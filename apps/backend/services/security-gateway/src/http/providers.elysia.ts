import type { AnyElysia } from 'elysia';
import { withAdminGuard, withRequiredAuth } from '@uaip/middleware';
import { logger } from '@uaip/utils';
import { UserService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/infra/eventBus';
import { z } from 'zod';
import { LLMProviderStatus } from '@uaip/types';
import { llmProviderManagementService } from '../services/llmProviderManagementService.js';

// Zod schemas mirroring original
const createUserProviderSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  type: z.enum(['openai', 'anthropic', 'google', 'ollama', 'llmstudio', 'custom']),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  defaultModel: z.string().max(255).optional(),
  configuration: z
    .object({
      timeout: z.number().min(1000).optional(),
      retries: z.number().min(0).max(10).optional(),
      rateLimit: z.number().min(1).optional(),
      headers: z.record(z.string()).optional(),
      customEndpoints: z
        .object({
          models: z.string().optional(),
          chat: z.string().optional(),
          completions: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  priority: z.number().min(0).optional(),
});

const updateUserProviderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  defaultModel: z.string().max(255).optional(),
  configuration: z
    .object({
      timeout: z.number().min(1000).optional(),
      retries: z.number().min(0).max(10).optional(),
      rateLimit: z.number().min(1).optional(),
      headers: z.record(z.string()).optional(),
      customEndpoints: z
        .object({
          models: z.string().optional(),
          chat: z.string().optional(),
          completions: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  priority: z.number().min(0).optional(),
  status: z.nativeEnum(LLMProviderStatus).optional(),
  isActive: z.boolean().optional(),
});

const createManagedProviderSchema = createUserProviderSchema.extend({
  baseUrl: z.string().url(),
});

const ROLE_LIMITS: Record<string, number> = {
  guest: 0,
  user: 3,
  moderator: 5,
  admin: 10,
  system: 50,
};

const providerIdParamsSchema = z.object({ id: z.string().min(1) });

let eventBusServiceSingleton: EventBusService | null = null;

const getEventBusService = (): EventBusService => {
  if (!eventBusServiceSingleton) {
    eventBusServiceSingleton = EventBusService.getInstance();
  }
  return eventBusServiceSingleton;
};

export function registerProviderRoutes(elysiaApp: AnyElysia): AnyElysia {
  return (
    elysiaApp
      // Admin/system provider management
      .group('/api/v1', (app: AnyElysia) =>
        withAdminGuard(app)
          .get('/providers', async ({ set }) => {
            try {
              const providers = await llmProviderManagementService.getAllProviders();
              return { success: true, data: providers };
            } catch (error) {
              logger.error('Error getting LLM providers', { error });
              set.status = 500;
              return { success: false, error: 'Failed to get LLM providers' };
            }
          })
          .get('/providers/active', async ({ set }) => {
            try {
              const providers = await llmProviderManagementService.getActiveProviders();
              return { success: true, data: providers };
            } catch (error) {
              logger.error('Error getting active LLM providers', { error });
              set.status = 500;
              return { success: false, error: 'Failed to get active LLM providers' };
            }
          })
          .get('/providers/:id', async ({ set, params }) => {
            try {
              const { id } = providerIdParamsSchema.parse(params);
              const provider = await llmProviderManagementService.getProviderById(id);
              if (!provider) {
                set.status = 404;
                return { success: false, error: 'LLM provider not found' };
              }
              return { success: true, data: provider };
            } catch (error) {
              logger.error('Error getting LLM provider by ID', { error });
              set.status = 500;
              return { success: false, error: 'Failed to get LLM provider' };
            }
          })
          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .post('/providers', async ({ set, body, user }) => {
            try {
              const parsedBody = createManagedProviderSchema.parse(body);
              const created = await llmProviderManagementService.createProvider(
                parsedBody,
                user!.id
              );
              set.status = 201;
              return { success: true, data: created };
            } catch (error: unknown) {
              logger.error('Error creating LLM provider', { error });
              if (error instanceof Error && error.message.includes('already exists')) {
                set.status = 409;
                return { success: false, error: error.message };
              }
              set.status = 500;
              return { success: false, error: 'Failed to create LLM provider' };
            }
          })
          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .put('/providers/:id', async ({ set, params, body, user }) => {
            try {
              const { id } = providerIdParamsSchema.parse(params);
              const parsedBody = updateUserProviderSchema.parse(body);
              const updated = await llmProviderManagementService.updateProvider(
                id,
                parsedBody,
                user!.id
              );
              return { success: true, data: updated };
            } catch (error) {
              logger.error('Error updating LLM provider', { error });
              set.status = 500;
              return { success: false, error: 'Failed to update LLM provider' };
            }
          })
          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .delete('/providers/:id', async ({ set, params, user }) => {
            try {
              const { id } = providerIdParamsSchema.parse(params);
              await llmProviderManagementService.deleteProvider(id, user!.id);
              return { success: true, message: 'LLM provider deleted successfully' };
            } catch (error) {
              logger.error('Error deleting LLM provider', { error });
              set.status = 500;
              return { success: false, error: 'Failed to delete LLM provider' };
            }
          })
          .post('/providers/:id/test', async ({ set, params }) => {
            try {
              const { id } = providerIdParamsSchema.parse(params);
              const result = await llmProviderManagementService.testProviderConnection(id);
              return { success: true, data: result };
            } catch (error) {
              logger.error('Error testing LLM provider connection', { error });
              set.status = 500;
              return { success: false, error: 'Failed to test LLM provider connection' };
            }
          })
          .get('/providers/statistics', async ({ set }) => {
            try {
              const stats = await llmProviderManagementService.getProviderStatistics();
              return { success: true, data: stats };
            } catch (error) {
              logger.error('Error getting LLM provider statistics', { error });
              set.status = 500;
              return { success: false, error: 'Failed to get LLM provider statistics' };
            }
          })
      )

      // User-scoped provider management (nginx routes /api/v1/llm/my-providers here)
      .group('/api/v1/llm', (app: AnyElysia) =>
        withRequiredAuth(app)
          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .get('/my-providers/limits', async ({ user }) => {
            const role = (user!.role || 'user').toLowerCase();
            const limit = ROLE_LIMITS[role] ?? 0;
            const providers = await UserService.getInstance()
              .getUserLLMProviderRepository()
              .findAllProvidersByUser(user!.id);
            const current = providers.length;
            return {
              success: true,
              data: {
                role,
                limit,
                current,
                remaining: Math.max(0, limit - current),
                canCreateMore: current < limit && limit > 0,
              },
            };
          })

          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .get('/my-providers', async ({ user, set }) => {
            try {
              const providers = await UserService.getInstance()
                .getUserLLMProviderRepository()
                .findAllProvidersByUser(user!.id);
              return { success: true, data: providers.map(toSafeProvider) };
            } catch (error) {
              logger.error('Error getting user LLM providers', { error });
              set.status = 500;
              return { success: false, error: 'Failed to get LLM providers' };
            }
          })

          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .get('/my-providers/active', async ({ user, set }) => {
            try {
              const providers = await UserService.getInstance()
                .getUserLLMProviderRepository()
                .findActiveProvidersByUser(user!.id);
              const active = providers
                .filter((p) => p.isActive && (p.status === 'active' || p.status === 'testing'))
                .map((p) => ({
                  id: p.id,
                  name: p.name,
                  type: p.type,
                  defaultModel: p.defaultModel,
                  priority: p.priority,
                  hasApiKey: p.hasApiKey(),
                }));
              return { success: true, data: active };
            } catch (error) {
              logger.error('Error getting active user LLM providers', { error });
              set.status = 500;
              return { success: false, error: 'Failed to get active LLM providers' };
            }
          })

          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .get('/my-providers/models', async ({ user, set }) => {
            try {
              const { UserLLMService, ModelBootstrapService } = await import('@uaip/llm-service');
              const userLLMService = new UserLLMService();
              const modelBootstrapService = ModelBootstrapService.getInstance();
              const userId = user!.id;

              logger.info('Fetching models for user', { userId });

              // Strategy: Try cache first, then live API calls
              let models = await modelBootstrapService.getCachedUserModels(userId);
              let source = 'cache';

              // If cache miss, fetch live from provider APIs
              if (!models || models.length === 0) {
                logger.info('Cache miss for user models, fetching from provider APIs', { userId });
                models = await userLLMService.getAvailableModels(userId);
                source = 'live';

                // Cache the results for future requests
                if (models.length > 0) {
                  modelBootstrapService.refreshUserModels(userId).catch((error: Error) => {
                    logger.warn('Failed to refresh user models cache', {
                      userId,
                      error: error.message,
                    });
                  });
                }
              }

              logger.info('Models fetched successfully', {
                userId,
                totalModels: models.length,
                source,
              });
              return { success: true, data: models };
            } catch (error) {
              logger.error('Error getting user LLM models', { error });
              set.status = 500;
              return { success: false, error: 'Failed to get LLM models' };
            }
          })

          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .get('/my-providers/:id', async ({ set, params, user }) => {
            try {
              const { id } = providerIdParamsSchema.parse(params);
              const provider = await UserService.getInstance()
                .getUserLLMProviderRepository()
                .findById(id);
              if (!provider || provider.userId !== user!.id) {
                set.status = 404;
                return { success: false, error: 'LLM provider not found' };
              }
              return { success: true, data: toSafeProvider(provider) };
            } catch (error) {
              logger.error('Error getting user LLM provider by ID', { error });
              set.status = 500;
              return { success: false, error: 'Failed to get LLM provider' };
            }
          })

          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .post('/my-providers', async ({ set, body, user }) => {
            const validation = createUserProviderSchema.safeParse(body);
            if (!validation.success) {
              set.status = 400;
              return {
                success: false,
                error: 'Validation failed',
                details: validation.error.issues,
              };
            }
            try {
              const role = (user!.role || 'user').toLowerCase();
              const limit = ROLE_LIMITS[role] ?? 0;
              const repo = UserService.getInstance().getUserLLMProviderRepository();
              const existing = await repo.findAllProvidersByUser(user!.id);
              if (limit === 0 || existing.length >= limit) {
                set.status = 403;
                return {
                  success: false,
                  error: 'Permission denied',
                  message:
                    limit === 0
                      ? `Users with role '${role}' cannot create LLM providers`
                      : `Reached maximum providers (${limit}) for role ${role}`,
                };
              }
              const v = validation.data;
              const saved = await repo.createUserProvider({
                userId: user!.id,
                name: v.name,
                description: v.description,
                type: v.type,
                baseUrl: v.baseUrl,
                apiKey: v.apiKey,
                defaultModel: v.defaultModel,
                configuration: v.configuration,
                priority: v.priority || 100,
              });
              logger.info('User LLM provider created successfully', {
                userId: user!.id,
                providerId: saved.id,
                providerType: saved.type,
              });
              try {
                await getEventBusService().publish('llm.provider.changed', {
                  eventType: 'provider.created',
                  providerId: saved.id,
                  providerType: saved.type,
                  userId: user!.id,
                });
              } catch (eventError) {
                logger.warn('Failed to publish provider created event', {
                  providerId: saved.id,
                  error: eventError,
                });
              }
              set.status = 201;
              return { success: true, data: toSafeProvider(saved) };
            } catch (error: unknown) {
              logger.error('Error creating user LLM provider', { error });
              if (error instanceof Error && error.message.includes('already in use')) {
                set.status = 409;
                return { success: false, error: error.message };
              }
              set.status = 500;
              return { success: false, error: 'Failed to create LLM provider' };
            }
          })

          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .put('/my-providers/:id', async ({ set, params, body, user }) => {
            const validation = updateUserProviderSchema.safeParse(body);
            if (!validation.success) {
              set.status = 400;
              return {
                success: false,
                error: 'Validation failed',
                details: validation.error.issues,
              };
            }
            try {
              const { id } = providerIdParamsSchema.parse(params);
              const repo = UserService.getInstance().getUserLLMProviderRepository();
              const provider = await repo.findById(id);
              if (!provider || provider.userId !== user!.id) {
                set.status = 404;
                return { success: false, error: 'LLM provider not found' };
              }
              const v = validation.data;
              // Split config updates per available repo methods
              if (v.apiKey !== undefined) {
                await repo.updateApiKey(id, v.apiKey, user!.id);
              }
              const configUpdates: Record<string, unknown> = {};
              if (v.name !== undefined) configUpdates.name = v.name;
              if (v.description !== undefined) configUpdates.description = v.description;
              if (v.baseUrl !== undefined) configUpdates.baseUrl = v.baseUrl;
              if (v.defaultModel !== undefined) configUpdates.defaultModel = v.defaultModel;
              if (v.priority !== undefined) configUpdates.priority = v.priority;
              if (v.configuration !== undefined) configUpdates.configuration = v.configuration;
              if (Object.keys(configUpdates).length > 0) {
                await repo.updateProviderConfig(id, user!.id, configUpdates);
              }
              if (v.status !== undefined) {
                await repo.updateStatus(id, v.status, user!.id);
              }
              const updatedProvider = await repo.findById(id);
              if (updatedProvider) {
                try {
                  await getEventBusService().publish('llm.provider.changed', {
                    eventType: 'provider.updated',
                    providerId: updatedProvider.id,
                    providerType: updatedProvider.type,
                    userId: user!.id,
                  });
                } catch (eventError) {
                  logger.warn('Failed to publish provider updated event', {
                    providerId: updatedProvider.id,
                    error: eventError,
                  });
                }
              }
              return { success: true, data: toSafeProvider(updatedProvider!) };
            } catch (error) {
              logger.error('Error updating user LLM provider', { error });
              set.status = 500;
              return { success: false, error: 'Failed to update LLM provider' };
            }
          })

          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .delete('/my-providers/:id', async ({ set, params, user }) => {
            try {
              const { id } = providerIdParamsSchema.parse(params);
              const repo = UserService.getInstance().getUserLLMProviderRepository();
              const provider = await repo.findById(id);
              if (!provider || provider.userId !== user!.id) {
                set.status = 404;
                return { success: false, error: 'LLM provider not found' };
              }
              await repo.deleteUserProvider(id, user!.id);
              try {
                await getEventBusService().publish('llm.provider.changed', {
                  eventType: 'provider.deleted',
                  providerId: provider.id,
                  providerType: provider.type,
                  userId: user!.id,
                });
              } catch (eventError) {
                logger.warn('Failed to publish provider deleted event', {
                  providerId: provider.id,
                  error: eventError,
                });
              }
              return { success: true, message: 'LLM provider deleted successfully' };
            } catch (error: unknown) {
              logger.error('Error deleting user LLM provider', { error });
              if (error instanceof Error && error.message.includes('Cannot delete provider')) {
                set.status = 400;
                return { success: false, error: error.message, code: 'PROVIDER_IN_USE' };
              }
              set.status = 500;
              return { success: false, error: 'Failed to delete LLM provider' };
            }
          })

          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .post('/my-providers/:id/test', async ({ set, params, user }) => {
            try {
              const { id } = providerIdParamsSchema.parse(params);
              const { ModelService } = await import('../services/modelService.js');
              const modelService = new ModelService();
              const repo = UserService.getInstance().getUserLLMProviderRepository();
              const provider = await repo.findById(id);
              if (!provider || provider.userId !== user!.id) {
                set.status = 404;
                return { success: false, error: 'LLM provider not found' };
              }
              const isHealthy = await modelService.healthCheck();
              const models = await modelService.getModelsForProvider(id);
              return {
                success: true,
                data: {
                  status: isHealthy ? 'healthy' : 'unhealthy',
                  latency: 0,
                  error: isHealthy ? null : 'Database connection failed',
                  modelCount: models.length,
                  testedAt: new Date().toISOString(),
                  note: 'Database-only test. External API connectivity tested by LLM Service.',
                },
              };
            } catch (error) {
              logger.error('Error testing user LLM provider database connection', { error });
              set.status = 500;
              return { success: false, error: 'Failed to test LLM provider database connection' };
            }
          })

          // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
          .get('/my-providers/:id/stats', async ({ set, params, user }) => {
            try {
              const { id } = providerIdParamsSchema.parse(params);
              const repo = UserService.getInstance().getUserLLMProviderRepository();
              const stats = await repo.getProviderStats(id, user!.id);
              if (!stats) {
                set.status = 404;
                return { success: false, error: 'LLM provider not found' };
              }
              return {
                success: true,
                data: { ...stats, errorRate: `${stats.errorRate.toFixed(2)}%` },
              };
            } catch (error) {
              logger.error('Error getting user LLM provider statistics', { error });
              set.status = 500;
              return { success: false, error: 'Failed to get provider statistics' };
            }
          })
      )
  );
}

function toSafeProvider(provider: Record<string, unknown>) {
  return {
    id: provider.id,
    userId: provider.userId,
    name: provider.name,
    description: provider.description,
    type: provider.type,
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    configuration: provider.configuration,
    status: provider.status,
    isActive: provider.isActive,
    priority: provider.priority,
    hasApiKey: provider.hasApiKey?.() ?? false,
    totalTokensUsed: provider.totalTokensUsed,
    totalRequests: provider.totalRequests,
    totalErrors: provider.totalErrors,
    lastUsedAt: provider.lastUsedAt,
    lastHealthCheckAt: provider.lastHealthCheckAt,
    healthCheckResult: provider.healthCheckResult,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

export default registerProviderRoutes;
