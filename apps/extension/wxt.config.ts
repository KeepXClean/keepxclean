import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: [tailwindcss() as any],
  }),
  hooks: {
    'vite:build:extendConfig': (entrypoints, viteConfig) => {
      viteConfig.build ??= {};
      viteConfig.build.chunkSizeWarningLimit = 900;
      const isHtmlBundle = entrypoints.some(
        (e) => e.type === 'options' || e.type === 'popup'
      );
      if (isHtmlBundle) {
        viteConfig.build.rollupOptions ??= {};
        const output = viteConfig.build.rollupOptions.output;
        if (!Array.isArray(output)) {
          viteConfig.build.rollupOptions.output = {
            ...output,
            manualChunks(id) {
              if (id.includes('node_modules')) return 'vendor';
              if (id.includes('/src/i18n/locales/')) return 'locales';
            },
          };
        }
      }
    },
  },
  manifest: ({ mode }) => ({
    default_locale: 'en',
    name: '__MSG_extName__',
    short_name: 'KeepXClean',
    description: '__MSG_extDescription__',
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
      ...(mode === 'development' ? ['http://localhost:8787/*'] : []),
    ],
    action: {
      default_title: '__MSG_extActionTitle__',
      default_icon: { 16: 'icon/icon-16.png', 32: 'icon/icon-32.png' },
    },
  }),
});
