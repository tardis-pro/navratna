import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
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
            `This import would bundle backend (Bun/Node) code into the browser build.`
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, path.resolve(__dirname), '') };
  const API_TARGET = env.VITE_API_TARGET;
  const CORE = env.VITE_CORE_URL || 'http://localhost:3001';
  const GATEWAY = env.VITE_GATEWAY_URL || 'http://localhost:3002';

  const toCore = { target: API_TARGET || CORE, changeOrigin: true, secure: false };
  const toGateway = { target: API_TARGET || GATEWAY, changeOrigin: true, secure: false };

  // The API is on a different origin in production. If the base URL is missing the
  // client silently falls back to same-origin, where the SPA host answers every
  // /api/v1 call with index.html — a 200 full of HTML that looks like success.
  if (mode === 'production' && !env.VITE_API_BASE_URL) {
    throw new Error(
      'VITE_API_BASE_URL is required for production builds (e.g. https://api.navratna.tardis.digital). ' +
        'Set it in apps/frontend/.env.production or the build environment.'
    );
  }

  return {
    server: {
      host: '::',
      port: 5173,
      allowedHosts: true,
      fs: {
        allow: ['..'],
      },
      proxy: {
        '/api/v1/agents': toCore,
        '/api/v1/personas': toCore,
        '/api/v1/discussions': toCore,
        '/api/v1/artifacts': toCore,
        '/api/v1/info': toCore,
        '/api/v1/user/llm': toCore,
        '/api/v1/llm/my-providers': toGateway,
        '/api/v1/llm': toCore,
        '/api/v1/questionforge': toCore,
        '/api/v1/auth': toGateway,
        '/api/v1/security': toGateway,
        '/api/v1/approvals': toGateway,
        '/api/v1/users': toGateway,
        '/api/v1/audit': toGateway,
        '/api/v1/knowledge/constellations': toCore,
        '/api/v1/knowledge': toGateway,
        '/api/v1/contacts': toGateway,
        '/api/v1/projects': toGateway,
        '/api/v1/operations': toGateway,
        '/api/v1/capabilities': toGateway,
        '/api/v1/tools': toGateway,
        '/api/v1/mcp': toGateway,
        '/socket.io': { ...toCore, ws: true },
        '/health': toCore,
      },
    },
    optimizeDeps: {
      exclude: ['elysia', ...BACKEND_PACKAGES],
    },
    plugins: [
      backendLeakGuard(),
      react(),
      sentryVitePlugin({
        authToken: env.SENTRY_AUTH_TOKEN,
        org: 'geospoc',
        project: 'javascript-react',
        disable: mode !== 'production' || !env.SENTRY_AUTH_TOKEN,
        release: {
          name: env.VITE_APP_VERSION || '1.0.0',
        },
        sourcemaps: {
          assets: './dist/assets/**',
          filesToDeleteAfterUpload: './dist/**/*.map',
        },
      }),
    ].filter(Boolean),
    build: {
      // Hidden source maps: emitted for Sentry upload in CD, never referenced
      // from the bundles — so they are not served publicly by Cloudflare Pages.
      sourcemap: 'hidden',
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
