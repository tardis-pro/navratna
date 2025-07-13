import express from 'express';
import { BaseService, DiscussionService, PersonaService } from '@uaip/shared-services';
import { LLMService, UserLLMService } from '@uaip/llm-service';
import { DiscussionEventType, LLMTaskType } from '@uaip/types';
import { createAgentRoutes } from './routes/agentRoutes.js';
import knowledgeRoutes from './routes/knowledgeRoutes.js';
import { createDiscussionRoutes } from './routes/discussionRoutes.js';
import { createConversationEnhancementRoutes } from './routes/conversationEnhancementRoutes.js';
import { createPersonaRoutes } from './routes/personaRoutes.js';
import { DiscussionController } from './controllers/discussionController.js';
import { PersonaController } from './controllers/personaController.js';
import { ConversationEnhancementService } from './services/conversation-enhancement.service.js';
import { AgentDiscussionService } from './services/agent-discussion.service.js';
import { initializeChatIngestionServices } from './controllers/chatIngestionController.js';
import { logger } from '@uaip/utils';

class AgentIntelligenceService extends BaseService {
  private agentDiscussionService: AgentDiscussionService;
  private discussionService: DiscussionService;
  private discussionController: DiscussionController;
  private personaController: PersonaController;
  private personaService: PersonaService;
  private conversationEnhancementService: ConversationEnhancementService;
  private llmService: LLMService;

  constructor() {
    super({
      name: 'agent-intelligence',
      port: 3001,
      version: '1.0.0',
      enableWebSocket: false,
      enableNeo4j: true,
      enableEnterpriseEventBus: true
    });
  }

  protected async setupRoutes(): Promise<void> {
    // Get the KnowledgeGraphService instance from the ServiceFactory
    const { getKnowledgeGraphService } = await import('@uaip/shared-services');
    const knowledgeGraphService = await getKnowledgeGraphService();
    
    // Inject services into app.locals for controller access
    this.app.locals.services = {
      knowledgeGraphService: knowledgeGraphService,
      batchProcessorService: null, // Will be set when available
      databaseService: this.databaseService
    };

    // API routes
    this.app.use('/api/v1/agents', createAgentRoutes());
    this.app.use('/api/v1/knowledge', knowledgeRoutes);
    this.app.use('/api/v1/discussions', createDiscussionRoutes(this.discussionController));
    this.app.use('/api/v1/conversation', createConversationEnhancementRoutes(this.conversationEnhancementService));
    this.app.use('/api/v1/personas', createPersonaRoutes(this.personaController));
    
    // Monitoring and debug routes for race condition detection
    this.app.get('/api/v1/debug/conversation-enhancement', (req, res) => {
      try {
        const stats = this.conversationEnhancementService.getCleanupStatistics();
        const memoryUsage = process.memoryUsage();
        
        const alerts: string[] = [];
        
        // Check for high pending LLM requests (memory leak indicator)
        if (stats.pendingLLMRequests > 1000) {
          alerts.push(`CRITICAL: High pending LLM requests: ${stats.pendingLLMRequests}`);
        } else if (stats.pendingLLMRequests > 500) {
          alerts.push(`WARNING: Elevated pending LLM requests: ${stats.pendingLLMRequests}`);
        }
        
        // Check for high conversation states (memory usage)
        if (stats.conversationStates > 500) {
          alerts.push(`INFO: High conversation states: ${stats.conversationStates}`);
        }
        
        // Check for high agent persona mappings
        if (stats.agentPersonaMappings > 200) {
          alerts.push(`INFO: High agent persona mappings: ${stats.agentPersonaMappings}`);
        }
        
        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          conversationEnhancement: stats,
          memory: {
            heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024)
          },
          alerts
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch conversation enhancement debug info'
        });
      }
    });

    this.app.post('/api/v1/debug/force-llm-cleanup', (req, res) => {
      try {
        // Trigger immediate cleanup on conversation enhancement service
        this.conversationEnhancementService['cleanupStaleLLMRequests']();
        
        res.json({
          success: true,
          message: 'LLM cleanup triggered',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Failed to trigger LLM cleanup'
        });
      }
    });
    
    // Test endpoint for manual sync trigger
    this.app.post('/test/sync', async (req, res) => {
      try {
        const databaseService = this.databaseService;
        
        // Force Neo4j connection verification
        const graphDb = await databaseService.getToolGraphDatabase();
        logger.info('Testing Neo4j connection...');
        await graphDb.verifyConnectivity(5);
        
        const status = graphDb.getConnectionStatus();
        logger.info('Neo4j connection status:', status);
        
        if (!status.isConnected) {
          throw new Error('Neo4j connection verification failed');
        }
        
        const { KnowledgeBootstrapService } = await import('@uaip/shared-services');
        
        const knowledgeRepo = await databaseService.getKnowledgeRepository();
        const qdrantService = await databaseService.getQdrantService();
        const embeddingService = await databaseService.getSmartEmbeddingService();
        
        logger.info('Service instances created:', {
          knowledgeRepo: !!knowledgeRepo,
          qdrantService: !!qdrantService,
          graphDb: !!graphDb,
          embeddingService: !!embeddingService
        });
        
        const bootstrap = new KnowledgeBootstrapService(
          knowledgeRepo,
          qdrantService,
          graphDb,
          embeddingService
        );
        
        const result = await bootstrap.runPostSeedSync();
        res.json({ success: true, result, neo4jStatus: status });
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    });
  }

  protected async setupEventSubscriptions(): Promise<void> {
    logger.info('Setting up event subscriptions for agent-intelligence service');

    // Subscribe to WebSocket agent chat requests
    await this.eventBusService.subscribe('agent.chat.request', async (event) => {
      try {
        const { userId, agentId, message, conversationHistory, context, socketId, messageId, timestamp } = event.data;
        
        logger.info('Processing WebSocket agent chat request', { 
          agentId, 
          userId, 
          messageLength: message?.length,
          messageId,
          socketId: socketId?.substring(0, 10) + '...'
        });

        // Use unified model selection for the agent
        let modelSelection = null;
        if (agentId) {
          try {
            modelSelection = await this.selectModelForAgent(agentId, LLMTaskType.REASONING);
            logger.info('Selected model for agent', {
              agentId,
              model: modelSelection.model.model,
              provider: modelSelection.provider.effectiveProvider,
              strategy: modelSelection.model.selectionStrategy
            });
          } catch (error) {
            logger.warn('Failed to select model for agent, using defaults', { agentId, error });
          }
        }

        // Process the chat request using AgentDiscussionService
        const result = await this.agentDiscussionService.processDiscussionMessage({
          agentId,
          userId, 
          message,
          conversationId: `websocket-chat-${Date.now()}`,
          modelSelection // Pass the selected model
        });

        // Prepare enhanced response with WebSocket metadata
        const responsePayload = {
          socketId,
          agentId,
          messageId,
          response: result.response,
          agentName: `Agent ${agentId}`, // TODO: Load actual agent name from config
          confidence: result.metadata.confidence,
          memoryEnhanced: false, // TODO: Implement memory enhancement
          knowledgeUsed: 0, // TODO: Implement knowledge tracking  
          toolsExecuted: [], // TODO: Implement tool execution
          timestamp: new Date().toISOString(),
          processingTime: result.metadata.processingTime,
          responseType: result.metadata.responseType,
          conversationId: result.metadata.conversationId
        };

        // Publish response back to discussion-orchestration for WebSocket delivery
        await this.eventBusService.publish('agent.chat.response', responsePayload);

        logger.info('WebSocket agent chat response published', { 
          agentId, 
          messageId,
          responseLength: result.response.length,
          confidence: result.metadata.confidence
        });

      } catch (error) {
        logger.error('Failed to process WebSocket agent chat request', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          agentId: event.data?.agentId,
          messageId: event.data?.messageId
        });

        // Send error response back to client
        if (event.data?.socketId && event.data?.messageId) {
          await this.eventBusService.publish('agent.chat.response', {
            socketId: event.data.socketId,
            agentId: event.data.agentId,
            messageId: event.data.messageId,
            response: 'Sorry, I encountered an error processing your request. Please try again.',
            agentName: `Agent ${event.data.agentId}`,
            confidence: 0.0,
            error: true,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    // Subscribe to conversation enhancement requests from discussion orchestration
    await this.eventBusService.subscribe('conversation.enhancement.request', async (event) => {
      try {
        const { discussionId, availableAgentIds, messageHistory, currentTopic, enhancementType, context } = event.data;
        
        logger.info('Processing conversation enhancement request', {
          discussionId,
          agentCount: availableAgentIds?.length,
          messageCount: messageHistory?.length,
          enhancementType
        });

        // Get agent objects from IDs
        const availableAgents = [];
        for (const agentId of availableAgentIds || []) {
          try {
            const agent = await this.databaseService.getAgentService().findAgentById(agentId);
            if (agent) {
              availableAgents.push(agent);
            }
          } catch (error) {
            logger.warn('Failed to get agent for enhancement', { agentId, error });
          }
        }

        if (availableAgents.length === 0) {
          logger.warn('No valid agents found for enhancement request', { discussionId });
          return;
        }

        // Process enhancement request
        const result = await this.conversationEnhancementService.getEnhancedContribution({
          discussionId,
          availableAgents,
          messageHistory: messageHistory || [],
          currentTopic: currentTopic || '',
          enhancementType: enhancementType || 'auto',
          context
        });

        if (result.success && result.enhancedResponse) {
          try {
            // Find the participant ID for the selected agent
            const discussionService = await this.databaseService.getDiscussionService();
            const discussion = await discussionService.getDiscussion(discussionId);
            const participant = discussion?.participants?.find(p => p.agentId === result.selectedAgent?.id);

            if (participant) {
              // Send enhanced response back to discussion orchestration
              await this.eventBusService.publish('discussion.message.send', {
                discussionId,
                participantId: participant.id,
                content: result.enhancedResponse,
                messageType: 'agent_contribution',
                metadata: {
                  agentId: result.selectedAgent?.id,
                  personaId: result.selectedPersona?.id,
                  enhancementType: 'contextual',
                  contributionScore: result.contributionScores?.[0]?.score,
                  suggestions: result.suggestions || [],
                  nextActions: result.nextActions || []
                }
              });

              logger.info('Enhanced conversation response sent', {
                discussionId,
                agentId: result.selectedAgent?.id,
                personaId: result.selectedPersona?.id,
                responseLength: result.enhancedResponse.length
              });
            } else {
              logger.warn('Could not find participant for enhanced response', {
                discussionId,
                agentId: result.selectedAgent?.id,
                discussionExists: !!discussion,
                participantCount: discussion?.participants?.length || 0
              });
            }
          } catch (publishError) {
            logger.error('Failed to publish enhanced response', {
              discussionId,
              error: publishError instanceof Error ? publishError.message : 'Unknown error',
              stack: publishError instanceof Error ? publishError.stack : undefined
            });
          }
        } else {
          logger.info('No enhanced response generated', {
            discussionId,
            success: result.success,
            error: result.error
          });
        }

      } catch (error) {
        logger.error('Failed to process conversation enhancement request', {
          error: error instanceof Error ? error.message : 'Unknown error',
          discussionId: event?.data?.discussionId
        });
      }
    });

    // DEPRECATED: Agent participation is now handled by Discussion Orchestration service
    // via 'agent.discussion.participate' events. This removes the duplicate event handler
    // that was causing participant ID conflicts and "Participant not found" errors.
    // The AgentDiscussionService now properly subscribes to 'agent.discussion.participate'
    // events in its setupDiscussionEventSubscriptions() method.

    logger.info('Agent chat WebSocket event subscription established');
    logger.info('Conversation enhancement event subscription established');
    logger.info('Agent discussion participation events will be handled via AgentDiscussionService');
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }

  protected async initialize(): Promise<void> {
    // Initialize PersonaService
    this.personaService = new PersonaService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService
    });
    logger.info('PersonaService initialized');

    // Initialize LLMService (legacy - conversation enhancement now uses events)
    this.llmService = LLMService.getInstance();
    logger.info('LLMService initialized (legacy)');

    // Initialize ConversationEnhancementService (now event-driven)
    this.conversationEnhancementService = new ConversationEnhancementService(
      this.databaseService,
      this.eventBusService
      // No longer passing LLMService - using event-driven approach
    );
    await this.conversationEnhancementService.initialize();
    logger.info('ConversationEnhancementService initialized');

    // Initialize AgentDiscussionService
    this.agentDiscussionService = new AgentDiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      knowledgeGraphService: undefined, // Optional
      agentMemoryService: undefined, // Optional
      discussionService: undefined, // Optional
      llmService: this.llmService,
      userLLMService: new UserLLMService(),
      serviceName: 'agent-intelligence',
      securityLevel: 1
    });
    await this.agentDiscussionService.initialize();
    logger.info('AgentDiscussionService initialized for WebSocket chat processing');

    // Initialize DiscussionService for API routes
    this.discussionService = new DiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      personaService: this.personaService,
      enableRealTimeEvents: true,
      enableAnalytics: false,
      auditMode: 'comprehensive'
    });
    logger.info('DiscussionService initialized for REST API');

    // Initialize DiscussionController
    this.discussionController = new DiscussionController(this.discussionService);
    logger.info('DiscussionController initialized');

    // Initialize PersonaController
    this.personaController = new PersonaController(this.personaService);
    logger.info('PersonaController initialized');

    // Initialize chat ingestion services
    const chatServicesInitialized = await initializeChatIngestionServices();
    if (chatServicesInitialized) {
      logger.info('Chat ingestion services initialized successfully');
    } else {
      logger.warn('Chat ingestion services failed to initialize - will use fallback mode');
    }

    await this.setupRoutes();
    await this.setupEventSubscriptions();
  }

  async start(): Promise<void> {
    try {
      // Call parent start method which handles database initialization
      await super.start();
    } catch (error) {
      console.error('Failed to start Agent Intelligence Service:', error);
      throw error;
    }
  }
}

// Start the service
const service = new AgentIntelligenceService();
service.start().catch(error => {
  console.error('Failed to start Agent Intelligence Service:', error);
  process.exit(1);
});

export default AgentIntelligenceService;