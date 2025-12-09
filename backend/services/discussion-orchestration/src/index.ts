import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { createServer } from 'http';
import WebSocket from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import { Server as BunEngine } from '@socket.io/bun-engine';
import { logger } from '@uaip/utils';
import { DiscussionService, PersonaService } from '@uaip/shared-services';
import { authMiddleware } from '@uaip/middleware';
import { SERVICE_ACCESS_MATRIX, validateServiceAccess, getDatabaseConnectionString, AccessLevel } from '@uaip/shared-services';

import { config } from './config/index.js';
import { DiscussionOrchestrationService } from './services/discussionOrchestrationService.js';
// Removed EnterpriseWebSocketHandler import - using Socket.IO only
import { UserChatHandler } from './websocket/userChatHandler.js';
import { ConversationIntelligenceHandler } from './websocket/conversationIntelligenceHandler.js';
import { TaskNotificationHandler } from './websocket/taskNotificationHandler.js';
import { setupWebSocketHandlers } from './websocket/discussionSocket.js';

class DiscussionOrchestrationServer extends BaseService {
  private wss!: WebSocket.Server;
  private io: SocketIOServer;
  private bunEngine: BunEngine;
  private orchestrationService: DiscussionOrchestrationService;
  private discussionService: DiscussionService;
  private personaService: PersonaService;
  // Removed webSocketHandler - using Socket.IO only
  private userChatHandler?: UserChatHandler;
  private conversationIntelligenceHandler?: ConversationIntelligenceHandler;
  private taskNotificationHandler?: TaskNotificationHandler;
  private serviceName = 'discussion-orchestration';
  private authResponseHandlers = new Map<string, (response: any) => void>();
  private authSubscriptionInitialized = false;

  constructor() {
    super({
      name: 'discussion-orchestration',
      port: config.discussionOrchestration.port || 3005,
      enableEnterpriseEventBus: true,
      enableWebSocket: true
    });

    // Initialize Socket.IO server with Bun engine
    this.io = new SocketIOServer({
      cors: {
        origin: false
      },
      serveClient: false,
      path: '/socket.io/'
    });

    // Create and bind Bun engine
    this.bunEngine = new BunEngine({
      path: '/socket.io/',
      pingInterval: 25000,
      pingTimeout: 60000
    });
    this.io.bind(this.bunEngine);

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

    this.orchestrationService = new DiscussionOrchestrationService(
      this.discussionService,
      this.eventBusService
    );

    this.auditServiceStartup();
  }

  protected async initialize(): Promise<void> {
    // Initialize shared auth subscription
    await this.initializeAuthSubscription();
    logger.info('Discussion Orchestration Service initialized');
  }

  protected setupCustomMiddleware(): void {
    // Request sanitization and authentication handled in route handlers
    // Elysia doesn't support Express-style middleware
    // Input sanitization and auth validation will be done per route
  }

  protected async setupRoutes(): Promise<void> {
    // Service info endpoint
    this.app.get('/api/v1/info', () => ({
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
    }));

    // Debug and monitoring routes for race condition detection
    this.app.get('/api/v1/debug/race-conditions', ({ set }) => {
      try {
        const orchestrationStats = this.orchestrationService.getCleanupStatistics();
        const systemHealth = this.getSystemHealthMetrics();

        return {
          success: true,
          timestamp: new Date().toISOString(),
          orchestrationStats,
          systemHealth,
          warnings: this.detectRaceConditionWarnings(orchestrationStats, systemHealth)
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Failed to fetch race condition debug info'
        };
      }
    });

    this.app.get('/api/v1/debug/memory-usage', ({ set }) => {
      try {
        const memoryUsage = process.memoryUsage();
        const orchestrationStats = this.orchestrationService.getCleanupStatistics();

        return {
          success: true,
          timestamp: new Date().toISOString(),
          process: {
            ...memoryUsage,
            heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            rssGB: Math.round(memoryUsage.rss / 1024 / 1024 / 1024 * 100) / 100
          },
          orchestration: orchestrationStats,
          alerts: this.generateMemoryAlerts(memoryUsage, orchestrationStats)
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Failed to fetch memory usage debug info'
        };
      }
    });

    this.app.post('/api/v1/debug/force-cleanup', ({ set }) => {
      try {
        // Trigger immediate cleanup
        this.orchestrationService['performPeriodicCleanup']();

        return {
          success: true,
          message: 'Forced cleanup triggered',
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Failed to trigger cleanup'
        };
      }
    });

    this.app.get('/api/v1/debug/pending-requests', ({ set }) => {
      try {
        // This would require exposing cleanup stats from ConversationEnhancementService
        // For now, return orchestration stats
        const stats = this.orchestrationService.getCleanupStatistics();

        return {
          success: true,
          timestamp: new Date().toISOString(),
          orchestration: stats,
          note: 'LLM pending requests require agent-intelligence service endpoint'
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Failed to fetch pending requests info'
        };
      }
    });

    // User chat API routes
    this.app.get('/api/v1/users/online', ({ set }) => {
      try {
        const connectedUsers = this.userChatHandler.getConnectedUsers();
        return {
          success: true,
          users: connectedUsers.map(user => ({
            userId: user.userId,
            username: user.username,
            status: user.status,
            lastActivity: user.lastActivity
          }))
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Failed to fetch online users'
        };
      }
    });

    this.app.get('/api/v1/users/:userId/status', ({ params, set }) => {
      try {
        const { userId } = params;
        const userStatus = this.userChatHandler.getUserStatus(userId);

        if (userStatus) {
          return {
            success: true,
            user: {
              userId: userStatus.userId,
              username: userStatus.username,
              status: userStatus.status,
              lastActivity: userStatus.lastActivity,
              isOnline: true
            }
          };
        } else {
          return {
            success: true,
            user: {
              userId,
              isOnline: false
            }
          };
        }
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Failed to fetch user status'
        };
      }
    });

    // Add Socket.IO route handler for Bun engine
    this.app.all('/socket.io/*', ({ request, server }) => {
      if (!server) {
        logger.error('Server not available for Socket.IO request');
        return new Response('Server not available', { status: 503 });
      }
      return this.bunEngine.handleRequest(request, server);
    });

    // No traditional API routes - all operations through event bus
    logger.info('Event-driven routes configured', {
      service: this.serviceName,
      apiEndpoints: ['/health', '/api/v1/info', '/api/v1/users/*', '/socket.io/*'],
      primaryCommunication: 'RabbitMQ Event Bus'
    });
  }

  protected async getHealthInfo(): Promise<any> {
    const status = this.orchestrationService.getStatus();
    const databaseHealthy = await this.checkDatabaseHealth();
    const eventBusHealthy = await this.checkEventBusHealth();
    
    return {
      ...status,
      websocket: {
        enabled: config.discussionOrchestration.websocket.enabled,
        connected: this.io ? true : false
      },
      database: {
        connected: databaseHealthy
      },
      eventBus: {
        connected: eventBusHealthy
      }
    };
  }

  protected async checkServiceHealth(): Promise<boolean> {
    const databaseHealthy = await this.checkDatabaseHealth();
    const eventBusHealthy = await this.checkEventBusHealth();
    
    return databaseHealthy && eventBusHealthy;
  }

  protected async setupEventSubscriptions(): Promise<void> {
    // Subscribe to agent messages for discussions
    await this.eventBusService.subscribe('discussion.agent.message', async (event) => {
      try {
        const { discussionId, participantId, agentId, content, messageType, metadata } = event.data || event;
        
        logger.info('Processing agent message for discussion', { 
          discussionId, 
          participantId, 
          agentId,
          messageType,
          contentLength: content?.length,
          isInitialParticipation: metadata?.isInitialParticipation
        });

        // Send the agent message to the discussion through orchestration service
        const result = await this.orchestrationService.sendMessage(
          discussionId,
          participantId,
          content,
          messageType || 'message',
          metadata
        );

        if (result.success) {
          logger.info('Agent message sent to discussion successfully', {
            discussionId,
            agentId,
            participantId,
            messageId: result.data?.id
          });
        } else {
          logger.error('Failed to send agent message to discussion', {
            discussionId,
            agentId,
            participantId,
            error: result.error
          });
        }

      } catch (error) {
        logger.error('Error processing agent message event', {
          error: error instanceof Error ? error.message : 'Unknown error',
          eventData: event?.data || event
        });
      }
    });

    logger.info('Discussion orchestration event subscriptions configured', {
      subscriptions: ['discussion.agent.message']
    });
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

  private async initializeAuthSubscription(): Promise<void> {
    if (this.authSubscriptionInitialized) return;
    
    try {
      // Set up shared authentication response handler
      const sharedAuthHandler = async (event: any) => {
        const correlationId = event.data?.correlationId;
        if (correlationId && this.authResponseHandlers.has(correlationId)) {
          const handler = this.authResponseHandlers.get(correlationId);
          if (handler) {
            handler(event.data);
            this.authResponseHandlers.delete(correlationId);
          }
        }
      };
      
      await this.eventBusService.subscribe('security.auth.response', sharedAuthHandler);
      this.authSubscriptionInitialized = true;
      
      logger.info('Shared authentication subscription initialized');
    } catch (error) {
      logger.error('Failed to initialize shared auth subscription', { error: error.message });
      throw error;
    }
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

  public async start(): Promise<void> {
    try {
      // Initialize base components first (from BaseService)
      await this['initializeDatabase']();
      await this['initializeEventBus']();

      // Setup middleware and routes (from BaseService)
      this['setupBaseMiddleware']();
      this['setupBaseRoutes']();

      // Service-specific initialization
      await this.initialize();

      // Service-specific routes
      await this.setupRoutes();

      // Error handling (from BaseService)
      this['setup404Handler']();
      this['setupErrorHandler']();

      // Start server with WebSocket configuration for Bun engine
      this.server = this.app.listen({
        port: this.config.port,
        idleTimeout: 30,
        websocket: (this.bunEngine.handler() as any).websocket
      });

      logger.info(`${this.config.name} (Elysia with Socket.IO Bun engine) started on port ${this.config.port}`);

      // Setup graceful shutdown (from BaseService)
      this['setupGracefulShutdown']();

      // Socket.IO Authentication Middleware
        this.io.use(async (socket, next) => {
          try {
            // Extract token from multiple sources (Socket.IO standard patterns)
            const token = socket.handshake.auth?.token || 
                         socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
                         socket.handshake.query?.token;
            
            logger.info('Socket.IO authentication attempt', { 
              socketId: socket.id,
              hasToken: !!token,
              origin: socket.handshake.headers.origin,
              userAgent: socket.handshake.headers['user-agent']
            });
            
            if (!token) {
              logger.warn('Socket.IO connection rejected - no token', { 
                socketId: socket.id,
                headers: Object.keys(socket.handshake.headers),
                query: Object.keys(socket.handshake.query)
              });
              return next(new Error('Authentication token required'));
            }
            
            // Validate token through Security Gateway
            const authResponse = await this.validateSocketIOToken(token);
            
            if (!authResponse.valid) {
              logger.warn('Socket.IO authentication failed', {
                socketId: socket.id,
                reason: authResponse.reason
              });
              return next(new Error(`Authentication failed: ${authResponse.reason}`));
            }
            
            // Store user info in socket data
            socket.data.user = {
              userId: authResponse.userId,
              sessionId: authResponse.sessionId,
              securityLevel: authResponse.securityLevel || 3,
              complianceFlags: authResponse.complianceFlags || []
            };
            
            logger.info('✅ Socket.IO authentication successful', { 
              socketId: socket.id,
              userId: authResponse.userId,
              securityLevel: authResponse.securityLevel
            });
            
            next();
          } catch (error) {
            logger.error('Socket.IO authentication error', { 
              socketId: socket.id, 
              error: error.message 
            });
            return next(new Error('Authentication service unavailable'));
          }
        });
        
        logger.info('Socket.IO with Bun engine configured successfully');
      
      // Initialize handlers after server is created
      logger.info('Initializing WebSocket handlers', {
        serverExists: !!this.server,
        serverListening: this.server ? (this.server as any)?.server?.listening : false
      });
      
      if (!this.server) {
        throw new Error('HTTP server not available for WebSocket attachment');
      }
      
      // NOTE: Removed EnterpriseWebSocketHandler - using Socket.IO only
      logger.info('Using Socket.IO only - traditional WebSocket handler removed');

      this.userChatHandler = new UserChatHandler(this.io, this.eventBusService);
      
      try {
        this.conversationIntelligenceHandler = new ConversationIntelligenceHandler(this.io, this.eventBusService);
        logger.info('ConversationIntelligenceHandler initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize ConversationIntelligenceHandler:', error);
        // Continue without conversation intelligence handler rather than crashing the service
      }

      try {
        this.taskNotificationHandler = new TaskNotificationHandler(this.io, this.eventBusService);
        logger.info('TaskNotificationHandler initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize TaskNotificationHandler:', error);
        // Continue without task notification handler rather than crashing the service
      }

      // Setup discussion-specific WebSocket handlers (start_discussion, join_discussion, etc.)
      try {
        setupWebSocketHandlers(this.io, this.orchestrationService);
        logger.info('Discussion WebSocket handlers initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Discussion WebSocket handlers:', error);
        // Continue without discussion handlers rather than crashing the service
      }
      
      logger.info('Discussion Orchestration Service started with WebSocket support', {
        port: this.config.port,
        websocketEnabled: config.discussionOrchestration.websocket.enabled,
        compression: config.discussionOrchestration.performance.enableCompression,
        rateLimiting: config.discussionOrchestration.security.enableRateLimiting,
        socketIoAttached: !!this.io.engine
      });
    } catch (error) {
      logger.error('Failed to start Discussion Orchestration Service:', error);
      throw error;
    }
  }

  protected onServerStarted(): void {
    logger.info('Discussion Orchestration Service features:', {
      websocketEnabled: config.discussionOrchestration.websocket.enabled,
      compression: config.discussionOrchestration.performance.enableCompression,
      rateLimiting: config.discussionOrchestration.security.enableRateLimiting
    });
  }

  /**
   * Validate Socket.IO authentication token through Security Gateway
   */
  private async validateSocketIOToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    sessionId?: string;
    securityLevel?: number;
    complianceFlags?: string[];
    reason?: string;
  }> {
    const correlationId = `socketio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise(async (resolve) => {
      // Set up timeout for auth validation
      const timeoutId = setTimeout(() => {
        logger.warn('Socket.IO authentication timeout', { correlationId, token: token.substr(0, 10) + '...' });
        // Clean up handler on timeout
        this.authResponseHandlers.delete(correlationId);
        resolve({ valid: false, reason: 'Authentication service timeout' });
      }, config.discussionOrchestration.security.websocketAuthTimeout); // Configurable authentication timeout
      
      try {
        // Register response handler for this specific correlation ID
        this.authResponseHandlers.set(correlationId, (response: any) => {
          clearTimeout(timeoutId);
          
          logger.debug('Socket.IO auth response received', { 
            correlationId, 
            valid: response?.valid,
            userId: response?.userId?.substr(0, 8) + '...' // Partial log for security
          });
          
          resolve(response);
        });
        
        // Publish auth validation request to Security Gateway
        await this.eventBusService.publish('security.auth.validate', {
          token,
          service: this.serviceName,
          operation: 'socketio_auth',
          correlationId,
          timestamp: new Date().toISOString()
        });
        
        logger.debug('Socket.IO auth request sent to Security Gateway', { correlationId });
        
      } catch (error) {
        clearTimeout(timeoutId);
        this.authResponseHandlers.delete(correlationId);
        logger.error('Socket.IO auth validation failed', { 
          error: error.message, 
          correlationId 
        });
        resolve({ valid: false, reason: 'Authentication service error' });
      }
    });
  }

  protected async cleanup(): Promise<void> {
    // Deregister from service registry
    await this.eventBusService.publish('service.registry.deregister', {
      service: this.serviceName,
      timestamp: new Date().toISOString()
    });

    // NOTE: No traditional WebSocket handler to shutdown - using Socket.IO only

    // Cleanup orchestration service
    if (this.orchestrationService) {
      await this.orchestrationService.cleanup();
      logger.info('Orchestration service cleaned up');
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down Discussion Orchestration Server...');
    
    try {
      // Call parent cleanup
      await this.cleanup();
      
      // Force exit if graceful shutdown takes too long
      setTimeout(() => {
        logger.warn('Forceful shutdown due to timeout');
        process.exit(1);
      }, config.discussionOrchestration.security.websocketAuthTimeout);
      
      logger.info('Discussion Orchestration Server shutdown completed');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get system health metrics for race condition detection
   */
  private getSystemHealthMetrics(): any {
    const memory = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
      memory: {
        heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
        rssGB: Math.round(memory.rss / 1024 / 1024 / 1024 * 100) / 100,
        external: Math.round(memory.external / 1024 / 1024),
        arrayBuffers: Math.round(memory.arrayBuffers / 1024 / 1024)
      },
      cpu: {
        uptime: uptime,
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
      },
      connections: {
        socketIO: this.io ? this.io.engine?.clientsCount || 0 : 0,
        authHandlers: this.authResponseHandlers.size
      }
    };
  }

  /**
   * Detect race condition warnings
   */
  private detectRaceConditionWarnings(orchestrationStats: any, systemHealth: any): string[] {
    const warnings: string[] = [];
    
    // Check for high number of operation locks (race condition indicator)
    if (orchestrationStats.operationLocks > 5) {
      warnings.push(`High operation locks detected: ${orchestrationStats.operationLocks} (normal: 0-2)`);
    }
    
    // Check for high turn timer count vs discussions
    if (orchestrationStats.turnTimers > orchestrationStats.activeDiscussions + 5) {
      warnings.push(`Timer count mismatch: ${orchestrationStats.turnTimers} timers vs ${orchestrationStats.activeDiscussions} discussions`);
    }
    
    // Check for high participation rate limits (possible infinite loop)
    if (orchestrationStats.participationRateLimits > orchestrationStats.activeDiscussions * 2) {
      warnings.push(`High participation rate limits: ${orchestrationStats.participationRateLimits} (may indicate agent loops)`);
    }
    
    // Check for memory pressure
    if (systemHealth.memory.heapUsedMB > 1000) {
      warnings.push(`High memory usage: ${systemHealth.memory.heapUsedMB}MB (consider cleanup)`);
    }
    
    // Check for stale discussions
    if (orchestrationStats.activeDiscussions > 100) {
      warnings.push(`High discussion count: ${orchestrationStats.activeDiscussions} (cleanup may be needed)`);
    }
    
    return warnings;
  }

  /**
   * Generate memory alerts
   */
  private generateMemoryAlerts(memoryUsage: NodeJS.MemoryUsage, orchestrationStats: any): string[] {
    const alerts: string[] = [];
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const rssGB = Math.round(memoryUsage.rss / 1024 / 1024 / 1024 * 100) / 100;
    
    // Memory thresholds
    if (heapUsedMB > 1500) {
      alerts.push(`CRITICAL: Heap usage ${heapUsedMB}MB exceeds 1.5GB threshold`);
    } else if (heapUsedMB > 1000) {
      alerts.push(`WARNING: Heap usage ${heapUsedMB}MB exceeds 1GB threshold`);
    }
    
    if (rssGB > 2.0) {
      alerts.push(`CRITICAL: RSS usage ${rssGB}GB exceeds 2GB threshold`);
    } else if (rssGB > 1.5) {
      alerts.push(`WARNING: RSS usage ${rssGB}GB exceeds 1.5GB threshold`);
    }
    
    // Data structure size alerts
    if (orchestrationStats.activeDiscussions > 1000) {
      alerts.push(`INFO: High active discussions: ${orchestrationStats.activeDiscussions}`);
    }
    
    if (orchestrationStats.participationRateLimits > 500) {
      alerts.push(`INFO: High participation rate limits: ${orchestrationStats.participationRateLimits}`);
    }
    
    return alerts;
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

// NOTE: Removed custom uncaught exception handlers - using standard BaseService handling only
// No more WebSocket frame errors since we're using Socket.IO only

// Start the server
server.start().catch((error) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
  process.exit(1);
});

// Named export to avoid Bun auto-serve on default export
export { server, server as discussionOrchestrationServer };
