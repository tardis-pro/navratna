import { withAdminGuard, withRequiredAuth } from './middleware/auth.plugin.js';
import { logger } from '@uaip/utils';
import { UserService } from '@uaip/shared-services';
import { z } from 'zod';
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
  status: z.enum(['active', 'inactive', 'error', 'testing']).optional(),
  isActive: z.boolean().optional(),
});

const ROLE_LIMITS: Record<string, number> = {
  guest: 0,
  user: 3,
  moderator: 5,
  admin: 10,
  system: 50,
};

export function registerProviderRoutes(app: any): any {
  return (
    app
      // Admin/system provider management
      .group('/api/v1', (app: any) =>
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
              const provider = await llmProviderManagementService.getProviderById(
                (params as any).id
              );
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
          .post('/providers', async ({ set, body, user }) => {
            try {
              const created = await llmProviderManagementService.createProvider(
                body as any,
                user!.id
              );
              set.status = 201;
              return { success: true, data: created };
            } catch (error: any) {
              logger.error('Error creating LLM provider', { error });
              if (error instanceof Error && error.message.includes('already exists')) {
                set.status = 409;
                return { success: false, error: error.message };
              }
              set.status = 500;
              return { success: false, error: 'Failed to create LLM provider' };
            }
          })
          .put('/providers/:id', async ({ set, params, body, user }) => {
            try {
              const updated = await llmProviderManagementService.updateProvider(
                (params as any).id,
                body as any,
                user!.id
              );
              return { success: true, data: updated };
            } catch (error) {
              logger.error('Error updating LLM provider', { error });
              set.status = 500;
              return { success: false, error: 'Failed to update LLM provider' };
            }
          })
          .delete('/providers/:id', async ({ set, params, user }) => {
            try {
              await llmProviderManagementService.deleteProvider((params as any).id, user!.id);
              return { success: true, message: 'LLM provider deleted successfully' };
            } catch (error) {
              logger.error('Error deleting LLM provider', { error });
              set.status = 500;
              return { success: false, error: 'Failed to delete LLM provider' };
            }
          })
          .post('/providers/:id/test', async ({ set, params }) => {
            try {
              const result = await llmProviderManagementService.testProviderConnection(
                (params as any).id
              );
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

      // User-scoped provider management
      .group('/api/v1', (app: any) =>
        withRequiredAuth(app)
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

          .get('/my-providers/active', async ({ user, set }) => {
            try {
              const providers = await UserService.getInstance()
                .getUserLLMProviderRepository()
                .findActiveProvidersByUser(user!.id);
              const active = providers
                .filter((p: any) => p.isActive && (p.status === 'active' || p.status === 'testing'))
                .map((p: any) => ({
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

          .get('/my-providers/models', async ({ user, set }) => {
            try {
              const { ModelService } = await import('../services/modelService.js');
              const dataSource = await (
                await import('@uaip/shared-services')
              ).DatabaseService.getInstance().getDataSource();
              const modelService = new ModelService(dataSource);
              const models = await modelService.getModelsForUser(user!.id);
              return { success: true, data: models };
            } catch (error) {
              logger.error('Error getting user LLM models', { error });
              set.status = 500;
              return { success: false, error: 'Failed to get LLM models' };
            }
          })

          .get('/my-providers/:id', async ({ set, params, user }) => {
            try {
              const provider = await UserService.getInstance()
                .getUserLLMProviderRepository()
                .findById((params as any).id);
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
                type: v.type as any,
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
              set.status = 201;
              return { success: true, data: toSafeProvider(saved) };
            } catch (error: any) {
              logger.error('Error creating user LLM provider', { error });
              if (error instanceof Error && error.message.includes('already in use')) {
                set.status = 409;
                return { success: false, error: error.message };
              }
              set.status = 500;
              return { success: false, error: 'Failed to create LLM provider' };
            }
          })

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
              const repo = UserService.getInstance().getUserLLMProviderRepository();
              const provider = await repo.findById((params as any).id);
              if (!provider || provider.userId !== user!.id) {
                set.status = 404;
                return { success: false, error: 'LLM provider not found' };
              }
              const v = validation.data;
              // Split config updates per available repo methods
              if (v.apiKey !== undefined) {
                await repo.updateApiKey((params as any).id, v.apiKey, user!.id);
              }
              const configUpdates: any = {};
              if (v.name !== undefined) configUpdates.name = v.name;
              if (v.description !== undefined) configUpdates.description = v.description;
              if (v.baseUrl !== undefined) configUpdates.baseUrl = v.baseUrl;
              if (v.defaultModel !== undefined) configUpdates.defaultModel = v.defaultModel;
              if (v.priority !== undefined) configUpdates.priority = v.priority;
              if (v.configuration !== undefined) configUpdates.configuration = v.configuration;
              if (Object.keys(configUpdates).length > 0) {
                await repo.updateProviderConfig((params as any).id, user!.id, configUpdates);
              }
              if (v.status !== undefined) {
                await repo.updateStatus((params as any).id, v.status as any, user!.id);
              }
              const updatedProvider = await repo.findById((params as any).id);
              return { success: true, data: toSafeProvider(updatedProvider!) };
            } catch (error) {
              logger.error('Error updating user LLM provider', { error });
              set.status = 500;
              return { success: false, error: 'Failed to update LLM provider' };
            }
          })

          .delete('/my-providers/:id', async ({ set, params, user }) => {
            try {
              const repo = UserService.getInstance().getUserLLMProviderRepository();
              await repo.deleteUserProvider((params as any).id, user!.id);
              return { success: true, message: 'LLM provider deleted successfully' };
            } catch (error: any) {
              logger.error('Error deleting user LLM provider', { error });
              if (error instanceof Error && error.message.includes('Cannot delete provider')) {
                set.status = 400;
                return { success: false, error: error.message, code: 'PROVIDER_IN_USE' };
              }
              set.status = 500;
              return { success: false, error: 'Failed to delete LLM provider' };
            }
          })

          .post('/my-providers/:id/test', async ({ set, params, user }) => {
            try {
              const { ModelService } = await import('../services/modelService.js');
              const dataSource = await (
                await import('@uaip/shared-services')
              ).DatabaseService.getInstance().getDataSource();
              const modelService = new ModelService(dataSource);
              const repo = UserService.getInstance().getUserLLMProviderRepository();
              const provider = await repo.findById((params as any).id);
              if (!provider || provider.userId !== user!.id) {
                set.status = 404;
                return { success: false, error: 'LLM provider not found' };
              }
              const isHealthy = await modelService.healthCheck();
              const models = await modelService.getModelsForProvider((params as any).id);
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

          .get('/my-providers/:id/stats', async ({ set, params, user }) => {
            try {
              const repo = UserService.getInstance().getUserLLMProviderRepository();
              const stats = await repo.getProviderStats((params as any).id, user!.id);
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

function toSafeProvider(provider: any) {
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
