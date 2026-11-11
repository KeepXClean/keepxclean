import { validateConfig, validateSnapshot } from '../src/services/validation';
import {
  computeAccountAgeDays,
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  processGraphqlResponsePayload,
  SlidingWindowTracker,
  type CrowdBlockSnapshot,
  type FilterConfig,
} from '@keepxclean/shared';

// Default public X Web Client Bearer token (used as fallback if not yet captured from headers)
const DEFAULT_X_BEARER =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

export default defineContentScript({
  matches: ['*://*.x.com/*', '*://*.twitter.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const FAST_BOOT_CACHE_KEY = '__kxc_fast_boot_cache_v1__';
    let currentConfig: FilterConfig = createDefaultConfig('standard');
    let currentSnapshot: CrowdBlockSnapshot = createDefaultCrowdSnapshot();
    const windowTracker = new SlidingWindowTracker();
    let capturedBearerToken = DEFAULT_X_BEARER;

    // 0. Synchronously hydrate from localStorage fast-boot cache so even 0ms initial XHRs use user's exact rules
    try {
      const rawCache = window.localStorage.getItem(FAST_BOOT_CACHE_KEY);
      if (rawCache) {
        const parsedCache = JSON.parse(rawCache);
        if (parsedCache?.config)
          currentConfig = validateConfig(parsedCache.config);
        if (parsedCache?.crowdSnapshot) {
          currentSnapshot = validateSnapshot(parsedCache.crowdSnapshot);
        }
      }
    } catch {
      // Ignore storage access errors
    }

    // Listen for config & crowd snapshot updates from ISOLATED content script
    window.addEventListener('KXC_SYNC_STATE', ((e: CustomEvent) => {
      try {
        if (e.detail?.config) currentConfig = validateConfig(e.detail.config);
        if (e.detail?.crowdSnapshot)
          currentSnapshot = validateSnapshot(e.detail.crowdSnapshot);
      } catch {
        return;
      }
      try {
        window.localStorage.setItem(
          FAST_BOOT_CACHE_KEY,
          JSON.stringify({
            config: currentConfig,
            crowdSnapshot: currentSnapshot,
          })
        );
      } catch {
        // Ignore quota errors
      }
    }) as EventListener);

    // Notify ISOLATED script that MAIN world interceptor is ready for state sync
    window.dispatchEvent(new CustomEvent('KXC_INTERCEPTOR_READY'));

    // Scan inline SSR Relay ($R) script tags on initial document load
    const scannedScripts = new WeakSet<Element>();
    function scanSsrRelayScripts() {
      const scripts = document.querySelectorAll('script:not([src])');
      scripts.forEach((script) => {
        if (scannedScripts.has(script)) return;
        const txt = script.textContent ?? '';
        if (!txt.includes('Result.Ok') || !txt.includes('\\"data\\"')) return;
        scannedScripts.add(script);

        const regex = /value:("(?:\\.|[^"\\])*")/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(txt)) !== null) {
          try {
            const innerJsonStr = JSON.parse(match[1]) as string;
            if (
              typeof innerJsonStr === 'string' &&
              innerJsonStr.startsWith('{')
            ) {
              transformGraphqlJsonText(innerJsonStr, 'SSR_RELAY');
            }
          } catch {
            // Ignore malformed script fragment
          }
        }
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scanSsrRelayScripts);
      window.addEventListener('load', scanSsrRelayScripts);
    } else {
      scanSsrRelayScripts();
    }

    function getCsrfToken(): string {
      const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
      return match ? decodeURIComponent(match[1]) : '';
    }

    function getTwidUid(): string {
      const match = document.cookie.match(/(?:^|;\s*)twid=([^;]+)/);
      if (!match) return '';
      const decoded = decodeURIComponent(match[1]);
      const uidMatch = decoded.match(/u=(\d+)/);
      return uidMatch ? uidMatch[1] : '';
    }

    async function sha256Hex(input: string): Promise<string> {
      const data = new TextEncoder().encode(input);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    // Attempt to detect current logged-in viewer profile from cookie / Viewer response
    async function emitViewerFromUid(
      restId: string,
      screenName = '',
      accountAgeDays = 0,
      followersCount = 0
    ) {
      if (!restId) return;
      const reporterHash = await sha256Hex(`kxc_v1_${restId}`);
      window.dispatchEvent(
        new CustomEvent('KXC_VIEWER_DETECTED', {
          detail: {
            restId,
            screenName,
            accountAgeDays,
            followersCount,
            reporterHash,
          },
        })
      );
    }

    const initialTwid = getTwidUid();
    if (initialTwid) {
      void emitViewerFromUid(initialTwid);
    }

    function isTargetGraphqlUrl(url: string): boolean {
      return url.includes('/graphql/');
    }

    function inspectViewerPayload(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: any
    ) {
      const viewerResult =
        payload?.data?.viewer?.user_results?.result ??
        payload?.data?.viewer?.user_result?.result;
      if (!viewerResult) return;
      const legacy = viewerResult.legacy ?? {};
      const core = viewerResult.core ?? {};
      const relCounts = viewerResult.relationship_counts ?? {};
      const restId = String(viewerResult.rest_id ?? legacy.id_str ?? '');
      const screenName = String(core.screen_name ?? legacy.screen_name ?? '');
      const createdAt = String(core.created_at ?? legacy.created_at ?? '');
      const createdAtMs =
        typeof core.created_at_ms === 'number' ? core.created_at_ms : undefined;
      const ageDays = computeAccountAgeDays(
        createdAt,
        Date.now(),
        createdAtMs,
        restId
      );
      const followers = Number(
        relCounts.followers ?? legacy.followers_count ?? 0
      );
      if (restId) {
        void emitViewerFromUid(restId, screenName, ageDays, followers);
      }
    }

    function transformGraphqlJsonText(rawText: string, url: string): string {
      if (!rawText) return rawText;
      try {
        const parsed = JSON.parse(rawText);
        if (url.includes('/Viewer') || parsed?.data?.viewer) {
          inspectViewerPayload(parsed);
        }

        const processed = processGraphqlResponsePayload(
          parsed,
          url,
          window.location.pathname,
          currentConfig,
          currentSnapshot,
          windowTracker
        );

        const ownAuthor = Object.values(processed.authorsByScreenName).find(
          ({ author }) => author.restId === getTwidUid()
        )?.author;
        if (ownAuthor)
          void emitViewerFromUid(
            ownAuthor.restId,
            ownAuthor.screenName,
            ownAuthor.accountAgeDays,
            ownAuthor.followersCount
          );

        const hasDecisions =
          Object.keys(processed.decisionsByTweetId).length > 0;
        const hasAuthors =
          Object.keys(processed.authorsByScreenName).length > 0;

        if (
          processed.interceptedLogs.length > 0 ||
          hasDecisions ||
          hasAuthors
        ) {
          window.dispatchEvent(
            new CustomEvent('KXC_GRAPHQL_PROCESSED', {
              detail: {
                interceptedLogs: processed.interceptedLogs,
                decisionsByTweetId: processed.decisionsByTweetId,
                authorsByScreenName: processed.authorsByScreenName,
              },
            })
          );
        }

        if (processed.modified) {
          return JSON.stringify(parsed);
        }
        return rawText;
      } catch {
        return rawText;
      }
    }

    // 1. Hook XMLHttpRequest (Primary transport used by X Web Client)
    const OriginalXHR = window.XMLHttpRequest;
    const origOpen = OriginalXHR.prototype.open;
    const origSend = OriginalXHR.prototype.send;
    const origSetRequestHeader = OriginalXHR.prototype.setRequestHeader;

    interface PatchedXHR extends XMLHttpRequest {
      _kxcUrl?: string;
      _kxcMethod?: string;
      _kxcInternal?: boolean;
    }

    OriginalXHR.prototype.open = function (
      this: PatchedXHR,
      method: string,
      url: string | URL,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...rest: any[]
    ) {
      this._kxcMethod = method;
      this._kxcUrl = String(url);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origOpen as any).apply(this, [method, url, ...rest]);
    };

    OriginalXHR.prototype.setRequestHeader = function (
      this: PatchedXHR,
      header: string,
      value: string
    ) {
      if (
        header.toLowerCase() === 'authorization' &&
        value.startsWith('Bearer ')
      ) {
        capturedBearerToken = value;
      }
      return origSetRequestHeader.call(this, header, value);
    };

    OriginalXHR.prototype.send = function (
      this: PatchedXHR,
      body?: Document | XMLHttpRequestBodyInit | null
    ) {
      const url = this._kxcUrl ?? '';

      // Detect native X Block action initiated by the user
      if (
        !this._kxcInternal &&
        url.includes('/blocks/create.json') &&
        typeof body === 'string'
      ) {
        const params = new URLSearchParams(body);
        const blockedUserId = params.get('user_id');
        if (blockedUserId) {
          this.addEventListener(
            'load',
            () => {
              if (this.status < 200 || this.status >= 300) return;
              let response;
              try {
                response =
                  this.responseType === 'json'
                    ? this.response
                    : JSON.parse(this.responseText);
              } catch {
                return;
              }
              if (
                String(response?.id_str ?? response?.id ?? '') ===
                  blockedUserId &&
                response?.blocking === true &&
                !response?.errors?.length
              )
                window.dispatchEvent(
                  new CustomEvent('KXC_NATIVE_BLOCK_DETECTED', {
                    detail: { targetUid: blockedUserId },
                  })
                );
            },
            { once: true }
          );
        }
      }

      if (isTargetGraphqlUrl(url)) {
        let cachedModifiedText: string | null = null;

        const getPatchedText = (): string => {
          if (cachedModifiedText !== null) return cachedModifiedText;
          let originalText = '';
          if (this.responseType === '' || this.responseType === 'text') {
            originalText =
              (Reflect.get(
                OriginalXHR.prototype,
                'responseText',
                this
              ) as string) ?? '';
          } else if (this.responseType === 'json') {
            const rawJsonObj = Reflect.get(
              OriginalXHR.prototype,
              'response',
              this
            );
            if (rawJsonObj && typeof rawJsonObj === 'object') {
              originalText = JSON.stringify(rawJsonObj);
            }
          }
          cachedModifiedText = transformGraphqlJsonText(originalText, url);
          return cachedModifiedText;
        };

        Object.defineProperty(this, 'responseText', {
          configurable: true,
          get: () => {
            if (this.readyState !== 4) return '';
            if (this.responseType !== '' && this.responseType !== 'text') {
              return Reflect.get(
                OriginalXHR.prototype,
                'responseText',
                this
              ) as string;
            }
            return getPatchedText();
          },
        });

        Object.defineProperty(this, 'response', {
          configurable: true,
          get: () => {
            if (this.readyState !== 4) return '';
            const rawResp = Reflect.get(
              OriginalXHR.prototype,
              'response',
              this
            );
            if (
              typeof rawResp === 'string' ||
              this.responseType === '' ||
              this.responseType === 'text'
            ) {
              return getPatchedText();
            }
            if (this.responseType === 'json') {
              try {
                return JSON.parse(getPatchedText());
              } catch {
                return rawResp;
              }
            }
            return rawResp;
          },
        });
      }

      return origSend.call(this, body);
    };

    // 2. Hook window.fetch (Fallback transport for newer X modules)
    const origFetch = window.fetch;
    window.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      const response = await origFetch.call(window, input, init);
      if (!isTargetGraphqlUrl(url)) {
        return response;
      }

      try {
        const cloned = response.clone();
        const rawText = await cloned.text();
        const modifiedText = transformGraphqlJsonText(rawText, url);
        if (modifiedText === rawText) {
          return response;
        }
        return new Response(modifiedText, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch {
        return response;
      }
    };

    // Only this bridge accesses X authentication; no credentials leave MAIN world.
    window.addEventListener('KXC_MAIN_COMMAND', (async (event: CustomEvent) => {
      const { command, targetUid, requestId, cursor, expectedViewer } =
        event.detail ?? {};
      if (
        typeof requestId !== 'string' ||
        requestId.length > 100 ||
        !['GET_VIEWER', 'NATIVE_BLOCK_USER', 'FETCH_EXISTING_BLOCKS'].includes(
          command
        )
      )
        return;
      const reply = (result: Record<string, unknown>) =>
        window.dispatchEvent(
          new CustomEvent('KXC_MAIN_RESULT', {
            detail: { requestId, ...result },
          })
        );
      const viewerUid = getTwidUid();
      if (!viewerUid) {
        reply({ ok: false, error: '请先登录 X', code: 'NO_SESSION' });
        return;
      }
      if (expectedViewer && expectedViewer !== viewerUid) {
        reply({
          ok: false,
          error: 'X 账号已切换，请重新操作',
          code: 'ACCOUNT_CHANGED',
        });
        return;
      }
      if (command === 'GET_VIEWER') {
        await emitViewerFromUid(viewerUid);
        reply({ ok: true, viewerUid });
        return;
      }
      const csrf = getCsrfToken();
      if (!csrf) {
        reply({
          ok: false,
          error: 'X 登录状态不完整，请刷新或重新登录',
          code: 'NO_SESSION',
        });
        return;
      }
      if (
        command === 'NATIVE_BLOCK_USER' &&
        (!/^\d{1,25}$/.test(targetUid ?? '') || !expectedViewer)
      ) {
        reply({ ok: false, error: '目标 UID 或当前账号未确认' });
        return;
      }
      if (
        command === 'FETCH_EXISTING_BLOCKS' &&
        !/^-?\d+$/.test(cursor ?? '-1')
      ) {
        reply({ ok: false, error: '分页游标无效' });
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 14000);
      try {
        const headers = {
          authorization: capturedBearerToken,
          'x-csrf-token': csrf,
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session',
          'content-type': 'application/x-www-form-urlencoded',
        };
        const isBlock = command === 'NATIVE_BLOCK_USER';
        const path = isBlock
          ? '/i/api/1.1/blocks/create.json'
          : `/i/api/1.1/blocks/ids.json?stringify_ids=true&count=5000&cursor=${encodeURIComponent(cursor ?? '-1')}`;
        const response = await origFetch.call(
          window,
          `${location.origin}${path}`,
          {
            method: isBlock ? 'POST' : 'GET',
            headers,
            credentials: 'include',
            signal: controller.signal,
            ...(isBlock
              ? { body: `user_id=${encodeURIComponent(targetUid)}` }
              : {}),
          }
        );
        if (!response.ok) throw new Error(`X 返回 HTTP ${response.status}`);
        const data = await response.json();
        if (data?.errors?.length)
          throw new Error('X 未能完成请求，请检查登录状态后重试');
        if (getTwidUid() !== viewerUid)
          throw new Error('X 账号已切换，结果未确认');
        if (isBlock) {
          const returnedUid = String(data?.id_str ?? data?.id ?? '');
          if (returnedUid !== targetUid || data?.blocking !== true)
            throw new Error('X 未确认目标账号已拉黑，结果未确认');
          reply({ ok: true, viewerUid });
        } else {
          if (
            !Array.isArray(data?.ids) ||
            typeof data?.next_cursor_str !== 'string' ||
            !/^-?\d+$/.test(data.next_cursor_str)
          )
            throw new Error('X 黑名单分页响应无效');
          reply({
            ok: true,
            viewerUid,
            ids: data.ids.map(String),
            nextCursor: data.next_cursor_str,
          });
        }
      } catch (error) {
        reply({
          ok: false,
          error: controller.signal.aborted
            ? 'X 请求超时，结果未确认'
            : (error as Error).message,
          code: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK',
        });
      } finally {
        clearTimeout(timer);
      }
    }) as unknown as EventListener);
    let lastViewerUid = initialTwid;
    const checkViewer = () => {
      const uid = getTwidUid();
      if (uid !== lastViewerUid) {
        lastViewerUid = uid;
        if (uid) void emitViewerFromUid(uid);
      }
    };
    window.addEventListener('focus', checkViewer);
    document.addEventListener('visibilitychange', checkViewer);
  },
});
