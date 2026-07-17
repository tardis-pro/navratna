// Execution Mesh — BYO-node quick enrollment (HTTP control plane).
//
// Lets a Navratna user register their OWN docker container / EC2 instance as a
// compute node in one step:
//   1. POST /api/v1/mesh/nodes/tokens   (user-authed) -> mint a short-lived,
//      single-use, org-scoped ENROLLMENT token + a ready-to-run `docker run`.
//   2. POST /api/v1/mesh/nodes/enroll   (Bearer = enrollment token) -> the node
//      presents the token + its self-detected descriptor; we register it in the
//      shared ExecutionNodeRegistry (stamped with owner + org affinity) and hand
//      back a longer-lived NODE token used to heartbeat.
//   3. POST /api/v1/mesh/nodes/:id/heartbeat (Bearer = node token) -> liveness.
//   4. GET  /api/v1/mesh/nodes          (user-authed) -> the caller's nodes with
//      what each advertised it can run (runtimes/tier/labels).
//
// Security: tokens are HS256 JWTs signed with MESH_ENROLL_SECRET (fallback:
// JWT_SECRET). Enrollment tokens are single-use (jti) and expire fast; the node
// proves identity per-heartbeat with its node token (sub === node id). The node
// never receives the platform's Redis/bus secrets from this path.

import { Elysia, t } from 'elysia';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { logger } from '@uaip/utils';
import { withRequiredAuth } from '@uaip/middleware';
import type {
  ExecutionNodeEnrollResponse,
  ExecutionRuntime,
  NodeTier,
  UserContext,
} from '@uaip/types';
import { config } from '../config/config.js';
import { ExecutionScheduler } from '../services/execution_mesh/scheduler.js';

// --- config knobs (env-driven; safe fallbacks) -----------------------------
const ENROLL_SECRET = process.env.MESH_ENROLL_SECRET || config.jwt.secret;
const ENROLL_TTL_SEC = parseInt(process.env.MESH_ENROLL_TTL_SEC || '900', 10); // 15 min
const NODE_TOKEN_TTL_SEC = parseInt(process.env.MESH_NODE_TOKEN_TTL_SEC || '86400', 10); // 24 h
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.EXEC_NODE_HEARTBEAT_MS || '5000', 10);
const PUBLIC_API_URL = (
  process.env.MESH_PUBLIC_API_URL ||
  process.env.PUBLIC_API_URL ||
  'https://YOUR-NAVRATNA-HOST'
).replace(/\/$/, '');
const NODE_IMAGE = process.env.NAVRATNA_EXEC_NODE_IMAGE || 'uaip/exec-node-mcp:latest';

// --- tiny HS256 JWT (no external dep) ---------------------------------------
function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlJson(obj: unknown): string {
  return b64url(JSON.stringify(obj));
}

interface JwtClaims {
  sub: string; // node id
  typ: 'mesh-enroll' | 'mesh-node';
  owner: string; // user id
  org: string; // organization id
  jti: string;
  iat: number;
  exp: number;
}

function signJwt(claims: JwtClaims, secret: string): string {
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = b64urlJson(claims);
  const data = `${header}.${payload}`;
  const sig = b64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

function verifyJwt(token: string, secret: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = b64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as JwtClaims;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

// Single-use enrollment tokens: remember spent jti until they would have expired.
const spentJti = new Map<string, number>();
function pruneSpent(): void {
  const now = Date.now();
  for (const [jti, exp] of spentJti) if (exp < now) spentJti.delete(jti);
}

function bearer(headers: Record<string, string | undefined>): string | null {
  const raw = headers.authorization || headers.Authorization;
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function registry() {
  return ExecutionScheduler.getInstance().getRegistry();
}

// The one-liners we hand back so the user just copies + pastes.
function dockerRunCmd(token: string): string {
  return [
    'docker run -d --restart unless-stopped',
    '  -v /var/run/docker.sock:/var/run/docker.sock',
    `  -e NAVRATNA_API_URL=${PUBLIC_API_URL}`,
    `  -e NAVRATNA_NODE_TOKEN=${token}`,
    `  ${NODE_IMAGE}`,
  ].join(' \\\n');
}

function curlBootstrapCmd(token: string): string {
  return (
    `curl -fsSL ${PUBLIC_API_URL}/api/v1/mesh/nodes/bootstrap.sh | ` +
    `NAVRATNA_API_URL=${PUBLIC_API_URL} NAVRATNA_NODE_TOKEN=${token} bash`
  );
}

// Served verbatim by GET /bootstrap.sh so `curl … | bash` works out of the box.
const BOOTSTRAP_SCRIPT = `#!/usr/bin/env bash
# Navratna exec-node bootstrap. Installs Docker if missing, then runs the agent.
set -euo pipefail
: "\${NAVRATNA_API_URL:?NAVRATNA_API_URL is required}"
: "\${NAVRATNA_NODE_TOKEN:?NAVRATNA_NODE_TOKEN is required}"
IMAGE="\${NAVRATNA_EXEC_NODE_IMAGE:-${NODE_IMAGE}}"
NAME="\${NAVRATNA_NODE_NAME:-navratna-exec-node}"
if ! command -v docker >/dev/null 2>&1; then
  echo "[bootstrap] installing Docker ..."; curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$(whoami)" || true
fi
docker pull "\${IMAGE}" || echo "[bootstrap] pull failed; using local image if present"
docker rm -f "\${NAME}" >/dev/null 2>&1 || true
docker run -d --name "\${NAME}" --restart unless-stopped \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -e NAVRATNA_API_URL="\${NAVRATNA_API_URL}" \\
  -e NAVRATNA_NODE_TOKEN="\${NAVRATNA_NODE_TOKEN}" \\
  "\${IMAGE}"
echo "[bootstrap] node started — it should appear online shortly. Logs: docker logs -f \${NAME}"
`;

// User-authed control surface: mint tokens + list your nodes. The whole group is
// behind withRequiredAuth (a real Navratna user JWT).
function userRoutes() {
  return new Elysia().group('/api/v1/mesh/nodes', (group) =>
    withRequiredAuth(group)
      .post(
        '/tokens',
        (ctx) => {
          const user = (ctx as unknown as { user: UserContext }).user;
          const now = Math.floor(Date.now() / 1000);
          const nodeId = `usr-${user.organizationId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
          const token = signJwt(
            {
              sub: nodeId,
              typ: 'mesh-enroll',
              owner: user.id,
              org: user.organizationId,
              jti: randomUUID(),
              iat: now,
              exp: now + ENROLL_TTL_SEC,
            },
            ENROLL_SECRET
          );
          return {
            nodeId,
            token,
            expiresInSec: ENROLL_TTL_SEC,
            dockerRun: dockerRunCmd(token),
            curlBootstrap: curlBootstrapCmd(token),
          };
        },
        { body: t.Optional(t.Any()) }
      )
      .get('/', (ctx) => {
        const user = (ctx as unknown as { user: UserContext }).user;
        const nodes = registry()
          .listNodes()
          .filter((n) => n.owner === user.id || n.affinity?.tenant === user.organizationId)
          .map((n) => ({
            id: n.id,
            runtime: n.runtime,
            health: n.health,
            tier: n.tier,
            runtimes: n.runtimes ?? [],
            capabilities: n.capabilities,
            labels: n.labels ?? {},
            capacity: n.capacity,
            lastHeartbeat: n.lastHeartbeat,
          }));
        return { nodes };
      })
  );
}

// Node-facing surface: authenticated by the enroll/node token in the request
// itself (NOT a user JWT), so it must live outside withRequiredAuth.
function nodeRoutes() {
  return new Elysia().group('/api/v1/mesh/nodes', (group) =>
    group
      .get('/bootstrap.sh', (ctx) => {
        ctx.set.headers['content-type'] = 'text/plain; charset=utf-8';
        return BOOTSTRAP_SCRIPT;
      })
      .post(
        '/enroll',
        (ctx): ExecutionNodeEnrollResponse | { error: string; code: string } => {
          const token = bearer(ctx.headers as Record<string, string | undefined>);
          const claims = token ? verifyJwt(token, ENROLL_SECRET) : null;
          if (!claims || claims.typ !== 'mesh-enroll') {
            ctx.set.status = 401;
            return { error: 'Invalid or expired enrollment token', code: 'ENROLL_INVALID' };
          }
          pruneSpent();
          if (spentJti.has(claims.jti)) {
            ctx.set.status = 409;
            return { error: 'Enrollment token already used', code: 'ENROLL_SPENT' };
          }
          spentJti.set(claims.jti, claims.exp * 1000);

          const body = (ctx.body ?? {}) as {
            runtime?: ExecutionRuntime;
            capabilities?: string[];
            capacity?: { maxConcurrent: number; cpu: number; memMb: number };
            runtimes?: string[];
            tier?: NodeTier;
            labels?: Record<string, string>;
          };

          registry().registerNode({
            id: claims.sub,
            runtime: body.runtime ?? 'docker-mcp',
            capabilities: body.capabilities?.length ? body.capabilities : ['mcp-'],
            capacity: body.capacity ?? { maxConcurrent: 8, cpu: 2, memMb: 2048 },
            affinity: { tenant: claims.org },
            health: 'ready',
            lastHeartbeat: Date.now(),
            owner: claims.owner,
            runtimes: body.runtimes ?? [],
            tier: body.tier,
            labels: body.labels,
          });

          const now = Math.floor(Date.now() / 1000);
          const nodeToken = signJwt(
            {
              sub: claims.sub,
              typ: 'mesh-node',
              owner: claims.owner,
              org: claims.org,
              jti: randomUUID(),
              iat: now,
              exp: now + NODE_TOKEN_TTL_SEC,
            },
            ENROLL_SECRET
          );

          logger.info('Execution node enrolled via token', {
            nodeId: claims.sub,
            owner: claims.owner,
            runtimes: body.runtimes,
            tier: body.tier,
          });

          return {
            nodeId: claims.sub,
            tenant: claims.org,
            nodeToken,
            heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
          };
        },
        { body: t.Optional(t.Any()) }
      )
      .post(
        '/:id/heartbeat',
        (ctx) => {
          const token = bearer(ctx.headers as Record<string, string | undefined>);
          const claims = token ? verifyJwt(token, ENROLL_SECRET) : null;
          const nodeId = (ctx.params as { id: string }).id;
          if (!claims || claims.typ !== 'mesh-node' || claims.sub !== nodeId) {
            ctx.set.status = 401;
            return { error: 'Invalid node token', code: 'NODE_TOKEN_INVALID' };
          }
          const body = (ctx.body ?? {}) as {
            health?: 'ready' | 'degraded' | 'draining' | 'down';
          };
          registry().recordHeartbeat({ id: nodeId, health: body.health });
          return { ok: true };
        },
        { body: t.Optional(t.Any()) }
      )
  );
}

export function registerMeshNodeRoutes() {
  logger.info('Registering execution-mesh BYO-node routes');
  return new Elysia().use(nodeRoutes()).use(userRoutes());
}
