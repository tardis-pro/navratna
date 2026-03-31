import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';

const BACKEND_PACKAGES = ['@uaip/navratna-core', '@uaip/navratna-gateway'];

function backendLeakGuard(): Plugin {
  return {
    name: 'backend-leak-guard',
    enforce: 'pre',
    resolveId(id, importer) {
      const leaking = BACKEND_PACKAGES.find((pkg) => id === pkg || id.startsWith(pkg + '/'));
      if (leaking) {
        throw new Error(
          `[backend-leak-guard] Runtime import of "${id}" from "${importer ?? 'unknown'}" detected. ` +
            `Backend packages must only be referenced with 'import type'. ` +
            `This import would bundle backend (Bun/Node) code into the browser build.`,
        );
      }
    },
  };
}

export default defineConfig(({ mode: _mode }) => {
  const API_TARGET = process.env.VITE_API_TARGET;
  const CORE = process.env.VITE_CORE_URL || 'http://localhost:3001';
  const GATEWAY = process.env.VITE_GATEWAY_URL || 'http://localhost:3002';

  const toCore = { target: API_TARGET || CORE, changeOrigin: true, secure: false };
  const toGateway = { target: API_TARGET || GATEWAY, changeOrigin: true, secure: false };

  return {
    server: {
      host: '::',
      port: 5173,
      allowedHosts: true,
      fs: {
        allow: ['..'],
      },
      proxy: {
        '/api/v1/agents':           toCore,
        '/api/v1/personas':         toCore,
        '/api/v1/discussions':      toCore,
        '/api/v1/artifacts':        toCore,
        '/api/v1/info':             toCore,
        '/api/v1/user/llm':         toCore,
        '/api/v1/llm/my-providers': toGateway,
        '/api/v1/llm':              toCore,
        '/api/v1/questionforge':    toCore,
        '/api/v1/auth':             toGateway,
        '/api/v1/security':         toGateway,
        '/api/v1/approvals':        toGateway,
        '/api/v1/users':            toGateway,
        '/api/v1/audit':            toGateway,
        '/api/v1/knowledge/constellations': toCore,
        '/api/v1/knowledge':        toGateway,
        '/api/v1/contacts':         toGateway,
        '/api/v1/projects':         toGateway,
        '/api/v1/operations':       toGateway,
        '/api/v1/capabilities':     toGateway,
        '/api/v1/tools':            toGateway,
        '/api/v1/mcp':              toGateway,
        '/socket.io':               { ...toCore, ws: true },
        '/health':                  toCore,
      },
    },
    optimizeDeps: {
      exclude: ['elysia', ...BACKEND_PACKAGES],
    },
    plugins: [backendLeakGuard(), react()].filter(Boolean),
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
