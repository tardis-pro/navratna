import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode: _mode }) => {
  // Use environment variable for API target, fallback to localhost for local dev
  const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:8081';

  return {
    server: {
      host: '::',
      port: 5173,
      allowedHosts: true,
      origin: 'http://localhost:5173',
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (requestPath) => requestPath.replace(/^\/api/, '/api'),
          configure: (proxy, _options) => {
            proxy.on('error', (_err, _req, _res) => {});
            proxy.on('proxyReq', (_proxyReq, _req, _res) => {});
            proxy.on('proxyRes', (_proxyRes, _req, _res) => {});
          },
        },
        '/health': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
    plugins: [react()].filter(Boolean),
    build: {
      rolldownOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('react-dom') || (id.includes('react') && !id.includes('@tanstack')))
              return 'vendor-react';
            if (id.includes('framer-motion')) return 'vendor-framer';
            if (id.includes('@radix-ui')) return 'vendor-radix';
            if (id.includes('socket.io-client')) return 'vendor-socket';
            if (id.includes('@tanstack/react-query')) return 'vendor-query';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      conditions: [],
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/__tests__/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
