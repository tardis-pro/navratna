import { UserLLMService, AgentResponseRequest } from '@uaip/llm-service';
import { logger } from '@uaip/utils';
import { ModelCapabilityDetector } from '@uaip/shared-services';
import { LLMProviderType } from '@uaip/types';
import { Elysia, type Context } from 'elysia';

type UserLLMProviderType = 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'google' | 'custom';

function _isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUserLLMProviderType(value: unknown): value is UserLLMProviderType {
  switch (value) {
    case 'ollama':
    case 'llmstudio':
    case 'openai':
    case 'anthropic':
    case 'google':
    case 'custom':
      return true;
    default:
      return false;
  }
}

function toDetectorProviderType(value: UserLLMProviderType): LLMProviderType | null {
  switch (value) {
    case 'ollama':
      return LLMProviderType.OLLAMA;
    case 'llmstudio':
      return LLMProviderType.LLMSTUDIO;
    case 'openai':
      return LLMProviderType.OPENAI;
    case 'anthropic':
      return LLMProviderType.ANTHROPIC;
    default:
      return null;
  }
}

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

type LLMProviderShape = {
  id: string;
  name: string;
  userId: string;
  description?: string;
  type: UserLLMProviderType;
  baseUrl?: string;
  apiKeyEncrypted?: string;
  isDefault: boolean;
  configuration?: Record<string, unknown>;
  isActive?: boolean;
  defaultModel?: string;
  modelId?: string;
};

function sanitizeProvider(provider: LLMProviderShape) {
  return {
    id: provider.id,
    userId: provider.userId,
    name: provider.name,
    description: provider.description,
    type: provider.type,
    baseUrl: provider.baseUrl,
    isDefault: provider.isDefault,
    configuration: provider.configuration,
    isActive: provider.isActive,
    defaultModel: provider.defaultModel,
    modelId: provider.modelId,
    hasApiKey: Boolean(provider.apiKeyEncrypted),
  };
}

function requireUserId(headers: Record<string, string | undefined>) {
  const userId = headers['x-user-id'];
  if (!userId) return { userId: null, error: { success: false, error: 'User authentication required' } };
  return { userId, error: null };
}

export function registerUserLLMRoutes<T extends Elysia>(app: T, userLLMService: UserLLMService): T {
  app.group(
    '/api/v1/user/llm',
    (group: { get: Function; post: Function; put: Function; delete: Function }) =>
      group
        // Get user's providers
        .get('/providers', async ({ headers }: Context) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          const providers = await userLLMService.getUserProviders(userId);

          // Remove sensitive data (API keys) from response
          const sanitizedProviders = providers.map(sanitizeProvider);

          return {
            success: true,
            data: sanitizedProviders,
          };
        })

        // Create a new provider for user
        .post('/providers', async ({ headers, body }: Context) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

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
              userId: provider.userId,
              name: provider.name,
              description: provider.description,
              type: provider.type,
              baseUrl: provider.baseUrl,
              isDefault: provider.isDefault,
              configuration: provider.configuration,
              isActive: provider.isActive,
              defaultModel: provider.defaultModel,
              modelId: provider.modelId,
              hasApiKey: Boolean(provider.apiKeyEncrypted),
            },
          };
        })

        // Update provider configuration
        .put('/providers/:providerId', async ({ headers, params, body }: Context) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

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
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

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
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          const result = await userLLMService.testUserProvider(userId);

          return {
            success: true,
            data: result,
          };
        })

        // Delete provider
        .delete('/providers/:providerId', async ({ headers, params }: Context) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          const { providerId } = params;
          await userLLMService.deleteUserProvider(userId, providerId);

          return {
            success: true,
            message: 'Provider deleted successfully',
          };
        })

        // Get user's providers by type
        .get('/providers/type/:type', async ({ headers, params }: Context) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          const { type } = params;
          if (!isUserLLMProviderType(type)) {
            return { success: false, error: 'Invalid provider type' };
          }

          const providers = await userLLMService.getUserProvidersByType(
            userId,
            type
          );

          // Remove sensitive data (API keys) from response
          const sanitizedProviders = providers.map(sanitizeProvider);

          return {
            success: true,
            data: sanitizedProviders,
          };
        })

        // Get available models for user
        .get('/models', async ({ headers }: Context) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;
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
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

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
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

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
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

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
            const detectorProviderType = toDetectorProviderType(provider.type);
            if (!detectorProviderType) {
              return {
                success: false,
                error: `Provider type ${provider.type} is not supported for capability detection`,
              };
            }

            const detection = await detector.detectCapabilities(
              provider.defaultModel,
              detectorProviderType,
              provider.baseUrl
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
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          const userProviders = await userLLMService.getUserProviders(userId);

          const detector = ModelCapabilityDetector.getInstance();
          const results = [];

          for (const provider of userProviders) {
            try {
              if (provider.defaultModel) {
                const detectorProviderType = toDetectorProviderType(provider.type);
                if (!detectorProviderType) {
                  results.push({
                    providerId: provider.id,
                    providerName: provider.name,
                    modelId: provider.defaultModel,
                    success: false,
                    error: `Provider type ${provider.type} is not supported for capability detection`,
                    detectedCapabilities: [] as string[],
                  });
                  continue;
                }

                // oxlint-disable-next-line eslint/no-await-in-loop -- sequential processing required
                const detection = await detector.detectCapabilities(
                  provider.defaultModel,
                  detectorProviderType,
                  provider.baseUrl
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

  return app;
}
