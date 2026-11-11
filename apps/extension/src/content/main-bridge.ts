import { getActiveErrors } from '../i18n/errors';
import { isExtensionContextValid } from '../services/client';
import type { NativeResult } from '../services/model';

export function createMainBridge() {
  const runtimeId = (() => {
    try {
      return typeof chrome !== 'undefined' ? chrome.runtime?.id : undefined;
    } catch {
      return undefined;
    }
  })();
  const pending = new Map<
    string,
    {
      resolve: (result: NativeResult) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const result = (event: Event) => {
    const data = (event as CustomEvent).detail;
    if (
      !data ||
      typeof data.requestId !== 'string' ||
      typeof data.ok !== 'boolean'
    )
      return;
    const item = pending.get(data.requestId);
    if (!item) return;
    pending.delete(data.requestId);
    clearTimeout(item.timer);
    item.resolve(data as NativeResult);
  };
  window.addEventListener('KXC_MAIN_RESULT', result);
  const request = (action: string, params: Record<string, unknown> = {}) =>
    new Promise<NativeResult>((resolve) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        resolve({
          ok: false,
          error: getActiveErrors().pageUnresponsive,
          code: 'TIMEOUT',
        });
      }, 18000);
      pending.set(requestId, { resolve, timer });
      window.dispatchEvent(
        new CustomEvent('KXC_MAIN_COMMAND', {
          detail: { ...params, command: action, requestId },
        })
      );
    });
  const listener = (
    message: Record<string, unknown>,
    sender: chrome.runtime.MessageSender,
    respond: (result: NativeResult) => void
  ) => {
    if (
      !isExtensionContextValid() ||
      !runtimeId ||
      sender.id !== runtimeId ||
      message.type !== 'KXC_NATIVE_BRIDGE' ||
      typeof message.action !== 'string'
    )
      return false;
    if (
      ![
        'GET_VIEWER',
        'NATIVE_BLOCK_USER',
        'FETCH_EXISTING_BLOCKS',
        'RESOLVE_USER_HANDLE',
      ].includes(message.action)
    )
      return false;
    void request(message.action, {
      targetUid: message.targetUid,
      expectedViewer: message.expectedViewer,
      cursor: message.cursor,
      screenName: message.screenName,
    }).then(respond);
    return true;
  };
  try {
    if (isExtensionContextValid()) {
      chrome.runtime.onMessage.addListener(listener);
    }
  } catch {
    // Ignore if context already invalidated
  }
  return {
    request,
    dispose() {
      window.removeEventListener('KXC_MAIN_RESULT', result);
      try {
        if (isExtensionContextValid()) {
          chrome.runtime.onMessage.removeListener(listener);
        }
      } catch {
        // Ignore removeListener error after extension context invalidation
      }
      const closedMsg = getActiveErrors().pageClosed;
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.resolve({ ok: false, error: closedMsg, code: 'UNCONFIRMED' });
      }
      pending.clear();
    },
  };
}
