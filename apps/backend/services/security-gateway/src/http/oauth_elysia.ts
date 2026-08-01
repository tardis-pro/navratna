import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withOptionalAuth, withRequiredAuth } from '@uaip/middleware';
import { OAuthProviderService } from '../services/oauth_provider_service.js';
import { EnhancedAuthService } from '../services/enhanced_auth_service.js';
import { AuditService } from '../services/audit_service.js';
import {
  UserType,
  AgentCapability,
  OAuthProviderType,
  AuditEventType,
  INTEGRATION_CREDENTIAL_CHANGED_EVENT,
  type IntegrationCredentialChangedEvent,
} from '@uaip/types';
import { EventBusService } from '@uaip/shared-services';
import {
  UserService,
  OAuthService,
  IntegrationConnectionService,
  getIntelligenceDb,
  agents,
  eq,
  and,
} from '@uaip/shared-services';

import { getAuthUser, getErrorMessage } from './context_helpers.js';
import { setAuthCookies } from './auth_elysia.js';

/**
 * Public production callback URL registered in the GitHub/Google OAuth consoles.
 * The SAME value must be used for the authorize step and the token exchange, so it is
 * centralized here. Override via OAUTH_CALLBACK_URL if the API host ever changes.
 */
export function getOAuthCallbackUrl(): string {
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
    oauthService: OAuthService.getInstance(),
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
const connectionIdParamsSchema = z.object({ connectionId: z.string().uuid() });
const startAuthorizeBodySchema = z.object({
  providerId: z.string().min(1),
  agentId: z.string().uuid().optional(),
});

export interface ConnectionSummary {
  id: string;
  agentId: string;
  providerId: string;
  scopes: string[];
  expiresAt: string | null;
  isExpired: boolean;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

async function userOwnsAgent(userId: string, agentId: string): Promise<boolean> {
  try {
    const rows = await getIntelligenceDb()
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.createdBy, userId)))
      .limit(1);
    return rows.length > 0;
  } catch (error) {
    logger.error('Failed to verify agent ownership', { userId, agentId, error });
    return false;
  }
}

async function callerOwnsConnection(userId: string, connectionAgentId: string): Promise<boolean> {
  if (connectionAgentId === userId) return true;
  return userOwnsAgent(userId, connectionAgentId);
}

function toConnectionSummary(row: {
  id: string;
  agentId: string;
  providerId: string;
  scopes?: string[] | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown> | null;
}): ConnectionSummary {
  return {
    id: row.id,
    agentId: row.agentId,
    providerId: row.providerId,
    scopes: row.scopes ?? [],
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    isExpired: row.expiresAt ? row.expiresAt.getTime() <= Date.now() : false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    metadata: row.metadata ?? {},
  };
}

/**
 * Completes a `connect_integration` callback: exchanges the code and stores the
 * credential as an integration connection owned by the user who STARTED the flow.
 *
 * The owner is read from the OAuth state, never from the request. The callback is
 * an unauthenticated browser redirect, so any session or parameter it carries
 * could belong to a different user than the one who authorized.
 */
async function completeIntegrationConnect(code: string, state: string): Promise<string> {
  const frontend = getFrontendBaseUrl();
  const { oauthProviderService, auditService } = getServices();

  const callback = await oauthProviderService.handleCallback(
    code,
    state,
    getOAuthCallbackUrl()
  );

  if (!callback.stateUserId) {
    logger.error('Integration connect callback has no bound user', {
      providerId: callback.provider.id,
    });
    return `${frontend}/?integration_error=${encodeURIComponent('connect_state_missing_user')}`;
  }
  if (!callback.provider.id) {
    return `${frontend}/?integration_error=${encodeURIComponent('provider_missing_id')}`;
  }

  const integrations = IntegrationConnectionService.getInstance();
  const provider = await integrations.findProviderByOAuthProviderId(callback.provider.id);
  if (!provider) {
    logger.error('No integration provider maps to this OAuth provider', {
      oauthProviderId: callback.provider.id,
    });
    return `${frontend}/?integration_error=${encodeURIComponent('integration_provider_not_found')}`;
  }

  const connection = await integrations.upsertConnectionForOwner({
    providerId: provider.id,
    ownerUserId: callback.stateUserId,
    accessToken: callback.tokens.access_token,
    refreshToken: callback.tokens.refresh_token,
    scopes: callback.provider.scope ?? [],
    expiresAt: callback.tokens.expires_in
      ? new Date(Date.now() + callback.tokens.expires_in * 1000)
      : undefined,
  })

  // Reconnecting rotates the credential on an EXISTING row, so any MCP session
  // cached under the superseded token must be closed. Never fail the connect:
  // the new credential is already stored.
  try {
    await EventBusService.getInstance().publish(INTEGRATION_CREDENTIAL_CHANGED_EVENT, {
      connectionId: connection.id,
      reason: 'rotated',
    } satisfies IntegrationCredentialChangedEvent)
  } catch (error) {
    logger.warn('Failed to announce a reconnected integration credential', {
      connectionId: connection.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  await auditService.logEvent({
    eventType: AuditEventType.SECURITY_CONFIG_CHANGE,
    userId: callback.stateUserId,
    details: { action: 'connect_integration', providerKey: provider.key },
  });

  logger.info('Integration connected', {
    userId: callback.stateUserId,
    providerKey: provider.key,
  });

  return `${frontend}/?integration_connected=${encodeURIComponent(provider.key)}`;
}

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

        // Peek at the state WITHOUT consuming it: both flows share this one
        // registered redirect URI, and only the state says which one this is.
        // authenticateWithOAuth consumes the state, so the branch must happen first.
        // The peek only ROUTES — it grants nothing. Whichever branch runs then
        // claims the state atomically, so a stale or replayed peek still loses.
        const pendingState = await OAuthService.getInstance().findOAuthState(state);
        const pendingMetadata =
          pendingState && typeof pendingState.metadata === 'object' && pendingState.metadata !== null
            ? (pendingState.metadata as Record<string, unknown>)
            : {};

        if (pendingMetadata.intent === 'connect_integration') {
          const redirect = await completeIntegrationConnect(code, state);
          set.status = 302;
          set.headers['Location'] = redirect;
          return '';
        }

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
    .group('', (g) =>
    withRequiredAuth(g)
      .get('/connections', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, query } = ctx;
        try {
          const rawAgentId =
            typeof query === 'object' && query !== null && 'agentId' in query
              ? query.agentId
              : undefined;
          // Connections are keyed by agentId. A user's own connections are stored
          // under their user id as the agent id, so default to the caller and never
          // let an arbitrary agentId widen the scope beyond agents they own.
          const scopeId = typeof rawAgentId === 'string' && rawAgentId ? rawAgentId : user.id;
          if (scopeId !== user.id) {
            const owns = await userOwnsAgent(user.id, scopeId);
            if (!owns) {
              set.status = 403;
              return { success: false, error: 'Agent not found or not accessible' };
            }
          }
          const { oauthService } = getServices();
          const rows = await oauthService.findAgentOAuthConnections(scopeId);
          return { success: true, connections: rows.map(toConnectionSummary) };
        } catch (error) {
          logger.error('Failed to list OAuth connections', { userId: user.id, error });
          set.status = 500;
          return { success: false, error: 'Failed to list OAuth connections' };
        }
      })

      .post('/connections/authorize', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, body } = ctx;
        const parsed = startAuthorizeBodySchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'providerId is required' };
        }
        try {
          const { providerId, agentId } = parsed.data;
          const scopeId = agentId ?? user.id;
          if (scopeId !== user.id) {
            const owns = await userOwnsAgent(user.id, scopeId);
            if (!owns) {
              set.status = 403;
              return { success: false, error: 'Agent not found or not accessible' };
            }
          }
          const { oauthProviderService } = getServices();
          const { url } = await oauthProviderService.generateAuthorizationUrl(
            providerId,
            getOAuthCallbackUrl(),
            UserType.HUMAN
          );
          return { success: true, authorizationUrl: url };
        } catch (error) {
          logger.error('Failed to start OAuth authorization', { userId: user.id, error });
          set.status = 500;
          return { success: false, error: getErrorMessage(error) || 'Failed to start authorization' };
        }
      })

      .delete('/connections/:connectionId', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params } = ctx;
        const parsed = connectionIdParamsSchema.safeParse(params);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'A valid connectionId is required' };
        }
        try {
          const { oauthService } = getServices();
          const connection = await oauthService.findOAuthConnectionById(parsed.data.connectionId);
          if (!connection || !(await callerOwnsConnection(user.id, connection.agentId))) {
            set.status = 404;
            return { success: false, error: 'Connection not found' };
          }
          await oauthService.deactivateOAuthConnection(connection.id);
          return { success: true, message: 'OAuth connection removed' };
        } catch (error) {
          logger.error('Failed to delete OAuth connection', { userId: user.id, error });
          set.status = 500;
          return { success: false, error: 'Failed to delete OAuth connection' };
        }
      })

      .post('/connections/:connectionId/refresh', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params } = ctx;
        const parsed = connectionIdParamsSchema.safeParse(params);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'A valid connectionId is required' };
        }
        try {
          const { oauthService, oauthProviderService } = getServices();
          const connection = await oauthService.findOAuthConnectionById(parsed.data.connectionId);
          if (!connection || !(await callerOwnsConnection(user.id, connection.agentId))) {
            set.status = 404;
            return { success: false, error: 'Connection not found' };
          }
          const accessToken = await oauthProviderService.getAgentAccessToken(
            connection.agentId,
            connection.providerId
          );
          if (!accessToken) {
            set.status = 502;
            return { success: false, error: 'Provider refused to refresh the access token' };
          }
          const refreshed = await oauthService.findOAuthConnectionById(connection.id);
          return {
            success: true,
            connection: refreshed ? toConnectionSummary(refreshed) : null,
          };
        } catch (error) {
          logger.error('Failed to refresh OAuth connection', { userId: user.id, error });
          set.status = 500;
          return { success: false, error: 'Failed to refresh OAuth connection' };
        }
      })

      .post('/connect', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set, body } = ctx;
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
          user.id,
          code,
          state,
          baseRedirect
        );
        const resultSuccess =
          typeof result === 'object' && result !== null && 'success' in result
            ? Boolean(result.success)
            : true;
        logger.info('OAuth provider connected', {
          userId: user.id,
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
