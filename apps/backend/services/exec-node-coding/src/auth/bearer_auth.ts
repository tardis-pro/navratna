import * as crypto from 'node:crypto';
import Elysia from 'elysia';

export function extractBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') return undefined;
  return parts[1];
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function createBearerAuth(expectedToken: string) {
  return new Elysia({ name: 'exec-node-coding-bearer-auth' })
    .guard({
      beforeHandle({ request, set }) {
        const authorization = request.headers.get('authorization') ?? undefined;
        const token = extractBearerToken(authorization);
        if (!token || !timingSafeEqual(token, expectedToken)) {
          set.status = 401;
          return { error: 'Invalid or missing Authorization: Bearer token' };
        }
      },
    });
}
