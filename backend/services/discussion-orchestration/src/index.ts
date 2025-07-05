import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { createServer } from 'http';
import WebSocket from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '@uaip/utils';
import { DiscussionService, PersonaService } from '@uaip/shared-services';
import { authMiddleware } from '@uaip/middleware';
import { SERVICE_ACCESS_MATRIX, validateServiceAccess, getDatabaseConnectionString, AccessLevel } from '@uaip/shared-services';

import { config } from './config/index.js';
import { DiscussionOrchestrationService } from './services/discussionOrchestrationService.js';
import { EnterpriseWebSocketHandler } from './websocket/enterpriseWebSocketHandler.js';
import { UserChatHandler } from './websocket/userChatHandler.js';
import { ConversationIntelligenceHandler } from './websocket/conversationIntelligenceHandler.js';

class DiscussionOrchestrationServer extends BaseService {
  private wss!: WebSocket.Server;
  private io: SocketIOServer;
  private orchestrationService: DiscussionOrchestrationService;
  private discussionService: DiscussionService;
  private personaService: PersonaService;
  private webSocketHandler: EnterpriseWebSocketHandler;
  private userChatHandler: UserChatHandler;
  private conversationIntelligenceHandler: ConversationIntelligenceHandler;
  private serviceName = 'discussion-orchestration';

  constructor() {
    super({
      name: 'discussion-orchestration',
      port: config.discussionOrchestration.port || 3005,
      enableEnterpriseEventBus: true,
      enableWebSocket: true
    });

    // Create HTTP server for WebSocket
    this.server = createServer(this.app);
    
    // Initialize Socket.IO server
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*", // Configure appropriately for production
        methods: ["GET", "POST"]
      }
    });

    // Validate enterprise database access
    if (!validateServiceAccess(this.serviceName, 'postgresql', 'postgres-application', AccessLevel.WRITE)) {
      throw new Error('Service lacks required database permissions');
    }

    // Initialize persona service with enterprise configuration
    this.personaService = new PersonaService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      cacheConfig: {
        redis: getDatabaseConnectionString(this.serviceName, 'redis', 'redis-application'),
        ttl: 300, // 5 minutes
        securityLevel: 3
      }
    });

    // Initialize discussion service with enterprise configuration
    this.discussionService = new DiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      personaService: this.personaService,
      enableRealTimeEvents: true,
      enableAnalytics: false, // Analytics go through separate analytics-service
      auditMode: 'comprehensive'
    });

    // Initialize handlers
    this.webSocketHandler = new EnterpriseWebSocketHandler(
      this.server,
      this.eventBusService,
      this.serviceName
    );

    this.userChatHandler = new UserChatHandler(this.io);
    this.conversationIntelligenceHandler = new ConversationIntelligenceHandler(this.io, this.eventBusService);

    this.orchestrationService = new DiscussionOrchestrationService(
      this.discussionService,
      this.eventBusService
    );

    this.auditServiceStartup();
  }

  protected async initialize(): Promise<void> {
    logger.info('Discussion Orchestration Service initialized');
  }

  protected setupCustomMiddleware(): void {
    // Request sanitization for security
    this.app.use((req, res, next) => {
      if (config.discussionOrchestration.security.enableInputSanitization) {
        // Basic input sanitization would go here
      }
      next();
    });

    // Authentication middleware for protected routes
    this.app.use('/api/', authMiddleware);
  }

  protected async setupRoutes(): Promise<void> {
    // Service info endpoint
    this.app.get('/api/v1/info', (req, res) => {
      res.json({
        service: 'discussion-orchestration',
        version: process.env.npm_package_version || '1.0.0',
        description: 'UAIP Discussion Orchestration Service - Manages discussion lifecycle, turn strategies, and real-time coordination',
        features: [
          'Discussion lifecycle management',
          'Multiple turn strategies (Round Robin, Moderated, Context Aware)',
          'Real-time WebSocket communication',
          'Event-driven architecture',
          'Comprehensive turn management'
        ],
        endpoints: {
          websocket: '/socket.io',
          conversationIntelligence: '/socket.io/conversation-intelligence',
          health: '/health',
          info: '/api/v1/info'
        },
        note: 'This service provides orchestration capabilities. Discussion CRUD operations are handled by the agent-intelligence service.'
      });
    });

    // User chat API routes
    this.app.get('/api/v1/users/online', (req, res) => {
      try {
        const connectedUsers = this.userChatHandler.getConnectedUsers();
        res.json({
          success: true,
          users: connectedUsers.map(user => ({
            userId: user.userId,
            username: user.username,
            status: user.status,
            lastActivity: user.lastActivity
          }))
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch online users'
        });
      }
    });

    this.app.get('/api/v1/users/:userId/status', (req, res) => {
      try {
        const { userId } = req.params;
        const userStatus = this.userChatHandler.getUserStatus(userId);
        
        if (userStatus) {
          res.json({
            success: true,
            user: {
              userId: userStatus.userId,
              username: userStatus.username,
              status: userStatus.status,
              lastActivity: userStatus.lastActivity,
              isOnline: true
            }
          });
        } else {
          res.json({
            success: true,
            user: {
              userId,
              isOnline: false
            }
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch user status'
        });
      }
    });

    // No traditional API routes - all operations through event bus
    logger.info('Event-driven routes configured', {
      service: this.serviceName,
      apiEndpoints: ['/health', '/api/v1/info', '/api/v1/users/*'],
      primaryCommunication: 'RabbitMQ Event Bus'
    });
  }

  protected async getHealthInfo(): Promise<any> {
    const status = this.orchestrationService.getStatus();
    return {
      ...status,
      websocket: {
        enabled: config.discussionOrchestration.websocket.enabled,
        connected: this.io ? true : false
      },
      database: {
        connected: true
      },
      eventBus: {
        connected: this.eventBusService ? true : false
      }
    };
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }

  protected async setupEventSubscriptions(): Promise<void> {
    // Event subscriptions would be set up here if needed
  }

  private async publishOrchestrationEvent(eventType: string, discussionId: string, user: any): Promise<void> {
    const event = {
      type: eventType,
      discussionId,
      userId: user.id,
      timestamp: new Date().toISOString(),
      source: this.serviceName,
      securityLevel: user.securityLevel || 3
    };

    await this.eventBusService.publish('orchestration.control', event);

    // Audit log for compliance
    logger.info('AUDIT: Orchestration control event', {
      ...event,
      auditEvent: 'ORCHESTRATION_CONTROL',
      compliance: true
    });
  }

  private auditServiceStartup(): void {
    // Comprehensive startup audit for compliance
    const startupAudit = {
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      securityLevel: SERVICE_ACCESS_MATRIX[this.serviceName].securityLevel,
      complianceFlags: SERVICE_ACCESS_MATRIX[this.serviceName].complianceFlags,
      databases: SERVICE_ACCESS_MATRIX[this.serviceName].databases.map(db => ({
        type: db.type,
        tier: db.tier,
        instance: db.instance,
        encryption: db.encryption,
        auditLevel: db.auditLevel
      })),
      networkSegments: SERVICE_ACCESS_MATRIX[this.serviceName].networkSegments,
      eventBusEnabled: true,
      webSocketEnabled: true,
      apiSurface: 'minimal'
    };

    logger.info('AUDIT: Service startup', {
      ...startupAudit,
      auditEvent: 'SERVICE_STARTUP',
      compliance: true
    });

    // Register with service registry via event bus
    this.eventBusService.publish('service.registry.register', {
      service: this.serviceName,
      capabilities: ['discussion_orchestration', 'websocket_realtime', 'turn_management'],
      status: 'active',
      ...startupAudit
    }).catch(error => {
      logger.error('Failed to register with service registry', { error });
    });
  }

  protected onServerStarted(): void {
    logger.info('Discussion Orchestration Service features:', {
      websocketEnabled: config.discussionOrchestration.websocket.enabled,
      compression: config.discussionOrchestration.performance.enableCompression,
      rateLimiting: config.discussionOrchestration.security.enableRateLimiting
    });
  }

  protected async cleanup(): Promise<void> {
    // Deregister from service registry
    await this.eventBusService.publish('service.registry.deregister', {
      service: this.serviceName,
      timestamp: new Date().toISOString()
    });

    // Shutdown Enterprise WebSocket handler
    if (this.webSocketHandler) {
      await this.webSocketHandler.shutdown();
      logger.info('Enterprise WebSocket handler shut down');
    }

    // Cleanup orchestration service
    if (this.orchestrationService) {
      await this.orchestrationService.cleanup();
      logger.info('Orchestration service cleaned up');
    }
  }

  public getStatus(): any {
    return {
      service: 'discussion-orchestration',
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      websocket: {
        enabled: config.discussionOrchestration.websocket.enabled,
        connected: this.io ? true : false
      },
      database: {
        connected: true
      },
      eventBus: {
        connected: this.eventBusService ? true : false
      }
    };
  }
}

// Create and start the server
const server = new DiscussionOrchestrationServer();

// Start the server
server.start().catch((error) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
  process.exit(1);
});

export { server as discussionOrchestrationServer };
export default server;
