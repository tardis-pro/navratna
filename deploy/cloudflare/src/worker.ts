/**
 * Navratna API Gateway Worker
 *
 * Replaces the old nginx API gateway (api-gateway/nginx.conf) now that the
 * backend runs as two Fly.io apps instead of behind nginx.
 *
 * Responsibilities (1:1 with what nginx used to do):
 *   1. Path-split every /api/v1/* route to navratna-core vs navratna-gateway.
 *   2. Validate the HS256 JWT (Authorization: Bearer, or access_token cookie)
 *      and inject X-User-ID / X-User-Email / X-User-Role for the backend,
 *      which trusts these headers (attachNginxAuth / requireNginxAuth).
 *   3. Strip any client-supplied X-User-* headers so they can never be forged.
 *   4. CORS for the Pages frontend.
 *   5. Pass Socket.IO / WebSocket traffic through to navratna-core.
 *
 * Auth model matches @uaip/middleware JWTValidator.verify():
 *   alg HS256, issuer "uaip", audience "uaip-services", claims { userId, email, role }.
 *
 * NOTE: This worker only INJECTS X-User-* on a valid token; it does not
 * blanket-401. The backend decides required-vs-optional per route
 * (requireNginxAuth returns 401 when the user is absent). Public endpoints
 * (/api/v1/auth/*, /.well-known/*) pass through untouched.
 */

interface Env {
  ENVIRONMENT: string;
  CORE_URL: string; // https://navratna-core.fly.dev
  GATEWAY_URL: string; // https://navratna-gateway.fly.dev
  FRONTEND_URL: string; // https://navratna.tardis.digital
  CORS_ORIGINS: string; // comma-separated allowed origins
  JWT_SECRET: string; // HS256 secret (wrangler secret) — legacy token verification
  JWKS_URL?: string; // override for the RS256 JWKS endpoint (default: GATEWAY_URL/.well-known/jwks.json)
  EDGE_AUTH_SECRET?: string; // shared secret proving a request came through this Worker
  STORAGE?: R2Bucket;
}

const JWT_ISSUER = 'uaip';
const JWT_AUDIENCE = 'uaip-services';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Target = 'core' | 'gateway';

interface RouteRule {
  prefix: string;
  target: Target;
}

/**
 * Path → backend map, mirrored from nginx.conf. ORDER MATTERS: longer / more
 * specific prefixes must come before their parents (constellations before
 * knowledge, my-providers before llm, user/llm before llm).
 */
const ROUTE_TABLE: RouteRule[] = [
  // --- gateway (security + orchestration + capability) ---
  { prefix: '/api/v1/auth', target: 'gateway' },
  { prefix: '/api/v1/oauth', target: 'gateway' },
  { prefix: '/api/v1/security', target: 'gateway' },
  { prefix: '/api/v1/approvals', target: 'gateway' },
  { prefix: '/api/v1/users', target: 'gateway' },
  { prefix: '/api/v1/audit', target: 'gateway' },
  { prefix: '/api/v1/contacts', target: 'gateway' },
  { prefix: '/api/v1/projects', target: 'gateway' },
  { prefix: '/api/v1/operations', target: 'gateway' },
  { prefix: '/api/v1/orchestration', target: 'gateway' },
  { prefix: '/api/v1/workflows', target: 'gateway' },
  { prefix: '/api/v1/tasks', target: 'gateway' },
  { prefix: '/api/v1/dashboard', target: 'gateway' },
  { prefix: '/api/v1/webhooks', target: 'gateway' },
  { prefix: '/api/v1/capabilities', target: 'gateway' },
  { prefix: '/api/v1/workspaces', target: 'gateway' },
  { prefix: '/api/v1/mesh', target: 'gateway' }, // exec-mesh node enroll/heartbeat/tokens
  { prefix: '/api/v1/canva', target: 'gateway' },
  { prefix: '/api/v1/tools', target: 'gateway' },
  { prefix: '/api/v1/mcp', target: 'gateway' },
  { prefix: '/api/v1/federation', target: 'gateway' },
  { prefix: '/api/v1/agent-llm-providers', target: 'gateway' }, // before /agents (core) is irrelevant — distinct prefix
  { prefix: '/api/v1/providers', target: 'gateway' },
  { prefix: '/api/v1/llm/my-providers', target: 'gateway' },
  { prefix: '/.well-known/openid-configuration', target: 'gateway' },
  { prefix: '/.well-known/jwks.json', target: 'gateway' },

  // --- core (agent + discussion + artifact + llm) ---
  { prefix: '/api/v1/knowledge/constellations', target: 'core' }, // before /knowledge
  { prefix: '/api/v1/knowledge/ingest', target: 'core' }, // before /knowledge parent
  { prefix: '/api/v1/agents', target: 'core' },
  { prefix: '/api/v1/personas', target: 'core' },
  { prefix: '/api/v1/discussions', target: 'core' },
  { prefix: '/api/v1/artifacts', target: 'core' },
  { prefix: '/api/v1/info', target: 'core' },
  { prefix: '/api/v1/onboard', target: 'core' },
  { prefix: '/api/v1/compositions', target: 'core' }, // routes are plural; singular kept for compat
  { prefix: '/api/v1/composition', target: 'core' },
  { prefix: '/api/v1/user/llm', target: 'core' }, // before /llm
  { prefix: '/api/v1/questionforge', target: 'core' },
  { prefix: '/api/v1/llm', target: 'core' },
  { prefix: '/s', target: 'core' }, // short-link resolver (/s/:shortCode → 302)
  { prefix: '/socket.io', target: 'core' },

  // --- knowledge parent (gateway) — AFTER constellations + ingest ---
  { prefix: '/api/v1/knowledge', target: 'gateway' },
];

/**
 * Routes that must never have auth enforced / injected upstream needs.
 * OAuth initiate + provider callbacks run pre-authentication.
 */
const PUBLIC_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/oauth',
  '/.well-known/',
  '/api/v1/artifacts/public', // read-only shared-artifact view (no auth)
  '/s/', // short-link resolver / redirect
];

function resolveTarget(pathname: string): Target | null {
  // Table is ordered specific-first, so the first prefix match wins.
  for (const rule of ROUTE_TABLE) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')) {
      return rule.target;
    }
  }
  return null;
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

// --- base64url + HS256 verification via Web Crypto -------------------------

function b64urlToUint8(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToString(b64url: string): string {
  return new TextDecoder().decode(b64urlToUint8(b64url));
}

interface JwtClaims {
  userId?: string;
  email?: string;
  role?: string;
  orgId?: string;
  scp?: string[] | string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
}

/**
 * Standard claim checks shared by both algorithms: issuer, audience, expiry, and
 * the required identity fields. Matches @uaip/middleware verify options.
 */
function claimsValid(claims: JwtClaims): boolean {
  if (claims.iss !== JWT_ISSUER) return false;
  const aud = claims.aud;
  const audOk = Array.isArray(aud) ? aud.includes(JWT_AUDIENCE) : aud === JWT_AUDIENCE;
  if (!audOk) return false;
  if (typeof claims.exp === 'number' && Date.now() >= claims.exp * 1000) return false;
  return (
    typeof claims.userId === 'string' &&
    typeof claims.email === 'string' &&
    typeof claims.role === 'string'
  );
}

/**
 * Verify an HS256 JWT (legacy path, kept through the RS256 rollout window).
 */
async function verifyJwtHs256(token: string, secret: string): Promise<JwtClaims | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;

    const header = JSON.parse(b64urlToString(headerB64)) as { alg?: string };
    if (header.alg !== 'HS256') return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const valid = await crypto.subtle.verify('HMAC', key, b64urlToUint8(sigB64), data);
    if (!valid) return null;

    const claims = JSON.parse(b64urlToString(payloadB64)) as JwtClaims;
    return claimsValid(claims) ? claims : null;
  } catch {
    return null;
  }
}

// --- RS256 verification via the gateway's published JWKS (cached in-isolate) ---

interface JwksCache {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}
let jwksCache: JwksCache | null = null;
const JWKS_TTL_MS = 3_600_000; // 1h

function jwksUrl(env: Env): string {
  return env.JWKS_URL ?? `${env.GATEWAY_URL}/.well-known/jwks.json`;
}

async function loadJwks(env: Env, force: boolean): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (!force && jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(jwksUrl(env));
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys?: Array<Record<string, unknown>> };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk['kty'] !== 'RSA' || typeof jwk['kid'] !== 'string') continue;
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk as unknown as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    keys.set(jwk['kid'], key);
  }
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

/**
 * Verify an RS256 JWT against the gateway's JWKS. On a kid miss (key rotation)
 * the cache is force-refreshed once before giving up.
 */
async function verifyJwtRs256(token: string, env: Env): Promise<JwtClaims | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;

    const header = JSON.parse(b64urlToString(headerB64)) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

    let keys = await loadJwks(env, false);
    let key = keys.get(header.kid);
    if (!key) {
      keys = await loadJwks(env, true);
      key = keys.get(header.kid);
    }
    if (!key) return null;

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, b64urlToUint8(sigB64), data);
    if (!valid) return null;

    const claims = JSON.parse(b64urlToString(payloadB64)) as JwtClaims;
    return claimsValid(claims) ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Verify a token by the algorithm declared in its header — RS256 (new) or HS256
 * (legacy). Reading alg first prevents algorithm-confusion; an unknown alg is
 * rejected.
 */
async function verifyJwt(token: string, env: Env): Promise<JwtClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let alg: string | undefined;
  try {
    alg = (JSON.parse(b64urlToString(parts[0])) as { alg?: string }).alg;
  } catch {
    return null;
  }
  if (alg === 'RS256') return verifyJwtRs256(token, env);
  if (alg === 'HS256') return verifyJwtHs256(token, env.JWT_SECRET);
  return null;
}

function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  // Fallback to access_token cookie (nginx did the same).
  const cookie = request.headers.get('Cookie');
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

// --- CORS ------------------------------------------------------------------

const ALLOWED_HEADERS = [
  'DNT', 'User-Agent', 'X-Requested-With', 'If-Modified-Since', 'Cache-Control',
  'Content-Type', 'Range', 'Authorization', 'X-Session-ID', 'X-Security-Level',
  'X-User-ID', 'X-Timestamp', 'X-Correlation-ID', 'X-Client-Version',
  'X-Request-ID', 'X-Environment', 'x-csrf-token',
].join(',');

function corsOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (allowed.includes(origin)) return origin;
  if (env.ENVIRONMENT !== 'production' && origin.includes('localhost')) return origin;
  return null;
}

function applyCors(response: Response, origin: string | null): Response {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function preflight(origin: string | null): Response {
  const headers = new Headers();
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 204, headers });
}

// --- main fetch handler ----------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const origin = corsOrigin(request, env);

    // Health check for the edge worker itself.
    if (pathname === '/health' || pathname === '/__edge/health') {
      return applyCors(
        Response.json({ status: 'healthy', edge: (request.cf?.colo as string) || 'unknown', ts: new Date().toISOString() }),
        origin
      );
    }

    // CORS preflight — never reaches the backend.
    if (request.method === 'OPTIONS') {
      return preflight(origin);
    }

    const target = resolveTarget(pathname);
    if (!target) {
      return applyCors(Response.json({ error: 'Not Found', path: pathname }, { status: 404 }), origin);
    }

    const originBase = target === 'core' ? env.CORE_URL : env.GATEWAY_URL;
    const backendUrl = new URL(pathname + url.search, originBase);

    // Rebuild headers: strip forgeable identity headers, keep everything else.
    const headers = new Headers(request.headers);
    headers.delete('X-User-ID');
    headers.delete('X-User-Email');
    headers.delete('X-User-Role');
    headers.delete('X-User-Org'); // tenant — only the edge may set it
    headers.delete('X-User-Scopes');
    headers.delete('X-Edge-Auth'); // never allow a client to supply this
    headers.delete('Host');

    // Prove to the Fly backends that this request came through the edge. The
    // backends only trust X-User-* identity when this shared secret matches,
    // which stops anyone from hitting *.fly.dev directly to forge a user.
    if (env.EDGE_AUTH_SECRET) {
      headers.set('X-Edge-Auth', env.EDGE_AUTH_SECRET);
    }
    headers.set('X-Forwarded-Proto', 'https');
    headers.set('X-Forwarded-Host', url.hostname);
    const clientIp = request.headers.get('CF-Connecting-IP');
    if (clientIp) {
      headers.set('X-Real-IP', clientIp);
      headers.set('X-Forwarded-For', clientIp);
    }

    // Inject verified identity (skip for purely public endpoints).
    if (!isPublicPath(pathname)) {
      const token = extractToken(request);
      if (token) {
        const claims = await verifyJwt(token, env);
        if (claims && typeof claims.userId === 'string' && UUID_REGEX.test(claims.userId)) {
          headers.set('X-User-ID', claims.userId);
          headers.set('X-User-Email', claims.email ?? '');
          headers.set('X-User-Role', claims.role ?? 'user');
          // Tenant + scopes for the backend (attachNginxAuth reads X-User-Org).
          if (typeof claims.orgId === 'string' && UUID_REGEX.test(claims.orgId)) {
            headers.set('X-User-Org', claims.orgId);
          }
          const scopes = Array.isArray(claims.scp)
            ? claims.scp.join(' ')
            : typeof claims.scp === 'string'
              ? claims.scp
              : '';
          if (scopes) headers.set('X-User-Scopes', scopes);
        }
      }
    }

    // WebSocket / Socket.IO passthrough — forward Upgrade untouched.
    const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

    const proxyReq = new Request(backendUrl.toString(), {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'manual',
    });

    try {
      const response = await fetch(proxyReq);
      if (isWebSocket) {
        // Canonical CF WebSocket passthrough: hand back the upstream socket
        // with a 101 so the client connects straight through to the backend.
        const ws = (response as unknown as { webSocket?: WebSocket }).webSocket;
        if (ws) {
          return new Response(null, { status: 101, webSocket: ws });
        }
        return response;
      }
      const outHeaders = new Headers(response.headers);
      outHeaders.set('X-Served-By', 'cloudflare-worker');
      const proxied = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: outHeaders,
      });
      return applyCors(proxied, origin);
    } catch (error) {
      return applyCors(
        Response.json(
          { error: 'Backend service unavailable', target, message: error instanceof Error ? error.message : 'Unknown error' },
          { status: 503 }
        ),
        origin
      );
    }
  },
};
