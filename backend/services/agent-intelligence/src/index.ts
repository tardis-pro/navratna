import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { LLMService } from '@uaip/llm-service';
import {
  PersonaService,
  DiscussionService,
  ServiceFactory,
  UserKnowledgeService,
  QdrantService,
  EmbeddingService,
  redisCacheService
} from '@uaip/shared-services';
import { createAgentRoutes } from './routes/agentRoutes.js';
import { createPersonaRoutes } from './routes/personaRoutes.js';
import { createDiscussionRoutes } from './routes/discussionRoutes.js';
import knowledgeRoutes from './routes/knowledgeRoutes.js';
import { AgentController } from './controllers/agentController.js';
import { PersonaController } from './controllers/personaController.js';
import { DiscussionController } from './controllers/discussionController.js';

// Import microservices
import {
  AgentCoreService,
  AgentContextService,
  AgentPlanningService,
  AgentLearningService,
  AgentDiscussionService,
  AgentMetricsService,
  AgentIntentService,
  AgentInitializationService,
  AgentEventOrchestrator,
  ConversationIntelligenceService
} from './services/index.js';

class AgentIntelligenceService extends BaseService {
  private personaService: PersonaService;
  private discussionService: DiscussionService;
  private agentController: AgentController;
  private personaController: PersonaController;
  private discussionController: DiscussionController;

  // Microservices
  private agentCoreService: AgentCoreService;
  private agentContextService: AgentContextService;
  private agentPlanningService: AgentPlanningService;
  private agentLearningService: AgentLearningService;
  private agentDiscussionService: AgentDiscussionService;
  private agentMetricsService: AgentMetricsService;
  private agentIntentService: AgentIntentService;
  private agentInitializationService: AgentInitializationService;
  private agentEventOrchestrator: AgentEventOrchestrator;
  private conversationIntelligenceService: ConversationIntelligenceService;

  // ServiceFactory instance
  private serviceFactory: any;

  constructor() {
    super({
      name: 'agent-intelligence',
      port: parseInt(process.env.PORT || '3001', 10),
      enableEnterpriseEventBus: true
    });

    // Initialize persona and discussion services
    this.personaService = new PersonaService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      enableCaching: true,
      enableAnalytics: true
    });

    this.discussionService = new DiscussionService();

    // Initialize controllers with service dependencies
    this.personaController = new PersonaController(this.personaService);
    this.discussionController = new DiscussionController(this.discussionService);

    // Initialize microservices (will be fully configured in initialize() method)
    this.initializeMicroservices();
  }

  private initializeMicroservices(): void {
    const baseConfig = {
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      knowledgeGraphService: null, // Will be set in initialize() method
      llmService: null, // Will be set in initialize() method
      serviceName: 'agent-intelligence',
      securityLevel: 2
    };

    this.agentCoreService = new AgentCoreService(baseConfig);
    this.agentContextService = new AgentContextService(baseConfig);
    this.agentPlanningService = new AgentPlanningService(baseConfig);
    this.agentLearningService = new AgentLearningService(baseConfig);
    this.agentDiscussionService = new AgentDiscussionService({
      ...baseConfig,
      llmService: null,
      userLLMService: null
    });
    this.agentMetricsService = new AgentMetricsService(baseConfig);
    this.agentIntentService = new AgentIntentService({
      ...baseConfig,
      llmService: null,
      userLLMService: null
    });
    this.agentInitializationService = new AgentInitializationService(baseConfig);
    this.agentEventOrchestrator = new AgentEventOrchestrator({
      ...baseConfig,
      orchestrationPipelineUrl: process.env.ORCHESTRATION_PIPELINE_URL || 'http://localhost:3002'
    });

    logger.info('Microservices initialized with basic configuration');
  }

  protected async initialize(): Promise<void> {
    // Initialize ServiceFactory for Knowledge Graph services
    let enhancedServicesAvailable = false;
    let knowledgeGraphService = null;
    let agentMemoryService = null;
    let llmService = null;
    let userLLMService = null;

    try {
      const { serviceFactory } = await import('@uaip/shared-services');
      this.serviceFactory = serviceFactory;
      await this.serviceFactory.initialize();
      logger.info('ServiceFactory initialized successfully');

      // Get enhanced services
      knowledgeGraphService = await this.serviceFactory.getKnowledgeGraphService();
      agentMemoryService = await this.serviceFactory.getAgentMemoryService();
      llmService = await this.serviceFactory.getLLMService();
      userLLMService = await this.serviceFactory.getUserLLMService();

      // Initialize AgentController with enhanced services
      await this.initializeAgentController();
      logger.info('AgentController initialized with enhanced services');
      enhancedServicesAvailable = true;
    } catch (error) {
      logger.warn('ServiceFactory initialization failed, falling back to basic services:', error);
    }

    // Configure microservices with enhanced services if available
    await this.configureMicroservicesWithEnhancedServices(
      knowledgeGraphService,
      agentMemoryService,
      llmService,
      userLLMService
    );

    if (!enhancedServicesAvailable) {
      // Initialize microservices in fallback mode
      await this.initializeFallbackMode();
    }

    logger.info('Persona and Discussion services initialized');
  }

  private async initializeFallbackMode(): Promise<void> {
    logger.info('Initializing microservices in fallback mode...');
    
    await this.agentCoreService.initialize();
    await this.agentContextService.initialize();
    await this.agentPlanningService.initialize();
    await this.agentLearningService.initialize();
    await this.agentDiscussionService.initialize();
    await this.agentMetricsService.initialize();
    await this.agentIntentService.initialize();
    await this.agentInitializationService.initialize();
    
    // Initialize ConversationIntelligenceService in fallback mode
    try {
      await redisCacheService.initialize();
      
      this.conversationIntelligenceService = new ConversationIntelligenceService(
        this.eventBusService,
        null, // userKnowledgeService - fallback mode
        null, // qdrantService - fallback mode
        null, // embeddingService - fallback mode
        null, // llmService - fallback mode
        redisCacheService
      );
      
      logger.info('ConversationIntelligenceService initialized in fallback mode');
    } catch (error) {
      logger.warn('Failed to initialize ConversationIntelligenceService in fallback mode:', error);
      this.conversationIntelligenceService = null;
    }
    
    logger.info('All microservices initialized in fallback mode');

    // Initialize AgentController without enhanced services
    this.agentController = new AgentController(
      undefined, // knowledgeGraphService
      undefined, // agentMemoryService
      this.personaService,
      this.discussionService,
      this.databaseService,
      this.eventBusService
    );

    await this.agentController.initialize();
    logger.info('AgentController initialized in fallback mode');
  }

  private async configureMicroservicesWithEnhancedServices(
    knowledgeGraphService: any,
    agentMemoryService: any,
    llmService: any,
    userLLMService: any
  ): Promise<void> {
    try {
      // Update services with enhanced capabilities
      if (knowledgeGraphService) {
        this.agentContextService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentPlanningService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentLearningService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentDiscussionService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentMetricsService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentIntentService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentInitializationService['knowledgeGraphService'] = knowledgeGraphService;
      }

      if (agentMemoryService) {
        this.agentLearningService['agentMemoryService'] = agentMemoryService;
        this.agentDiscussionService['agentMemoryService'] = agentMemoryService;
        this.agentMetricsService['agentMemoryService'] = agentMemoryService;
        this.agentInitializationService['agentMemoryService'] = agentMemoryService;
      }

      if (llmService && userLLMService) {
        this.agentDiscussionService['llmService'] = llmService;
        this.agentDiscussionService['userLLMService'] = userLLMService;
        this.agentIntentService['llmService'] = llmService;
        this.agentIntentService['userLLMService'] = userLLMService;
      }

      // Initialize all microservices
      logger.info('Initializing microservices...');
      await this.agentCoreService.initialize();
      await this.agentContextService.initialize();
      await this.agentPlanningService.initialize();
      await this.agentLearningService.initialize();
      await this.agentDiscussionService.initialize();
      await this.agentMetricsService.initialize();
      await this.agentIntentService.initialize();
      await this.agentInitializationService.initialize();
      
      // Initialize ConversationIntelligenceService with all dependencies
      if (this.conversationIntelligenceService === null && this.serviceFactory) {
        const userKnowledgeService = await this.serviceFactory.getUserKnowledgeService();
        const qdrantService = await this.serviceFactory.getQdrantService();
        const embeddingService = await this.serviceFactory.getEmbeddingService();
        
        await redisCacheService.initialize();
        
        this.conversationIntelligenceService = new ConversationIntelligenceService(
          this.eventBusService,
          userKnowledgeService,
          qdrantService,
          embeddingService,
          llmService,
          redisCacheService
        );
        
        logger.info('ConversationIntelligenceService initialized successfully');
      }
      
      logger.info('All microservices initialized successfully');

      // Initialize the event orchestrator with all services
      await this.agentEventOrchestrator.initialize({
        agentCoreService: this.agentCoreService,
        agentContextService: this.agentContextService,
        agentPlanningService: this.agentPlanningService,
        agentLearningService: this.agentLearningService,
        agentDiscussionService: this.agentDiscussionService,
        agentMetricsService: this.agentMetricsService,
        agentIntentService: this.agentIntentService,
        agentInitializationService: this.agentInitializationService
      });

      logger.info('Microservices configured with enhanced services and orchestrator initialized');
    } catch (error) {
      logger.error('Failed to configure microservices with enhanced services:', error);
      throw error;
    }
  }

  private async initializeAgentController(): Promise<void> {
    try {
      if (!this.serviceFactory) {
        throw new Error('ServiceFactory not initialized');
      }
      const knowledgeGraphService = await this.serviceFactory.getKnowledgeGraphService();
      const agentMemoryService = await this.serviceFactory.getAgentMemoryService();

      this.agentController = new AgentController(
        knowledgeGraphService,
        agentMemoryService,
        this.personaService,
        this.discussionService,
        this.databaseService,
        this.eventBusService
      );

      await this.agentController.initialize();
      logger.info('AgentController initialized with full service dependencies');
    } catch (error) {
      logger.error('Failed to initialize AgentController with enhanced services:', error);
      throw error;
    }
  }

  protected async setupRoutes(): Promise<void> {
    // API routes
    this.app.use('/api/v1/agents', createAgentRoutes(this.agentController));
    this.app.use('/api/v1/personas', createPersonaRoutes(this.personaController));
    this.app.use('/api/v1/discussions', createDiscussionRoutes(this.discussionController));
    
    // Knowledge routes - handled by this service as configured in nginx
    this.app.use('/api/v1/knowledge', knowledgeRoutes);
  }

  protected async setupEventSubscriptions(): Promise<void> {
    // Subscribe to agent chat requests from WebSocket connections
    await this.eventBusService.subscribe('agent.chat.request', async (event) => {
      try {
        const { userId, agentId, message, conversationHistory, context, connectionId, messageId, timestamp } = event.data;
        
        logger.info('Processing agent chat request', { 
          userId: userId?.substring(0, 8) + '...',
          agentId: agentId?.substring(0, 8) + '...',
          messageLength: message?.length || 0,
          connectionId,
          messageId
        });

        // Forward to agent discussion service for processing
        const chatResponse = await this.agentDiscussionService.participateInDiscussion({
          agentId,
          message,
          userId,
          conversationHistory: conversationHistory || [],
          context: context || {}
        });

        // Publish response back via event bus
        await this.eventBusService.publish('agent.chat.response', {
          connectionId,
          agentId,
          userId,
          messageId,
          response: chatResponse.response,
          agentName: chatResponse.agentName || 'Agent',
          confidence: chatResponse.confidence || 0.8,
          timestamp: new Date().toISOString(),
          metadata: chatResponse.metadata || {}
        });

        logger.info('Agent chat response sent', { 
          agentId: agentId?.substring(0, 8) + '...',
          connectionId,
          messageId,
          responseLength: chatResponse.response?.length || 0
        });

      } catch (error) {
        logger.error('Agent chat processing failed', { error, event: event.data });
        
        // Send error response
        if (event.data.connectionId) {
          await this.eventBusService.publish('agent.chat.response', {
            connectionId: event.data.connectionId,
            agentId: event.data.agentId,
            messageId: event.data.messageId,
            response: 'I apologize, but I encountered an error processing your request. Please try again.',
            agentName: 'Agent',
            confidence: 0.0,
            error: true,
            timestamp: new Date().toISOString()
          });
        }
      }
    });
  }

  protected async checkServiceHealth(): Promise<boolean> {
    // Add service-specific health checks here
    return true;
  }

  protected onServerStarted(): void {
    logger.info('Available endpoints:');
    logger.info('  - /api/v1/agents - Agent management');
    logger.info('  - /api/v1/personas - Persona management');
    logger.info('  - /api/v1/discussions - Discussion orchestration');
    logger.info('  - /api/v1/knowledge - Knowledge management');
  }

  protected async cleanup(): Promise<void> {
    // Shutdown event orchestrator first
    if (this.agentEventOrchestrator) {
      await this.agentEventOrchestrator.shutdown();
      logger.info('Agent Event Orchestrator shutdown completed');
    }
  }
}

// Initialize and start the service
const service = new AgentIntelligenceService();

// Start the service
service.start().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
});
