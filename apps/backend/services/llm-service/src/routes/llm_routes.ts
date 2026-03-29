import type { AnyElysia } from 'elysia';
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
  StreamingLLMRequest,
} from '@uaip/types';
import { logger, ValidationError } from '@uaip/utils';

type UserProviderType = 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'google' | 'custom';
type LLMArtifactType = 'code' | 'documentation' | 'test' | 'prd';

const _artifactTypes: readonly LLMArtifactType[] = ['code', 'documentation', 'test', 'prd'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

function toUserProviderType(value: unknown): UserProviderType | undefined {
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
  app: AnyElysia,
  llmService: LLMService,
  modelBootstrapService: ModelBootstrapService,
  userLLMService: UserLLMService
): AnyElysia {
  return (app as { group: Function }).group(
    '/api/v1/llm',
    (group: { get: Function; post: Function }) =>
      group
        // Get available models from all providers
        .get('/models', async ({ set }: { set: { headers: Record<string, string> } }) => {
          const models = await llmService.getAvailableModels();

          // Set cache headers (1 hour)
          set.headers['Cache-Control'] = 'public, max-age=3600';
          set.headers['ETag'] = `"models-${models.length}-${Date.now()}"`;

          return {
            success: true,
            data: models,
          };
        })

        // Get models from a specific provider
        .get(
          '/models/:providerType',
          async ({
            params,
            set,
          }: {
            params: Record<string, string>;
            set: { headers: Record<string, string> };
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
          }
        )

        // Generate LLM response
        .post('/generate', async ({ body }: { body: Record<string, unknown> }) => {
          const { prompt, systemPrompt, maxTokens, temperature, model, preferredType } = body;

          if (!prompt) {
            throw new ValidationError('Prompt is required');
          }

          const response = await llmService.generateResponse(
            {
              prompt: prompt as string,
              systemPrompt: systemPrompt as string | undefined,
              maxTokens: maxTokens as number | undefined,
              temperature: temperature as number | undefined,
              model: model as string | undefined,
            },
            preferredType as string | undefined
          );

          return {
            success: true,
            data: response,
          };
        })

        // Generate agent response
        .post('/agent-response', async ({ body }: { body: Record<string, unknown> }) => {
          if (!isAgentResponseRequest(body)) {
            throw new ValidationError('Agent response request is invalid');
          }

          const response = await llmService.generateAgentResponse(body);

          return {
            success: true,
            data: response,
          };
        })

        // Generate artifact
        .post('/artifact', async ({ body }: { body: Record<string, unknown> }) => {
          if (!isArtifactType(body.type) || typeof body.prompt !== 'string') {
            throw new ValidationError('Type and prompt are required');
          }

          const response = await llmService.generateArtifact({
            type: body.type,
            context: body.prompt,
            language: typeof body.language === 'string' ? body.language : undefined,
            requirements: Array.isArray(body.requirements)
              ? body.requirements.filter((value): value is string => typeof value === 'string')
              : [],
            constraints: [],
          });

          return {
            success: true,
            data: response,
          };
        })

        // Analyze context
        .post('/analyze-context', async ({ body }: { body: Record<string, unknown> }) => {
          if (!isContextMessageArray(body.conversationHistory)) {
            throw new ValidationError('Conversation history is required');
          }

          const response = await llmService.analyzeContext({
            conversationHistory: body.conversationHistory,
            currentContext: isContextDocument(body.currentContext) ? body.currentContext : undefined,
            userRequest: typeof body.userRequest === 'string' ? body.userRequest : undefined,
            agentCapabilities: Array.isArray(body.agentCapabilities)
              ? body.agentCapabilities.filter((value): value is string => typeof value === 'string')
              : undefined,
          });

          return {
            success: true,
            data: response,
          };
        })

        // Get provider statistics
        .get('/providers/stats', async () => {
          const stats = await llmService.getProviderStats();

          return {
            success: true,
            data: stats,
          };
        })

        // Get all configured providers
        .get('/providers', async ({ set }: { set: { headers: Record<string, string> } }) => {
          const providers = await llmService.getConfiguredProviders();

          // Set cache headers (1 hour)
          set.headers['Cache-Control'] = 'public, max-age=3600';
          set.headers['ETag'] = `"providers-${providers.length}-${Date.now()}"`;

          return {
            success: true,
            data: providers,
          };
        })

        // Check provider health
        .get('/providers/health', async () => {
          const healthResults = await llmService.checkProviderHealth();

          return {
            success: true,
            data: healthResults,
          };
        })

        // Test event-driven integration
        .post('/test-events', async () => {
          logger.info('Testing event-driven LLM integration...');

          // Import the test function dynamically
          const { testLLMEventIntegration } = await import('../test_event_integration.js');

          // Run the test
          const result = await testLLMEventIntegration();

          return {
            success: true,
            data: result,
            message: (result as Record<string, unknown>).testSuccess
              ? 'Event integration test passed'
              : 'Event integration test failed',
          };
        })

        // Cache management endpoints
        .post('/cache/invalidate', async ({ body }: { body: Record<string, unknown> }) => {
          const { type, syncModels } = body;

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
        })

        .post('/cache/refresh', async () => {
          await llmService.refreshProviders();

          return {
            success: true,
            message: 'Providers refreshed and cache cleared',
          };
        })

        // Model bootstrap management endpoints
        .get('/bootstrap/status', async () => {
          const status = await modelBootstrapService.getBootstrapStatus();

          return {
            success: true,
            data: status,
          };
        })

        .post('/bootstrap/refresh', async () => {
          logger.info('Manual model bootstrap refresh requested');

          // Run bootstrap in background
          modelBootstrapService.bootstrapAllModels({ force: true }).catch((error) => {
            logger.error('Manual model bootstrap failed', { error });
          });

          return {
            success: true,
            message: 'Model bootstrap refresh started',
          };
        })

        .post(
          '/bootstrap/refresh-user/:userId',
          async ({ params }: { params: Record<string, string> }) => {
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
          }
        )

        // Streaming endpoints
        .post(
          '/stream',
          async ({
            body,
            store,
          }: {
            body: Record<string, unknown>;
            store: { user?: { id: string } };
          }) => {
            const {
              prompt,
              systemPrompt,
              model,
              maxTokens,
              agentId,
              conversationId,
              providerType,
            } = body;
            const userId = store.user?.id;
            const preferredProviderType = toUserProviderType(providerType);

            if (!userId) {
              throw new ValidationError('User not authenticated');
            }

            if (!prompt) {
              throw new ValidationError('Prompt is required');
            }

            const streamingService = StreamingService.getInstance();
            let userProvider = null;
            let selectedModel = model as string | undefined;

            if (agentId) {
              const selection = await userLLMService.selectProviderForAgent(
                userId,
                agentId as string,
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
            // After google check above, type is narrowed but TS doesn't infer it
            const streamingConfig = {
              ...providerConfig,
              type: providerConfig.type as Exclude<typeof providerConfig.type, 'google'>,
              baseUrl: providerConfig.baseUrl || '',
            };
            streamingService.registerProvider(streamingProviderId, streamingConfig);

            const request: StreamingLLMRequest = {
              prompt: prompt as string,
              systemPrompt: systemPrompt as string | undefined,
              model: selectedModel,
              maxTokens: maxTokens as number | undefined,
              userId,
              agentId: agentId as string | undefined,
              conversationId: conversationId as string | undefined,
              streaming: {
                enabled: true,
              },
            };

            const sessionId = await streamingService.startStream(request, streamingProviderId);

            return {
              success: true,
              data: { sessionId, status: 'streaming' },
            };
          }
        )

        .post(
          '/stream/:sessionId/cancel',
          async ({
            params,
            store: _store,
          }: {
            params: Record<string, string>;
            store: Record<string, unknown>;
          }) => {
            const { sessionId } = params;
            const streamingService = StreamingService.getInstance();
            await streamingService.cancelStream(sessionId);

            return {
              success: true,
              data: { status: 'cancelled' },
            };
          }
        )

        .get('/stream/:sessionId', async ({ params }: { params: Record<string, string> }) => {
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
        })
  );
}
