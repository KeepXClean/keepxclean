import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  resolveLocale,
  type ViewerProfile,
  type FilterConfig,
  type CrowdBlockSnapshot,
} from '@keepxclean/shared';
import { command, isExtensionContextValid } from '../src/services/client';
import { getState, subscribe } from '../src/state/store';
import { ContentApp } from '../src/content/ContentApp';
import { DomController } from '../src/content/dom-controller';
import { createMainBridge } from '../src/content/main-bridge';
import uiCss from '../src/ui/ui.css?inline';

export default defineContentScript({
  matches: ['*://*.x.com/*', '*://*.twitter.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manual',
  async main(ctx) {
    if (!isExtensionContextValid() || ctx.isInvalid) return;
    const bridge = createMainBridge();
    let controller: DomController | undefined;
    let ui: { mount: () => void; remove: () => void } | undefined;
    let disposed = false;
    const buffer: CustomEvent[] = [];

    let lastConfig: FilterConfig | undefined;
    let lastSnapshot: CrowdBlockSnapshot | undefined;
    let lastViewerUid: string | undefined;

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      try {
        ui?.remove();
      } catch {
        // Ignore shadow UI teardown errors after context invalidation
      }
      ui = undefined;
      off();
      bridge.dispose();
      controller?.dispose();
      controller = undefined;
      window.removeEventListener('KXC_VIEWER_DETECTED', viewer);
      window.removeEventListener('KXC_GRAPHQL_PROCESSED', graphql);
      window.removeEventListener('KXC_NATIVE_BLOCK_DETECTED', nativeBlock);
      window.removeEventListener('KXC_INTERCEPTOR_READY', ready);
    };

    const isCtxInvalid = () => {
      try {
        return ctx.isInvalid;
      } catch {
        return true;
      }
    };

    const guardContext = () => {
      if (disposed || !isExtensionContextValid() || isCtxInvalid()) {
        cleanup();
        return false;
      }
      return true;
    };

    const sync = (force = false) => {
      if (!guardContext()) return;
      const state = getState();
      if (!state.data || state.error) return;
      if (
        force ||
        lastConfig !== state.data.config ||
        lastSnapshot !== state.data.snapshot
      ) {
        lastConfig = state.data.config;
        lastSnapshot = state.data.snapshot;
        window.dispatchEvent(
          new CustomEvent('KXC_SYNC_STATE', {
            detail: {
              config: {
                ...lastConfig,
                locale: resolveLocale(lastConfig.locale),
              },
              crowdSnapshot: lastSnapshot,
            },
          })
        );
        controller?.update(lastConfig, lastSnapshot);
      }
    };

    const off = subscribe(() => sync());
    const ready = () => sync(true);
    const viewer = (event: Event) => {
      if (!guardContext()) return;
      const profile = (event as CustomEvent<ViewerProfile>).detail;
      if (profile?.restId) {
        lastViewerUid = profile.restId;
        controller?.setViewer(profile.restId);
        void command({ type: 'viewer.set', viewer: profile }).catch(
          () => undefined
        );
      }
    };
    const graphql = (event: Event) => {
      if (!guardContext()) return;
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail !== 'object') return;
      if (!controller) {
        buffer.push(event as CustomEvent);
        if (buffer.length > 20) buffer.shift();
        return;
      }
      controller.ingest(
        detail.decisionsByTweetId ?? {},
        detail.authorsByScreenName ?? {}
      );
      if (
        Array.isArray(detail.interceptedLogs) &&
        detail.interceptedLogs.length
      )
        void command({
          type: 'logs.append',
          entries: detail.interceptedLogs,
        }).catch(() => undefined);
    };
    const nativeBlock = (event: Event) => {
      if (!guardContext()) return;
      const uid = (event as CustomEvent).detail?.targetUid;
      if (typeof uid !== 'string' || !/^\d{1,25}$/.test(uid)) return;
      const author = controller?.findAuthor(uid);
      void command({
        type: 'block.start',
        nativeAlreadyDone: true,
        entry: {
          uid,
          screenName: author?.screenName || '',
          name: author?.name,
          addedAt: Date.now(),
        },
        followers: author?.followersCount,
      }).catch(() => undefined);
    };

    window.addEventListener('KXC_VIEWER_DETECTED', viewer);
    window.addEventListener('KXC_GRAPHQL_PROCESSED', graphql);
    window.addEventListener('KXC_NATIVE_BLOCK_DETECTED', nativeBlock);
    window.addEventListener('KXC_INTERCEPTOR_READY', ready);
    ctx.onInvalidated(cleanup);
    // Proactively detect extension reloads so orphaned observers tear down cleanly
    // before X DOM mutations trigger dead chrome.* calls.
    ctx.setInterval(() => {
      guardContext();
    }, 1500);

    if (!document.body)
      await new Promise<void>((resolve) =>
        document.addEventListener('DOMContentLoaded', () => resolve(), {
          once: true,
        })
      );
    if (!guardContext()) return;

    controller = new DomController(uiCss, guardContext);
    if (lastViewerUid) controller.setViewer(lastViewerUid);
    const createdUi = await createShadowRootUi(ctx, {
      name: 'kxc-main-ui',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      css: uiCss,
      onMount(container) {
        const root = createRoot(container);
        root.render(
          React.createElement(ContentApp, { controller: controller! })
        );
        return root;
      },
      onRemove(root) {
        try {
          root?.unmount();
        } catch {
          // Ignore React unmount errors if host already detached
        }
      },
    });
    if (!guardContext()) {
      try {
        createdUi.remove();
      } catch {
        // Ignore
      }
      return;
    }
    ui = createdUi;
    ui.mount();
    const state = getState();
    if (state.data) controller.update(state.data.config, state.data.snapshot);
    controller.start();
    buffer.splice(0).forEach(graphql);
    sync();
    void bridge.request('GET_VIEWER');
  },
});
