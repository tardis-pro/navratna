import { Elysia } from 'elysia';
import { withAdminGuard, withRequiredAuth } from '@uaip/middleware';
import { logger } from '@uaip/utils';
import { UserService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/infra/event_bus';
import { z } from 'zod';
import { LLMProviderStatus, LLMProviderType, CreateLLMProviderRequest } from '@uaip/types';
import { llmProviderManagementService } from '../services/llm_provider_management_service.js';

function toCreateLLMProviderRequest(parsed: {
  name?: string;
  type?: LLMProviderType;
  baseUrl?: string;
  description?: string;
  apiKey?: string;
  defaultModel?: string;
  configuration?: {
    timeout?: number;
    retries?: number;
    rateLimit?: number;
    headers?: Record<string, string>;
    customEndpoints?: { models?: string; chat?: string; completions?: string };
  };
  priority?: number;
}): CreateLLMProviderRequest {
  if (!parsed.name) throw new Error('name is required');
  if (!parsed.type) throw new Error('type is required');
  if (!parsed.baseUrl) throw new Error('baseUrl is required');
  return {
    name: parsed.name,
    type: parsed.type,
    baseUrl: parsed.baseUrl,
    description: parsed.description,
    apiKey: parsed.apiKey,
    defaultModel: parsed.defaultModel,
    configuration: parsed.configuration,
    priority: parsed.priority,
  };
}

import { getAuthUser, getErrorMessage } from './context_helpers.js';

// Zod schemas mirroring original
const createUserProviderSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  type: z.nativeEnum(LLMProviderType),
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

const createManagedProviderSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  type: z.nativeEnum(LLMProviderType),
  baseUrl: z.string().url(),
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

const ROLE_LIMITS: Record<string, number> = {
  guest: 0,
  user: 3,
  moderator: 5,
  admin: 10,
  system: 50,
};

const providerIdParamsSchema = z.object({ id: z.string().min(1) });

let eventBusServiceSingleton: EventBusService | null = null;

type UserProviderRecord = Record<string, unknown>;

function getProviderConfiguration(provider: UserProviderRecord): Record<string, unknown> {
  const configuration = provider.configuration;
  return typeof configuration === 'object' && configuration !== null
    ? configuration as Record<string, unknown>
    : {};
}

function getStringConfigValue(
  provider: UserProviderRecord,
  key: string,
  fallback?: unknown
): string | undefined {
  const configuration = getProviderConfiguration(provider);
  const configValue = configuration[key];
  if (typeof configValue === 'string') return configValue;
  return typeof fallback === 'string' ? fallback : undefined;
}

function getNumberConfigValue(
  provider: UserProviderRecord,
  key: string,
  fallback?: unknown
): number | undefined {
  const configuration = getProviderConfiguration(provider);
  const configValue = configuration[key];
  if (typeof configValue === 'number') return configValue;
  return typeof fallback === 'number' ? fallback : undefined;
}

function getBooleanConfigValue(
  provider: UserProviderRecord,
  key: string,
  fallback?: unknown
): boolean | undefined {
  const configuration = getProviderConfiguration(provider);
  const configValue = configuration[key];
  if (typeof configValue === 'boolean') return configValue;
  return typeof fallback === 'boolean' ? fallback : undefined;
}

const getEventBusService = (): EventBusService => {
  if (!eventBusServiceSingleton) {
    eventBusServiceSingleton = EventBusService.getInstance();
  }
  return eventBusServiceSingleton;
};

export function registerProviderRoutes() {
  return new Elysia()
      // Admin/system provider management
      .group('/api/v1', (app) => withAdminGuard(app)
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
        .post('/providers', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, body } = ctx;
          try {
            const parsedBody = toCreateLLMProviderRequest(createManagedProviderSchema.parse(body));
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
              return { success: false, error: 'An LLM provider with this name already exists' };
            }
            set.status = 500;
            return { success: false, error: 'Failed to create LLM provider' };
          }
        })
        .put('/providers/:id', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, params, body } = ctx;
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
        .delete('/providers/:id', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, params } = ctx;
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
      .group('/api/v1/llm', (app) => withRequiredAuth(app)
        .get('/my-providers/limits', async (ctx) => {
          const user = getAuthUser(ctx);
          const role = (user!.role || 'user').toLowerCase();
          const limit = ROLE_LIMITS[role] ?? 0;
          const providers = await UserService.getInstance()
            .getUserLLMProviderRepository()
            .findByUserId(user!.id);
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
        .get('/my-providers', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set } = ctx;
          try {
            const providers = await UserService.getInstance()
              .getUserLLMProviderRepository()
              .findByUserId(user!.id);
            return { success: true, data: providers.map(toSafeProvider) };
          } catch (error) {
            logger.error('Error getting user LLM providers', { error });
            set.status = 500;
            return { success: false, error: 'Failed to get LLM providers' };
          }
        })
        .get('/my-providers/active', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set } = ctx;
          try {
            const userProviders = await UserService.getInstance()
              .getUserLLMProviderRepository()
              .findActiveByUserId(user!.id);
            const llmProviderRepo = UserService.getInstance().getLLMProviderRepository();
            const providers = userProviders.length > 0 ? await llmProviderRepo.findMany() : [];
            const providerMap = new Map(providers.map((p) => [p.id, p]));
            const active = userProviders.map((up) => {
              const provider = providerMap.get(up.providerId);
              return {
                id: up.id,
                providerId: up.providerId,
                name: provider?.name ?? 'Unknown',
                type: provider?.type ?? 'custom',
                defaultModel: provider?.defaultModel ?? null,
                priority: provider?.priority ?? 0,
                hasApiKey: Boolean(up.apiKeyEncrypted),
                isDefault: up.isDefault,
              };
            });
            return { success: true, data: active };
          } catch (error) {
            logger.error('Error getting active user LLM providers', { error });
            set.status = 500;
            return { success: false, error: 'Failed to get active LLM providers' };
          }
        })
        .get('/my-providers/models', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set } = ctx;
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
        .get('/my-providers/:id', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, params } = ctx;
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
        .post('/my-providers', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, body } = ctx;
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
              providerId: v.type,
              apiKeyEncrypted: v.apiKey,
              configuration: {
                name: v.name,
                description: v.description,
                baseUrl: v.baseUrl,
                defaultModel: v.defaultModel,
                priority: v.priority ?? 100,
                ...(v.configuration ?? {}),
              },
            });
            logger.info('User LLM provider created successfully', {
              userId: user!.id,
              providerId: saved.id,
              providerType: saved.providerId,
            });
            try {
              await getEventBusService().publish('llm.provider.changed', {
                eventType: 'provider.created',
                providerId: saved.id,
                providerType: saved.providerId,
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
              return { success: false, error: 'An LLM provider name is already in use' };
            }
            set.status = 500;
            return { success: false, error: 'Failed to create LLM provider' };
          }
        })
        .put('/my-providers/:id', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, params, body } = ctx;
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
              await repo.updateApiKey(id, v.apiKey);
            }
            const configUpdates: Record<string, unknown> = {};
            if (v.name !== undefined) configUpdates.name = v.name;
            if (v.description !== undefined) configUpdates.description = v.description;
            if (v.baseUrl !== undefined) configUpdates.baseUrl = v.baseUrl;
            if (v.defaultModel !== undefined) configUpdates.defaultModel = v.defaultModel;
            if (v.priority !== undefined) configUpdates.priority = v.priority;
            if (v.status !== undefined) configUpdates.status = v.status;
            if (v.isActive !== undefined) configUpdates.isActive = v.isActive;
            if (v.configuration !== undefined) Object.assign(configUpdates, v.configuration);
            if (Object.keys(configUpdates).length > 0) {
              await repo.updateProviderConfig(id, {
                configuration: {
                  ...getProviderConfiguration(provider),
                  ...configUpdates,
                },
              });
            }
            const updatedProvider = await repo.findById(id);
            if (updatedProvider) {
              try {
                await getEventBusService().publish('llm.provider.changed', {
                  eventType: 'provider.updated',
                  providerId: updatedProvider.id,
                  providerType: updatedProvider.providerId,
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
        .delete('/my-providers/:id', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, params } = ctx;
          try {
            const { id } = providerIdParamsSchema.parse(params);
            const repo = UserService.getInstance().getUserLLMProviderRepository();
            const provider = await repo.findById(id);
            if (!provider || provider.userId !== user!.id) {
              set.status = 404;
              return { success: false, error: 'LLM provider not found' };
            }
            await repo.deleteUserProvider(id);
            try {
              await getEventBusService().publish('llm.provider.changed', {
                eventType: 'provider.deleted',
                providerId: provider.id,
                providerType: provider.providerId,
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
              return { success: false, error: 'Cannot delete provider — it is currently in use', code: 'PROVIDER_IN_USE' };
            }
            set.status = 500;
            return { success: false, error: 'Failed to delete LLM provider' };
          }
        })
        .post('/my-providers/:id/test', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, params } = ctx;
          try {
            const { id } = providerIdParamsSchema.parse(params);
            const repo = UserService.getInstance().getUserLLMProviderRepository();
            const provider = await repo.findById(id);
            if (!provider || provider.userId !== user!.id) {
              set.status = 404;
              return { success: false, error: 'LLM provider not found' };
            }
            const { UserLLMService } = await import('@uaip/llm-service');
            const userLLMService = new UserLLMService();
            const result = await userLLMService.testUserProvider(user!.id, id);
            return {
              success: true,
              data: {
                status: result.isHealthy ? 'healthy' : 'unhealthy',
                latency: result.responseTime,
                error: result.error ?? null,
                modelCount: result.modelCount,
                testedAt: new Date().toISOString(),
                note: 'Live provider connectivity tested through LLM Service.',
              },
            };
          } catch (error) {
            logger.error('Error testing user LLM provider database connection', { error });
            set.status = 500;
            return { success: false, error: 'Failed to test LLM provider database connection' };
          }
        })
        .get('/my-providers/:id/stats', async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, params } = ctx;
          try {
            const { id } = providerIdParamsSchema.parse(params);
            const repo = UserService.getInstance().getUserLLMProviderRepository();
            const provider = await repo.findById(id);
            if (!provider || provider.userId !== user.id) {
              set.status = 404;
              return { success: false, error: 'LLM provider not found' };
            }
            const stats = await repo.getProviderStats(id);
            if (!stats) {
              set.status = 404;
              return { success: false, error: 'LLM provider not found' };
            }
            return {
              success: true,
              data: { ...stats, errorRate: '0.00%' },
            };
          } catch (error) {
            const message = getErrorMessage(error);
            logger.error('Error getting user LLM provider statistics', { error: message });
            set.status = 500;
            return { success: false, error: 'Failed to get provider statistics', message };
          }
        })
      );
}

function toSafeProvider(provider: Record<string, unknown>) {
  const configuration = getProviderConfiguration(provider);
  const isActive = getBooleanConfigValue(provider, 'isActive', provider.isActive);
  return {
    id: provider.id,
    userId: provider.userId,
    name: getStringConfigValue(provider, 'name', provider.name),
    description: getStringConfigValue(provider, 'description', provider.description),
    type: getStringConfigValue(provider, 'type', provider.providerId ?? provider.type),
    baseUrl: getStringConfigValue(provider, 'baseUrl', provider.baseUrl),
    defaultModel: getStringConfigValue(provider, 'defaultModel', provider.defaultModel),
    configuration,
    status: getStringConfigValue(provider, 'status', provider.status),
    isActive: isActive ?? true,
    priority: getNumberConfigValue(provider, 'priority', provider.priority),
    hasApiKey: Boolean(provider.apiKeyEncrypted),
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
