import type { Command, Result } from './model';
import { normalizeServiceUrl } from './validation';

export async function command<T = void>(action: Command): Promise<T> {
  const result = (await chrome.runtime.sendMessage({
    type: 'KXC_COMMAND',
    action,
  })) as Result<T>;
  if (!result || !result.ok)
    throw new Error(
      result && !result.ok
        ? result.error
        : '扩展连接已断开，请刷新页面或重新加载扩展'
    );
  return result.data;
}
export async function authorizeService(input: string) {
  const normalized = normalizeServiceUrl(input);
  if (normalized) {
    const origins = [new URL(normalized).origin + '/*'];
    if (!(await chrome.permissions.request({ origins })))
      throw new Error('未获得服务访问权限，原配置已保留');
  }
  return normalized;
}
export function openOptions(page = 'rules') {
  return command({ type: 'options.open', page });
}
