import React from 'react';
import { createRoot } from 'react-dom/client';
import type {
  ViewerProfile,
  FilterConfig,
  CrowdBlockSnapshot,
} from '@keepxclean/shared';
import { command } from '../src/services/client';
import { getState, subscribe } from '../src/state/store';
import { ContentApp } from '../src/content/ContentApp';
import { DomController } from '../src/content/dom-controller';
import { createMainBridge } from '../src/content/main-bridge';
import uiCss from '../src/ui/ui.css?inline';

export default defineContentScript({
  matches: ['*://*.x.com/*', '*://*.twitter.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const bridge = createMainBridge();
    let controller: DomController | undefined;
    const buffer: CustomEvent[] = [];
    const sync = (force = false) => {
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
            detail: { config: lastConfig, crowdSnapshot: lastSnapshot },
          })
        );
        controller?.update(lastConfig, lastSnapshot);
      }
    };
    let lastConfig: FilterConfig | undefined;
    let lastSnapshot: CrowdBlockSnapshot | undefined;
    const off = subscribe(() => sync());
    const ready = () => sync(true);
    const viewer = (event: Event) => {
      const profile = (event as CustomEvent<ViewerProfile>).detail;
      if (profile?.restId)
        void command({ type: 'viewer.set', viewer: profile }).catch(
          () => undefined
        );
    };
    const graphql = (event: Event) => {
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
    let disposed = false;
    ctx.onInvalidated(() => {
      disposed = true;
      off();
      bridge.dispose();
      controller?.dispose();
      window.removeEventListener('KXC_VIEWER_DETECTED', viewer);
      window.removeEventListener('KXC_GRAPHQL_PROCESSED', graphql);
      window.removeEventListener('KXC_NATIVE_BLOCK_DETECTED', nativeBlock);
      window.removeEventListener('KXC_INTERCEPTOR_READY', ready);
    });
    if (!document.body)
      await new Promise<void>((resolve) =>
        document.addEventListener('DOMContentLoaded', () => resolve(), {
          once: true,
        })
      );
    if (disposed) return;
    controller = new DomController(uiCss);
    const ui = await createShadowRootUi(ctx, {
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
        root?.unmount();
      },
    });
    ui.mount();
    const state = getState();
    if (state.data) controller.update(state.data.config, state.data.snapshot);
    controller.start();
    buffer.splice(0).forEach(graphql);
    sync();
    void bridge.request('GET_VIEWER');
    ctx.onInvalidated(() => ui.remove());
  },
});
