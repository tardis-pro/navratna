import express from 'express';
import { BaseService, DiscussionService, PersonaService } from '@uaip/shared-services';
import { DiscussionEventType } from '@uaip/types';
import { createAgentRoutes } from './routes/agentRoutes.js';
import knowledgeRoutes from './routes/knowledgeRoutes.js';
import { createDiscussionRoutes } from './routes/discussionRoutes.js';
import { DiscussionController } from './controllers/discussionController.js';
import { AgentDiscussionService } from './services/AgentDiscussionService.js';
import { initializeChatIngestionServices } from './controllers/chatIngestionController.js';
import { logger } from '@uaip/utils';

class AgentIntelligenceService extends BaseService {
  private agentDiscussionService: AgentDiscussionService;
  private discussionService: DiscussionService;
  private discussionController: DiscussionController;
  private personaService: PersonaService;

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

        // Process the chat request using AgentDiscussionService
        const result = await this.agentDiscussionService.processDiscussionMessage({
          agentId,
          userId, 
          message,
          conversationId: `websocket-chat-${Date.now()}`
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

    // Subscribe to discussion events to trigger agent participation
    await this.eventBusService.subscribe('discussion.events', async (event) => {
      try {
        logger.info('Received discussion event', {
          eventType: event.type,
          eventDataType: event.data?.type,
          statusChangedComparison: event.data?.type === DiscussionEventType.STATUS_CHANGED,
          participantJoinedComparison: event.data?.type === DiscussionEventType.PARTICIPANT_JOINED,
          discussionId: event.data?.discussionId,
          eventData: event.data
        });
        
        if (event.data?.type === DiscussionEventType.PARTICIPANT_JOINED) {
          const { participantId, agentId, discussionId, role } = event.data.data;
          
          logger.info('Agent joined discussion - triggering participation', { 
            agentId, 
            discussionId, 
            participantId,
            role 
          });

          // Trigger agent to join the discussion and provide initial response
          await this.agentDiscussionService.triggerAgentParticipation(
            discussionId,
            agentId,
            participantId
          );

          logger.info('Agent participation triggered successfully', { 
            agentId, 
            discussionId 
          });
        }

        // Handle discussion status changes - automatically add agents when discussion becomes active
        if (event.data?.type === DiscussionEventType.STATUS_CHANGED) {
          const discussionId = event.data?.discussionId;
          const { oldStatus, newStatus, startedBy } = event.data?.data || {};
          
          logger.info('Discussion status changed', { 
            discussionId, 
            oldStatus, 
            newStatus, 
            startedBy 
          });

          // When discussion becomes active, automatically add available agents
          if (newStatus === 'active' && oldStatus !== 'active') {
            logger.info('Discussion became active - checking for available agents', { 
              discussionId 
            });

            try {
              // Get the discussion details to check for existing participants
              const discussion = await this.discussionService.getDiscussion(discussionId);
              
              if (discussion) {
                // Check if there are any agent participants already
                const agentParticipants = discussion.participants || [];
                
                if (agentParticipants.length === 0) {
                  logger.info('No agent participants found - adding default agent', { 
                    discussionId 
                  });
                  
                  // Add a default agent to the discussion
                  // You can modify this to select specific agents based on discussion topic/settings
                  const agentRepository = this.databaseService.getAgentRepository();
                  const availableAgents = await agentRepository.getActiveAgents(1);
                  
                  if (availableAgents.length > 0) {
                    const defaultAgent = availableAgents[0]; // Use first available agent
                    
                    // Add the agent as a participant
                    await this.discussionService.addParticipant(discussionId, {
                      agentId: defaultAgent.id,
                      role: 'participant'
                    });
                    
                    logger.info('Default agent added to discussion', { 
                      discussionId, 
                      agentId: defaultAgent.id 
                    });
                  } else {
                    logger.warn('No available agents found to add to discussion', { 
                      discussionId 
                    });
                  }
                } else {
                  logger.info('Agent participants already exist in discussion', { 
                    discussionId, 
                    agentCount: agentParticipants.length 
                  });
                }
              }
            } catch (error) {
              logger.error('Failed to handle discussion status change', { 
                error: error instanceof Error ? error.message : 'Unknown error',
                discussionId,
                oldStatus,
                newStatus
              });
            }
          }
        }
      } catch (error) {
        logger.error('Failed to handle discussion event', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          eventType: event.type,
          agentId: event.data?.agentId,
          discussionId: event.data?.discussionId
        });
      }
    });

    logger.info('Agent chat WebSocket event subscription established');
    logger.info('Discussion events subscription established');
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

    // Initialize AgentDiscussionService
    this.agentDiscussionService = new AgentDiscussionService();
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