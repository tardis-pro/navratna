import { UserLLMService, AgentResponseRequest } from '@uaip/llm-service';
import { logger } from '@uaip/utils';
import { ModelCapabilityDetector } from '@uaip/shared-services';
import type {
  UserLLMProviderType,
  CreateUserLLMProviderRequest,
  UpdateUserLLMProviderRequest,
  UpdateApiKeyRequest,
  UserLLMGenerateRequest,
  LLMProviderShape,
} from '@uaip/types';
import { LLMProviderType } from '@uaip/types';
import { Elysia, t } from 'elysia';

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

const ProviderResponseSchema = t.Object({
  success: t.Boolean(),
  data: t.Optional(t.Any()),
  error: t.Optional(t.String()),
  message: t.Optional(t.String()),
});

export function registerUserLLMRoutes(userLLMService: UserLLMService){
  return new Elysia().group(
    '/api/v1/user/llm',
    (group) =>
      group
        .get('/providers', async ({ headers }) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          const providers = await userLLMService.getUserProviders(userId);

          const sanitizedProviders = providers.map(sanitizeProvider);

          return {
            success: true,
            data: sanitizedProviders,
          };
        }, {
          response: { 200: ProviderResponseSchema },
        })

        .post('/providers', async ({ headers, body }) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          // @ts-expect-error -- Elysia validates body via TypeBox schema; body IS CreateUserLLMProviderRequest at runtime
          const requestBody: CreateUserLLMProviderRequest = body;
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
        }, {
          body: t.Object({
            name: t.String(),
            description: t.Optional(t.String()),
            type: t.Union([
              t.Literal('ollama'),
              t.Literal('llmstudio'),
              t.Literal('openai'),
              t.Literal('anthropic'),
              t.Literal('google'),
              t.Literal('custom'),
            ]),
            baseUrl: t.Optional(t.String()),
            apiKey: t.Optional(t.String()),
            defaultModel: t.Optional(t.String()),
            configuration: t.Optional(t.Any()),
            priority: t.Optional(t.Number()),
          }),
          response: { 200: ProviderResponseSchema },
        })

        .put('/providers/:providerId', async ({ headers, params, body }) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          const { providerId } = params;
          const requestBody: UpdateUserLLMProviderRequest = body;
          const { name, description, baseUrl, defaultModel, priority, configuration } = requestBody;

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
        }, {
          body: t.Object({
            name: t.Optional(t.String()),
            description: t.Optional(t.String()),
            baseUrl: t.Optional(t.String()),
            defaultModel: t.Optional(t.String()),
            priority: t.Optional(t.Number()),
            configuration: t.Optional(t.Any()),
          }),
          response: { 200: ProviderResponseSchema },
        })

        .put('/providers/:providerId/api-key', async ({ headers, params, body }) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          const { providerId } = params;
          // @ts-expect-error -- Elysia validates body via TypeBox schema; body IS UpdateApiKeyRequest at runtime
          const requestBody: UpdateApiKeyRequest = body;
          const { apiKey } = requestBody;

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
        }, {
          body: t.Object({
            apiKey: t.String(),
          }),
          response: { 200: ProviderResponseSchema },
        })

        .post('/providers/:providerId/test', async ({ headers }) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          const result = await userLLMService.testUserProvider(userId);

          return {
            success: true,
            data: result,
          };
        }, {
          response: { 200: ProviderResponseSchema },
        })

        .delete('/providers/:providerId', async ({ headers, params }) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          const { providerId } = params;
          await userLLMService.deleteUserProvider(userId, providerId);

          return {
            success: true,
            message: 'Provider deleted successfully',
          };
        }, {
          response: { 200: ProviderResponseSchema },
        })

        .get('/providers/type/:type', async ({ headers, params }) => {
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

          const sanitizedProviders = providers.map(sanitizeProvider);

          return {
            success: true,
            data: sanitizedProviders,
          };
        }, {
          response: { 200: ProviderResponseSchema },
        })

        .get('/models', async ({ headers }) => {
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
        }, {
          response: { 200: ProviderResponseSchema },
        })

        .post('/generate', async ({ headers, body }) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          // @ts-expect-error -- Elysia validates body via TypeBox schema; body IS UserLLMGenerateRequest at runtime
          const requestBody: UserLLMGenerateRequest = body;
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
        }, {
          body: t.Object({
            prompt: t.String(),
            systemPrompt: t.Optional(t.String()),
            maxTokens: t.Optional(t.Number()),
            temperature: t.Optional(t.Number()),
            model: t.Optional(t.String()),
          }),
          response: { 200: ProviderResponseSchema },
        })

        .post('/agent-response', async ({ headers, body }) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          // @ts-expect-error -- Elysia validates body via TypeBox schema; body IS AgentResponseRequest at runtime
          const request: AgentResponseRequest = body;
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
        }, {
          body: t.Object({
            agent: t.Object({
              id: t.String(),
              name: t.String(),
              role: t.String(),
            }),
            messages: t.Array(t.Any()),
            context: t.Optional(t.Any()),
            tools: t.Optional(t.Array(t.Any())),
          }),
          response: { 200: ProviderResponseSchema },
        })

        .get('/capabilities', async ({ headers }) => {
          const { userId, error: authError } = requireUserId(headers);
          if (authError) return authError;

          const userProviders = await userLLMService.getUserProviders(userId);

          const capabilities = [];

          for (const provider of userProviders) {
            const config = provider.configuration;
            const rawModelCaps = config?.['modelCapabilities'];
            const rawDetectedCaps = config?.['detectedCapabilities'];
            const rawLastCheck = config?.['lastCapabilityCheck'];
            const providerCapabilities = {
              providerId: provider.id,
              providerName: provider.name,
              providerType: provider.type,
              defaultModel: provider.defaultModel,
              modelCapabilities: _isRecord(rawModelCaps) ? rawModelCaps : {},
              detectedCapabilities: Array.isArray(rawDetectedCaps) ? rawDetectedCaps.filter((s): s is string => typeof s === 'string') : [],
              lastCapabilityCheck: rawLastCheck instanceof Date ? rawLastCheck : undefined,
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
        }, {
          response: { 200: ProviderResponseSchema },
        })

        .post(
          '/providers/:providerId/detect-capabilities',
          async ({ headers, params }) => {
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

            const currentConfig = provider.configuration;
            provider.configuration = {
              ...currentConfig,
              detectedCapabilities: detection.detectedCapabilities,
              lastCapabilityCheck: new Date(),
              capabilityTestResults: detection.testResults,
            };

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
          },
          {
            response: { 200: ProviderResponseSchema },
          }
        )

        .post('/detect-all-capabilities', async ({ headers }) => {
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
                    detectedCapabilities: new Array<string>(),
                  });
                  continue;
                }

                // oxlint-disable-next-line eslint/no-await-in-loop -- sequential processing required
                const detection = await detector.detectCapabilities(
                  provider.defaultModel,
                  detectorProviderType,
                  provider.baseUrl
                );

                const currentConfig = provider.configuration;
                provider.configuration = {
                  ...currentConfig,
                  detectedCapabilities: detection.detectedCapabilities,
                  lastCapabilityCheck: new Date(),
                  capabilityTestResults: detection.testResults,
                };

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
                detectedCapabilities: new Array<string>(),
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
        }, {
          response: { 200: ProviderResponseSchema },
        })
  );
}
