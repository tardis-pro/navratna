import { BaseService, getDatabaseConnectionString } from '@uaip/shared-services';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as BunEngine } from '@socket.io/bun-engine';
import { LLMService, UserLLMService, ModelBootstrapService } from '@uaip/llm-service';
import { logger } from '@uaip/utils';
import type { EventBusMessage } from '@uaip/types';

import { registerAgentRoutes } from '../../agent-intelligence/src/routes/agent.routes.js';
import { registerConstellationRoutes } from '../../agent-intelligence/src/routes/constellation.routes.js';
import { ArtifactService } from '../../artifact-service/src/ArtifactService.js';
import { registerArtifactRoutes } from '../../artifact-service/src/routes/artifactRoutes.js';
import { registerShortLinkRoutes } from '../../artifact-service/src/routes/shortLinkRoutes.js';
import { registerLLMRoutes } from '../../llm-service/src/routes/llm.routes.js';
import { registerUserLLMRoutes } from '../../llm-service/src/routes/user-llm.routes.js';

import { DiscussionOrchestrationService } from '../../discussion-orchestration/src/services/discussionOrchestrationService.js';
import { DiscussionService } from '../../discussion-orchestration/src/services/discussionService.js';
import { PersonaService } from '../../discussion-orchestration/src/services/personaService.js';
import { UserChatHandler } from '../../discussion-orchestration/src/websocket/userChatHandler.js';
import { ConversationIntelligenceHandler } from '../../discussion-orchestration/src/websocket/conversationIntelligenceHandler.js';
import { TaskNotificationHandler } from '../../discussion-orchestration/src/websocket/taskNotificationHandler.js';
import { StreamingHandler } from '../../discussion-orchestration/src/websocket/streamingHandler.js';
import { CodingAgentSocketHandler } from '../../discussion-orchestration/src/websocket/codingAgentSocketHandler.js';
import { setupWebSocketHandlers } from '../../discussion-orchestration/src/websocket/discussionSocket.js';
import { DebateHandler } from '../../discussion-orchestration/src/handlers/debateHandler.js';
import { WhatsAppHandler } from '../../discussion-orchestration/src/whatsapp/whatsappHandler.js';

class NavratnaCoreService extends BaseService {
  private artifactService!: ArtifactService;
  private llmService!: LLMService;
  private userLLMService!: UserLLMService;
  private modelBootstrapService!: ModelBootstrapService;

  private io: SocketIOServer;
  private bunEngine: BunEngine;
  private orchestrationService!: DiscussionOrchestrationService;
  private discussionService!: DiscussionService;
  private personaService!: PersonaService;

  private userChatHandler?: UserChatHandler;
  private conversationIntelligenceHandler?: ConversationIntelligenceHandler;
  private taskNotificationHandler?: TaskNotificationHandler;
  private streamingHandler?: StreamingHandler;
  private codingAgentSocketHandler?: CodingAgentSocketHandler;
  private debateHandler?: DebateHandler;
  private whatsappHandler?: WhatsAppHandler;

  private authResponseHandlers = new Map<string, (response: Record<string, unknown>) => void>();
  private authSubscriptionInitialized = false;

  constructor() {
    super({
      name: 'navratna-core',
      port: parseInt(process.env.NAVRATNA_CORE_PORT || '3001', 10),
      version: '3.0.0',
      enableWebSocket: true,
      enableNeo4j: true,
      enableEnterpriseEventBus: true,
    });
    this.registerEntities([]);

    this.io = new SocketIOServer({
      cors: { origin: false },
      serveClient: false,
      path: '/socket.io/',
    });

    this.bunEngine = new BunEngine({
      path: '/socket.io/',
      pingInterval: 25000,
      pingTimeout: 60000,
    });
    this.io.bind(this.bunEngine);
  }

  protected async initialize(): Promise<void> {
    this.artifactService = new ArtifactService(this.eventBusService);
    await this.artifactService.initialize();

    this.llmService = LLMService.getInstance();
    this.userLLMService = new UserLLMService(this.modelSelectionFacade);
    this.modelBootstrapService = ModelBootstrapService.getInstance();

    this.personaService = new PersonaService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      cacheConfig: {
        redis: getDatabaseConnectionString('discussion-orchestration', 'redis', 'redis-application'),
        ttl: 300,
        securityLevel: 3,
      },
    });

    this.discussionService = new DiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      personaService: this.personaService,
      enableRealTimeEvents: true,
      enableAnalytics: false,
      auditMode: 'comprehensive',
    });

    this.orchestrationService = new DiscussionOrchestrationService(
      this.discussionService,
      this.eventBusService
    );

    await this.initializeAuthSubscription();

    this.debateHandler = new DebateHandler(this.io, this.eventBusService);

    logger.info('navratna-core services initialized');
  }

  protected async setupRoutes(): Promise<void> {
    registerAgentRoutes(this.app);
    registerConstellationRoutes(this.app);
    registerArtifactRoutes(this.app, this.artifactService);
    registerShortLinkRoutes(this.app);
    registerLLMRoutes(this.app, this.llmService, this.modelBootstrapService, this.userLLMService);
    registerUserLLMRoutes(this.app, this.userLLMService);

    this.app.all('/socket.io/*', ({ request, server }: { request: Request; server: unknown }) => {
      if (!server) {
        logger.error('Server not available for Socket.IO request');
        return new Response('Server not available', { status: 503 });
      }
      return this.bunEngine.handleRequest(
        request,
        server as Parameters<typeof this.bunEngine.handleRequest>[1]
      );
    });

    this.app.get('/health', () => ({
      status: 'ok',
      service: 'navratna-core',
      consolidates: ['agent-intelligence', 'discussion-orchestration', 'artifact-service', 'llm-service'],
    }));

    logger.info('navratna-core routes configured');
  }

  protected async setupEventSubscriptions(): Promise<void> {
    await this.eventBusService.subscribe(
      'discussion.agent.message',
      async (event: EventBusMessage) => {
        try {
          const eventPayload = (event.data || event) as {
            discussionId: string;
            participantId: string;
            agentId?: string;
            content: string;
            messageType?: string;
            metadata?: Record<string, unknown>;
            isInitialParticipation?: boolean;
          };
          const {
            discussionId,
            participantId,
            agentId,
            content,
            messageType,
            metadata,
            isInitialParticipation,
          } = eventPayload;
          const mergedMetadata = {
            ...(metadata || {}),
            ...(isInitialParticipation === true ? { isInitialParticipation: true } : {}),
          };

          const result = await this.orchestrationService.sendMessage(
            discussionId,
            participantId,
            content,
            messageType || 'message',
            mergedMetadata
          );

          if (!result.success) {
            logger.error('Failed to send agent message to discussion', {
              discussionId,
              agentId,
              participantId,
              error: result.error,
            });
          }
        } catch (error) {
          logger.error('Error processing agent message event', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    logger.info('navratna-core event subscriptions configured');
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }

  public async start(): Promise<void> {
    try {
      await this.initializeDatabase();
      await this.initializeEventBus();

      this.setupBaseMiddleware();
      this.setupBaseRoutes();

      await this.initialize();
      await this.setupRoutes();

      this.setup404Handler();
      this.setupErrorHandler();

      const bunHandler = this.bunEngine.handler();
      this.server = this.app.listen({
        port: this.config.port,
        idleTimeout: 30,
        websocket: 'websocket' in bunHandler ? bunHandler.websocket : undefined,
      });

      logger.info(
        `navratna-core (Elysia + Socket.IO Bun engine) started on port ${this.config.port}`
      );

      this.setupGracefulShutdown();

      this.io.use(async (socket: Socket, next: (err?: Error) => void) => {
        try {
          const userId = socket.handshake.headers['x-user-id'] as string | undefined;
          const userEmail = socket.handshake.headers['x-user-email'] as string | undefined;
          const userRole = socket.handshake.headers['x-user-role'] as string | undefined;

          if (userId) {
            const UUID_REGEX =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!UUID_REGEX.test(userId)) {
              return next(new Error('Authentication failed: Invalid user ID format'));
            }
            socket.data.user = {
              userId,
              email: userEmail || '',
              role: userRole || 'user',
              sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              securityLevel: 3,
              complianceFlags: [],
            };
            return next();
          }

          const token =
            socket.handshake.auth?.token ||
            (socket.handshake.headers?.authorization as string | undefined)?.replace(
              'Bearer ',
              ''
            ) ||
            socket.handshake.query?.token;

          if (!token) {
            return next(new Error('Authentication required'));
          }

          const authResponse = await this.validateSocketIOToken(token as string);
          if (!authResponse.valid) {
            return next(new Error(`Authentication failed: ${authResponse.reason}`));
          }

          socket.data.user = {
            userId: authResponse.userId,
            sessionId: authResponse.sessionId,
            securityLevel: authResponse.securityLevel || 3,
            complianceFlags: authResponse.complianceFlags || [],
          };
          next();
        } catch (error) {
          logger.error('Socket.IO authentication error', {
            socketId: socket.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return next(new Error('Authentication service unavailable'));
        }
      });

      this.userChatHandler = new UserChatHandler(this.io, this.eventBusService);

      try {
        this.conversationIntelligenceHandler = new ConversationIntelligenceHandler(
          this.io,
          this.eventBusService
        );
      } catch (error) {
        logger.error('Failed to initialize ConversationIntelligenceHandler:', error);
      }

      try {
        this.taskNotificationHandler = new TaskNotificationHandler(this.io, this.eventBusService);
      } catch (error) {
        logger.error('Failed to initialize TaskNotificationHandler:', error);
      }

      try {
        this.streamingHandler = new StreamingHandler(this.io, this.eventBusService);
      } catch (error) {
        logger.error('Failed to initialize StreamingHandler:', error);
      }

      try {
        this.codingAgentSocketHandler = new CodingAgentSocketHandler(
          this.io,
          this.eventBusService
        );
      } catch (error) {
        logger.error('Failed to initialize CodingAgentSocketHandler:', error);
      }

      try {
        this.whatsappHandler = new WhatsAppHandler(this.io, this.eventBusService);
      } catch (error) {
        logger.error('Failed to initialize WhatsAppHandler:', error);
      }

      try {
        setupWebSocketHandlers(this.io, this.orchestrationService);
      } catch (error) {
        logger.error('Failed to initialize discussion WebSocket handlers:', error);
      }

      logger.info('navratna-core WebSocket handlers initialized');
    } catch (error) {
      logger.error('navratna-core: Failed to start:', error);
      process.exit(1);
    }
  }

  private async initializeAuthSubscription(): Promise<void> {
    if (this.authSubscriptionInitialized) return;

    await this.eventBusService.subscribe(
      'security.auth.response',
      async (event: EventBusMessage) => {
        const eventData = event.data as Record<string, unknown> | undefined;
        const correlationId = eventData?.correlationId as string | undefined;
        if (correlationId && this.authResponseHandlers.has(correlationId)) {
          const handler = this.authResponseHandlers.get(correlationId);
          if (handler) {
            handler(eventData as Record<string, unknown>);
            this.authResponseHandlers.delete(correlationId);
          }
        }
      }
    );
    this.authSubscriptionInitialized = true;
    logger.info('Shared authentication subscription initialized');
  }

  private async validateSocketIOToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    sessionId?: string;
    securityLevel?: number;
    complianceFlags?: string[];
    reason?: string;
  }> {
    const correlationId = `socketio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const WS_AUTH_TIMEOUT_MS = 5000;

    return new Promise((resolve) => {
      let resolved = false;
      const resolveOnce = (result: {
        valid: boolean;
        userId?: string;
        sessionId?: string;
        securityLevel?: number;
        complianceFlags?: string[];
        reason?: string;
      }) => {
        if (resolved) return;
        resolved = true;
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        this.authResponseHandlers.delete(correlationId);
        this.validateSocketIOTokenViaHttp(token)
          .then(resolveOnce)
          .catch(() => resolveOnce({ valid: false, reason: 'Auth validation timed out' }));
      }, WS_AUTH_TIMEOUT_MS);

      this.authResponseHandlers.set(correlationId, (response: Record<string, unknown>) => {
        clearTimeout(timeoutId);
        resolveOnce(
          response as {
            valid: boolean;
            userId?: string;
            sessionId?: string;
            securityLevel?: number;
            complianceFlags?: string[];
            reason?: string;
          }
        );
      });

      this.eventBusService
        .publish('security.auth.validate', {
          token,
          service: 'navratna-core',
          operation: 'socketio_auth',
          correlationId,
          timestamp: new Date().toISOString(),
        })
        .catch((error: unknown) => {
          clearTimeout(timeoutId);
          this.authResponseHandlers.delete(correlationId);
          this.validateSocketIOTokenViaHttp(token)
            .then(resolveOnce)
            .catch(() => resolveOnce({ valid: false, reason: 'Auth validation failed' }));
          logger.error('Socket.IO auth event bus publish failed', {
            error: error instanceof Error ? error.message : String(error),
            correlationId,
          });
        });
    });
  }

  private async validateSocketIOTokenViaHttp(token: string): Promise<{
    valid: boolean;
    userId?: string;
    sessionId?: string;
    securityLevel?: number;
    complianceFlags?: string[];
    reason?: string;
  }> {
    const defaultUrls = ['http://navratna-gateway:3002', 'http://localhost:3002'];
    const urls = process.env.SECURITY_GATEWAY_URL
      ? [process.env.SECURITY_GATEWAY_URL, ...defaultUrls]
      : defaultUrls;

    for (const baseUrl of urls) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      try {
        // oxlint-disable-next-line no-await-in-loop
        const response = await fetch(`${baseUrl}/api/v1/auth/validate`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          // oxlint-disable-next-line no-await-in-loop
          const errorBody = await response.json().catch((): null => null);
          return {
            valid: false,
            reason:
              (errorBody as Record<string, unknown> | null)?.error?.toString() ||
              'Authentication failed',
          };
        }

        return { valid: true, userId: response.headers.get('x-user-id') || undefined };
      } catch (error) {
        clearTimeout(timeoutId);
        logger.warn('Socket.IO HTTP auth fallback failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          baseUrl,
        });
      }
    }

    return { valid: false, reason: 'Authentication service timeout' };
  }
}

const service = new NavratnaCoreService();
service.start().catch((error) => {
  logger.error('Failed to start navratna-core', { error });
  process.exit(1);
});