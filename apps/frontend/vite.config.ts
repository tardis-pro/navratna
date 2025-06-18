import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Use environment variable for API target, fallback to localhost for local dev
  const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:8081';
  
  return {
    server: {
      host: "::",
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, '/api')
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
      mode === 'development' &&
      componentTagger(),
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
