import { UserLLMService, AgentResponseRequest } from '@uaip/llm-service';
import { logger } from '@uaip/utils';
import { ModelCapabilityDetector, UserLLMProviderType } from '@uaip/shared-services';
import type { Elysia, Context } from 'elysia';

// Request Interfaces
interface CreateProviderRequest {
  name: string;
  description?: string;
  type: UserLLMProviderType;
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  configuration?: Record<string, unknown>;
  priority?: number;
}

interface UpdateProviderRequest {
  name?: string;
  description?: string;
  baseUrl?: string;
  defaultModel?: string;
  priority?: number;
  configuration?: Record<string, unknown>;
}

interface UpdateApiKeyRequest {
  apiKey: string;
}

interface GenerateRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export function registerUserLLMRoutes(app: Elysia, userLLMService: UserLLMService) {
  return app.group(
    '/api/v1/user/llm',
    (group: { get: Function; post: Function; put: Function; delete: Function }) =>
      group
        // Get user's providers
        .get('/providers', async ({ headers }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }

          const providers = await userLLMService.getUserProviders(userId);

          // Remove sensitive data (API keys) from response
          const sanitizedProviders = providers.map((provider) => ({
            id: provider.id,
            name: provider.name,
            description: provider.description,
            type: provider.type,
            baseUrl: provider.baseUrl,
            defaultModel: provider.defaultModel,
            status: provider.status,
            isActive: provider.isActive,
            priority: provider.priority,
            totalTokensUsed: provider.totalTokensUsed,
            totalRequests: provider.totalRequests,
            totalErrors: provider.totalErrors,
            lastUsedAt: provider.lastUsedAt,
            healthCheckResult: provider.healthCheckResult,
            hasApiKey: provider.hasApiKey(),
            createdAt: provider.createdAt,
            updatedAt: provider.updatedAt,
          }));

          return {
            success: true,
            data: sanitizedProviders,
          };
        })

        // Create a new provider for user
        .post('/providers', async ({ headers, body }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }

          const requestBody = body as CreateProviderRequest;
          const {
            name,
            description,
            type,
            baseUrl,
            apiKey,
            defaultModel,
            configuration,
            priority,
          } = requestBody || {};

          if (!name || !type) {
            return {
              success: false,
              error: 'Name and type are required',
            };
          }

          const provider = await userLLMService.createUserProvider(userId, {
            name,
            description,
            type,
            baseUrl,
            apiKey,
            defaultModel,
            configuration,
            priority,
          });

          // Return sanitized provider data
          return {
            success: true,
            data: {
              id: provider.id,
              name: provider.name,
              description: provider.description,
              type: provider.type,
              baseUrl: provider.baseUrl,
              defaultModel: provider.defaultModel,
              status: provider.status,
              isActive: provider.isActive,
              priority: provider.priority,
              hasApiKey: provider.hasApiKey(),
              createdAt: provider.createdAt,
            },
          };
        })

        // Update provider configuration
        .put('/providers/:providerId', async ({ headers, params, body }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }

          const { providerId } = params;
          const requestBody = body as UpdateProviderRequest;
          const { name, description, baseUrl, defaultModel, priority, configuration } =
            requestBody || {};

          await userLLMService.updateUserProviderConfig(userId, providerId, {
            name,
            description,
            baseUrl,
            defaultModel,
            priority,
            configuration,
          });

          return {
            success: true,
            message: 'Provider configuration updated successfully',
          };
        })

        // Update provider API key
        .put('/providers/:providerId/api-key', async ({ headers, params, body }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }

          const { providerId } = params;
          const requestBody = body as UpdateApiKeyRequest;
          const { apiKey } = requestBody || {};

          if (!apiKey) {
            return {
              success: false,
              error: 'API key is required',
            };
          }

          await userLLMService.updateUserProviderApiKey(userId, providerId, apiKey);

          return {
            success: true,
            message: 'API key updated successfully',
          };
        })

        // Test provider connectivity
        .post('/providers/:providerId/test', async ({ headers }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }

          const result = await userLLMService.testUserProvider(userId);

          return {
            success: true,
            data: result,
          };
        })

        // Delete provider
        .delete('/providers/:providerId', async ({ headers, params }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }

          const { providerId } = params;
          await userLLMService.deleteUserProvider(userId, providerId);

          return {
            success: true,
            message: 'Provider deleted successfully',
          };
        })

        // Get user's providers by type
        .get('/providers/type/:type', async ({ headers, params }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }

          const { type } = params;
          // Cast string param to UserLLMProviderType - strictly speaking we should validate it
          // but for now we assume it's valid or the service will handle the empty result
          const providers = await userLLMService.getUserProvidersByType(
            userId,
            type as UserLLMProviderType
          );

          // Remove sensitive data (API keys) from response
          const sanitizedProviders = providers.map((provider) => ({
            id: provider.id,
            name: provider.name,
            description: provider.description,
            type: provider.type,
            baseUrl: provider.baseUrl,
            defaultModel: provider.defaultModel,
            status: provider.status,
            isActive: provider.isActive,
            priority: provider.priority,
            totalTokensUsed: provider.totalTokensUsed,
            totalRequests: provider.totalRequests,
            totalErrors: provider.totalErrors,
            lastUsedAt: provider.lastUsedAt,
            healthCheckResult: provider.healthCheckResult,
            hasApiKey: provider.hasApiKey(),
            createdAt: provider.createdAt,
            updatedAt: provider.updatedAt,
          }));

          return {
            success: true,
            data: sanitizedProviders,
          };
        })

        // Get available models for user
        .get('/models', async ({ headers }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }
          logger.info('Getting available models for user', { userId });
          const models = await userLLMService.getAvailableModels(userId);
          const healthResults = await userLLMService.testUserProvider(userId);
          logger.debug('Health check results', { userId, healthResults });
          return {
            success: true,
            data: models,
          };
        })

        // Generate LLM response
        .post('/generate', async ({ headers, body }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }

          const requestBody = body as GenerateRequest;
          const { prompt, systemPrompt, maxTokens, temperature, model } = requestBody || {};

          if (!prompt) {
            return {
              success: false,
              error: 'Prompt is required',
            };
          }

          const response = await userLLMService.generateResponse(userId, {
            prompt,
            systemPrompt,
            maxTokens,
            temperature,
            model,
          });

          return {
            success: true,
            data: response,
          };
        })

        // Generate agent response
        .post('/agent-response', async ({ headers, body }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }

          // Cast body to AgentResponseRequest
          const request = body as AgentResponseRequest;
          const { agent, messages, context, tools } = request || {};

          if (!agent || !messages) {
            return {
              success: false,
              error: 'Agent and messages are required',
            };
          }

          const response = await userLLMService.generateAgentResponse(userId, {
            agent,
            messages,
            context,
            tools,
          });

          return {
            success: true,
            data: response,
          };
        })

        // Get model capabilities for user's providers
        .get('/capabilities', async ({ headers }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }

          const userProviders = await userLLMService.getUserProviders(userId);

          const capabilities = [];

          for (const provider of userProviders) {
            const config = provider.configuration as Record<string, unknown> | undefined;
            const providerCapabilities = {
              providerId: provider.id,
              providerName: provider.name,
              providerType: provider.type,
              defaultModel: provider.defaultModel,
              modelCapabilities: (config?.modelCapabilities as Record<string, unknown>) || {},
              detectedCapabilities: (config?.detectedCapabilities as string[]) || [],
              lastCapabilityCheck: config?.lastCapabilityCheck as Date | undefined,
              isActive: provider.isActive,
              status: provider.status,
            };

            capabilities.push(providerCapabilities);
          }

          return {
            success: true,
            data: {
              userId,
              providers: capabilities,
              totalProviders: userProviders.length,
              activeProviders: userProviders.filter((p) => p.isActive).length,
            },
          };
        })

        // Detect capabilities for a specific provider
        .post(
          '/providers/:providerId/detect-capabilities',
          async ({ headers, params }: Context) => {
            const userId = headers['x-user-id'];
            const providerId = params.providerId;

            if (!userId) {
              return {
                success: false,
                error: 'User authentication required',
              };
            }

            const provider = await userLLMService.getUserProviderById(providerId);

            if (!provider) {
              return {
                success: false,
                error: 'Provider not found',
              };
            }

            const detector = ModelCapabilityDetector.getInstance();
            const apiKey = await provider.getApiKey();
            // ModelCapabilityDetector expects specific types, we assume compatibility here or cast if needed
            // Since UserLLMProviderType and detector types might differ slightly, we cast to any or compatible type
            // However, avoiding any, we assume they are compatible strings.
            const detection = await detector.detectCapabilities(
              provider.defaultModel,
              provider.type as unknown as string, // Cast to compatible type for detector
              provider.baseUrl,
              apiKey
            );

            // Update provider configuration with detected capabilities
            const currentConfig = provider.configuration as Record<string, unknown> | undefined;
            provider.configuration = {
              ...currentConfig,
              detectedCapabilities: detection.detectedCapabilities,
              lastCapabilityCheck: new Date(),
              capabilityTestResults: detection.testResults,
            } as Record<string, unknown>;

            await userLLMService.updateUserProviderConfig(userId, provider.id, {
              configuration: provider.configuration,
            });

            return {
              success: true,
              data: {
                providerId: provider.id,
                providerName: provider.name,
                modelId: provider.defaultModel,
                detection,
              },
            };
          }
        )

        // Detect capabilities for all user providers
        .post('/detect-all-capabilities', async ({ headers }: Context) => {
          const userId = headers['x-user-id'];
          if (!userId) {
            return {
              success: false,
              error: 'User authentication required',
            };
          }

          const userProviders = await userLLMService.getUserProviders(userId);

          const detector = ModelCapabilityDetector.getInstance();
          const results = [];

          for (const provider of userProviders) {
            try {
              if (provider.defaultModel) {
                // oxlint-disable-next-line eslint/no-await-in-loop -- sequential processing required
                const apiKey = await provider.getApiKey();
                // oxlint-disable-next-line eslint/no-await-in-loop -- sequential processing required
                const detection = await detector.detectCapabilities(
                  provider.defaultModel,
                  provider.type as unknown as string,
                  provider.baseUrl,
                  apiKey
                );

                // Update provider configuration with detected capabilities
                const currentConfig = provider.configuration as Record<string, unknown> | undefined;
                provider.configuration = {
                  ...currentConfig,
                  detectedCapabilities: detection.detectedCapabilities,
                  lastCapabilityCheck: new Date(),
                  capabilityTestResults: detection.testResults,
                } as Record<string, unknown>;

                // oxlint-disable-next-line eslint/no-await-in-loop -- sequential processing required
                await userLLMService.updateUserProviderConfig(userId, provider.id, {
                  configuration: provider.configuration,
                });

                results.push({
                  providerId: provider.id,
                  providerName: provider.name,
                  modelId: provider.defaultModel,
                  success: true,
                  detection,
                });
              }
            } catch (error) {
              results.push({
                providerId: provider.id,
                providerName: provider.name,
                modelId: provider.defaultModel,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                detectedCapabilities: [] as string[], // Ensure this is set to an empty array,
              });
            }
          }
          return {
            success: true,
            data: {
              userId,
              totalProviders: userProviders.length,
              processedProviders: results.length,
              successfulDetections: results.filter((r) => r.success).length,
              failedDetections: results.filter((r) => !r.success).length,
              results,
            },
          };
        })
  );
}
