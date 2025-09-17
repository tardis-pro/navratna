import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withOptionalAuth, withRequiredAuth } from './middleware/auth.plugin.js';
import { OAuthProviderService } from '../services/oauthProviderService.js';
import { EnhancedAuthService } from '../services/enhancedAuthService.js';
import { AuditService } from '../services/auditService.js';
import { UserType, AgentCapability, OAuthProviderType, AuditEventType } from '@uaip/types';

let oauthProviderService: OAuthProviderService | null = null;
let enhancedAuthService: EnhancedAuthService | null = null;
let auditService: AuditService | null = null;
import { DatabaseService } from '@uaip/shared-services';

function getServices() {
  if (!auditService) auditService = new AuditService();
  if (!oauthProviderService) oauthProviderService = new OAuthProviderService(auditService);
  if (!enhancedAuthService) enhancedAuthService = new EnhancedAuthService(DatabaseService.getInstance(), oauthProviderService, auditService);
  return { oauthProviderService, enhancedAuthService, auditService };
}

const AuthorizeRequestSchema = z.object({
  provider_id: z.string().min(1),
  redirect_uri: z.string().url(),
  user_type: z.nativeEnum(UserType).optional().default(UserType.HUMAN),
  agent_capabilities: z.array(z.nativeEnum(AgentCapability)).optional(),
  scope: z.array(z.string()).optional()
});

const CallbackRequestSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  redirect_uri: z.string().url().optional()
});

const AgentAuthRequestSchema = z.object({
  agent_id: z.string().min(1),
  agent_token: z.string().min(1),
  capabilities: z.array(z.nativeEnum(AgentCapability)),
  requested_scopes: z.array(z.string()).optional(),
  requested_providers: z.array(z.string()).optional()
});

export function registerOAuthRoutes(app: any): any {
  return app.group('/api/v1/oauth', (app: any) => withOptionalAuth(app)
    // GET /providers
    .get('/providers', async ({ set, query }) => {
      try {
        const { oauthProviderService } = getServices();
        const userType = ((query as any).userType as UserType) || UserType.HUMAN;
        const providers = await oauthProviderService.getAvailableProviders(userType);
        return { success: true, providers: providers.map((p: any) => ({ id: p.id, name: p.name, type: p.type, isEnabled: p.isEnabled, agentAccess: p.agentConfig?.allowAgentAccess || false, requiredCapabilities: p.agentConfig?.requiredCapabilities || [], scope: p.scope })) };
      } catch (error) {
        logger.error('Failed to get OAuth providers', { error });
        set.status = 500; return { success: false, error: 'Failed to get OAuth providers' };
      }
    })

    // POST /authorize
    .post('/authorize', async ({ set, body, request, headers }) => {
      try {
        const validated = AuthorizeRequestSchema.parse(body);
        const { oauthProviderService, auditService } = getServices();
        const { url, state } = await oauthProviderService.generateAuthorizationUrl(validated.provider_id, validated.redirect_uri, validated.user_type, validated.agent_capabilities);
        await auditService.logEvent({ eventType: AuditEventType.OAUTH_AUTHORIZE_INITIATED, details: { providerId: validated.provider_id, userType: validated.user_type, ipAddress: request.headers.get('x-forwarded-for') || '', userAgent: headers['user-agent'] } });
        return { success: true, authorization_url: url, state };
      } catch (error: any) {
        logger.error('Authorize failed', { error: error?.message });
        set.status = 400; return { success: false, error: error?.message || 'Authorization failed' };
      }
    })

    // POST /callback
    .post('/callback', async ({ set, body, request, headers }) => {
      try {
        const validated = CallbackRequestSchema.parse(body);
        const { enhancedAuthService, auditService } = getServices();
        const ipAddress = request.headers.get('x-forwarded-for') || '';
        const userAgent = headers['user-agent'];
        const redirectUri = validated.redirect_uri || `${request.url.split('/api')[0]}/api/auth/oauth/callback`;
        const authResult = await enhancedAuthService.authenticateWithOAuth(validated.code, validated.state, redirectUri, ipAddress, userAgent);
        await auditService.logEvent({ eventType: AuditEventType.OAUTH_CALLBACK_SUCCESS, userId: authResult.user.id, details: { userType: authResult.user.userType, sessionId: authResult.session.id } });
        return { success: true, user: { id: authResult.user.id, email: authResult.user.email, name: authResult.user.name, userType: authResult.user.userType, role: authResult.user.role }, session: { id: authResult.session.id, expiresAt: authResult.session.expiresAt }, tokens: { access_token: authResult.tokens.accessToken, refresh_token: authResult.tokens.refreshToken, expires_at: authResult.session.expiresAt, token_type: 'Bearer' }, mfa_required: authResult.requiresMFA, mfa_challenge: authResult.mfaChallenge };
      } catch (error: any) {
        const { auditService } = getServices();
        await auditService.logEvent({ eventType: AuditEventType.OAUTH_CALLBACK_FAILED, details: { error: error?.message, ipAddress: request.headers.get('x-forwarded-for') || '', userAgent: headers['user-agent'] } });
        set.status = 500; return { success: false, error: error?.message || 'OAuth callback failed' };
      }
    })

    // POST /agent/authenticate
    .post('/agent/authenticate', async ({ set, body, request, headers }) => {
      try {
        const validated = AgentAuthRequestSchema.parse(body);
        const { enhancedAuthService, auditService } = getServices();
        const ipAddress = request.headers.get('x-forwarded-for') || '';
        const userAgent = headers['user-agent'];
        const authResult = await enhancedAuthService.authenticateAgent({ agentId: validated.agent_id, agentToken: validated.agent_token, capabilities: validated.capabilities, requestedProviders: (validated.requested_providers || []) as OAuthProviderType[], ipAddress, userAgent });
        await auditService.logEvent({ eventType: AuditEventType.AGENT_AUTH_SUCCESS, agentId: validated.agent_id, details: { capabilities: validated.capabilities, requestedProviders: validated.requested_providers } });
        return { success: true, agent: { id: authResult.user.id, name: authResult.user.name, capabilities: authResult.user.agentConfig?.capabilities || [], userType: authResult.user.userType }, tokens: { access_token: authResult.tokens.accessToken, refresh_token: authResult.tokens.refreshToken, expires_at: authResult.session.expiresAt, token_type: 'Bearer' }, session: { id: authResult.session.id, expiresAt: authResult.session.expiresAt } };
      } catch (error: any) {
        const { auditService } = getServices();
        await auditService.logEvent({ eventType: AuditEventType.AGENT_AUTH_FAILED, agentId: (body as any)?.agent_id, details: { error: error?.message, ipAddress: request.headers.get('x-forwarded-for') || '', userAgent: headers['user-agent'] } });
        set.status = 500; return { success: false, error: error?.message || 'Agent authentication failed' };
      }
    })

    // POST /connect (requires auth)
    .group('', (g: any) => withRequiredAuth(g)
      .post('/connect', async ({ set, body, user }) => {
        try {
          const { code, state, redirectUri } = body as any;
          if (!code || !state) { set.status = 400; return { success: false, error: 'Authorization code and state are required' }; }
          const { enhancedAuthService } = getServices();
          const baseRedirect = redirectUri || '';
          const result = await enhancedAuthService.connectOAuthProvider(user!.id, code, state, baseRedirect);
          logger.info('OAuth provider connected', { userId: user!.id, success: (result as any)?.success });
          return { success: (result as any)?.success ?? true, message: 'OAuth provider connected successfully' };
        } catch (error: any) {
          set.status = 500; return { success: false, error: error?.message || 'Failed to connect OAuth provider' };
        }
      })
    )

    // Provider-specific operations (require auth)
    .group('/agent', (g: any) => withRequiredAuth(g)
      // GitHub operations
      .post('/github/:providerId', async ({ set, params, body, user }) => {
        try {
          const validated = z.object({ operation: z.enum(['list_repos', 'get_repo', 'create_repo', 'clone_repo']), repository: z.string().optional(), parameters: z.record(z.any()).optional() }).parse(body);
          const { oauthProviderService, auditService } = getServices();
          let result: any;
          switch (validated.operation) {
            case 'list_repos':
              result = await oauthProviderService.getGitHubRepos(user!.id, (params as any).providerId);
              break;
            case 'get_repo':
              if (!validated.repository) { set.status = 400; return { success: false, error: 'Repository name required' }; }
              result = { message: 'Get repo operation not yet implemented' };
              break;
            default:
              set.status = 400; return { success: false, error: `Unsupported operation: ${validated.operation}` };
          }
          await auditService.logEvent({ eventType: AuditEventType.AGENT_OPERATION_SUCCESS, agentId: user!.id, details: { providerId: (params as any).providerId, operation: validated.operation, repository: validated.repository, resultCount: Array.isArray(result) ? result.length : 1 } });
          return { success: true, operation: validated.operation, data: result };
        } catch (error: any) {
          const { auditService } = getServices();
          await auditService.logEvent({ eventType: AuditEventType.AGENT_OPERATION_FAILED, agentId: user!.id, details: { error: error?.message, providerId: (params as any).providerId, operation: (body as any)?.operation } });
          set.status = 500; return { success: false, error: error?.message || 'GitHub operation failed' };
        }
      })

      // Gmail operations
      .post('/gmail/:providerId', async ({ set, params, body, user }) => {
        try {
          const validated = z.object({ operation: z.enum(['list_messages', 'get_message', 'send_message', 'search_messages']), query: z.string().optional(), message_id: z.string().optional(), parameters: z.record(z.any()).optional() }).parse(body);
          const { oauthProviderService, auditService } = getServices();
          let result: any;
          switch (validated.operation) {
            case 'list_messages':
            case 'search_messages':
              result = await oauthProviderService.getGmailMessages(user!.id, (params as any).providerId, validated.query);
              break;
            case 'get_message':
              if (!validated.message_id) { set.status = 400; return { success: false, error: 'Message ID required' }; }
              result = { message: 'Get message operation not yet implemented' };
              break;
            default:
              set.status = 400; return { success: false, error: `Unsupported operation: ${validated.operation}` };
          }
          await auditService.logEvent({ eventType: AuditEventType.AGENT_OPERATION_SUCCESS, agentId: user!.id, details: { providerId: (params as any).providerId, operation: validated.operation, query: validated.query, messageId: validated.message_id, resultCount: Array.isArray(result) ? result.length : 1 } });
          return { success: true, operation: validated.operation, data: result };
        } catch (error: any) {
          const { auditService } = getServices();
          await auditService.logEvent({ eventType: AuditEventType.AGENT_OPERATION_FAILED, agentId: user!.id, details: { error: error?.message, providerId: (params as any).providerId, operation: (body as any)?.operation } });
          set.status = 500; return { success: false, error: error?.message || 'Gmail operation failed' };
        }
      })
    )

    // Health
    .get('/health', async () => ({ status: 'healthy', timestamp: new Date().toISOString(), services: { oauth_provider: 'healthy', auth_service: 'healthy', database: 'healthy' } }))
  );
}

export default registerOAuthRoutes;
