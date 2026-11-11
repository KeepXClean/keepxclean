import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  publicDir: '../../public',
  server: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('../../../../', import.meta.url))] },
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@keepxclean/shared': fileURLToPath(
        new URL('../../../../packages/shared/src/index.ts', import.meta.url)
      ),
    },
  },
});
