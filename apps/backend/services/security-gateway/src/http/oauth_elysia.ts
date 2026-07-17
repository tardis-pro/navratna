import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withOptionalAuth, withRequiredAuth } from '@uaip/middleware';
import { OAuthProviderService } from '../services/oauth_provider_service.js';
import { EnhancedAuthService } from '../services/enhanced_auth_service.js';
import { AuditService } from '../services/audit_service.js';
import { UserType, AgentCapability, OAuthProviderType, AuditEventType } from '@uaip/types';
import { UserService } from '@uaip/shared-services';

import { getAuthUser, getErrorMessage } from './context_helpers.js';
import { setAuthCookies } from './auth_elysia.js';

/**
 * Public production callback URL registered in the GitHub/Google OAuth consoles.
 * The SAME value must be used for the authorize step and the token exchange, so it is
 * centralized here. Override via OAUTH_CALLBACK_URL if the API host ever changes.
 */
function getOAuthCallbackUrl(): string {
  return process.env.OAUTH_CALLBACK_URL || 'https://api.navratna.tardis.digital/api/v1/oauth/callback';
}

/** Frontend app URL the browser is returned to after a successful OAuth callback. */
function getFrontendBaseUrl(): string {
  return (
    process.env.FRONTEND_BASE_URL ||
    process.env.APP_BASE_URL ||
    'https://navratna.tardis.digital'
  );
}

let oauthProviderServiceSingleton: OAuthProviderService | null = null;
let enhancedAuthServiceSingleton: EnhancedAuthService | null = null;
let auditServiceSingleton: AuditService | null = null;

function getServices() {
  if (!auditServiceSingleton) auditServiceSingleton = new AuditService();
  if (!oauthProviderServiceSingleton)
    oauthProviderServiceSingleton = new OAuthProviderService(auditServiceSingleton);
  if (!enhancedAuthServiceSingleton)
    enhancedAuthServiceSingleton = new EnhancedAuthService(
      oauthProviderServiceSingleton,
      auditServiceSingleton
    );
  return {
    oauthProviderService: oauthProviderServiceSingleton,
    enhancedAuthService: enhancedAuthServiceSingleton,
    auditService: auditServiceSingleton,
  };
}

const AuthorizeRequestSchema = z.object({
  provider_id: z.string().min(1),
  redirect_uri: z.string().url(),
  user_type: z.nativeEnum(UserType).optional().default(UserType.HUMAN),
  agent_capabilities: z.array(z.nativeEnum(AgentCapability)).optional(),
  scope: z.array(z.string()).optional(),
});

const CallbackRequestSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  redirect_uri: z.string().url().optional(),
});

const AgentAuthRequestSchema = z.object({
  agent_id: z.string().min(1),
  agent_token: z.string().min(1),
  capabilities: z.array(z.nativeEnum(AgentCapability)),
  requested_scopes: z.array(z.string()).optional(),
  requested_providers: z.array(z.string()).optional(),
});

const providerIdParamsSchema = z.object({ providerId: z.string().min(1) });
const connectBodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  redirectUri: z.string().optional(),
});
const optionalOperationSchema = z.object({ operation: z.string().optional() });

export function registerOAuthRoutes() {
  return new Elysia().group('/api/v1/oauth', (app) => withOptionalAuth(app)
    // GET /providers
    .get('/providers', async ({ set, query }) => {
      try {
        const { oauthProviderService } = getServices();
        const userTypeRaw =
          typeof query === 'object' && query !== null && 'userType' in query
            ? query.userType
            : undefined;
        const userType =
          typeof userTypeRaw === 'string'
            ? (Object.values(UserType).find((t) => t === userTypeRaw) ?? UserType.HUMAN)
            : UserType.HUMAN;
        const providers = await oauthProviderService.getAvailableProviders(userType);
        return {
          success: true,
          providers: providers.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            isEnabled: p.isEnabled,
            agentAccess: p.agentConfig?.allowAgentAccess || false,
            requiredCapabilities: p.agentConfig?.requiredCapabilities || [],
            scope: p.scope,
          })),
        };
      } catch (error) {
        logger.error('Failed to get OAuth providers', { error });
        set.status = 500;
        return { success: false, error: 'Failed to get OAuth providers' };
      }
    })
  
    // POST /authorize
    .post('/authorize', async ({ set, body, request, headers }) => {
      try {
        const validated = AuthorizeRequestSchema.parse(body);
        const { oauthProviderService, auditService } = getServices();
        const { url, state } = await oauthProviderService.generateAuthorizationUrl(
          validated.provider_id,
          validated.redirect_uri,
          validated.user_type,
          validated.agent_capabilities
        );
        await auditService.logEvent({
          eventType: AuditEventType.OAUTH_AUTHORIZE_INITIATED,
          details: {
            providerId: validated.provider_id,
            userType: validated.user_type,
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'],
          },
        });
        return { success: true, authorization_url: url, state };
      } catch (error: unknown) {
        const errorMsg = getErrorMessage(error);
        logger.error('Authorize failed', { error: errorMsg });
        set.status = 400;
        return { success: false, error: errorMsg || 'Authorization failed' };
      }
    })
  
    // POST /callback
    .post('/callback', async ({ set, body, request, headers }) => {
      try {
        const validated = CallbackRequestSchema.parse(body);
        const { enhancedAuthService, auditService } = getServices();
        const ipAddress = request.headers.get('x-forwarded-for') || '';
        const userAgent = headers['user-agent'];
        const redirectUri =
          validated.redirect_uri || `${request.url.split('/api')[0]}/api/auth/oauth/callback`;
        const authResult = await enhancedAuthService.authenticateWithOAuth(
          validated.code,
          validated.state,
          redirectUri,
          ipAddress,
          userAgent
        );
        await auditService.logEvent({
          eventType: AuditEventType.OAUTH_CALLBACK_SUCCESS,
          userId: authResult.user.id,
          details: { userType: authResult.user.userType, sessionId: authResult.session.id },
        });
        return {
          success: true,
          user: {
            id: authResult.user.id,
            email: authResult.user.email,
            name: authResult.user.name,
            userType: authResult.user.userType,
            role: authResult.user.role,
          },
          session: { id: authResult.session.id, expiresAt: authResult.session.expiresAt },
          tokens: {
            access_token: authResult.tokens.accessToken,
            refresh_token: authResult.tokens.refreshToken,
            expires_at: authResult.session.expiresAt,
            token_type: 'Bearer',
          },
          mfa_required: authResult.requiresMFA,
          mfa_challenge: authResult.mfaChallenge,
        };
      } catch (error: unknown) {
        const errorMsg = getErrorMessage(error);
        const { auditService } = getServices();
        await auditService.logEvent({
          eventType: AuditEventType.OAUTH_CALLBACK_FAILED,
          details: {
            error: errorMsg,
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'],
          },
        });
        set.status = 500;
        return { success: false, error: errorMsg || 'OAuth callback failed' };
      }
    })

    // GET /initiate/:provider — browser entry point for OAuth-only signup/login.
    // Resolves the provider by type ('github' | 'google'), builds the authorization
    // URL, and 302-redirects the browser to the provider's consent screen.
    .get('/initiate/:provider', async ({ params, set, request, headers }) => {
      const providerKey = String(params.provider || '').toLowerCase();
      const frontend = getFrontendBaseUrl();
      try {
        const { oauthProviderService, auditService } = getServices();
        const available = await oauthProviderService.getAvailableProviders(UserType.HUMAN);
        const provider = available.find(
          (p) => p.type === providerKey || p.name?.toLowerCase() === providerKey
        );
        if (!provider || !provider.id) {
          set.status = 302;
          set.headers['Location'] = `${frontend}/?oauth_error=${encodeURIComponent('provider_not_available')}`;
          return '';
        }
        const { url } = await oauthProviderService.generateAuthorizationUrl(
          provider.id,
          getOAuthCallbackUrl(),
          UserType.HUMAN
        );
        await auditService.logEvent({
          eventType: AuditEventType.OAUTH_AUTHORIZE_INITIATED,
          details: {
            providerId: provider.id,
            providerType: provider.type,
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'],
          },
        });
        set.status = 302;
        set.headers['Location'] = url;
        return '';
      } catch (error: unknown) {
        const errorMsg = getErrorMessage(error);
        logger.error('OAuth initiate failed', { provider: providerKey, error: errorMsg });
        set.status = 302;
        set.headers['Location'] = `${frontend}/?oauth_error=${encodeURIComponent(errorMsg || 'initiate_failed')}`;
        return '';
      }
    })

    // GET /callback — provider redirect target. Exchanges the code, provisions or links
    // the user, sets the SAME httpOnly auth cookies as password login, then redirects
    // the browser back to the frontend app (now authenticated).
    .get('/callback', async ({ query, set, cookie, request, headers }) => {
      const frontend = getFrontendBaseUrl();
      const q = (query ?? {}) as Record<string, string | undefined>;
      const code = q.code;
      const state = q.state;
      if (!code || !state) {
        set.status = 302;
        set.headers['Location'] = `${frontend}/?oauth_error=${encodeURIComponent('missing_code_or_state')}`;
        return '';
      }
      try {
        const { enhancedAuthService, auditService } = getServices();
        const ipAddress = request.headers.get('x-forwarded-for') || '';
        const userAgent = headers['user-agent'];
        const authResult = await enhancedAuthService.authenticateWithOAuth(
          code,
          state,
          getOAuthCallbackUrl(),
          ipAddress,
          userAgent
        );

        const userId = authResult.user.id;
        if (!userId) {
          throw new Error('Authenticated user is missing an id');
        }

        // Persist the refresh token so the /auth/refresh rotation works (mirrors login).
        await UserService.getInstance().createRefreshToken(
          userId,
          authResult.tokens.refreshToken,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        );

        // Establish the exact same httpOnly session cookies as password login.
        setAuthCookies(cookie, {
          accessToken: authResult.tokens.accessToken,
          refreshToken: authResult.tokens.refreshToken,
        });

        await auditService.logEvent({
          eventType: AuditEventType.OAUTH_CALLBACK_SUCCESS,
          userId,
          details: { userType: authResult.user.userType, sessionId: authResult.session.id },
        });

        set.status = 302;
        set.headers['Location'] = frontend;
        return '';
      } catch (error: unknown) {
        const errorMsg = getErrorMessage(error);
        const { auditService } = getServices();
        await auditService.logEvent({
          eventType: AuditEventType.OAUTH_CALLBACK_FAILED,
          details: {
            error: errorMsg,
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'],
          },
        });
        logger.error('OAuth callback (GET) failed', { error: errorMsg });
        set.status = 302;
        set.headers['Location'] = `${frontend}/?oauth_error=${encodeURIComponent(errorMsg || 'oauth_callback_failed')}`;
        return '';
      }
    })

    // POST /agent/authenticate
    .post('/agent/authenticate', async ({ set, body, request, headers }) => {
      try {
        const validated = AgentAuthRequestSchema.parse(body);
        const { enhancedAuthService, auditService } = getServices();
        const ipAddress = request.headers.get('x-forwarded-for') || '';
        const userAgent = headers['user-agent'];
        const validOAuthProviderTypes = new Set<string>(Object.values(OAuthProviderType));
        const requestedProviders = (validated.requested_providers ?? []).filter(
          (p): p is OAuthProviderType => validOAuthProviderTypes.has(p)
        );
        const authResult = await enhancedAuthService.authenticateAgent({
          agentId: validated.agent_id,
          agentToken: validated.agent_token,
          capabilities: validated.capabilities,
          requestedProviders,
          ipAddress,
          userAgent,
        });
        await auditService.logEvent({
          eventType: AuditEventType.AGENT_AUTH_SUCCESS,
          agentId: validated.agent_id,
          details: {
            capabilities: validated.capabilities,
            requestedProviders: validated.requested_providers,
          },
        });
        return {
          success: true,
          agent: {
            id: authResult.user.id,
            name: authResult.user.name,
            capabilities: authResult.user.agentConfig?.capabilities || [],
            userType: authResult.user.userType,
          },
          tokens: {
            access_token: authResult.tokens.accessToken,
            refresh_token: authResult.tokens.refreshToken,
            expires_at: authResult.session.expiresAt,
            token_type: 'Bearer',
          },
          session: { id: authResult.session.id, expiresAt: authResult.session.expiresAt },
        };
      } catch (error: unknown) {
        const errorMsg = getErrorMessage(error);
        const { auditService } = getServices();
        const parsedBody = AgentAuthRequestSchema.safeParse(body);
        await auditService.logEvent({
          eventType: AuditEventType.AGENT_AUTH_FAILED,
          agentId: parsedBody.success ? parsedBody.data.agent_id : undefined,
          details: {
            error: errorMsg,
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'],
          },
        });
        set.status = 500;
        return { success: false, error: errorMsg || 'Agent authentication failed' };
      }
    })
  
    // POST /connect (requires auth)
    .group('', (g) => // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
    withRequiredAuth(g).post('/connect', async ({ set, body, user }) => {
      try {
        const parsedBody = connectBodySchema.safeParse(body);
        if (!parsedBody.success) {
          set.status = 400;
          return { success: false, error: 'Authorization code and state are required' };
        }
        const { code, state, redirectUri } = parsedBody.data;
        if (!code || !state) {
          set.status = 400;
          return { success: false, error: 'Authorization code and state are required' };
        }
        const { enhancedAuthService } = getServices();
        const baseRedirect = redirectUri || '';
        const result = await enhancedAuthService.connectOAuthProvider(
          user!.id,
          code,
          state,
          baseRedirect
        );
        const resultSuccess =
          typeof result === 'object' && result !== null && 'success' in result
            ? Boolean(result.success)
            : true;
        logger.info('OAuth provider connected', {
          userId: user!.id,
          success: resultSuccess,
        });
        return {
          success: resultSuccess,
          message: 'OAuth provider connected successfully',
        };
      } catch (error: unknown) {
        const errorMsg = getErrorMessage(error);
        set.status = 500;
        return { success: false, error: errorMsg || 'Failed to connect OAuth provider' };
      }
    })
    )
  
    // Provider-specific operations (require auth)
    .group('/agent', (g) => withRequiredAuth(g)
      // GitHub operations
      .post('/github/:providerId', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params, body } = ctx;
        try {
          const { providerId } = providerIdParamsSchema.parse(params);
          const validated = z
            .object({
              operation: z.enum(['list_repos', 'get_repo', 'create_repo', 'clone_repo']),
              repository: z.string().optional(),
              parameters: z.record(z.any()).optional(),
            })
            .parse(body);
          const { oauthProviderService, auditService } = getServices();
          let result: unknown;
          switch (validated.operation) {
            case 'list_repos':
              result = await oauthProviderService.getGitHubRepos(user.id, providerId);
              break;
            case 'get_repo':
              if (!validated.repository) {
                set.status = 400;
                return { success: false, error: 'Repository name required' };
              }
              result = await oauthProviderService.getGitHubRepo(
                user.id,
                providerId,
                validated.repository
              );
              break;
            default:
              set.status = 400;
              return { success: false, error: `Unsupported operation: ${validated.operation}` };
          }
          await auditService.logEvent({
            eventType: AuditEventType.AGENT_OPERATION_SUCCESS,
            agentId: user.id,
            details: {
              providerId,
              operation: validated.operation,
              repository: validated.repository,
              resultCount: Array.isArray(result) ? result.length : 1,
            },
          });
          return { success: true, operation: validated.operation, data: result };
        } catch (error: unknown) {
          const errorMsg = getErrorMessage(error);
          const { auditService } = getServices();
          const parsedParams = providerIdParamsSchema.safeParse(params);
          const parsedBody = optionalOperationSchema.safeParse(body);
          await auditService.logEvent({
            eventType: AuditEventType.AGENT_OPERATION_FAILED,
            agentId: user.id,
            details: {
              error: errorMsg,
              providerId: parsedParams.success ? parsedParams.data.providerId : undefined,
              operation: parsedBody.success ? parsedBody.data.operation : undefined,
            },
          });
          set.status = 500;
          return { success: false, error: errorMsg || 'GitHub operation failed' };
        }
      })
      
      // Gmail operations
      .post('/gmail/:providerId', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params, body } = ctx;
        try {
          const { providerId } = providerIdParamsSchema.parse(params);
          const validated = z
            .object({
              operation: z.enum([
                'list_messages',
                'get_message',
                'send_message',
                'search_messages',
              ]),
              query: z.string().optional(),
              message_id: z.string().optional(),
              parameters: z.record(z.any()).optional(),
            })
            .parse(body);
          const { oauthProviderService, auditService } = getServices();
          let result: unknown;
          switch (validated.operation) {
            case 'list_messages':
            case 'search_messages':
              result = await oauthProviderService.getGmailMessages(
                user.id,
                providerId,
                validated.query
              );
              break;
            case 'get_message':
              if (!validated.message_id) {
                set.status = 400;
                return { success: false, error: 'Message ID required' };
              }
              result = await oauthProviderService.getGmailMessage(
                user.id,
                providerId,
                validated.message_id
              );
              break;
            default:
              set.status = 400;
              return { success: false, error: `Unsupported operation: ${validated.operation}` };
          }
          await auditService.logEvent({
            eventType: AuditEventType.AGENT_OPERATION_SUCCESS,
            agentId: user.id,
            details: {
              providerId,
              operation: validated.operation,
              query: validated.query,
              messageId: validated.message_id,
              resultCount: Array.isArray(result) ? result.length : 1,
            },
          });
          return { success: true, operation: validated.operation, data: result };
        } catch (error: unknown) {
          const errorMsg = getErrorMessage(error);
          const { auditService } = getServices();
          const parsedParams = providerIdParamsSchema.safeParse(params);
          const parsedBody = optionalOperationSchema.safeParse(body);
          await auditService.logEvent({
            eventType: AuditEventType.AGENT_OPERATION_FAILED,
            agentId: user.id,
            details: {
              error: errorMsg,
              providerId: parsedParams.success ? parsedParams.data.providerId : undefined,
              operation: parsedBody.success ? parsedBody.data.operation : undefined,
            },
          });
          set.status = 500;
          return { success: false, error: errorMsg || 'Gmail operation failed' };
        }
      })
    )
  
    // Health
    .get('/health', async () => ({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: { oauth_provider: 'healthy', auth_service: 'healthy', database: 'healthy' },
    }))
  );

}

export default registerOAuthRoutes;
