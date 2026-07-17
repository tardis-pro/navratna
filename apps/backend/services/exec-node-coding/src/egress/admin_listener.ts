import * as http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CodingEgressPhaseRequestSchema, CodingNodeJwtClaimsSchema } from '@uaip/types';
import { importSPKI, jwtVerify } from 'jose';
import type { KeyLike } from 'jose';
import type { PhaseStore } from './phase_store.js';

const ALG = 'RS256';
const ISSUER = 'uaip-coding-gateway';
const AUDIENCE = 'uaip-coding-node';
const MAX_BODY_BYTES = 4 * 1024;
const READ_TIMEOUT_MS = 2_500;
const MAX_TOKEN_AGE_SECONDS = 60;

let verifyKey: KeyLike | null = null;

export async function loadAdminVerifyKey(publicPem: string): Promise<void> {
  verifyKey = await importSPKI(publicPem.trim(), ALG);
}

export interface AdminDeps {
  phaseStore: PhaseStore;
  getCurrentSessionId: () => string | undefined;
  port?: number;
  host?: string;
  nowSeconds?: () => number;
}

export interface AdminListener {
  close(): Promise<void>;
  listen(): Promise<http.Server>;
  server(): http.Server;
}

export function createAdminListener(deps: AdminDeps): AdminListener {
  const server = http.createServer(async (req, res) => {
    const path = req.url?.split('?', 1)[0] ?? '';
    if (path !== '/phase') {
      sendJson(res, 404, { error: 'not-found' });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' });
      return;
    }
    if (!isJsonContentType(req.headers['content-type'])) {
      sendJson(res, 415, { error: 'content-type-must-be-application-json' });
      return;
    }

    let rawBody: Buffer;
    try {
      rawBody = await readBody(req, MAX_BODY_BYTES, READ_TIMEOUT_MS);
    } catch (error) {
      const status = error instanceof BodyReadError && error.reason === 'too-large' ? 413 : 408;
      sendJson(res, status, { error: status === 413 ? 'body-too-large' : 'request-timeout' });
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawBody.toString('utf8'));
    } catch {
      sendJson(res, 400, { error: 'invalid-json' });
      return;
    }
    const parsed = CodingEgressPhaseRequestSchema.safeParse(raw);
    if (!parsed.success) {
      sendJson(res, 400, { error: 'invalid-body' });
      return;
    }

    const token = getBearer(req);
    if (!token || verifyKey === null) {
      sendJson(res, 401, { error: 'invalid-token' });
      return;
    }

    let rawClaims: unknown;
    try {
      const { payload } = await jwtVerify(token, verifyKey, {
        algorithms: [ALG],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      rawClaims = payload;
    } catch {
      sendJson(res, 401, { error: 'invalid-token' });
      return;
    }
    const parsedClaims = CodingNodeJwtClaimsSchema.safeParse(rawClaims);
    if (!parsedClaims.success) {
      sendJson(res, 401, { error: 'invalid-token' });
      return;
    }
    const claims = parsedClaims.data;
    if (
      claims.sessionId === undefined || claims.workspaceId === undefined || claims.projectId === undefined ||
      claims.userId === undefined || claims.tenantId === undefined || claims.repositoryId === undefined ||
      claims.iat === undefined
    ) {
      sendJson(res, 401, { error: 'invalid-token' });
      return;
    }

    const now = deps.nowSeconds?.() ?? Math.floor(Date.now() / 1000);
    if (claims.iat > now + 5 || now - claims.iat > MAX_TOKEN_AGE_SECONDS) {
      sendJson(res, 401, { error: 'stale-token' });
      return;
    }

    const body = parsed.data;
    if (
      body.sessionId === undefined || body.workspaceId === undefined || body.projectId === undefined ||
      body.userId === undefined || body.tenantId === undefined || body.repositoryId === undefined || body.phase === undefined
    ) {
      sendJson(res, 400, { error: 'invalid-body' });
      return;
    }
    if (
      claims.sessionId !== body.sessionId ||
      claims.workspaceId !== body.workspaceId ||
      claims.projectId !== body.projectId ||
      claims.userId !== body.userId ||
      claims.tenantId !== body.tenantId ||
      claims.repositoryId !== body.repositoryId
    ) {
      sendJson(res, 403, { error: 'scope-mismatch' });
      return;
    }
    if (deps.getCurrentSessionId() !== body.sessionId) {
      sendJson(res, 403, { error: 'session-mismatch' });
      return;
    }

    deps.phaseStore.set(body.phase);
    sendJson(res, 200, { ok: true, phase: body.phase, sessionId: body.sessionId });
  });

  return {
    server: () => server,
    listen: () => new Promise((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      server.once('error', onError);
      server.listen(deps.port ?? 15444, deps.host ?? '::', () => {
        server.removeListener('error', onError);
        resolve(server);
      });
    }),
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function isJsonContentType(value: string | undefined): boolean {
  return typeof value === 'string' && value.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function getBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  return match?.[1] ?? null;
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    Connection: 'close',
  });
  res.end(text);
}

class BodyReadError extends Error {
  constructor(readonly reason: 'too-large' | 'timeout' | 'aborted') {
    super(reason);
    this.name = 'BodyReadError';
  }
}

function readBody(req: IncomingMessage, maxBytes: number, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (error?: BodyReadError): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onAbort);
      req.removeListener('aborted', onAbort);
      if (error) reject(error);
      else resolve(Buffer.concat(chunks));
    };
    const onData = (chunk: Buffer): void => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        finish(new BodyReadError('too-large'));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = (): void => finish();
    const onAbort = (): void => finish(new BodyReadError('aborted'));
    const timer = setTimeout(() => {
      finish(new BodyReadError('timeout'));
      req.destroy();
    }, timeoutMs);
    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onAbort);
    req.once('aborted', onAbort);
  });
}
