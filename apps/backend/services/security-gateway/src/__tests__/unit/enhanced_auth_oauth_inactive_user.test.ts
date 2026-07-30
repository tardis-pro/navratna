import { EnhancedAuthService } from '../../services/enhanced_auth_service.ts';
import { OAuthProviderType, UserType } from '@uaip/types';

/**
 * Password login rejects inactive accounts (auth_elysia.ts) but the OAuth path
 * resolves a user by email and issues a session directly. Any deactivated
 * account — including the non-loginable system actor — is otherwise reachable
 * by anyone who controls that address at a configured provider.
 */

const { mockUserService, mockOAuthService, mockSessionService, mockMfaService } = vi.hoisted(() => ({
  mockUserService: {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn().mockResolvedValue(null),
    createUser: vi.fn(),
    updateUser: vi.fn().mockResolvedValue(undefined),
  },
  mockOAuthService: {
    findAgentOAuthConnection: vi.fn().mockResolvedValue(null),
    findAgentOAuthConnections: vi.fn().mockResolvedValue([]),
  },
  mockSessionService: {
    createSession: vi.fn().mockResolvedValue({ id: 'session-1', userId: 'user-1' }),
  },
  mockMfaService: {},
}));

vi.mock('@uaip/shared-services', () => ({
  UserService: { getInstance: vi.fn().mockReturnValue(mockUserService) },
  OAuthService: { getInstance: vi.fn().mockReturnValue(mockOAuthService) },
  MFAService: { getInstance: vi.fn().mockReturnValue(mockMfaService) },
  SessionService: { getInstance: vi.fn().mockReturnValue(mockSessionService) },
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  NotFoundError: class NotFoundError extends Error {},
  ValidationError: class ValidationError extends Error {},
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

vi.mock('@uaip/middleware', () => ({
  JWTValidator: {},
  generateAuthTokens: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
}));

vi.mock('@uaip/config', () => ({ config: { security: {}, jwt: {} } }));

const PROVIDER_ID = 'eb474f9c-6eb2-466d-864d-7898e4299af6';

function makeProviderService(email: string) {
  return {
    handleCallback: vi.fn().mockResolvedValue({
      tokens: { accessToken: 'a', refreshToken: 'r' },
      userInfo: { id: '113875594268270712660', email, name: 'Someone' },
      provider: { id: PROVIDER_ID, type: OAuthProviderType.GOOGLE },
      oauthState: { userType: UserType.HUMAN, agentCapabilities: [] },
    }),
  };
}

const makeAuditService = () => ({ logEvent: vi.fn().mockResolvedValue(undefined) });

describe('EnhancedAuthService.authenticateWithOAuth — inactive accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOAuthService.findAgentOAuthConnection.mockResolvedValue(null);
    mockSessionService.createSession.mockResolvedValue({ id: 'session-1', userId: 'user-1' });
  });

  it('refuses to issue a session for a deactivated account', async () => {
    mockUserService.findUserByEmail.mockResolvedValue({
      id: 'inactive-1',
      email: 'disabled@example.com',
      role: 'user',
      isActive: false,
    });

    const svc = new EnhancedAuthService(
      makeProviderService('disabled@example.com') as never,
      makeAuditService() as never
    );

    await expect(
      svc.authenticateWithOAuth('code', 'state', 'https://api/callback')
    ).rejects.toThrow(/disabled|inactive|deactivat/i);

    expect(mockSessionService.createSession).not.toHaveBeenCalled();
  });

  it('refuses the seeded system actor', async () => {
    mockUserService.findUserByEmail.mockResolvedValue({
      id: '00000000-0000-0000-0000-0000000000a1',
      email: 'system@uaip.internal',
      role: 'system',
      isActive: false,
    });

    const svc = new EnhancedAuthService(
      makeProviderService('system@uaip.internal') as never,
      makeAuditService() as never
    );

    await expect(
      svc.authenticateWithOAuth('code', 'state', 'https://api/callback')
    ).rejects.toThrow();

    expect(mockSessionService.createSession).not.toHaveBeenCalled();
  });

  it('still issues a session for an active account', async () => {
    mockUserService.findUserByEmail.mockResolvedValue({
      id: 'active-1',
      email: 'ok@example.com',
      role: 'user',
      isActive: true,
    });

    const svc = new EnhancedAuthService(
      makeProviderService('ok@example.com') as never,
      makeAuditService() as never
    );

    const result = await svc.authenticateWithOAuth('code', 'state', 'https://api/callback');

    expect(result.user.id).toBe('active-1');
    expect(mockSessionService.createSession).toHaveBeenCalled();
  });
});
