import { LLMService, ModelBootstrapService } from '@uaip/llm-service';
import { logger, ValidationError } from '@uaip/utils';

export function registerLLMRoutes(
  app: any,
  llmService: LLMService,
  modelBootstrapService: ModelBootstrapService
): any {
  return app.group('/api/v1/llm', (app: any) =>
    app
      // Get available models from all providers
      .get('/models', async ({ set }: any) => {
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
      .get('/models/:providerType', async ({ params, set }: any) => {
        const { providerType } = params;
        const models = await llmService.getModelsFromProvider(providerType);

        // Set cache headers (1 hour)
        set.headers['Cache-Control'] = 'public, max-age=3600';
        set.headers['ETag'] = `"provider-${providerType}-${models.length}-${Date.now()}"`;

        return {
          success: true,
          data: models,
        };
      })

      // Generate LLM response
      .post('/generate', async ({ body }: any) => {
        const { prompt, systemPrompt, maxTokens, temperature, model, preferredType } = body;

        if (!prompt) {
          throw new ValidationError('Prompt is required');
        }

        const response = await llmService.generateResponse(
          {
            prompt,
            systemPrompt,
            maxTokens,
            temperature,
            model,
          },
          preferredType
        );

        return {
          success: true,
          data: response,
        };
      })

      // Generate agent response
      .post('/agent-response', async ({ body }: any) => {
        const { agent, messages, context, tools } = body;

        if (!agent || !messages) {
          throw new ValidationError('Agent and messages are required');
        }

        const response = await llmService.generateAgentResponse({
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

      // Generate artifact
      .post('/artifact', async ({ body }: any) => {
        const { type, prompt, language, requirements } = body;

        if (!type || !prompt) {
          throw new ValidationError('Type and prompt are required');
        }

        const response = await llmService.generateArtifact({
          type,
          context: prompt,
          language,
          requirements,
          constraints: [],
        });

        return {
          success: true,
          data: response,
        };
      })

      // Analyze context
      .post('/analyze-context', async ({ body }: any) => {
        const { conversationHistory, currentContext, userRequest, agentCapabilities } = body;

        if (!conversationHistory) {
          throw new ValidationError('Conversation history is required');
        }

        const response = await llmService.analyzeContext({
          conversationHistory,
          currentContext,
          userRequest,
          agentCapabilities,
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
      .get('/providers', async ({ set }: any) => {
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
        const { testLLMEventIntegration } = await import('../test-event-integration.js');

        // Run the test
        const result = await testLLMEventIntegration();

        return {
          success: true,
          data: result,
          message: result.testSuccess
            ? 'Event integration test passed'
            : 'Event integration test failed',
        };
      })

      // Cache management endpoints
      .post('/cache/invalidate', async ({ body }: any) => {
        const { type } = body;

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

        return {
          success: true,
          message: `Cache invalidated: ${type || 'all'}`,
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
        modelBootstrapService.bootstrapAllModels().catch((error) => {
          logger.error('Manual model bootstrap failed', { error });
        });

        return {
          success: true,
          message: 'Model bootstrap refresh started',
        };
      })

      .post('/bootstrap/refresh-user/:userId', async ({ params }: any) => {
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
      })
  );
}
