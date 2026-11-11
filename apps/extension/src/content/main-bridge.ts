import type { NativeResult } from '../services/model';

export function createMainBridge() {
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
          error: 'X 页面未响应，结果未确认',
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
      sender.id !== chrome.runtime.id ||
      message.type !== 'KXC_NATIVE_BRIDGE' ||
      typeof message.action !== 'string'
    )
      return false;
    if (
      !['GET_VIEWER', 'NATIVE_BLOCK_USER', 'FETCH_EXISTING_BLOCKS'].includes(
        message.action
      )
    )
      return false;
    void request(message.action, {
      targetUid: message.targetUid,
      expectedViewer: message.expectedViewer,
      cursor: message.cursor,
    }).then(respond);
    return true;
  };
  chrome.runtime.onMessage.addListener(listener);
  return {
    request,
    dispose() {
      window.removeEventListener('KXC_MAIN_RESULT', result);
      chrome.runtime.onMessage.removeListener(listener);
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.resolve({ ok: false, error: '页面已关闭，结果未确认' });
      }
      pending.clear();
    },
  };
}
