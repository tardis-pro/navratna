import { BaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { errorTrackingMiddleware, createErrorLogger } from '@uaip/middleware';
import { LLMService, UserLLMService, ModelBootstrapService, ApiKeyDecryptionService } from '@uaip/llm-service';
import llmRoutes from './routes/llmRoutes.js';
import userLLMRoutes from './routes/userLLMRoutes.js';
import { AgentGenerationHandler } from './handlers/AgentGenerationHandler.js';

class LLMServiceServer extends BaseService {
  private llmService: LLMService;
  private userLLMService: UserLLMService;
  private modelBootstrapService: ModelBootstrapService;
  private agentGenerationHandler: AgentGenerationHandler;
  private apiKeyDecryptionService: ApiKeyDecryptionService;
  private errorLogger = createErrorLogger('llm-service');

  constructor() {
    super({
      name: 'llm-service',
      port: parseInt(process.env.PORT || '3007', 10),
      enableEnterpriseEventBus: true
    });

    // Initialize LLM service only - UserLLMService will be created after facade is ready
    this.llmService = LLMService.getInstance();
    this.modelBootstrapService = ModelBootstrapService.getInstance();
    this.apiKeyDecryptionService = ApiKeyDecryptionService.getInstance();
    // Note: userLLMService and agentGenerationHandler will be initialized in initialize()
  }

  protected async initialize(): Promise<void> {
    // Initialize model selection facade first
    await this.initializeModelSelection();
    
    // Debug: Check facade availability
    logger.info('Debug: Facade state before creating UserLLMService', {
      facadeExists: !!this.modelSelectionFacade,
      facadeType: typeof this.modelSelectionFacade,
      facadeConstructor: this.modelSelectionFacade?.constructor?.name
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
      logger.warn('Model selection facade not available, UserLLMService will use fallback behavior');
    }
    
    // Bootstrap all models on startup (run in background)
    logger.info('Starting model bootstrap process...');
    this.modelBootstrapService.bootstrapAllModels().catch(error => {
      logger.error('Model bootstrap failed, continuing with service startup', { error });
    });
    
    logger.info('LLM Service initialized');
  }

  protected setupCustomMiddleware(): void {
    // Error tracking middleware
    this.app.use(errorTrackingMiddleware('llm-service'));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
      next();
    });
  }

  protected async setupRoutes(): Promise<void> {
    // API routes
    this.app.use('/api/v1/llm', llmRoutes);
    this.app.use('/api/v1/user/llm', userLLMRoutes);
  }

  protected async setupEventSubscriptions(): Promise<void> {
    // Subscribe to LLM request events
    await this.eventBusService.subscribe('llm.user.request', (event: any) => this.handleUserLLMRequest(event));
    await this.eventBusService.subscribe('llm.global.request', (event: any) => this.handleGlobalLLMRequest(event));
    await this.eventBusService.subscribe('llm.agent.generate.request', (event: any) => this.handleAgentGenerateRequest(event));
    await this.eventBusService.subscribe('llm.generate.request', (event: any) => this.handleArtifactGenerationRequest(event));
    await this.eventBusService.subscribe('llm.provider.changed', (event: any) => this.handleProviderChanged(event));
    logger.info('Event bus subscriptions configured');
  }

  private async handleUserLLMRequest(event: any): Promise<void> {
    try {
      logger.info('Raw event received', { event });
      const { requestId, agentRequest, userId } = event.data || event;
      logger.info('Processing user LLM request', { requestId, userId, hasAgentRequest: !!agentRequest });

      // Validate userId is a proper UUID (reject "system" and other invalid UUIDs)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!userId || !uuidRegex.test(userId)) {
        logger.warn('Invalid userId for user LLM request, falling back to global LLM', { 
          userId, 
          requestId,
          reason: 'Invalid UUID format' 
        });
        // Fall back to global LLM request handling
        await this.handleGlobalLLMRequest(event);
        return;
      }

      // Use the initialized UserLLMService instance (which has the facade)
      const userLLMService = this.userLLMService;

      // Add error handling and better logging
      logger.info('Calling UserLLMService.generateAgentResponse', {
        userId,
        hasAgentRequest: !!agentRequest,
        agentRequestKeys: agentRequest ? Object.keys(agentRequest) : [],
        hasAgent: agentRequest?.agent ? true : false,
        hasMessages: agentRequest?.messages ? true : false,
        hasContext: agentRequest?.context ? true : false
      });
      const response = await userLLMService.generateAgentResponse(userId, agentRequest);
      logger.info('UserLLMService response received', {
        hasResponse: !!response,
        responseContent: response?.content?.substring(0, 100),
        responseModel: response?.model,
        responseError: response?.error
      });

      // Publish response
      const responseChannel = `llm.response.${requestId}`;
      logger.info('Publishing LLM response', { responseChannel, hasResponse: !!response });
      await this.eventBusService.publish(responseChannel, response);

      logger.info('User LLM request processed', { requestId, userId });
    } catch (error) {
      logger.error('Failed to process user LLM request', {
        error: error.message,
        stack: error.stack,
        requestId: event?.data?.requestId || event?.requestId,
        userId: event?.data?.userId || event?.userId
      });

      // Publish error response
      try {
        await this.eventBusService.publish(`llm.response.${event?.data?.requestId || event?.requestId}`, {
          error: error.message,
          success: false
        });
      } catch (publishError) {
        logger.error('Failed to publish error response', { publishError });
      }
    }
  }

  private async handleGlobalLLMRequest(event: any): Promise<void> {
    try {
      const { requestId, agentRequest } = event.data || event;
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
      logger.error('Failed to process global LLM request', {
        error: error.message,
        stack: error.stack,
        requestId: event?.data?.requestId || event?.requestId
      });

      // Publish error response
      try {
        await this.eventBusService.publish(`llm.response.${event?.data?.requestId || event?.requestId}`, {
          error: error.message,
          success: false
        });
      } catch (publishError) {
        logger.error('Failed to publish error response', { publishError });
      }
    }
  }

  private async handleAgentGenerateRequest(event: any): Promise<void> {
    await this.agentGenerationHandler.handle(event);
  }

  private async handleArtifactGenerationRequest(event: any): Promise<void> {
    try {
      const { type, artifactType, context, options, metadata } = event.data || event;
      const requestId = event.metadata?.requestId;
      
      logger.info('Processing artifact generation request', {
        requestId,
        artifactType,
        type,
        conversationId: context?.conversationId
      });

      if (type !== 'generate_artifact_content') {
        logger.warn('Unknown artifact generation request type', { type, requestId });
        await this.publishArtifactResponse(requestId, {
          success: false,
          error: {
            code: 'UNKNOWN_REQUEST_TYPE',
            message: `Unknown request type: ${type}`
          }
        });
        return;
      }

      // Prepare prompt for artifact generation
      const prompt = this.buildArtifactGenerationPrompt(artifactType, context, options);
      
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
              role: 'technical_writer'
            }
          }
        },
        messages: [{
          id: `msg_${Date.now()}`,
          role: 'user',
          content: prompt,
          sender: 'system',
          timestamp: new Date().toISOString(),
          type: 'user' as const
        }],
        context: {
          id: context.conversationId || 'artifact-gen',
          title: `Generate ${artifactType} artifact`,
          content: prompt,
          type: 'artifact_generation',
          metadata: {
            createdAt: new Date(),
            lastModified: new Date(),
            author: 'artifact-service',
            conversationId: context.conversationId,
            requiresStructuredOutput: true,
            artifactType,
            outputFormat: this.getOutputFormat(artifactType)
          }
        }
      };

      // Generate response using LLM service
      const response = await this.llmService.generateAgentResponse(agentRequest);

      if (response?.content) {
        await this.publishArtifactResponse(requestId, {
          success: true,
          content: response.content,
          metadata: {
            model: response.model,
            processingTime: Date.now() - (metadata?.timestamp ? new Date(metadata.timestamp).getTime() : Date.now()),
            artifactType
          }
        });
        
        logger.info('Artifact generation completed successfully', {
          requestId,
          artifactType,
          contentLength: response.content.length
        });
      } else {
        await this.publishArtifactResponse(requestId, {
          success: false,
          error: {
            code: 'GENERATION_FAILED',
            message: 'LLM failed to generate artifact content',
            details: response?.error || 'No content generated'
          }
        });
        
        logger.error('Artifact generation failed', {
          requestId,
          artifactType,
          error: response?.error || 'No content generated'
        });
      }

    } catch (error) {
      const requestId = event.metadata?.requestId;
      logger.error('Failed to process artifact generation request', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        eventData: event.data
      });

      await this.publishArtifactResponse(requestId, {
        success: false,
        error: {
          code: 'PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      });
    }
  }

  private buildArtifactGenerationPrompt(artifactType: string, context: any, options?: any): string {
    const { summary, keyMessages, decisions, actionItems, technical } = context;
    
    let prompt = `Generate a ${artifactType} artifact based on the following discussion context:\n\n`;
    
    if (summary) {
      prompt += `## Discussion Summary\n${summary}\n\n`;
    }
    
    if (keyMessages && keyMessages.length > 0) {
      prompt += `## Key Messages\n`;
      keyMessages.forEach((msg: any, index: number) => {
        prompt += `${index + 1}. ${msg.content}\n`;
      });
      prompt += '\n';
    }
    
    if (decisions && decisions.length > 0) {
      prompt += `## Decisions Made\n`;
      decisions.forEach((decision: any, index: number) => {
        prompt += `${index + 1}. ${decision.description || decision.decision}\n`;
      });
      prompt += '\n';
    }
    
    if (actionItems && actionItems.length > 0) {
      prompt += `## Action Items\n`;
      actionItems.forEach((item: any, index: number) => {
        prompt += `${index + 1}. ${item.description || item.item}\n`;
      });
      prompt += '\n';
    }
    
    if (technical) {
      prompt += `## Technical Context\n`;
      if (technical.language) prompt += `- Language: ${technical.language}\n`;
      if (technical.framework) prompt += `- Framework: ${technical.framework}\n`;
      if (technical.requirements) {
        prompt += `- Requirements:\n`;
        technical.requirements.forEach((req: string) => {
          prompt += `  - ${req}\n`;
        });
      }
      prompt += '\n';
    }
    
    // Add artifact-specific instructions
    prompt += this.getArtifactSpecificInstructions(artifactType, options);
    
    return prompt;
  }

  private getArtifactSpecificInstructions(artifactType: string, options?: any): string {
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

  private async publishArtifactResponse(requestId: string, response: any): Promise<void> {
    try {
      await this.eventBusService.publish('llm.generate.response', response, {
        metadata: { requestId }
      });
    } catch (error) {
      logger.error('Failed to publish artifact response', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleProviderChanged(event: any): Promise<void> {
    try {
      const { eventType, providerId, providerType, agentId } = event.data || event;

      logger.info('Provider change event received', {
        eventType,
        providerId,
        providerType,
        agentId
      });

      // Import and refresh LLM service providers
      const { llmService } = await import('@uaip/llm-service');
      await llmService.refreshProviders();

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
        agentId
      });

    } catch (error) {
      logger.error('Failed to handle provider change event', {
        error: error.message,
        event: event?.data || event
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

export default server;
