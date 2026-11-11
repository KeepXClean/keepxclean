import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: [tailwindcss() as any],
  }),
  manifest: {
    name: 'KeepXClean - X 高信噪比净空插件',
    short_name: 'KeepXClean',
    description:
      '让 X (Twitter) 保持高质量：无感拦截高频刷屏号、众包被拉黑超过 N 人账号、评论区蓝标水军及多维关键词内容 (keepxclean.com)',
    homepage_url: 'https://keepxclean.com',
    permissions: ['storage', 'alarms'],
    optional_host_permissions: [
      'https://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ],
    web_accessible_resources: [
      {
        resources: ['icon/*.png'],
        matches: ['*://*.x.com/*', '*://*.twitter.com/*'],
      },
    ],
    icons: {
      16: 'icon/icon-16.png',
      32: 'icon/icon-32.png',
      48: 'icon/icon-48.png',
      128: 'icon/icon-128.png',
    },
    host_permissions: [
      '*://*.x.com/*',
      '*://*.twitter.com/*',
      'https://*.keepxclean.com/*',
      'https://keepxclean.com/*',
      'http://localhost:8787/*',
    ],
    action: {
      default_title: 'KeepXClean 净空控制台',
      default_icon: { 16: 'icon/icon-16.png', 32: 'icon/icon-32.png' },
    },
  },
});
