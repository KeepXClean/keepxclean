import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Ensures dev-server matches Cloudflare auto-trailing-slash behavior
 * by redirecting /privacy to /privacy/
 */
function trailingSlashPlugin(): Plugin {
  return {
    name: 'kxc-trailing-slash',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/privacy') {
          res.statusCode = 301;
          res.setHeader('Location', '/privacy/');
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), trailingSlashPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@keepxclean/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
      },
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
