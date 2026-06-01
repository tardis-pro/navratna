import { Elysia, t } from 'elysia';
import {
  LLMService,
  ModelBootstrapService,
  StreamingService,
  UserLLMService,
} from '@uaip/llm-service';
import type {
  AgentResponseRequest,
  AvailableTool,
  ChatMessage,
  ContextDocument,
  ContextMessage,
  LLMArtifactType,
  StreamingLLMRequest,
  UserLLMProviderType,
} from '@uaip/types';
import { logger, ValidationError, isRecord } from '@uaip/utils';

const _artifactTypes: readonly LLMArtifactType[] = ['code', 'documentation', 'test', 'prd'];


function isChatMessageArray(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (message) =>
        isRecord(message) &&
        typeof message.id === 'string' &&
        typeof message.content === 'string' &&
        typeof message.sender === 'string' &&
        typeof message.timestamp === 'string' &&
        ['user', 'assistant', 'system', 'tool'].includes(String(message.type))
    )
  );
}

function isAvailableToolArray(value: unknown): value is AvailableTool[] {
  return (
    Array.isArray(value) &&
    value.every(
      (tool) =>
        isRecord(tool) &&
        typeof tool.name === 'string' &&
        typeof tool.description === 'string' &&
        isRecord(tool.parameters)
    )
  );
}

function isContextDocument(value: unknown): value is ContextDocument {
  return (
    isRecord(value) &&
    (value.title === undefined || typeof value.title === 'string') &&
    (value.content === undefined || typeof value.content === 'string') &&
    (value.language === undefined || typeof value.language === 'string')
  );
}

function isContextMessageArray(value: unknown): value is ContextMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (message) =>
        isRecord(message) &&
        typeof message.sender === 'string' &&
        typeof message.content === 'string'
    )
  );
}

function isAgentResponseRequest(value: unknown): value is AgentResponseRequest {
  return (
    isRecord(value) &&
    isRecord(value.agent) &&
    typeof value.agent.id === 'string' &&
    typeof value.agent.name === 'string' &&
    typeof value.agent.role === 'string' &&
    isChatMessageArray(value.messages) &&
    (value.context === undefined || isContextDocument(value.context)) &&
    (value.tools === undefined || isAvailableToolArray(value.tools))
  );
}

function isArtifactType(value: unknown): value is LLMArtifactType {
  return value === 'code' || value === 'documentation' || value === 'test' || value === 'prd';
}

function toUserProviderType(value: unknown): UserLLMProviderType | undefined {
  switch (value) {
    case 'ollama':
    case 'llmstudio':
    case 'openai':
    case 'anthropic':
    case 'google':
    case 'custom':
      return value;
    default:
      return undefined;
  }
}

export function registerLLMRoutes(
  llmService: LLMService,
  modelBootstrapService: ModelBootstrapService,
  userLLMService: UserLLMService
){
  return new Elysia().group(
    '/api/v1/llm',
    (group) =>
      group
        // Get available models from all providers
        .get('/models', async ({ set }) => {
          const models = await llmService.getAvailableModels();

          // Set cache headers (1 hour)
          set.headers['Cache-Control'] = 'public, max-age=3600';
          set.headers['ETag'] = `"models-${models.length}-${Date.now()}"`;

          return {
            success: true,
            data: models,
          };
        }, {
          response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }) },
        })

        // Get models from a specific provider
        .get(
          '/models/:providerType',
          async ({
            params,
            set,
          }) => {
            const { providerType } = params;
            const models = await llmService.getModelsFromProvider(providerType);

            // Set cache headers (1 hour)
            set.headers['Cache-Control'] = 'public, max-age=3600';
            set.headers['ETag'] = `"provider-${providerType}-${models.length}-${Date.now()}"`;

            return {
              success: true,
              data: models,
            };
          },
          {
            response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }) },
          }
        )

        // Generate LLM response
        .post('/generate', async ({ body }) => {
          const payload = isRecord(body) ? body : {};
          const prompt = payload['prompt'];
          const systemPrompt = payload['systemPrompt'];
          const maxTokens = payload['maxTokens'];
          const temperature = payload['temperature'];
          const model = payload['model'];
          const preferredType = payload['preferredType'];

          if (typeof prompt !== 'string' || !prompt) {
            throw new ValidationError('Prompt is required');
          }

          const response = await llmService.generateResponse(
            {
              prompt,
              systemPrompt: typeof systemPrompt === 'string' ? systemPrompt : undefined,
              maxTokens: typeof maxTokens === 'number' ? maxTokens : undefined,
              temperature: typeof temperature === 'number' ? temperature : undefined,
              model: typeof model === 'string' ? model : undefined,
            },
            typeof preferredType === 'string' ? preferredType : undefined
          );

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
            preferredType: t.Optional(t.String()),
          }),
          response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }) },
        })

        // Generate agent response
        .post('/agent-response', async ({ body }) => {
          if (!isAgentResponseRequest(body)) {
            throw new ValidationError('Agent response request is invalid');
          }

          const response = await llmService.generateAgentResponse(body);

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
          response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }) },
        })
        
        // Generate artifact
        .post('/artifact', async ({ body }) => {
          if (!isRecord(body)) {
            throw new ValidationError('Type and prompt are required');
          }

          const artifactType = Reflect.get(body, 'type');
          const prompt = Reflect.get(body, 'prompt');
          const language = Reflect.get(body, 'language');
          const requirements = Reflect.get(body, 'requirements');

          if (!isArtifactType(artifactType) || typeof prompt !== 'string') {
            throw new ValidationError('Type and prompt are required');
          }

          const response = await llmService.generateArtifact({
            type: artifactType,
            context: prompt,
            language: typeof language === 'string' ? language : undefined,
            requirements: Array.isArray(requirements)
              ? requirements.filter((value): value is string => typeof value === 'string')
              : [],
            constraints: [],
          });

          return {
            success: true,
            data: response,
          };
        }, {
          body: t.Object({
            type: t.Union([
              t.Literal('code'),
              t.Literal('documentation'),
              t.Literal('test'),
              t.Literal('prd'),
            ]),
            prompt: t.String(),
            language: t.Optional(t.String()),
            requirements: t.Optional(t.Array(t.String())),
          }),
          response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }) },
        })

        // Analyze context
        .post('/analyze-context', async ({ body }) => {
          if (!isRecord(body)) {
            throw new ValidationError('Conversation history is required');
          }

          const conversationHistory = Reflect.get(body, 'conversationHistory');
          const currentContext = Reflect.get(body, 'currentContext');
          const userRequest = Reflect.get(body, 'userRequest');
          const agentCapabilities = Reflect.get(body, 'agentCapabilities');

          if (!isContextMessageArray(conversationHistory)) {
            throw new ValidationError('Conversation history is required');
          }

          const response = await llmService.analyzeContext({
            conversationHistory,
            currentContext: isContextDocument(currentContext) ? currentContext : undefined,
            userRequest: typeof userRequest === 'string' ? userRequest : undefined,
            agentCapabilities: Array.isArray(agentCapabilities)
              ? agentCapabilities.filter((value): value is string => typeof value === 'string')
              : undefined,
          });

          return {
            success: true,
            data: response,
          };
        }, {
          body: t.Object({
            conversationHistory: t.Array(t.Any()),
            currentContext: t.Optional(t.Any()),
            userRequest: t.Optional(t.String()),
            agentCapabilities: t.Optional(t.Array(t.String())),
          }),
          response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }) },
        })

        // Get provider statistics
        .get('/providers/stats', async ({ store: _store }) => {
          const stats = await llmService.getProviderStats();

          return {
            success: true,
            data: stats,
          };
        }, {
          response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }) },
        })

        // Get all configured providers
        .get('/providers', async ({ set }) => {
          const providers = await llmService.getConfiguredProviders();

          // Set cache headers (1 hour)
          set.headers['Cache-Control'] = 'public, max-age=3600';
          set.headers['ETag'] = `"providers-${providers.length}-${Date.now()}"`;

          return {
            success: true,
            data: providers,
          };
        }, {
          response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }) },
        })

        // Check provider health
        .get('/providers/health', async ({ store: _store }) => {
          const healthResults = await llmService.checkProviderHealth();

          return {
            success: true,
            data: healthResults,
          };
        }, {
          response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }) },
        })

        // Test event-driven integration
        .post('/test-events', async ({ store: _store }) => {
          logger.info('Testing event-driven LLM integration...');

          // Import the test function dynamically
          const { testLLMEventIntegration } = await import('../test_event_integration.js');

          // Run the test
          const result = await testLLMEventIntegration();

          return {
            success: true,
            data: result,
            message: isRecord(result) && Reflect.get(result, 'testSuccess')
              ? 'Event integration test passed'
              : 'Event integration test failed',
          };
        }, {
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any(), message: t.String() }),
          },
        })

        // Cache management endpoints
        .post('/cache/invalidate', async ({ body }) => {
          const payload = isRecord(body) ? body : {};
          const type = Reflect.get(payload, 'type');
          const syncModels = Reflect.get(payload, 'syncModels');

          switch (type) {
            case 'models':
              await llmService.invalidateModelsCache();
              break;
            case 'providers':
              await llmService.invalidateProvidersCache();
              break;
            case 'all':
              await llmService.invalidateAllCache();
              break;
            default:
              await llmService.invalidateAllCache();
          }

          // If syncModels is requested (or by default for 'all'), also sync models from provider APIs
          if (syncModels !== false && (type === 'all' || type === 'models' || !type)) {
            logger.info('Triggering model sync after cache invalidation');
            // Run bootstrap in background to sync models from provider APIs
            modelBootstrapService.bootstrapAllModels({ force: true }).catch((error) => {
              logger.error('Model sync after cache invalidation failed', { error });
            });
          }

          return {
            success: true,
            message: `Cache invalidated: ${type || 'all'}${syncModels !== false ? ' (model sync triggered)' : ''}`,
          };
        }, {
          body: t.Object({
            type: t.Optional(t.String()),
            syncModels: t.Optional(t.Boolean()),
          }),
          response: { 200: t.Object({ success: t.Literal(true), message: t.String() }) },
        })

        .post('/cache/refresh', async ({ store: _store }) => {
          await llmService.refreshProviders();

          return {
            success: true,
            message: 'Providers refreshed and cache cleared',
          };
        }, {
          response: { 200: t.Object({ success: t.Literal(true), message: t.String() }) },
        })

        // Model bootstrap management endpoints
        .get('/bootstrap/status', async ({ store: _store }) => {
          const status = await modelBootstrapService.getBootstrapStatus();

          return {
            success: true,
            data: status,
          };
        }, {
          response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }) },
        })

        .post('/bootstrap/refresh', async ({ store: _store }) => {
          logger.info('Manual model bootstrap refresh requested');

          // Run bootstrap in background
          modelBootstrapService.bootstrapAllModels({ force: true }).catch((error) => {
            logger.error('Manual model bootstrap failed', { error });
          });

          return {
            success: true,
            message: 'Model bootstrap refresh started',
          };
        }, {
          response: { 200: t.Object({ success: t.Literal(true), message: t.String() }) },
        })

        .post(
          '/bootstrap/refresh-user/:userId',
          async ({ params }) => {
            const { userId } = params;

            if (!userId) {
              throw new ValidationError('User ID is required');
            }

            logger.info('Manual user model refresh requested', { userId });

            await modelBootstrapService.refreshUserModels(userId);

            return {
              success: true,
              message: `Models refreshed for user ${userId}`,
            };
          },
          {
            response: { 200: t.Object({ success: t.Literal(true), message: t.String() }) },
          }
        )

        // Streaming endpoints
        .post(
          '/stream',
          async ({ body, store }) => {
            const payload = isRecord(body) ? body : {};
            const prompt = Reflect.get(payload, 'prompt');
            const systemPrompt = Reflect.get(payload, 'systemPrompt');
            const model = Reflect.get(payload, 'model');
            const maxTokens = Reflect.get(payload, 'maxTokens');
            const agentId = Reflect.get(payload, 'agentId');
            const conversationId = Reflect.get(payload, 'conversationId');
            const providerType = Reflect.get(payload, 'providerType');
            const storeUser = isRecord(store) ? Reflect.get(store, 'user') : undefined;
            const userId = isRecord(storeUser) ? Reflect.get(storeUser, 'id') : undefined;
            const preferredProviderType = toUserProviderType(providerType);

            if (typeof userId !== 'string') {
              throw new ValidationError('User not authenticated');
            }

            if (!prompt) {
              throw new ValidationError('Prompt is required');
            }

            const streamingService = StreamingService.getInstance();
            let userProvider = null;
            let selectedModel = typeof model === 'string' ? model : undefined;

            if (agentId) {
              const selection = await userLLMService.selectProviderForAgent(
                userId,
                typeof agentId === 'string' ? agentId : String(agentId),
                {
                  model: typeof model === 'string' ? model : undefined,
                  provider: preferredProviderType,
                }
              );

              if (selection) {
                userProvider = selection.provider;
                selectedModel = selection.selection.model.model || selectedModel;
              }
            }

            if (!userProvider) {
              userProvider = await userLLMService.getBestProviderForUser(
                userId,
                preferredProviderType
              );
            }

            if (!userProvider) {
              throw new ValidationError('No active LLM providers configured for user');
            }

            const providerConfig = userProvider.getProviderConfig();
            if (providerConfig.type === 'google') {
              throw new ValidationError('Google providers are not supported for streaming');
            }

            const streamingProviderId = userProvider.id;
            const streamingConfig = {
              ...providerConfig,
              type: providerConfig.type,
              baseUrl: providerConfig.baseUrl || '',
            };
            streamingService.registerProvider(streamingProviderId, streamingConfig);

            const request: StreamingLLMRequest = {
              prompt: typeof prompt === 'string' ? prompt : String(prompt),
              systemPrompt: typeof systemPrompt === 'string' ? systemPrompt : undefined,
              model: selectedModel,
              maxTokens: typeof maxTokens === 'number' ? maxTokens : undefined,
              userId,
              agentId: typeof agentId === 'string' ? agentId : undefined,
              conversationId: typeof conversationId === 'string' ? conversationId : undefined,
              streaming: {
                enabled: true,
              },
            };

            const sessionId = await streamingService.startStream(request, streamingProviderId);

            return {
              success: true,
              data: { sessionId, status: 'streaming' },
            };
          },
          {
            body: t.Object({
              prompt: t.String(),
              systemPrompt: t.Optional(t.String()),
              model: t.Optional(t.String()),
              maxTokens: t.Optional(t.Number()),
              agentId: t.Optional(t.String()),
              conversationId: t.Optional(t.String()),
              providerType: t.Optional(t.String()),
            }),
            response: {
              200: t.Object({
                success: t.Literal(true),
                data: t.Object({ sessionId: t.String(), status: t.String() }),
              }),
            },
          }
        )

        .post(
          '/stream/:sessionId/cancel',
          async ({
            params,
            store: _store,
          }) => {
            const { sessionId } = params;
            const streamingService = StreamingService.getInstance();
            await streamingService.cancelStream(sessionId);

            return {
              success: true,
              data: { status: 'cancelled' },
            };
          },
          {
            response: {
              200: t.Object({
                success: t.Literal(true),
                data: t.Object({ status: t.String() }),
              }),
            },
          }
        )

        .get('/stream/:sessionId', async ({ params }) => {
          const { sessionId } = params;
          const streamingService = StreamingService.getInstance();
          const info = streamingService.getStreamInfo(sessionId);

          if (!info) {
            throw new ValidationError('Stream not found');
          }

          return {
            success: true,
            data: info,
          };
        }, {
          response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }) },
        })
  );
}
