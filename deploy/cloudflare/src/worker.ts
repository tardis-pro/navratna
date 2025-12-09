/**
 * Navratna API Gateway Worker
 *
 * This Cloudflare Worker handles:
 * - Edge routing to backend services
 * - CORS handling
 * - Rate limiting
 * - Request/response caching
 * - Security headers
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { cache } from 'hono/cache';
import { logger } from 'hono/logger';

// Types for Cloudflare bindings
interface Env {
  // Environment variables
  ENVIRONMENT: string;
  BACKEND_URL: string;
  FRONTEND_URL: string;
  CORS_ORIGINS: string;

  // R2 Storage
  STORAGE: R2Bucket;

  // KV Cache
  CACHE: KVNamespace;

  // Secrets (set via wrangler secret)
  JWT_SECRET?: string;
  API_KEY?: string;
}

// Service routing map
const SERVICE_ROUTES: Record<string, string> = {
  '/api/v1/auth': '/api/v1/auth',
  '/api/v1/users': '/api/v1/users',
  '/api/v1/security': '/api/v1/security',
  '/api/v1/knowledge': '/api/v1/knowledge',
  '/api/v1/contacts': '/api/v1/contacts',
  '/api/v1/projects': '/api/v1/projects',
  '/api/v1/agents': '/api/v1/agents',
  '/api/v1/personas': '/api/v1/personas',
  '/api/v1/discussions': '/api/v1/discussions',
  '/api/v1/operations': '/api/v1/operations',
  '/api/v1/capabilities': '/api/v1/capabilities',
  '/api/v1/tools': '/api/v1/tools',
  '/api/v1/mcp': '/api/v1/mcp',
  '/api/v1/artifacts': '/api/v1/artifacts',
  '/api/v1/llm': '/api/v1/llm',
  '/api/v1/audit': '/api/v1/audit',
  '/api/v1/approvals': '/api/v1/approvals',
};

const app = new Hono<{ Bindings: Env }>();

// Logging middleware
app.use('*', logger());

// Security headers
app.use('*', secureHeaders({
  xFrameOptions: 'SAMEORIGIN',
  xContentTypeOptions: 'nosniff',
  xXssProtection: '1; mode=block',
  referrerPolicy: 'strict-origin-when-cross-origin',
}));

// CORS middleware - configured dynamically based on environment
app.use('*', async (c, next) => {
  const origins = c.env.CORS_ORIGINS.split(',').map(o => o.trim());

  return cors({
    origin: (origin) => {
      if (!origin) return null;
      // Check if origin matches any allowed origin
      if (origins.includes(origin)) return origin;
      // Allow localhost in development
      if (c.env.ENVIRONMENT === 'development' && origin.includes('localhost')) {
        return origin;
      }
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Session-ID',
      'X-Security-Level',
      'X-User-ID',
      'X-Timestamp',
      'X-Correlation-ID',
      'X-Client-Version',
      'X-Request-ID',
      'X-Environment',
      'x-csrf-token',
    ],
    exposeHeaders: ['X-Total-Count', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400,
  })(c, next);
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
    edge: c.req.raw.cf?.colo || 'unknown',
  });
});

// R2 Storage routes
app.get('/storage/:key{.*}', async (c) => {
  const key = c.req.param('key');
  const object = await c.env.STORAGE.get(key);

  if (!object) {
    return c.json({ error: 'Object not found' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=3600');

  return new Response(object.body, { headers });
});

app.put('/storage/:key{.*}', async (c) => {
  const key = c.req.param('key');
  const body = await c.req.arrayBuffer();
  const contentType = c.req.header('Content-Type') || 'application/octet-stream';

  await c.env.STORAGE.put(key, body, {
    httpMetadata: {
      contentType,
    },
  });

  return c.json({ success: true, key });
});

app.delete('/storage/:key{.*}', async (c) => {
  const key = c.req.param('key');
  await c.env.STORAGE.delete(key);
  return c.json({ success: true });
});

// API proxy routes
app.all('/api/*', async (c) => {
  const url = new URL(c.req.url);
  const path = url.pathname;

  // Build backend URL
  const backendUrl = new URL(path, c.env.BACKEND_URL);
  backendUrl.search = url.search;

  // Forward the request
  const headers = new Headers(c.req.raw.headers);
  headers.set('X-Forwarded-For', c.req.header('CF-Connecting-IP') || '');
  headers.set('X-Forwarded-Proto', 'https');
  headers.set('X-Real-IP', c.req.header('CF-Connecting-IP') || '');
  headers.delete('host');

  // Add edge location info
  const cf = c.req.raw.cf;
  if (cf) {
    headers.set('X-CF-Colo', cf.colo as string || '');
    headers.set('X-CF-Country', cf.country as string || '');
  }

  try {
    const response = await fetch(backendUrl.toString(), {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
        ? await c.req.arrayBuffer()
        : undefined,
    });

    // Clone response and add edge headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('X-Served-By', 'cloudflare-worker');
    responseHeaders.set('X-Edge-Location', (cf?.colo as string) || 'unknown');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Backend request failed:', error);
    return c.json({
      error: 'Backend service unavailable',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 503);
  }
});

// WebSocket upgrade handler (for future Durable Objects implementation)
app.get('/socket.io/*', async (c) => {
  // For now, proxy WebSocket to backend
  // In future, use Durable Objects for edge WebSocket handling
  const upgradeHeader = c.req.header('Upgrade');

  if (upgradeHeader !== 'websocket') {
    // Regular polling transport - proxy to backend
    const backendUrl = new URL(c.req.url);
    backendUrl.hostname = new URL(c.env.BACKEND_URL).hostname;
    backendUrl.port = new URL(c.env.BACKEND_URL).port || '';
    backendUrl.protocol = 'https:';

    const response = await fetch(backendUrl.toString(), {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method !== 'GET' ? await c.req.arrayBuffer() : undefined,
    });

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }

  // WebSocket upgrade - return 426 (or proxy in production)
  return c.json({
    error: 'WebSocket connections should be made directly to the backend',
    backendUrl: `${c.env.BACKEND_URL}/socket.io/`,
  }, 426);
});

// Cache middleware for static assets
app.get('/static/*', cache({
  cacheName: 'navratna-static',
  cacheControl: 'public, max-age=86400',
}));

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    path: c.req.path,
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: c.env.ENVIRONMENT === 'development' ? err.message : undefined,
  }, 500);
});

export default app;
