import { BaseService, allEntities } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LLMService,
  UserLLMService,
  ModelBootstrapService,
  ApiKeyDecryptionService,
} from '@uaip/llm-service';
import { registerLLMRoutes } from './routes/llm.routes.js';
import { registerUserLLMRoutes } from './routes/user-llm.routes.js';
import { AgentGenerationHandler } from './handlers/AgentGenerationHandler.js';
import { ModelRoutingService } from './services/modelRouting.service.js';

class LLMServiceServer extends BaseService {
  private llmService: LLMService;
  private userLLMService: UserLLMService;
  private modelBootstrapService: ModelBootstrapService;
  private agentGenerationHandler: AgentGenerationHandler;
  private apiKeyDecryptionService: ApiKeyDecryptionService;
  private modelRoutingService: ModelRoutingService;

  constructor() {
    super({
      name: 'llm-service',
      port: parseInt(process.env.PORT || '3007', 10),
      enableEnterpriseEventBus: true,
    });

    // Register all TypeORM entities — required for ModelSelectionOrchestrator to
    // resolve Agent, AgentLLMPreference, UserLLMPreference repos at runtime.
    // Without this, TypeORM throws "No metadata for X was found" which silently
    // causes AgentSpecificStrategy and UserSpecificStrategy to fail, falling
    // through to ContextAwareStrategy which returns hardcoded Anthropic defaults.
    this.registerEntities(allEntities);

    // Initialize LLM service only - UserLLMService will be created after facade is ready
    this.llmService = LLMService.getInstance();
    this.modelBootstrapService = ModelBootstrapService.getInstance();
    this.apiKeyDecryptionService = ApiKeyDecryptionService.getInstance();

    const currentFileDir = dirname(fileURLToPath(import.meta.url));
    const modelRoutingPath = join(currentFileDir, 'config', 'agentModels.json');
    this.modelRoutingService = new ModelRoutingService(modelRoutingPath);
  }

  protected async initialize(): Promise<void> {
    // Initialize model selection facade first
    await this.initializeModelSelection();

    // Debug: Check facade availability
    logger.info('Debug: Facade state before creating UserLLMService', {
      facadeExists: !!this.modelSelectionFacade,
      facadeType: typeof this.modelSelectionFacade,
      facadeConstructor: this.modelSelectionFacade?.constructor?.name,
    });

    // Create UserLLMService with facade (always pass it, even if null)
    this.userLLMService = new UserLLMService(this.modelSelectionFacade);

    // Create AgentGenerationHandler after UserLLMService is ready
    this.agentGenerationHandler = new AgentGenerationHandler(
      this.userLLMService,
      this.llmService,
      this.eventBusService
    );

    // Initialize API Key Decryption Service with event bus
    this.apiKeyDecryptionService.setEventBusService(this.eventBusService);

    if (this.modelSelectionFacade) {
      logger.info('UserLLMService initialized with model selection facade');
    } else {
      logger.warn(
        'Model selection facade not available, UserLLMService will use fallback behavior'
      );
    }

    // Bootstrap all models on startup (run in background)
    logger.info('Starting model bootstrap process...');
    this.modelBootstrapService.bootstrapAllModels().catch((error) => {
      logger.error('Model bootstrap failed, continuing with service startup', { error });
    });

    logger.info('LLM Service initialized');
  }

  protected setupCustomMiddleware(): void {
    // BaseService handles request logging and error tracking
    // No custom middleware needed for LLM service
  }

  protected async setupRoutes(): Promise<void> {
    // Register route groups
    registerLLMRoutes(this.app, this.llmService, this.modelBootstrapService, this.userLLMService);

    this.app.group('/api/v1/llm', (group: { get: Function; post: Function }) =>
      group
        .get('/routes/:agentId', ({ params }: { params: Record<string, string> }) => {
          const { agentId } = params;
          const agent = this.modelRoutingService.getAgentConfig(agentId);

          if (!agent) {
            return {
              success: false,
              error: `No route configured for agent: ${agentId}`,
            };
          }

          return {
            success: true,
            data: {
              agent,
              provider: this.modelRoutingService.getProviderForAgent(agentId),
              fallbackProviders: this.modelRoutingService.getFallbackProviders(agentId),
            },
          };
        })
        .get('/routes', () => ({
          success: true,
          data: this.modelRoutingService.getAllAgents(),
        }))
        .post('/chat', async ({ body }: { body: Record<string, unknown> }) => {
          const agentId = body?.agentId as string | undefined;
          const prompt = body?.prompt as string | undefined;
          const capability = (body?.capability as string) || 'chat';
          const systemPrompt = body?.systemPrompt as string | undefined;

          if (!agentId || !prompt) {
            return {
              success: false,
              error: 'agentId and prompt are required',
            };
          }

          const routedModel =
            this.modelRoutingService.getModelForAgent(agentId, capability) ??
            this.modelRoutingService.getDefaultModel(
              capability in { chat: 1, embedding: 1, reasoning: 1, coding: 1 } ? capability : 'chat'
            );

          if (!routedModel) {
            return {
              success: false,
              error: `No model route found for agent ${agentId}`,
            };
          }

          const agentConfig = this.modelRoutingService.getAgentConfig(agentId);
          const response = await this.llmService.generateResponse(
            {
              prompt,
              systemPrompt:
                systemPrompt ?? this.modelRoutingService.getSystemPrompt(agentId) ?? undefined,
              maxTokens: agentConfig?.maxTokens ?? routedModel.maxTokens,
              temperature: agentConfig?.temperature ?? routedModel.temperature,
              model: routedModel.name,
            },
            routedModel.provider
          );

          return {
            success: true,
            data: {
              agentId,
              capability,
              model: routedModel,
              response,
            },
          };
        })
    );

    registerUserLLMRoutes(this.app, this.userLLMService);
  }

  protected async setupEventSubscriptions(): Promise<void> {
    // Subscribe to LLM request events
    await this.eventBusService.subscribe('llm.user.request', (event: Record<string, unknown>) =>
      this.handleUserLLMRequest(event)
    );
    await this.eventBusService.subscribe('llm.global.request', (event: Record<string, unknown>) =>
      this.handleGlobalLLMRequest(event)
    );
    await this.eventBusService.subscribe(
      'llm.agent.generate.request',
      (event: Record<string, unknown>) => this.handleAgentGenerateRequest(event)
    );
    await this.eventBusService.subscribe('llm.generate.request', (event: Record<string, unknown>) =>
      this.handleArtifactGenerationRequest(event)
    );
    await this.eventBusService.subscribe('llm.provider.changed', (event: Record<string, unknown>) =>
      this.handleProviderChanged(event)
    );
    logger.info('Event bus subscriptions configured');
  }

  private async handleUserLLMRequest(event: Record<string, unknown>): Promise<void> {
    try {
      logger.info('Raw event received', { event });
      const eventData = (event.data || event) as Record<string, unknown>;
      const { requestId, agentRequest, userId } = eventData;
      logger.info('Processing user LLM request', {
        requestId,
        userId,
        hasAgentRequest: !!agentRequest,
      });

      // Validate userId is a proper UUID (reject "system" and other invalid UUIDs)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!userId || !uuidRegex.test(userId as string)) {
        logger.warn('Invalid userId for user LLM request, falling back to global LLM', {
          userId,
          requestId,
          reason: 'Invalid UUID format',
        });
        // Fall back to global LLM request handling
        await this.handleGlobalLLMRequest(event);
        return;
      }

      // Use the initialized UserLLMService instance (which has the facade)
      const userLLMService = this.userLLMService;

      // Add error handling and better logging
      const agentReq = agentRequest as Record<string, unknown> | undefined;
      logger.info('Calling UserLLMService.generateAgentResponse', {
        userId,
        hasAgentRequest: !!agentRequest,
        agentRequestKeys: agentReq ? Object.keys(agentReq) : [],
        hasAgent: !!agentReq?.agent,
        hasMessages: !!agentReq?.messages,
        hasContext: !!agentReq?.context,
      });
      const response = await userLLMService.generateAgentResponse(userId as string, agentRequest);
      logger.info('UserLLMService response received', {
        hasResponse: !!response,
        responseContent: response?.content?.substring(0, 100),
        responseModel: response?.model,
        responseError: response?.error,
      });

      // Publish response
      const responseChannel = `llm.response.${requestId}`;
      logger.info('Publishing LLM response', { responseChannel, hasResponse: !!response });
      await this.eventBusService.publish(responseChannel, response);

      logger.info('User LLM request processed', { requestId, userId });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      const errStack = error instanceof Error ? error.stack : undefined;
      const eventData = event?.data as Record<string, unknown> | undefined;
      logger.error('Failed to process user LLM request', {
        error: errMsg,
        stack: errStack,
        requestId: eventData?.requestId || event?.requestId,
        userId: eventData?.userId || event?.userId,
      });

      // Publish error response
      try {
        await this.eventBusService.publish(
          `llm.response.${eventData?.requestId || event?.requestId}`,
          {
            error: errMsg,
            success: false,
          }
        );
      } catch (publishError) {
        logger.error('Failed to publish error response', { publishError });
      }
    }
  }

  private async handleGlobalLLMRequest(event: Record<string, unknown>): Promise<void> {
    try {
      const eventData = (event.data || event) as Record<string, unknown>;
      const { requestId, agentRequest } = eventData;
      logger.info('Processing global LLM request', { requestId });

      // Import and use LLMService
      const { llmService } = await import('@uaip/llm-service');
      // llmService is already a singleton instance
      logger.info('Calling llmService.generateAgentResponse', { hasAgentRequest: !!agentRequest });
      const response = await llmService.generateAgentResponse(agentRequest);
      logger.info('LLMService response received', { hasResponse: !!response });

      // Publish response
      await this.eventBusService.publish(`llm.response.${requestId}`, response);

      logger.info('Global LLM request processed', { requestId });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      const errStack = error instanceof Error ? error.stack : undefined;
      const eventData = event?.data as Record<string, unknown> | undefined;
      logger.error('Failed to process global LLM request', {
        error: errMsg,
        stack: errStack,
        requestId: eventData?.requestId || event?.requestId,
      });

      // Publish error response
      try {
        await this.eventBusService.publish(
          `llm.response.${eventData?.requestId || event?.requestId}`,
          {
            error: errMsg,
            success: false,
          }
        );
      } catch (publishError) {
        logger.error('Failed to publish error response', { publishError });
      }
    }
  }

  private async handleAgentGenerateRequest(event: Record<string, unknown>): Promise<void> {
    await this.agentGenerationHandler.handle(event);
  }

  private async handleArtifactGenerationRequest(event: Record<string, unknown>): Promise<void> {
    try {
      const eventPayload = (event.data || event) as Record<string, unknown>;
      const { type, artifactType, context, options, metadata } = eventPayload;
      const eventMeta = event.metadata as Record<string, unknown> | undefined;
      const requestId = eventMeta?.requestId as string;

      const ctxRecord = context as Record<string, unknown> | undefined;
      logger.info('Processing artifact generation request', {
        requestId,
        artifactType,
        type,
        conversationId: ctxRecord?.conversationId,
      });

      if (type !== 'generate_artifact_content') {
        logger.warn('Unknown artifact generation request type', { type, requestId });
        await this.publishArtifactResponse(requestId, {
          success: false,
          error: {
            code: 'UNKNOWN_REQUEST_TYPE',
            message: `Unknown request type: ${type}`,
          },
        });
        return;
      }

      // Prepare prompt for artifact generation
      const prompt = this.buildArtifactGenerationPrompt(
        artifactType as string,
        ctxRecord || {},
        options as Record<string, unknown> | undefined
      );

      // Create agent request for LLM generation
      const agentRequest = {
        agent: {
          id: 'artifact-generator',
          name: 'Artifact Generator',
          persona: {
            name: 'Artifact Generator',
            description: `AI agent specialized in generating ${artifactType} artifacts`,
            capabilities: [artifactType, 'documentation', 'code_generation'],
            preferences: {
              communicationStyle: 'technical',
              role: 'technical_writer',
            },
          },
        },
        messages: [
          {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: prompt,
            sender: 'system',
            timestamp: new Date().toISOString(),
            type: 'user' as const,
          },
        ],
        context: {
          id: ctxRecord?.conversationId || 'artifact-gen',
          title: `Generate ${artifactType} artifact`,
          content: prompt,
          type: 'artifact_generation',
          metadata: {
            createdAt: new Date(),
            lastModified: new Date(),
            author: 'artifact-service',
            conversationId: ctxRecord?.conversationId,
            requiresStructuredOutput: true,
            artifactType,
            outputFormat: this.getOutputFormat(artifactType as string),
          },
        },
      };

      // Generate response using LLM service
      const response = await this.llmService.generateAgentResponse(agentRequest);

      if (response?.content) {
        await this.publishArtifactResponse(requestId, {
          success: true,
          content: response.content,
          metadata: {
            model: response.model,
            processingTime:
              Date.now() -
              ((metadata as Record<string, unknown>)?.timestamp
                ? new Date((metadata as Record<string, unknown>).timestamp as string).getTime()
                : Date.now()),
            artifactType,
          },
        });

        logger.info('Artifact generation completed successfully', {
          requestId,
          artifactType,
          contentLength: response.content.length,
        });
      } else {
        await this.publishArtifactResponse(requestId, {
          success: false,
          error: {
            code: 'GENERATION_FAILED',
            message: 'LLM failed to generate artifact content',
            details: response?.error || 'No content generated',
          },
        });

        logger.error('Artifact generation failed', {
          requestId,
          artifactType,
          error: response?.error || 'No content generated',
        });
      }
    } catch (error) {
      const catchMeta = event.metadata as Record<string, unknown> | undefined;
      const catchRequestId = catchMeta?.requestId as string;
      logger.error('Failed to process artifact generation request', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: catchRequestId,
        eventData: event.data,
      });

      await this.publishArtifactResponse(catchRequestId, {
        success: false,
        error: {
          code: 'PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      });
    }
  }

  private buildArtifactGenerationPrompt(
    artifactType: string,
    context: Record<string, unknown>,
    options?: Record<string, unknown>
  ): string {
    const { summary } = context;
    const keyMessages = context.keyMessages as Array<Record<string, unknown>> | undefined;
    const decisions = context.decisions as Array<Record<string, unknown>> | undefined;
    const actionItems = context.actionItems as Array<Record<string, unknown>> | undefined;
    const technical = context.technical as Record<string, unknown> | undefined;

    let prompt = `Generate a ${artifactType} artifact based on the following discussion context:\n\n`;

    if (summary) {
      prompt += `## Discussion Summary\n${summary}\n\n`;
    }

    if (keyMessages && keyMessages.length > 0) {
      prompt += `## Key Messages\n`;
      keyMessages.forEach((msg: Record<string, unknown>, index: number) => {
        prompt += `${index + 1}. ${msg.content}\n`;
      });
      prompt += '\n';
    }

    if (decisions && decisions.length > 0) {
      prompt += `## Decisions Made\n`;
      decisions.forEach((decision: Record<string, unknown>, index: number) => {
        prompt += `${index + 1}. ${decision.description || decision.decision}\n`;
      });
      prompt += '\n';
    }

    if (actionItems && actionItems.length > 0) {
      prompt += `## Action Items\n`;
      actionItems.forEach((item: Record<string, unknown>, index: number) => {
        prompt += `${index + 1}. ${item.description || item.item}\n`;
      });
      prompt += '\n';
    }

    if (technical) {
      prompt += `## Technical Context\n`;
      if (technical.language) prompt += `- Language: ${technical.language}\n`;
      if (technical.framework) prompt += `- Framework: ${technical.framework}\n`;
      const requirements = technical.requirements as string[] | undefined;
      if (requirements) {
        prompt += `- Requirements:\n`;
        requirements.forEach((req: string) => {
          prompt += `  - ${req}\n`;
        });
      }
      prompt += '\n';
    }

    // Add artifact-specific instructions
    prompt += this.getArtifactSpecificInstructions(artifactType, options);

    return prompt;
  }

  private getArtifactSpecificInstructions(
    artifactType: string,
    options?: Record<string, unknown>
  ): string {
    switch (artifactType) {
      case 'code':
        return `## Instructions\nGenerate production-ready code that implements the discussed requirements. Include:\n- Proper error handling\n- Clear variable names and structure\n- Brief inline comments for complex logic\n- Follow ${options?.language || 'TypeScript'} best practices\n\nProvide only the code without additional explanations.`;

      case 'test':
        return `## Instructions\nGenerate comprehensive unit tests for the discussed functionality. Include:\n- Test cases for normal operation\n- Edge cases and error conditions\n- Clear test descriptions\n- Use ${options?.framework || 'Jest'} testing framework\n\nProvide only the test code without additional explanations.`;

      case 'documentation':
        return `## Instructions\nGenerate clear, comprehensive documentation that covers:\n- Purpose and overview\n- Key features and functionality\n- Usage examples\n- API reference (if applicable)\n- Implementation details discussed\n\nUse markdown format with proper headings and structure.`;

      case 'prd':
        return `## Instructions\nGenerate a Product Requirements Document (PRD) that includes:\n- Product Overview\n- User Stories and Use Cases\n- Functional Requirements\n- Non-Functional Requirements\n- Technical Specifications\n- Success Metrics\n- Implementation Timeline\n\nUse professional PRD format with clear sections and bullet points.`;

      case 'analysis':
        return `## Instructions\nGenerate a comprehensive analysis document that includes:\n- Executive Summary\n- Problem Statement\n- Current State Analysis\n- Recommendations\n- Risk Assessment\n- Next Steps\n\nProvide structured analysis with clear reasoning and data-driven insights.`;

      case 'workflow':
        return `## Instructions\nGenerate a workflow specification that includes:\n- Process Overview\n- Step-by-step Workflow\n- Decision Points\n- Roles and Responsibilities\n- Success Criteria\n- Error Handling\n\nUse clear, actionable language with numbered steps.`;

      default:
        return `## Instructions\nGenerate a ${artifactType} artifact based on the discussion context. Ensure it is well-structured, comprehensive, and directly addresses the requirements and decisions mentioned in the discussion.`;
    }
  }

  private getOutputFormat(artifactType: string): string {
    switch (artifactType) {
      case 'code':
      case 'test':
        return 'code_block';
      case 'documentation':
      case 'prd':
      case 'analysis':
        return 'markdown';
      case 'workflow':
        return 'structured_list';
      default:
        return 'plain_text';
    }
  }

  private async publishArtifactResponse(
    requestId: string,
    response: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.eventBusService.publish('llm.generate.response', response, {
        metadata: { requestId },
      });
    } catch (error) {
      logger.error('Failed to publish artifact response', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleProviderChanged(event: Record<string, unknown>): Promise<void> {
    try {
      const providerEventData = (event.data || event) as Record<string, unknown>;
      const { eventType, providerId, providerType, agentId } = providerEventData;

      logger.info('Provider change event received', {
        eventType,
        providerId,
        providerType,
        agentId,
      });

      // Import and refresh LLM service providers
      const { llmService } = await import('@uaip/llm-service');
      await llmService.refreshProviders();

      // Force a model bootstrap to sync provider models to the database
      await this.modelBootstrapService.bootstrapAllModels({ force: true });

      // If this is an agent config change, clear any cached agent configurations
      if (eventType === 'agent-config-changed' && agentId) {
        logger.info('Clearing agent configuration cache', { agentId });
        // Clear any agent-specific caches if they exist
        // For now, the provider refresh should handle this, but we could add specific agent cache clearing here
      }

      logger.info('LLM service providers refreshed due to provider change', {
        eventType,
        providerId,
        providerType,
        agentId,
      });
    } catch (error) {
      logger.error('Failed to handle provider change event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        event: event?.data || event,
      });
    }
  }

  protected async checkServiceHealth(): Promise<boolean> {
    // Add service-specific health checks here
    return true;
  }
}

// Start the server
const server = new LLMServiceServer();
server.start().catch((error) => {
  logger.error('Failed to start LLM Service API', { error });
  process.exit(1);
});

// Named export to avoid Bun auto-serve on default export
export { server };
