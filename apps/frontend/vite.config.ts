import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Use environment variable for API target, fallback to localhost for local dev
  const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:8081';
  
  return {
    server: {
      host: "::",
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
        'all'
      ],
      origin: 'http://localhost:5173',
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, '/api'),
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('Proxy error:', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Sending Request to the Target:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            });
          },
        },
        '/health': {
          target: apiTarget,
          changeOrigin: true,
          secure: false
        }
      }
    },
    plugins: [
      react(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@uaip/types": path.resolve(__dirname, "../../packages/shared-types/src"),
        "@uaip/utils": path.resolve(__dirname, "../../packages/shared-utils/src"),
      },
    },
  };
});
