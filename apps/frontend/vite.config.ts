import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ _mode }) => {
  // Use environment variable for API target, fallback to localhost for local dev
  const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:8081';

  return {
    server: {
      host: '::',
      port: 5173,
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'api-gateway',
        'uaip-api-gateway',
        'council-frontend',
        'frontend',
        '.local',
        '.vercel.app',
        '.netlify.app',
        '.ngrok-free.app',
        '3440-2402-e280-3e2c-76e-7917-4452-f5bb-a42d.ngrok-free.app',
        'all',
      ],
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
      rollupOptions: {
        output: {
          manualChunks(id) {
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
      conditions: ['@uaip/source'],
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/__tests__/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
