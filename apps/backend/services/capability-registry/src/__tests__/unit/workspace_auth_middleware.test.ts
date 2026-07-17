import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';
import { withNginxAuth, getNginxUser } from '@uaip/middleware';

const NGINX_USER = {
  id: '33333333-3333-3333-3333-333333333333',
  email: 'user@test.com',
  role: 'user',
  organizationId: '00000000-0000-0000-0000-000000000001',
};

describe('workspace auth middleware wiring (real middleware)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('withNginxAuth is a function', () => {
    expect(typeof withNginxAuth).toBe('function');
  });

  it('getNginxUser extracts user from a context-shaped object', () => {
    const fakeCtx = { user: NGINX_USER, set: {}, request: new Request('http://localhost') };
    const user = getNginxUser(fakeCtx);
    expect(user.id).toBe(NGINX_USER.id);
    expect(user.organizationId).toBe(NGINX_USER.organizationId);
  });

  it('getNginxUser throws when user is absent', () => {
    const fakeCtx = { set: {}, request: new Request('http://localhost') };
    expect(() => getNginxUser(fakeCtx)).toThrow(/getNginxUser: user not found/);
  });

  it('withNginxAuth wraps an Elysia instance and returns an Elysia instance', () => {
    const app = new Elysia();
    const wrapped = withNginxAuth(app);
    expect(wrapped).toBeInstanceOf(Elysia);
  });

  it('withNginxAuth rejects unauthenticated requests with 401', async () => {
    const app = withNginxAuth(new Elysia())
      .get('/ping', () => ({ ok: true }));

    const resp = await app.handle(new Request('http://localhost/ping', {
      headers: {},
    }));
    expect(resp.status).toBe(401);
  });
});
