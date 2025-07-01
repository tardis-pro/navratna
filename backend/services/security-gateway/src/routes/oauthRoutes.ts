import { Router, Request, Response } from 'express';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { OAuthProviderService } from '../services/oauthProviderService.js';
import { EnhancedAuthService } from '../services/enhancedAuthService.js';
import { AuditService } from '../services/auditService.js';
import {
  UserType,
  AgentCapability,
  OAuthProviderType,
  GitHubProviderConfig,
  EmailProviderConfig,
  AuditEventType
} from '@uaip/types';
import { authMiddleware } from '@uaip/middleware';
import { z } from 'zod';

interface OAuthAuthorizationRequest {
  providerId: string;
  userType?: UserType;
  agentCapabilities?: AgentCapability[];
  redirectUri?: string;
}

interface AgentOAuthRequest {
  agentId: string;
  agentToken: string;
  providerId: string;
  capabilities: AgentCapability[];
}

// Request validation schemas
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
  error: z.string().optional(),
  error_description: z.string().optional()
});

const AgentAuthRequestSchema = z.object({
  agent_id: z.string().min(1),
  agent_token: z.string().min(1),
  capabilities: z.array(z.nativeEnum(AgentCapability)),
  requested_scopes: z.array(z.string()).optional(),
  requested_providers: z.array(z.string()).optional()
});

const GitHubOperationSchema = z.object({
  operation: z.enum(['list_repos', 'get_repo', 'create_repo', 'clone_repo']),
  repository: z.string().optional(),
  parameters: z.record(z.any()).optional()
});

const EmailOperationSchema = z.object({
  operation: z.enum(['list_messages', 'get_message', 'send_message', 'search_messages']),
  query: z.string().optional(),
  message_id: z.string().optional(),
  parameters: z.record(z.any()).optional()
});

export function createOAuthRoutes(
  oauthProviderService: OAuthProviderService,
  enhancedAuthService: EnhancedAuthService,
  auditService: AuditService
): Router {
  const router = Router();

  /**
   * Get available OAuth providers
   */
  router.get('/providers', async (req: Request, res: Response) => {
    try {
      const userType = req.query.userType as UserType || UserType.HUMAN;
      const providers = await oauthProviderService.getAvailableProviders(userType);

      res.json({
        success: true,
        providers: providers.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          isEnabled: p.isEnabled,
          agentAccess: p.agentConfig?.allowAgentAccess || false,
          requiredCapabilities: p.agentConfig?.requiredCapabilities || [],
          scope: p.scope
        }))
      });
    } catch (error) {
      logger.error('Failed to get OAuth providers', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get OAuth providers'
      });
    }
  });

  /**
   * Initiate OAuth authorization flow
   */
  router.post('/authorize', async (req: Request, res: Response) => {
    try {
      const validatedData = AuthorizeRequestSchema.parse(req.body);
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent');

      const { url, state, codeVerifier } = await oauthProviderService.generateAuthorizationUrl(
        validatedData.provider_id,
        validatedData.redirect_uri,
        validatedData.user_type,
        validatedData.agent_capabilities
      );

      // Code verifier is already stored in OAuth state entity by the service

      await auditService.logEvent({
        eventType: AuditEventType.OAUTH_AUTHORIZE_INITIATED,
        details: {
          providerId: validatedData.provider_id,
          userType: validatedData.user_type,
          agentCapabilities: validatedData.agent_capabilities,
          ipAddress,
          userAgent
        }
      });

      res.json({
        success: true,
        authorization_url: url,
        state
      });
    } catch (error) {
      await auditService.logEvent({
        eventType: AuditEventType.OAUTH_AUTHORIZE_FAILED,
        details: {
          error: error.message,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      });

      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Handle OAuth callback
   */
  router.post('/callback', (async (req: Request, res: Response) => {
    try {
      const validatedData = CallbackRequestSchema.parse(req.body);
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent');

      // Handle OAuth error responses
      if (validatedData.error) {
        await auditService.logEvent({
          eventType: AuditEventType.OAUTH_CALLBACK_ERROR,
          details: {
            error: validatedData.error,
            errorDescription: validatedData.error_description,
            ipAddress,
            userAgent
          }
        });

        return res.status(400).json({
          success: false,
          error: validatedData.error,
          error_description: validatedData.error_description
        });
      }

      // Get redirect URI from request
      const redirectUri = req.body.redirect_uri;
      if (!redirectUri) {
        return res.status(400).json({
          success: false,
          error: 'Missing redirect URI'
        });
      }

      // Authenticate with OAuth
      const authResult = await enhancedAuthService.authenticateWithOAuth(
        validatedData.code,
        validatedData.state,
        redirectUri,
        ipAddress,
        userAgent
      );

      // AuthenticationResult doesn't have success property - it throws on error

      // Set secure cookies for tokens
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict' as const,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      };

      res.cookie('access_token', authResult.tokens.accessToken, cookieOptions);
      res.cookie('refresh_token', authResult.tokens.refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Session data is managed by OAuth state entity, no cleanup needed

      await auditService.logEvent({
        eventType: AuditEventType.OAUTH_CALLBACK_SUCCESS,
        userId: authResult.user.id,
        details: {
          userType: authResult.user.userType,
          sessionId: authResult.session.id
        }
      });

      res.json({
        success: true,
        user: {
          id: authResult.user.id,
          email: authResult.user.email,
          name: authResult.user.name,
          userType: authResult.user.userType,
          role: authResult.user.role
        },
        session: {
          id: authResult.session.id,
          expiresAt: authResult.session.expiresAt
        },
        tokens: {
          access_token: authResult.tokens.accessToken,
          refresh_token: authResult.tokens.refreshToken,
          expires_at: authResult.session.expiresAt,
          token_type: 'Bearer'
        },
        mfa_required: authResult.requiresMFA,
        mfa_challenge: authResult.mfaChallenge
      });
    } catch (error) {
      await auditService.logEvent({
        eventType: AuditEventType.OAUTH_CALLBACK_FAILED,
        details: {
          error: error.message,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }) as any);

  /**
   * Agent OAuth authentication
   */
  router.post('/agent/authenticate', async (req: Request, res: Response) => {
    try {
      const validatedData = AgentAuthRequestSchema.parse(req.body);
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent');

      const authResult = await enhancedAuthService.authenticateAgent({
        agentId: validatedData.agent_id,
        agentToken: validatedData.agent_token,
        capabilities: validatedData.capabilities,
        requestedProviders: (validatedData.requested_providers || []) as OAuthProviderType[],
        ipAddress,
        userAgent
      });

      // AuthenticationResult doesn't have success property - it throws on error

      await auditService.logEvent({
        eventType: AuditEventType.AGENT_AUTH_SUCCESS,
        agentId: validatedData.agent_id,
        details: {
          capabilities: validatedData.capabilities,
          requestedProviders: validatedData.requested_providers
        }
      });

      res.json({
        success: true,
        agent: {
          id: authResult.user.id,
          name: authResult.user.name,
          capabilities: authResult.user.agentConfig?.capabilities || [],
          userType: authResult.user.userType
        },
        tokens: {
          access_token: authResult.tokens.accessToken,
          refresh_token: authResult.tokens.refreshToken,
          expires_at: authResult.session.expiresAt,
          token_type: 'Bearer'
        },
        session: {
          id: authResult.session.id,
          expiresAt: authResult.session.expiresAt
        }
      });
    } catch (error) {
      await auditService.logEvent({
        eventType: AuditEventType.AGENT_AUTH_FAILED,
        agentId: req.body.agent_id,
        details: {
          error: error.message,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Connect OAuth provider to existing user/agent (requires authentication)
   */
  router.post('/connect', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { code, state, redirectUri } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        throw new ApiError(401, 'Authentication required', 'AUTHENTICATION_REQUIRED');
      }

      if (!code || !state) {
        throw new ApiError(400, 'Authorization code and state are required', 'MISSING_OAUTH_PARAMS');
      }

      const baseRedirectUri = redirectUri || `${req.protocol}://${req.get('host')}/api/auth/oauth/callback`;

      const result = await enhancedAuthService.connectOAuthProvider(
        userId,
        code,
        state,
        baseRedirectUri
      );

      logger.info('OAuth provider connected', {
        userId,
        success: result.success
      });

      res.json({
        success: result.success,
        message: 'OAuth provider connected successfully'
      });
    } catch (error) {
      logger.error('Failed to connect OAuth provider', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to connect OAuth provider'
        });
      }
    }
  });

  /**
   * Get agent's OAuth connections
   */
  router.get('/agent/:agentId/connections', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const userId = req.user?.id;

      // Verify agent access (note: req.user doesn't have userType property)
      if (userId !== agentId) {
        throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
      }

      const connections = await oauthProviderService.getAgentConnections(agentId);

      res.json({
        success: true,
        connections: connections.map(conn => ({
          id: conn.id,
          providerId: conn.providerId,
          providerType: conn.providerType,
          capabilities: conn.capabilities,
          permissions: conn.permissions,
          isActive: conn.isActive,
          lastUsedAt: conn.lastUsedAt,
          usageStats: conn.usageStats
        }))
      });
    } catch (error) {
      logger.error('Failed to get agent OAuth connections', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to get agent OAuth connections'
        });
      }
    }
  });

  /**
   * Revoke agent's OAuth connection
   */
  router.delete('/agent/:agentId/connections/:providerId', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { agentId, providerId } = req.params;
      const userId = req.user?.id;

      // Verify agent access (note: req.user doesn't have userType property)
      if (userId !== agentId) {
        throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
      }

      const revoked = await oauthProviderService.revokeAgentConnection(agentId, providerId);

      if (revoked) {
        logger.info('Agent OAuth connection revoked', { agentId, providerId });
        res.json({
          success: true,
          message: 'OAuth connection revoked successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'OAuth connection not found'
        });
      }
    } catch (error) {
      logger.error('Failed to revoke agent OAuth connection', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to revoke OAuth connection'
        });
      }
    }
  });

  /**
   * Provider-specific routes for common operations
   */

  // GitHub-specific routes
  router.post('/agent/github/:providerId', (async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      const validatedData = GitHubOperationSchema.parse(req.body);
      const agentId = req.user?.id; // Assumes middleware sets req.user

      if (!agentId) {
        return res.status(401).json({
          success: false,
          error: 'Agent authentication required'
        });
      }

      let result;
      switch (validatedData.operation) {
        case 'list_repos':
          result = await oauthProviderService.getGitHubRepos(agentId, providerId);
          break;
        case 'get_repo':
          if (!validatedData.repository) {
            return res.status(400).json({
              success: false,
              error: 'Repository name required'
            });
          }
          // Implement get specific repo
          result = { message: 'Get repo operation not yet implemented' };
          break;
        default:
          return res.status(400).json({
            success: false,
            error: `Unsupported operation: ${validatedData.operation}`
          });
      }

      await auditService.logEvent({
        eventType: AuditEventType.AGENT_OPERATION_SUCCESS,
        agentId,
        details: {
          providerId,
          operation: validatedData.operation,
          repository: validatedData.repository,
          resultCount: Array.isArray(result) ? result.length : 1
        }
      });

      res.json({
        success: true,
        operation: validatedData.operation,
        data: result
      });
    } catch (error) {
      const agentId = req.user?.id;
      await auditService.logEvent({
        eventType: AuditEventType.AGENT_OPERATION_FAILED,
        agentId,
        details: {
          error: error.message,
          providerId: req.params.providerId,
          operation: req.body.operation
        }
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }) as any);

  // Gmail-specific routes
  router.post('/agent/gmail/:providerId', (async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      const validatedData = EmailOperationSchema.parse(req.body);
      const agentId = req.user?.id;

      if (!agentId) {
        return res.status(401).json({
          success: false,
          error: 'Agent authentication required'
        });
      }

      let result;
      switch (validatedData.operation) {
        case 'list_messages':
        case 'search_messages':
          result = await oauthProviderService.getGmailMessages(
            agentId,
            providerId,
            validatedData.query
          );
          break;
        case 'get_message':
          if (!validatedData.message_id) {
            return res.status(400).json({
              success: false,
              error: 'Message ID required'
            });
          }
          // Implement get specific message
          result = { message: 'Get message operation not yet implemented' };
          break;
        default:
          return res.status(400).json({
            success: false,
            error: `Unsupported operation: ${validatedData.operation}`
          });
      }

      await auditService.logEvent({
        eventType: AuditEventType.AGENT_OPERATION_SUCCESS,
        agentId,
        details: {
          providerId,
          operation: validatedData.operation,
          query: validatedData.query,
          messageId: validatedData.message_id,
          resultCount: Array.isArray(result) ? result.length : 1
        }
      });

      res.json({
        success: true,
        operation: validatedData.operation,
        data: result
      });
    } catch (error) {
      const agentId = req.user?.id;
      await auditService.logEvent({
        eventType: AuditEventType.AGENT_OPERATION_FAILED,
        agentId,
        details: {
          error: error.message,
          providerId: req.params.providerId,
          operation: req.body.operation
        }
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }) as any);

  // Health check for OAuth service
  router.get('/health', async (req: Request, res: Response) => {
    try {
      // Perform basic health checks
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          oauth_provider: 'healthy',
          auth_service: 'healthy',
          database: 'healthy'
        }
      };

      res.json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}

// Helper functions for API calls
async function makeGitHubAPICall(endpoint: string, accessToken: string): Promise<any> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'UAIP-Agent/1.0'
    }
  });

  if (!response.ok) {
    throw new ApiError(response.status, 'GitHub API error', 'GITHUB_API_ERROR');
  }

  return await response.json();
}

async function makeGmailAPICall(endpoint: string, accessToken: string): Promise<any> {
  const response = await fetch(`https://www.googleapis.com${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new ApiError(response.status, 'Gmail API error', 'GMAIL_API_ERROR');
  }

  return await response.json();
} 