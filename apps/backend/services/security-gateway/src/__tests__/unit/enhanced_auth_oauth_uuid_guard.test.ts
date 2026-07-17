import { EnhancedAuthService } from '../../services/enhanced_auth_service.ts';
import { OAuthProviderType, UserType } from '@uaip/types';

const { mockUserService, mockOAuthService, mockSessionService, mockMfaService } = vi.hoisted(() => ({
  mockUserService: {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn().mockResolvedValue(null),
    createUser: vi.fn(),
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

const GOOGLE_SUB = '113875594268270712660';
const GOOGLE_PROVIDER_ID = 'eb474f9c-6eb2-466d-864d-7898e4299af6';

const makeProviderService = () => ({
  handleCallback: vi.fn().mockResolvedValue({
    tokens: { accessToken: 'gh-access', refreshToken: 'gh-refresh' },
    userInfo: { id: GOOGLE_SUB, email: 'newuser@gmail.com', name: 'New User' },
    provider: { id: GOOGLE_PROVIDER_ID, type: OAuthProviderType.GOOGLE },
    oauthState: { userType: UserType.HUMAN, agentCapabilities: [] },
  }),
});

const makeAuditService = () => ({ logEvent: vi.fn().mockResolvedValue(undefined) });

describe('EnhancedAuthService.authenticateWithOAuth — UUID guard on agent-connection lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserService.findUserByEmail.mockResolvedValue(null);
    mockUserService.findUserById.mockResolvedValue(null);
    mockUserService.createUser.mockResolvedValue({
      id: 'provisioned-user-1',
      email: 'newuser@gmail.com',
      role: 'user',
    });
    mockOAuthService.findAgentOAuthConnection.mockResolvedValue(null);
    mockSessionService.createSession.mockResolvedValue({ id: 'session-1', userId: 'provisioned-user-1' });
  });

  it('does NOT pass a non-UUID Google sub into findAgentOAuthConnection (would crash the UUID column)', async () => {
    const providerService = makeProviderService();
    const auditService = makeAuditService();
    const svc = new EnhancedAuthService(providerService as never, auditService as never);

    await svc.authenticateWithOAuth('code-123', 'state-123', 'https://api/callback');

    expect(mockOAuthService.findAgentOAuthConnection).not.toHaveBeenCalled();
  });

  it('provisions a first-time Google user via createUser when no email match exists', async () => {
    const providerService = makeProviderService();
    const auditService = makeAuditService();
    const svc = new EnhancedAuthService(providerService as never, auditService as never);

    const result = await svc.authenticateWithOAuth('code-123', 'state-123', 'https://api/callback');

    expect(mockUserService.createUser).toHaveBeenCalledTimes(1);
    expect(result.user.id).toBe('provisioned-user-1');
  });

  it('still uses findAgentOAuthConnection when userInfo.id IS a real UUID', async () => {
    const realUuid = '11111111-2222-4333-8444-555555555555';
    const providerService = {
      handleCallback: vi.fn().mockResolvedValue({
        tokens: { accessToken: 'a', refreshToken: 'r' },
        userInfo: { id: realUuid, email: undefined, name: 'Agent' },
        provider: { id: GOOGLE_PROVIDER_ID, type: OAuthProviderType.GOOGLE },
        oauthState: { userType: UserType.HUMAN, agentCapabilities: [] },
      }),
    };
    const auditService = makeAuditService();
    const svc = new EnhancedAuthService(providerService as never, auditService as never);

    await svc.authenticateWithOAuth('code-123', 'state-123', 'https://api/callback');

    expect(mockOAuthService.findAgentOAuthConnection).toHaveBeenCalledWith(realUuid, GOOGLE_PROVIDER_ID);
  });
});
