import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withRequiredAuth } from '@uaip/middleware';
import {
  INTEGRATION_CONNECTION_LINKED_EVENT,
  INTEGRATION_CONNECTION_UNLINKED_EVENT,
  UserType,
  type IntegrationConnectionUnlinkedEvent,
} from '@uaip/types';
import {
  EventBusService,
  IntegrationConnectionService,
  IntegrationError,
  type IntegrationBindingSummary,
  type IntegrationErrorCode,
} from '@uaip/shared-services';
import { OAuthProviderService } from '../services/oauth_provider_service.js';
import { AuditService } from '../services/audit_service.js';

import { getAuthUser } from './context_helpers.js';
import { getOAuthCallbackUrl } from './oauth_elysia.js';

let oauthProviderServiceSingleton: OAuthProviderService | null = null;

function getOAuthProviderService(): OAuthProviderService {
  if (!oauthProviderServiceSingleton) {
    oauthProviderServiceSingleton = new OAuthProviderService(new AuditService());
  }
  return oauthProviderServiceSingleton;
}

/**
 * A provider whose catalog needs the user's own credential is skipped by boot-time
 * discovery, so linking is the only moment its tools can be registered. The event
 * carries no token — the subscriber resolves the credential from the binding.
 * Announcing must never fail the link: the binding is already stored.
 */
async function announceLinkedConnection(binding: IntegrationBindingSummary): Promise<void> {
  try {
    await EventBusService.getInstance().publish(INTEGRATION_CONNECTION_LINKED_EVENT, {
      serverKey: binding.providerKey,
      projectId: binding.projectId,
      agentId: binding.agentId,
      actorUserId: binding.createdByUserId,
    });
  } catch (error) {
    logger.warn('Failed to announce a linked integration connection', {
      providerKey: binding.providerKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Withdrawing a binding must withdraw the agent's tools too, otherwise the model
 * keeps being offered tools whose credential no longer resolves. Announcing must
 * never fail the unlink: the binding is already gone.
 */
async function announceUnlinkedConnection(
  event: IntegrationConnectionUnlinkedEvent
): Promise<void> {
  try {
    await EventBusService.getInstance().publish(INTEGRATION_CONNECTION_UNLINKED_EVENT, event);
  } catch (error) {
    logger.warn('Failed to announce an unlinked integration connection', {
      serverKey: event.serverKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const STATUS_BY_ERROR_CODE: Record<IntegrationErrorCode, number> = {
  connection_not_found: 404,
  provider_not_found: 404,
  binding_not_found: 404,
  agent_not_found: 404,
  forbidden: 403,
};

/**
 * `format:` validators are avoided throughout: the production Bun build does not
 * register TypeBox string formats, so an AOT-compiled route schema using one
 * rejects every request. Shapes are validated with zod inside the handler.
 */
const createConnectionSchema = z.object({
  providerId: z.string().uuid(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const linkConnectionSchema = z.object({
  connectionId: z.string().uuid(),
  enabled: z.boolean().optional(),
});

const rotateTokenSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

const bindingParamsSchema = z.object({
  projectId: z.string().uuid(),
  agentId: z.string().uuid(),
  providerId: z.string().uuid(),
});

function service(): IntegrationConnectionService {
  return IntegrationConnectionService.getInstance();
}

interface ErrorResponse {
  success: false;
  error: string;
}

function respondToError(
  error: unknown,
  set: { status?: number | string },
  fallback: string
): ErrorResponse {
  if (error instanceof IntegrationError) {
    set.status = STATUS_BY_ERROR_CODE[error.code];
    return { success: false, error: error.message };
  }
  logger.error(fallback, { error: error instanceof Error ? error.message : String(error) });
  set.status = 500;
  return { success: false, error: fallback };
}

export function registerIntegrationRoutes() {
  return new Elysia().group('/api/v1/integrations', (app) =>
    withRequiredAuth(app)
      .get('/providers', async (ctx) => {
        const { set } = ctx;
        try {
          return { success: true, providers: await service().listProviders() };
        } catch (error) {
          return respondToError(error, set, 'Failed to list integration providers');
        }
      })

      .post('/providers/:providerKey/connect', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params } = ctx;
        try {
          const provider = await service().findProviderByKey(params.providerKey);
          if (!provider || !provider.enabled) {
            set.status = 404;
            return { success: false, error: 'Integration provider not found' };
          }
          if (!provider.oauthProviderId) {
            set.status = 409;
            return {
              success: false,
              error: `${provider.displayName} has no OAuth credentials configured on this server`,
            };
          }

          const { url } = await getOAuthProviderService().generateAuthorizationUrl(
            provider.oauthProviderId,
            getOAuthCallbackUrl(),
            UserType.HUMAN,
            undefined,
            // Bound at authorize time while the caller is authenticated — the
            // callback is a bare browser redirect and cannot be trusted to say
            // who it belongs to.
            { userId: user.id, intent: 'connect_integration' }
          );
          return { success: true, authorizationUrl: url };
        } catch (error) {
          return respondToError(error, set, 'Failed to start integration authorization');
        }
      })

      .get('/connections', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set } = ctx;
        try {
          // Scoped to the caller only. A connection is a credential, so there is
          // deliberately no parameter that could widen this to another user.
          return { success: true, connections: await service().listConnections(user.id) };
        } catch (error) {
          return respondToError(error, set, 'Failed to list integration connections');
        }
      })

      .post('/connections', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, body } = ctx;
        const parsed = createConnectionSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'providerId and accessToken are required' };
        }
        try {
          const connection = await service().createConnection({
            providerId: parsed.data.providerId,
            ownerUserId: user.id,
            accessToken: parsed.data.accessToken,
            refreshToken: parsed.data.refreshToken,
            scopes: parsed.data.scopes,
            expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
            metadata: parsed.data.metadata,
          });
          set.status = 201;
          return { success: true, connection };
        } catch (error) {
          return respondToError(error, set, 'Failed to create integration connection');
        }
      })

      .post('/connections/:connectionId/token', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params, body } = ctx;
        const parsed = rotateTokenSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'accessToken is required' };
        }
        try {
          await service().rotateConnectionToken(
            params.connectionId,
            user.id,
            parsed.data.accessToken,
            parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined
          );
          return { success: true };
        } catch (error) {
          return respondToError(error, set, 'Failed to rotate integration token');
        }
      })

      .delete('/connections/:connectionId', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params } = ctx;
        try {
          await service().revokeConnection(params.connectionId, user.id);
          return { success: true };
        } catch (error) {
          return respondToError(error, set, 'Failed to revoke integration connection');
        }
      })

      .get('/projects/:projectId/bindings', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params, query } = ctx;
        try {
          const agentId =
            typeof query === 'object' && query !== null && typeof query.agentId === 'string'
              ? query.agentId
              : undefined;
          const bindings = await service().listBindings(params.projectId, user.id, agentId);
          return { success: true, bindings };
        } catch (error) {
          return respondToError(error, set, 'Failed to list integration bindings');
        }
      })

      .put('/projects/:projectId/agents/:agentId/connection', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params, body } = ctx;
        const parsed = linkConnectionSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'connectionId is required' };
        }
        try {
          const binding = await service().linkConnection({
            projectId: params.projectId,
            agentId: params.agentId,
            connectionId: parsed.data.connectionId,
            actorUserId: user.id,
            enabled: parsed.data.enabled,
          });
          await announceLinkedConnection(binding);
          return { success: true, binding };
        } catch (error) {
          return respondToError(error, set, 'Failed to link integration connection');
        }
      })

      .delete('/projects/:projectId/agents/:agentId/providers/:providerId', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params } = ctx;
        const parsed = bindingParamsSchema.safeParse(params);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'projectId, agentId and providerId are required' };
        }
        try {
          const serverKey = await service().unlinkConnection(
            parsed.data.projectId,
            parsed.data.agentId,
            parsed.data.providerId,
            user.id
          );
          await announceUnlinkedConnection({
            serverKey,
            projectId: parsed.data.projectId,
            agentId: parsed.data.agentId,
          });
          return { success: true };
        } catch (error) {
          return respondToError(error, set, 'Failed to unlink integration connection');
        }
      })
  );
}
