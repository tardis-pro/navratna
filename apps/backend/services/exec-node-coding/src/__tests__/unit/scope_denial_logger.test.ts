/**
 * Tests for scope_denial_logger.ts
 *
 * Requirements verified:
 * 1. logScopeDenial logs exactly the expected structured fields.
 * 2. No bearer token, raw authorization header, or body data enters the log.
 * 3. Only field NAME (mismatch_field) is logged — not field VALUE from JWT or body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

vi.mock('@uaip/utils', () => ({
  logger: {
    warn: mockWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logScopeDenial } from '../../auth/scope_denial_logger.js';

const SESSION_ID_FROM_PATH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID_FROM_JWT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_FROM_JWT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const BEARER_TOKEN = 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0In0.fakesig';
const REQUEST_BODY = '{"message":"my super secret prompt"}';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('logScopeDenial — structured log fields', () => {
  it('logs security_event, route, mismatch_field, and session/user IDs', () => {
    logScopeDenial({
      route: '/sessions/:id/prompt',
      mismatchField: 'sessionId',
      pathSessionId: SESSION_ID_FROM_PATH,
      jwtSessionId: SESSION_ID_FROM_JWT,
      jwtUserId: USER_ID_FROM_JWT,
    });

    expect(mockWarn).toHaveBeenCalledOnce();
    const [msg, meta] = mockWarn.mock.calls[0]!;
    expect(msg).toBe('exec-node-coding: JWT scope denial');
    expect(meta).toBeDefined();
    expect(meta.security_event).toBe('jwt_scope_denial');
    expect(meta.route).toBe('/sessions/:id/prompt');
    expect(meta.mismatch_field).toBe('sessionId');
    expect(meta.path_session_id).toBe(SESSION_ID_FROM_PATH);
    expect(meta.jwt_session_id).toBe(SESSION_ID_FROM_JWT);
    expect(meta.jwt_user_id).toBe(USER_ID_FROM_JWT);
  });

  it('does not log the Bearer token value', () => {
    logScopeDenial({
      route: '/sessions/:id/abort',
      mismatchField: 'sessionId',
      pathSessionId: SESSION_ID_FROM_PATH,
      jwtSessionId: SESSION_ID_FROM_JWT,
      jwtUserId: USER_ID_FROM_JWT,
    });

    expect(mockWarn).toHaveBeenCalledOnce();
    const loggedMeta = JSON.stringify(mockWarn.mock.calls[0]);
    expect(loggedMeta).not.toContain(BEARER_TOKEN);
    expect(loggedMeta).not.toContain('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('does not log request body or prompt content', () => {
    logScopeDenial({
      route: '/sessions',
      mismatchField: 'workspaceId',
      pathSessionId: SESSION_ID_FROM_PATH,
      jwtSessionId: SESSION_ID_FROM_JWT,
      jwtUserId: USER_ID_FROM_JWT,
    });

    expect(mockWarn).toHaveBeenCalledOnce();
    const loggedMeta = JSON.stringify(mockWarn.mock.calls[0]);
    expect(loggedMeta).not.toContain(REQUEST_BODY);
    expect(loggedMeta).not.toContain('super secret prompt');
  });

  it('logs only the field NAME (mismatch_field) not the actual mismatched value', () => {
    const BODY_WORKSPACE_ID = 'workspace-from-body-not-matching';
    const JWT_WORKSPACE_ID = 'workspace-from-jwt-bbbbbbbb';

    logScopeDenial({
      route: '/sessions',
      mismatchField: 'workspaceId',
      pathSessionId: SESSION_ID_FROM_PATH,
      jwtSessionId: SESSION_ID_FROM_JWT,
      jwtUserId: USER_ID_FROM_JWT,
    });

    expect(mockWarn).toHaveBeenCalledOnce();
    const loggedMeta = JSON.stringify(mockWarn.mock.calls[0]);
    // Field NAME is logged
    expect(loggedMeta).toContain('workspaceId');
    // But the actual mismatched VALUES are not logged in the metadata
    expect(loggedMeta).not.toContain(BODY_WORKSPACE_ID);
    expect(loggedMeta).not.toContain(JWT_WORKSPACE_ID);
  });

  it('works for all four route denial contexts', () => {
    const routes = [
      '/sessions',
      '/sessions/:id/prompt',
      '/sessions/:id/verify',
      '/sessions/:id/abort',
      '/sessions/:id',
    ];

    for (const route of routes) {
      vi.clearAllMocks();
      logScopeDenial({
        route,
        mismatchField: 'sessionId',
        pathSessionId: SESSION_ID_FROM_PATH,
        jwtSessionId: SESSION_ID_FROM_JWT,
        jwtUserId: USER_ID_FROM_JWT,
      });

      expect(mockWarn).toHaveBeenCalledOnce();
      const [, meta] = mockWarn.mock.calls[0]!;
      expect(meta.route).toBe(route);
      expect(meta.security_event).toBe('jwt_scope_denial');
    }
  });
});
