# Discussion Orchestration Service - Tech Debt Analysis & Refactoring Plan

## 📊 Current State Analysis

### 🔴 Critical Issues

**1. Oversized Files (4 files >500 lines)**

- `discussionOrchestrationService.ts`: **1,906 lines** - Massive god class
- `enterpriseWebSocketHandler.ts`: **1,029 lines** - Complex WebSocket management
- `discussionSocket.ts`: **1,010 lines** - Socket.IO handler duplication
- `index.ts`: **805 lines** - Heavy server initialization

**2. Duplicate WebSocket Handlers**

- Both `EnterpriseWebSocketHandler` and Socket.IO handlers exist
- Code comments indicate `EnterpriseWebSocketHandler` is being phased out
- Duplicate authentication and message handling logic

**3. Manual Service Instantiation**

- Services created with `new` instead of dependency injection
- Direct instantiation: `new TurnStrategyService()`, `new ParticipantManagementService()`
- Tight coupling between components

**4. Memory Management Issues**

- Multiple Map-based caches without proper cleanup
- Timer management spread across multiple files
- Race condition detection but no systematic prevention

### 🟡 Moderate Issues

**5. Event-Driven Complexity**

- Event subscription logic scattered across multiple files
- No centralized event coordination
- Duplicate event handlers for similar functionality

**6. Missing Abstractions**

- No interface abstractions for core services
- Strategy pattern implementation incomplete
- Direct service dependencies instead of contracts

## 🛠 Refactoring Plan

### Phase 1: File Size Reduction (Week 1)

#### 1.1 Break Down DiscussionOrchestrationService (1,906 → ~300 lines)

**Current State:**

```typescript
// discussionOrchestrationService.ts - 1,906 lines
export class DiscussionOrchestrationService extends EventEmitter {
  // All responsibilities mixed together:
  // - Discussion lifecycle management
  // - Turn management
  // - Participant management
  // - Message orchestration
  // - Cleanup and memory management
  // - Event handling
  // - Rate limiting
  // - Timer management
}
```

**Proposed Structure:**

```typescript
// Core service (300 lines)
src/services/discussionOrchestrationService.ts

// Extract into separate services:
src/services/discussion/
├── discussionLifecycleService.ts     // Create, start, end discussions
├── turnManagementService.ts          // Turn advancement logic
├── participantManagementService.ts   // Add/remove participants
├── messageOrchestrationService.ts    // Message handling
└── discussionCleanupService.ts       // Cleanup and memory management
```

**Example Implementation:**

```typescript
// src/services/discussion/discussionLifecycleService.ts
export interface IDiscussionLifecycleService {
  createDiscussion(
    request: CreateDiscussionRequest,
    createdBy: string
  ): Promise<DiscussionOrchestrationResult>;
  startDiscussion(discussionId: string, userId: string): Promise<DiscussionOrchestrationResult>;
  endDiscussion(discussionId: string, userId: string): Promise<DiscussionOrchestrationResult>;
  pauseDiscussion(discussionId: string, userId: string): Promise<DiscussionOrchestrationResult>;
}

export class DiscussionLifecycleService implements IDiscussionLifecycleService {
  constructor(
    private discussionService: DiscussionService,
    private eventBusService: EventBusService,
    private turnStrategyService: ITurnStrategyService
  ) {}

  async createDiscussion(
    request: CreateDiscussionRequest,
    createdBy: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      // Validate turn strategy configuration
      const validation = this.turnStrategyService.validateStrategyConfig(
        request.turnStrategy.strategy,
        request.turnStrategy
      );

      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid turn strategy configuration: ${validation.errors.join(', ')}`,
        };
      }

      // Create discussion through shared service
      const discussion = await this.discussionService.createDiscussion({
        ...request,
        createdBy,
        status: DiscussionStatus.DRAFT,
      });

      // Emit lifecycle event
      await this.eventBusService.publish('discussion.lifecycle.created', {
        discussionId: discussion.id,
        createdBy,
        timestamp: new Date().toISOString(),
      });

      return { success: true, data: discussion };
    } catch (error) {
      logger.error('Failed to create discussion', { error: error.message, request });
      return { success: false, error: error.message };
    }
  }

  // Additional lifecycle methods...
}
```

```typescript
// src/services/discussion/turnManagementService.ts
export interface ITurnManagementService {
  advanceTurn(discussionId: string): Promise<DiscussionOrchestrationResult>;
  canParticipantTakeTurn(discussionId: string, participantId: string): Promise<boolean>;
  setTurnTimer(discussionId: string, timeoutMs: number): void;
  clearTurnTimer(discussionId: string): void;
}

export class TurnManagementService implements ITurnManagementService {
  private turnTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private discussionService: DiscussionService,
    private turnStrategyService: ITurnStrategyService,
    private eventBusService: EventBusService
  ) {}

  async advanceTurn(discussionId: string): Promise<DiscussionOrchestrationResult> {
    try {
      const discussion = await this.discussionService.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      const participants = await this.discussionService.getParticipants(discussionId);
      const turnResult = await this.turnStrategyService.advanceTurn(
        discussion,
        participants,
        discussion.turnStrategy
      );

      if (!turnResult.success) {
        return { success: false, error: turnResult.error };
      }

      const updatedDiscussion = await this.discussionService.updateDiscussion(discussionId, {
        currentTurn: turnResult.nextParticipantId,
        turnCount: (discussion.turnCount || 0) + 1,
        lastActivity: new Date(),
      });

      // Emit turn advancement event
      await this.eventBusService.publish('discussion.turn.advanced', {
        discussionId,
        previousParticipant: discussion.currentTurn,
        nextParticipant: turnResult.nextParticipantId,
        turnCount: updatedDiscussion.turnCount,
      });

      return { success: true, data: turnResult };
    } catch (error) {
      logger.error('Failed to advance turn', { error: error.message, discussionId });
      return { success: false, error: error.message };
    }
  }

  setTurnTimer(discussionId: string, timeoutMs: number): void {
    this.clearTurnTimer(discussionId);

    const timer = setTimeout(async () => {
      logger.info('Turn timeout reached', { discussionId });
      await this.advanceTurn(discussionId);
    }, timeoutMs);

    this.turnTimers.set(discussionId, timer);
  }

  clearTurnTimer(discussionId: string): void {
    const timer = this.turnTimers.get(discussionId);
    if (timer) {
      clearTimeout(timer);
      this.turnTimers.delete(discussionId);
    }
  }

  // Additional turn management methods...
}
```

#### 1.2 Consolidate WebSocket Handlers (1,029 + 1,010 → 400 lines)

**Current Duplication:**

```typescript
// enterpriseWebSocketHandler.ts - 1,029 lines (being deprecated)
export class EnterpriseWebSocketHandler extends EventEmitter {
  // Complex WebSocket logic with authentication
}

// discussionSocket.ts - 1,010 lines
export function setupWebSocketHandlers(io: SocketIOServer, orchestrationService) {
  // Duplicate authentication and message handling
}
```

**Proposed Consolidation:**

```typescript
// Remove enterpriseWebSocketHandler.ts completely
// Consolidate into:
src/websocket/
├── socketIOHandler.ts               // Main Socket.IO logic (400 lines)
├── handlers/
│   ├── discussionHandler.ts         // Discussion-specific events
│   ├── chatHandler.ts              // User chat events
│   └── authHandler.ts              // Authentication logic
└── middleware/
    └── socketAuthMiddleware.ts      // Centralized auth middleware
```

**Example Implementation:**

```typescript
// src/websocket/socketIOHandler.ts
export class SocketIOHandler {
  private io: SocketIOServer;
  private handlers: Map<string, ISocketHandler> = new Map();

  constructor(
    io: SocketIOServer,
    private eventBusService: EventBusService,
    private orchestrationService: DiscussionOrchestrationService
  ) {
    this.io = io;
    this.setupMiddleware();
    this.setupHandlers();
  }

  private setupMiddleware(): void {
    // Centralized authentication middleware
    this.io.use(createSocketAuthMiddleware(this.eventBusService));
  }

  private setupHandlers(): void {
    this.handlers.set('discussion', new DiscussionHandler(this.orchestrationService));
    this.handlers.set('chat', new ChatHandler(this.eventBusService));
    this.handlers.set('auth', new AuthHandler(this.eventBusService));

    this.io.on('connection', (socket) => {
      logger.info('Socket.IO client connected', {
        socketId: socket.id,
        userId: socket.data.user?.userId,
      });

      // Register all handlers
      this.handlers.forEach((handler, name) => {
        handler.register(socket);
      });

      socket.on('disconnect', () => {
        logger.info('Socket.IO client disconnected', { socketId: socket.id });
        this.handlers.forEach((handler) => handler.unregister(socket));
      });
    });
  }
}
```

```typescript
// src/websocket/handlers/discussionHandler.ts
export interface ISocketHandler {
  register(socket: Socket): void;
  unregister(socket: Socket): void;
}

export class DiscussionHandler implements ISocketHandler {
  constructor(private orchestrationService: DiscussionOrchestrationService) {}

  register(socket: Socket): void {
    socket.on('start_discussion', this.handleStartDiscussion.bind(this, socket));
    socket.on('join_discussion', this.handleJoinDiscussion.bind(this, socket));
    socket.on('send_message', this.handleSendMessage.bind(this, socket));
    socket.on('leave_discussion', this.handleLeaveDiscussion.bind(this, socket));
  }

  unregister(socket: Socket): void {
    socket.removeAllListeners('start_discussion');
    socket.removeAllListeners('join_discussion');
    socket.removeAllListeners('send_message');
    socket.removeAllListeners('leave_discussion');
  }

  private async handleStartDiscussion(socket: Socket, data: any): Promise<void> {
    try {
      const { discussionId } = data;
      const userId = socket.data.user.userId;

      const result = await this.orchestrationService.startDiscussion(discussionId, userId);

      if (result.success) {
        socket.join(`discussion:${discussionId}`);
        socket.emit('discussion_started', { discussionId, success: true });
        socket.to(`discussion:${discussionId}`).emit('discussion_started', { discussionId });
      } else {
        socket.emit('discussion_error', { error: result.error });
      }
    } catch (error) {
      logger.error('Error starting discussion', { error: error.message, socketId: socket.id });
      socket.emit('discussion_error', { error: 'Failed to start discussion' });
    }
  }

  // Additional handler methods...
}
```

```typescript
// src/websocket/middleware/socketAuthMiddleware.ts
export function createSocketAuthMiddleware(eventBusService: EventBusService) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Validate token through Security Gateway
      const authResponse = await validateSocketIOToken(token, eventBusService);

      if (!authResponse.valid) {
        return next(new Error(`Authentication failed: ${authResponse.reason}`));
      }

      // Store user info in socket data
      socket.data.user = {
        userId: authResponse.userId,
        sessionId: authResponse.sessionId,
        securityLevel: authResponse.securityLevel || 3,
        complianceFlags: authResponse.complianceFlags || [],
      };

      next();
    } catch (error) {
      next(new Error('Authentication service unavailable'));
    }
  };
}

async function validateSocketIOToken(
  token: string,
  eventBusService: EventBusService
): Promise<any> {
  const correlationId = `socketio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return new Promise(async (resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ valid: false, reason: 'Authentication service timeout' });
    }, 10000);

    const responseHandler = (response: any) => {
      clearTimeout(timeoutId);
      resolve(response);
    };

    // Use proper event subscription pattern
    await eventBusService.subscribeOnce('security.auth.response', responseHandler, {
      filter: { correlationId },
    });

    await eventBusService.publish('security.auth.validate', {
      token,
      service: 'discussion-orchestration',
      operation: 'socketio_auth',
      correlationId,
      timestamp: new Date().toISOString(),
    });
  });
}
```

#### 1.3 Slim Down Main Server (805 → 200 lines)

**Current Monolithic Server:**

```typescript
// index.ts - 805 lines
class DiscussionOrchestrationServer extends BaseService {
  // Everything mixed together:
  // - Server configuration
  // - Middleware setup
  // - Route definitions
  // - Service initialization
  // - Event subscriptions
  // - WebSocket setup
  // - Health checks
  // - Debug endpoints
}
```

**Proposed Structure:**

```typescript
// Extract into:
src/server/
├── discussionServer.ts              // Main server class (200 lines)
├── config/
│   ├── serverConfig.ts             // Configuration management
│   └── middlewareSetup.ts          // Middleware setup
├── routes/
│   ├── healthRoutes.ts             // Health check routes
│   └── debugRoutes.ts              // Debug endpoints
└── startup/
    ├── serviceInitializer.ts       // Service dependency setup
    └── eventSubscriptions.ts       // Event bus subscriptions
```

**Example Implementation:**

```typescript
// src/server/discussionServer.ts
export class DiscussionOrchestrationServer extends BaseService {
  private orchestrationService: DiscussionOrchestrationService;
  private socketIOHandler: SocketIOHandler;
  private serviceInitializer: ServiceInitializer;

  constructor() {
    super({
      name: 'discussion-orchestration',
      port: config.discussionOrchestration.port || 3005,
      enableEnterpriseEventBus: true,
      enableWebSocket: true,
    });

    this.serviceInitializer = new ServiceInitializer(this.databaseService, this.eventBusService);
  }

  protected async initialize(): Promise<void> {
    // Initialize services through service initializer
    await this.serviceInitializer.initializeServices();
    this.orchestrationService = this.serviceInitializer.getOrchestrationService();

    // Subscribe to events
    await setupEventSubscriptions(this.eventBusService, this.orchestrationService);

    logger.info('Discussion Orchestration Service initialized');
  }

  protected setupCustomMiddleware(): void {
    setupMiddleware(this.app);
  }

  protected async setupRoutes(): Promise<void> {
    setupHealthRoutes(this.app, this.orchestrationService);
    setupDebugRoutes(this.app, this.orchestrationService);
  }

  public async start(): Promise<void> {
    await super.start();

    // Setup Socket.IO after server is created
    this.socketIOHandler = new SocketIOHandler(
      this.createSocketIOServer(),
      this.eventBusService,
      this.orchestrationService
    );

    logger.info('Discussion Orchestration Service started', {
      port: this.config.port,
      websocketEnabled: true,
    });
  }

  private createSocketIOServer(): SocketIOServer {
    const io = new SocketIOServer({
      cors: { origin: false },
    });

    io.attach(this.server, {
      cors: { origin: false },
      transports: ['websocket', 'polling'],
    });

    return io;
  }

  protected async cleanup(): Promise<void> {
    if (this.orchestrationService) {
      await this.orchestrationService.cleanup();
    }
    await super.cleanup();
  }
}
```

```typescript
// src/server/startup/serviceInitializer.ts
export class ServiceInitializer {
  private container: ServiceContainer;

  constructor(
    private databaseService: DatabaseService,
    private eventBusService: EventBusService
  ) {
    this.container = new ServiceContainer();
    this.registerServices();
  }

  private registerServices(): void {
    // Register core services
    this.container.register(
      'personaService',
      () =>
        new PersonaService({
          databaseService: this.databaseService,
          eventBusService: this.eventBusService,
          cacheConfig: {
            redis: getDatabaseConnectionString(
              'discussion-orchestration',
              'redis',
              'redis-application'
            ),
            ttl: 300,
            securityLevel: 3,
          },
        })
    );

    this.container.register(
      'discussionService',
      () =>
        new DiscussionService({
          databaseService: this.databaseService,
          eventBusService: this.eventBusService,
          personaService: this.container.resolve('personaService'),
          enableRealTimeEvents: true,
          enableAnalytics: false,
          auditMode: 'comprehensive',
        })
    );

    // Register orchestration services
    this.container.register('turnStrategyService', () => new TurnStrategyService());

    this.container.register(
      'discussionLifecycleService',
      () =>
        new DiscussionLifecycleService(
          this.container.resolve('discussionService'),
          this.eventBusService,
          this.container.resolve('turnStrategyService')
        )
    );

    this.container.register(
      'turnManagementService',
      () =>
        new TurnManagementService(
          this.container.resolve('discussionService'),
          this.container.resolve('turnStrategyService'),
          this.eventBusService
        )
    );

    this.container.register(
      'participantManagementService',
      () =>
        new ParticipantManagementService(
          this.container.resolve('discussionService'),
          this.eventBusService
        )
    );

    this.container.register(
      'messageOrchestrationService',
      () =>
        new MessageOrchestrationService(
          this.container.resolve('discussionService'),
          this.eventBusService
        )
    );

    this.container.register(
      'discussionCleanupService',
      () => new DiscussionCleanupService(this.container.resolve('discussionService'))
    );

    // Register main orchestration service
    this.container.register(
      'orchestrationService',
      () =>
        new DiscussionOrchestrationService(
          this.container.resolve('discussionLifecycleService'),
          this.container.resolve('turnManagementService'),
          this.container.resolve('participantManagementService'),
          this.container.resolve('messageOrchestrationService'),
          this.container.resolve('discussionCleanupService'),
          this.eventBusService
        )
    );
  }

  async initializeServices(): Promise<void> {
    // Initialize services that need async setup
    const personaService = this.container.resolve('personaService');
    await personaService.initialize();

    const discussionService = this.container.resolve('discussionService');
    await discussionService.initialize();
  }

  getOrchestrationService(): DiscussionOrchestrationService {
    return this.container.resolve('orchestrationService');
  }
}
```

```typescript
// src/server/routes/healthRoutes.ts
export function setupHealthRoutes(
  app: Express,
  orchestrationService: DiscussionOrchestrationService
): void {
  app.get('/api/v1/info', (req, res) => {
    res.json({
      service: 'discussion-orchestration',
      version: process.env.npm_package_version || '1.0.0',
      description:
        'UAIP Discussion Orchestration Service - Manages discussion lifecycle, turn strategies, and real-time coordination',
      features: [
        'Discussion lifecycle management',
        'Multiple turn strategies (Round Robin, Moderated, Context Aware)',
        'Real-time WebSocket communication',
        'Event-driven architecture',
        'Comprehensive turn management',
      ],
      endpoints: {
        websocket: '/socket.io',
        conversationIntelligence: '/socket.io/conversation-intelligence',
        health: '/health',
        info: '/api/v1/info',
      },
    });
  });

  app.get('/health', async (req, res) => {
    try {
      const status = orchestrationService.getStatus();
      const healthy = await orchestrationService.checkHealth();

      res.status(healthy ? 200 : 503).json({
        status: healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        ...status,
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
}
```

### Phase 2: Dependency Injection (Week 2)

#### 2.1 Create Service Container

**Current Manual Instantiation:**

```typescript
// Multiple places with direct instantiation
this.turnStrategyService = new TurnStrategyService();
const participantManagementService = new ParticipantManagementService(
  (this.discussionService as any).databaseService
);
```

**Proposed Service Container:**

```typescript
// src/container/serviceContainer.ts
export interface ServiceFactory<T = any> {
  (): T;
}

export interface ServiceRegistration<T = any> {
  factory: ServiceFactory<T>;
  singleton: boolean;
  instance?: T;
}

export class ServiceContainer {
  private services = new Map<string, ServiceRegistration>();
  private scopes = new WeakMap<object, Map<string, any>>();

  register<T>(
    name: string,
    factory: ServiceFactory<T>,
    options: { singleton?: boolean } = { singleton: true }
  ): void {
    this.services.set(name, {
      factory,
      singleton: options.singleton ?? true,
    });
  }

  resolve<T>(name: string, scope?: object): T {
    const registration = this.services.get(name);
    if (!registration) {
      throw new Error(`Service '${name}' not registered`);
    }

    // Handle singleton services
    if (registration.singleton) {
      if (!registration.instance) {
        registration.instance = registration.factory();
      }
      return registration.instance as T;
    }

    // Handle scoped services
    if (scope) {
      let scopedServices = this.scopes.get(scope);
      if (!scopedServices) {
        scopedServices = new Map();
        this.scopes.set(scope, scopedServices);
      }

      if (!scopedServices.has(name)) {
        scopedServices.set(name, registration.factory());
      }
      return scopedServices.get(name) as T;
    }

    // Create new instance for transient services
    return registration.factory() as T;
  }

  createScope(): ServiceScope {
    return new ServiceScope(this);
  }

  isRegistered(name: string): boolean {
    return this.services.has(name);
  }

  clear(): void {
    this.services.clear();
    this.scopes = new WeakMap();
  }
}

export class ServiceScope {
  private scopeKey = {};

  constructor(private container: ServiceContainer) {}

  resolve<T>(name: string): T {
    return this.container.resolve<T>(name, this.scopeKey);
  }

  dispose(): void {
    // Cleanup scoped services if they implement IDisposable
    const scopedServices = (this.container as any).scopes.get(this.scopeKey);
    if (scopedServices) {
      for (const [name, instance] of scopedServices) {
        if (instance && typeof instance.dispose === 'function') {
          instance.dispose();
        }
      }
      (this.container as any).scopes.delete(this.scopeKey);
    }
  }
}

// Usage example
export function createServiceContainer(): ServiceContainer {
  const container = new ServiceContainer();

  // Register services with proper dependency injection
  container.register('config', () => config);

  container.register(
    'turnStrategyService',
    () => new TurnStrategyService(container.resolve('config'))
  );

  container.register(
    'discussionLifecycleService',
    () =>
      new DiscussionLifecycleService(
        container.resolve('discussionService'),
        container.resolve('eventBusService'),
        container.resolve('turnStrategyService')
      )
  );

  return container;
}
```

#### 2.2 Service Interfaces

**Current Concrete Dependencies:**

```typescript
// Direct coupling to concrete classes
constructor(
  discussionService: DiscussionService,
  eventBusService: EventBusService
) {}
```

**Proposed Interface-Based Dependencies:**

```typescript
// src/interfaces/services/ITurnStrategyService.ts
export interface ITurnStrategyService {
  validateStrategyConfig(strategy: string, config: TurnStrategyConfig): ValidationResult;
  advanceTurn(
    discussion: Discussion,
    participants: DiscussionParticipant[],
    config: TurnStrategyConfig
  ): Promise<TurnResult>;
  canParticipantTakeTurn(
    discussion: Discussion,
    participant: DiscussionParticipant,
    config: TurnStrategyConfig
  ): Promise<boolean>;
  getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[],
    config: TurnStrategyConfig
  ): Promise<DiscussionParticipant | null>;
  resetStrategy(discussionId: string): void;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface TurnResult {
  success: boolean;
  nextParticipantId?: string;
  error?: string;
  metadata?: any;
}
```

```typescript
// src/interfaces/services/IParticipantManagementService.ts
export interface IParticipantManagementService {
  addParticipant(
    discussionId: string,
    participantData: AddParticipantRequest
  ): Promise<DiscussionOrchestrationResult>;
  removeParticipant(
    discussionId: string,
    participantId: string,
    removedBy: string
  ): Promise<DiscussionOrchestrationResult>;
  verifyParticipantAccess(discussionId: string, participantId: string): Promise<boolean>;
  getActiveParticipants(discussionId: string): Promise<DiscussionParticipant[]>;
  updateParticipantStatus(
    discussionId: string,
    participantId: string,
    status: ParticipantStatus
  ): Promise<void>;
}

export interface AddParticipantRequest {
  agentId?: string;
  userId?: string;
  role: ParticipantRole;
  permissions?: string[];
  metadata?: any;
}
```

```typescript
// src/interfaces/services/IDiscussionLifecycleService.ts
export interface IDiscussionLifecycleService {
  createDiscussion(
    request: CreateDiscussionRequest,
    createdBy: string
  ): Promise<DiscussionOrchestrationResult>;
  startDiscussion(discussionId: string, userId: string): Promise<DiscussionOrchestrationResult>;
  endDiscussion(discussionId: string, userId: string): Promise<DiscussionOrchestrationResult>;
  pauseDiscussion(discussionId: string, userId: string): Promise<DiscussionOrchestrationResult>;
  resumeDiscussion(discussionId: string, userId: string): Promise<DiscussionOrchestrationResult>;
  archiveDiscussion(discussionId: string, userId: string): Promise<DiscussionOrchestrationResult>;
}
```

```typescript
// src/interfaces/services/IMessageOrchestrationService.ts
export interface IMessageOrchestrationService {
  sendMessage(
    discussionId: string,
    participantId: string,
    content: string,
    messageType?: string,
    metadata?: any
  ): Promise<DiscussionOrchestrationResult>;
  broadcastMessage(discussionId: string, message: DiscussionMessage): Promise<void>;
  getDiscussionMessages(
    discussionId: string,
    options?: MessageQueryOptions
  ): Promise<DiscussionMessage[]>;
  validateMessageContent(content: string, messageType: string): ValidationResult;
  enhanceMessage(message: DiscussionMessage): Promise<DiscussionMessage>;
}

export interface MessageQueryOptions {
  limit?: number;
  offset?: number;
  fromDate?: Date;
  toDate?: Date;
  participantId?: string;
  messageType?: string;
}
```

**Implementation with Interfaces:**

```typescript
// src/services/discussion/turnManagementService.ts
export class TurnManagementService implements ITurnManagementService {
  private turnTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private discussionService: IDiscussionService, // Interface dependency
    private turnStrategyService: ITurnStrategyService, // Interface dependency
    private eventBusService: IEventBusService // Interface dependency
  ) {}

  async advanceTurn(discussionId: string): Promise<DiscussionOrchestrationResult> {
    try {
      const discussion = await this.discussionService.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      const participants = await this.discussionService.getParticipants(discussionId);
      const turnResult = await this.turnStrategyService.advanceTurn(
        discussion,
        participants,
        discussion.turnStrategy
      );

      if (!turnResult.success) {
        return { success: false, error: turnResult.error };
      }

      const updatedDiscussion = await this.discussionService.updateDiscussion(discussionId, {
        currentTurn: turnResult.nextParticipantId,
        turnCount: (discussion.turnCount || 0) + 1,
        lastActivity: new Date(),
      });

      // Emit turn advancement event
      await this.eventBusService.publish('discussion.turn.advanced', {
        discussionId,
        previousParticipant: discussion.currentTurn,
        nextParticipant: turnResult.nextParticipantId,
        turnCount: updatedDiscussion.turnCount,
        timestamp: new Date().toISOString(),
      });

      return { success: true, data: turnResult };
    } catch (error) {
      logger.error('Failed to advance turn', { error: error.message, discussionId });
      return { success: false, error: error.message };
    }
  }

  // Additional methods...
}
```

### Phase 3: Event System Consolidation (Week 3)

#### 3.1 Centralized Event Coordination

**Current Scattered Events:**

```typescript
// Events scattered across multiple files
await this.eventBusService.publish('discussion.events', event);
await this.eventBusService.publish('discussion.agent.message', data);
await this.eventBusService.publish('orchestration.control', event);
// ... many more scattered throughout codebase
```

**Proposed Event Coordination:**

```typescript
// src/events/eventCoordinator.ts
export interface IEventCoordinator {
  emitDiscussionEvent(event: DiscussionEvent): Promise<void>;
  emitParticipantEvent(event: ParticipantEvent): Promise<void>;
  emitMessageEvent(event: MessageEvent): Promise<void>;
  emitTurnEvent(event: TurnEvent): Promise<void>;
  registerHandler<T extends BaseEvent>(eventType: string, handler: EventHandler<T>): void;
  unregisterHandler<T extends BaseEvent>(eventType: string, handler: EventHandler<T>): void;
}

export class EventCoordinator implements IEventCoordinator {
  private handlers = new Map<string, Set<EventHandler<any>>>();
  private middleware: EventMiddleware[] = [];

  constructor(private eventBusService: IEventBusService) {
    this.setupEventSubscriptions();
  }

  addMiddleware(middleware: EventMiddleware): void {
    this.middleware.push(middleware);
  }

  async emitDiscussionEvent(event: DiscussionEvent): Promise<void> {
    const processedEvent = await this.processEvent(event);

    // Emit to internal handlers
    await this.emitToHandlers(`discussion.${event.type}`, processedEvent);

    // Emit to event bus for other services
    await this.eventBusService.publish('discussion.events', processedEvent);

    logger.info('Discussion event emitted', {
      type: event.type,
      discussionId: event.discussionId,
      timestamp: event.timestamp,
    });
  }

  async emitParticipantEvent(event: ParticipantEvent): Promise<void> {
    const processedEvent = await this.processEvent(event);

    await this.emitToHandlers(`participant.${event.type}`, processedEvent);
    await this.eventBusService.publish('discussion.participant.events', processedEvent);

    logger.info('Participant event emitted', {
      type: event.type,
      discussionId: event.discussionId,
      participantId: event.participantId,
    });
  }

  async emitMessageEvent(event: MessageEvent): Promise<void> {
    const processedEvent = await this.processEvent(event);

    await this.emitToHandlers(`message.${event.type}`, processedEvent);
    await this.eventBusService.publish('discussion.message.events', processedEvent);

    logger.info('Message event emitted', {
      type: event.type,
      discussionId: event.discussionId,
      messageId: event.messageId,
    });
  }

  async emitTurnEvent(event: TurnEvent): Promise<void> {
    const processedEvent = await this.processEvent(event);

    await this.emitToHandlers(`turn.${event.type}`, processedEvent);
    await this.eventBusService.publish('discussion.turn.events', processedEvent);

    logger.info('Turn event emitted', {
      type: event.type,
      discussionId: event.discussionId,
      currentParticipant: event.currentParticipant,
    });
  }

  registerHandler<T extends BaseEvent>(eventType: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  unregisterHandler<T extends BaseEvent>(eventType: string, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  private async processEvent<T extends BaseEvent>(event: T): Promise<T> {
    let processedEvent = { ...event };

    // Apply middleware
    for (const middleware of this.middleware) {
      processedEvent = await middleware.process(processedEvent);
    }

    return processedEvent;
  }

  private async emitToHandlers<T extends BaseEvent>(eventType: string, event: T): Promise<void> {
    const handlers = this.handlers.get(eventType);
    if (!handlers) return;

    const promises = Array.from(handlers).map((handler) =>
      handler.handle(event).catch((error) =>
        logger.error('Event handler error', {
          eventType,
          error: error.message,
          handlerName: handler.constructor.name,
        })
      )
    );

    await Promise.allSettled(promises);
  }

  private setupEventSubscriptions(): void {
    // Subscribe to external events from other services
    this.eventBusService.subscribe('agent.discussion.response', async (event) => {
      await this.emitMessageEvent({
        type: 'agent_response_received',
        discussionId: event.discussionId,
        messageId: event.messageId,
        participantId: event.agentId,
        timestamp: new Date().toISOString(),
        data: event,
      });
    });

    this.eventBusService.subscribe('discussion.agent.message', async (event) => {
      await this.emitMessageEvent({
        type: 'agent_message_received',
        discussionId: event.discussionId,
        messageId: event.messageId,
        participantId: event.participantId,
        timestamp: new Date().toISOString(),
        data: event,
      });
    });
  }
}
```

```typescript
// src/events/eventTypes.ts
export interface BaseEvent {
  type: string;
  discussionId: string;
  timestamp: string;
  data?: any;
}

export interface DiscussionEvent extends BaseEvent {
  type: 'created' | 'started' | 'ended' | 'paused' | 'resumed' | 'archived';
  status: DiscussionStatus;
  createdBy?: string;
  participantCount?: number;
}

export interface ParticipantEvent extends BaseEvent {
  type: 'joined' | 'left' | 'status_changed' | 'permissions_updated';
  participantId: string;
  role?: ParticipantRole;
  status?: ParticipantStatus;
}

export interface MessageEvent extends BaseEvent {
  type: 'sent' | 'agent_response_received' | 'agent_message_received' | 'enhanced' | 'broadcast';
  messageId: string;
  participantId: string;
  messageType?: string;
  contentLength?: number;
}

export interface TurnEvent extends BaseEvent {
  type: 'advanced' | 'timeout' | 'skipped' | 'strategy_changed';
  currentParticipant?: string;
  previousParticipant?: string;
  nextParticipant?: string;
  turnCount?: number;
  strategy?: string;
}
```

```typescript
// src/events/handlers/discussionEventHandler.ts
export interface EventHandler<T extends BaseEvent> {
  handle(event: T): Promise<void>;
}

export class DiscussionEventHandler implements EventHandler<DiscussionEvent> {
  constructor(
    private cleanupService: IDiscussionCleanupService,
    private notificationService: INotificationService
  ) {}

  async handle(event: DiscussionEvent): Promise<void> {
    switch (event.type) {
      case 'created':
        await this.handleDiscussionCreated(event);
        break;
      case 'started':
        await this.handleDiscussionStarted(event);
        break;
      case 'ended':
        await this.handleDiscussionEnded(event);
        break;
      case 'archived':
        await this.handleDiscussionArchived(event);
        break;
    }
  }

  private async handleDiscussionCreated(event: DiscussionEvent): Promise<void> {
    logger.info('Discussion created', { discussionId: event.discussionId });

    // Schedule cleanup for draft discussions
    await this.cleanupService.scheduleDraftCleanup(event.discussionId, 24 * 60 * 60 * 1000); // 24 hours

    // Notify participants
    await this.notificationService.notifyDiscussionCreated(event);
  }

  private async handleDiscussionStarted(event: DiscussionEvent): Promise<void> {
    logger.info('Discussion started', { discussionId: event.discussionId });

    // Cancel draft cleanup
    await this.cleanupService.cancelDraftCleanup(event.discussionId);

    // Start activity monitoring
    await this.cleanupService.startActivityMonitoring(event.discussionId);
  }

  private async handleDiscussionEnded(event: DiscussionEvent): Promise<void> {
    logger.info('Discussion ended', { discussionId: event.discussionId });

    // Stop activity monitoring
    await this.cleanupService.stopActivityMonitoring(event.discussionId);

    // Schedule archive after 30 days
    await this.cleanupService.scheduleArchival(event.discussionId, 30 * 24 * 60 * 60 * 1000);
  }

  private async handleDiscussionArchived(event: DiscussionEvent): Promise<void> {
    logger.info('Discussion archived', { discussionId: event.discussionId });

    // Clean up all resources
    await this.cleanupService.cleanupDiscussionResources(event.discussionId);
  }
}
```

```typescript
// src/events/middleware/eventMiddleware.ts
export interface EventMiddleware {
  process<T extends BaseEvent>(event: T): Promise<T>;
}

export class EventValidationMiddleware implements EventMiddleware {
  async process<T extends BaseEvent>(event: T): Promise<T> {
    // Validate required fields
    if (!event.type) {
      throw new Error('Event type is required');
    }
    if (!event.discussionId) {
      throw new Error('Discussion ID is required');
    }
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
    }

    return event;
  }
}

export class EventAuditMiddleware implements EventMiddleware {
  async process<T extends BaseEvent>(event: T): Promise<T> {
    // Add audit metadata
    const auditedEvent = {
      ...event,
      data: {
        ...event.data,
        audit: {
          service: 'discussion-orchestration',
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          traceId: this.generateTraceId(),
        },
      },
    };

    // Log for audit trail
    logger.info('AUDIT: Event processed', {
      type: event.type,
      discussionId: event.discussionId,
      timestamp: event.timestamp,
      auditEvent: 'EVENT_PROCESSED',
      compliance: true,
    });

    return auditedEvent;
  }

  private generateTraceId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class EventEnrichmentMiddleware implements EventMiddleware {
  constructor(private discussionService: IDiscussionService) {}

  async process<T extends BaseEvent>(event: T): Promise<T> {
    try {
      // Enrich with discussion metadata
      const discussion = await this.discussionService.getDiscussion(event.discussionId);
      if (discussion) {
        return {
          ...event,
          data: {
            ...event.data,
            discussion: {
              title: discussion.title,
              status: discussion.status,
              strategy: discussion.turnStrategy?.strategy,
              participantCount: discussion.participants?.length || 0,
            },
          },
        };
      }
    } catch (error) {
      // Don't fail the event if enrichment fails
      logger.warn('Failed to enrich event', {
        eventType: event.type,
        discussionId: event.discussionId,
        error: error.message,
      });
    }

    return event;
  }
}
```

### Phase 4: Strategy Pattern Implementation (Week 4)

#### 4.1 Complete Strategy Abstraction

**Current Incomplete Strategy Pattern:**

```typescript
// Partial implementation in turnStrategyService.ts
export class TurnStrategyService {
  // Mixed strategy logic with service logic
  async advanceTurn(discussion, participants, config) {
    // Strategy selection hardcoded
    switch (config.strategy) {
      case 'round_robin':
        // Direct implementation
        break;
      case 'moderated':
        // Direct implementation
        break;
    }
  }
}
```

**Proposed Complete Strategy Pattern:**

```typescript
// src/strategies/base/IDiscussionStrategy.ts
export interface IDiscussionStrategy {
  readonly name: string;
  readonly description: string;
  readonly defaultConfig: Partial<TurnStrategyConfig>;

  validateConfig(config: TurnStrategyConfig): ValidationResult;
  initialize(discussion: Discussion, participants: DiscussionParticipant[]): Promise<void>;
  getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<DiscussionParticipant | null>;
  canParticipantTakeTurn(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<boolean>;
  onParticipantJoined(participant: DiscussionParticipant, discussion: Discussion): Promise<void>;
  onParticipantLeft(participant: DiscussionParticipant, discussion: Discussion): Promise<void>;
  onTurnCompleted(participant: DiscussionParticipant, discussion: Discussion): Promise<void>;
  cleanup(discussion: Discussion): Promise<void>;
}

export interface StrategyContext {
  discussionId: string;
  currentTurn?: string;
  turnCount: number;
  lastActivity: Date;
  metadata: Record<string, any>;
}
```

```typescript
// src/strategies/base/BaseDiscussionStrategy.ts
export abstract class BaseDiscussionStrategy implements IDiscussionStrategy {
  protected context: Map<string, StrategyContext> = new Map();

  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly defaultConfig: Partial<TurnStrategyConfig>;

  abstract getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<DiscussionParticipant | null>;

  validateConfig(config: TurnStrategyConfig): ValidationResult {
    const errors: string[] = [];

    // Common validation
    if (config.timeoutMs && (config.timeoutMs < 1000 || config.timeoutMs > 300000)) {
      errors.push('Timeout must be between 1 second and 5 minutes');
    }

    if (config.maxParticipants && (config.maxParticipants < 2 || config.maxParticipants > 50)) {
      errors.push('Maximum participants must be between 2 and 50');
    }

    // Strategy-specific validation
    const strategyErrors = this.validateStrategySpecificConfig(config);
    errors.push(...strategyErrors);

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  async initialize(discussion: Discussion, participants: DiscussionParticipant[]): Promise<void> {
    this.context.set(discussion.id, {
      discussionId: discussion.id,
      currentTurn: discussion.currentTurn,
      turnCount: discussion.turnCount || 0,
      lastActivity: discussion.lastActivity || new Date(),
      metadata: {},
    });

    logger.info(`${this.name} strategy initialized`, {
      discussionId: discussion.id,
      participantCount: participants.length,
    });
  }

  async canParticipantTakeTurn(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<boolean> {
    // Common checks
    if (participant.status !== 'active') {
      return false;
    }

    if (participant.permissions && !participant.permissions.includes('send_message')) {
      return false;
    }

    // Strategy-specific checks
    return this.canParticipantTakeTurnStrategy(participant, discussion);
  }

  async onParticipantJoined(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void> {
    logger.info(`Participant joined discussion with ${this.name} strategy`, {
      discussionId: discussion.id,
      participantId: participant.id,
      role: participant.role,
    });

    await this.onParticipantJoinedStrategy(participant, discussion);
  }

  async onParticipantLeft(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void> {
    logger.info(`Participant left discussion with ${this.name} strategy`, {
      discussionId: discussion.id,
      participantId: participant.id,
    });

    await this.onParticipantLeftStrategy(participant, discussion);
  }

  async onTurnCompleted(participant: DiscussionParticipant, discussion: Discussion): Promise<void> {
    const context = this.context.get(discussion.id);
    if (context) {
      context.turnCount++;
      context.lastActivity = new Date();
    }

    await this.onTurnCompletedStrategy(participant, discussion);
  }

  async cleanup(discussion: Discussion): Promise<void> {
    this.context.delete(discussion.id);
    logger.info(`${this.name} strategy cleaned up`, { discussionId: discussion.id });
  }

  protected getContext(discussionId: string): StrategyContext | undefined {
    return this.context.get(discussionId);
  }

  protected updateContext(discussionId: string, updates: Partial<StrategyContext>): void {
    const context = this.context.get(discussionId);
    if (context) {
      Object.assign(context, updates);
    }
  }

  // Abstract methods for strategy-specific implementation
  protected abstract validateStrategySpecificConfig(config: TurnStrategyConfig): string[];
  protected abstract canParticipantTakeTurnStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<boolean>;
  protected abstract onParticipantJoinedStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void>;
  protected abstract onParticipantLeftStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void>;
  protected abstract onTurnCompletedStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void>;
}
```

**Strategy Implementations:**

```typescript
// src/strategies/implementations/RoundRobinStrategy.ts
export class RoundRobinStrategy extends BaseDiscussionStrategy {
  readonly name = 'round_robin';
  readonly description = 'Participants take turns in sequential order';
  readonly defaultConfig: Partial<TurnStrategyConfig> = {
    timeoutMs: 30000,
    allowSkipping: true,
    maxConsecutiveTurns: 1,
  };

  async getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<DiscussionParticipant | null> {
    const activeParticipants = participants.filter((p) => p.status === 'active');
    if (activeParticipants.length === 0) {
      return null;
    }

    const context = this.getContext(discussion.id);
    if (!discussion.currentTurn || !context) {
      // Start with first participant
      return activeParticipants[0];
    }

    // Find current participant index
    const currentIndex = activeParticipants.findIndex((p) => p.id === discussion.currentTurn);
    if (currentIndex === -1) {
      // Current participant not found, start from beginning
      return activeParticipants[0];
    }

    // Get next participant in round-robin fashion
    const nextIndex = (currentIndex + 1) % activeParticipants.length;
    return activeParticipants[nextIndex];
  }

  protected validateStrategySpecificConfig(config: TurnStrategyConfig): string[] {
    const errors: string[] = [];

    if (config.maxConsecutiveTurns && config.maxConsecutiveTurns !== 1) {
      errors.push('Round robin strategy only supports maxConsecutiveTurns = 1');
    }

    return errors;
  }

  protected async canParticipantTakeTurnStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<boolean> {
    // In round robin, only the next participant can take a turn
    const nextParticipant = await this.getNextParticipant(discussion, [participant]);
    return nextParticipant?.id === participant.id;
  }

  protected async onParticipantJoinedStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void> {
    // Round robin doesn't need special handling for new participants
    // They'll be included in the rotation automatically
  }

  protected async onParticipantLeftStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void> {
    // If the leaving participant was current, advance to next
    if (discussion.currentTurn === participant.id) {
      const context = this.getContext(discussion.id);
      if (context) {
        // Reset current turn so getNextParticipant will select properly
        context.currentTurn = undefined;
      }
    }
  }

  protected async onTurnCompletedStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void> {
    // Update context to track turn completion
    this.updateContext(discussion.id, {
      currentTurn: participant.id,
      lastActivity: new Date(),
    });
  }
}
```

```typescript
// src/strategies/implementations/ContextAwareStrategy.ts
export class ContextAwareStrategy extends BaseDiscussionStrategy {
  readonly name = 'context_aware';
  readonly description = 'Selects next participant based on conversation context and expertise';
  readonly defaultConfig: Partial<TurnStrategyConfig> = {
    timeoutMs: 45000,
    allowSkipping: false,
    contextAnalysisEnabled: true,
    expertiseWeight: 0.7,
    engagementWeight: 0.3,
  };

  private participantScores: Map<string, Map<string, number>> = new Map(); // discussionId -> participantId -> score

  async getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<DiscussionParticipant | null> {
    const activeParticipants = participants.filter((p) => p.status === 'active');
    if (activeParticipants.length === 0) {
      return null;
    }

    // Calculate scores for each participant based on context
    const scores = await this.calculateParticipantScores(discussion, activeParticipants);

    // Select participant with highest score
    let bestParticipant = activeParticipants[0];
    let bestScore = scores.get(bestParticipant.id) || 0;

    for (const participant of activeParticipants) {
      const score = scores.get(participant.id) || 0;
      if (score > bestScore) {
        bestScore = score;
        bestParticipant = participant;
      }
    }

    logger.info('Context-aware participant selection', {
      discussionId: discussion.id,
      selectedParticipant: bestParticipant.id,
      score: bestScore,
      scores: Object.fromEntries(scores),
    });

    return bestParticipant;
  }

  private async calculateParticipantScores(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    const config = discussion.turnStrategy;

    for (const participant of participants) {
      let score = 0;

      // Expertise relevance score
      if (config.expertiseWeight) {
        const expertiseScore = await this.calculateExpertiseScore(participant, discussion);
        score += expertiseScore * config.expertiseWeight;
      }

      // Engagement score
      if (config.engagementWeight) {
        const engagementScore = await this.calculateEngagementScore(participant, discussion);
        score += engagementScore * config.engagementWeight;
      }

      // Recency penalty (avoid same participant consecutively)
      if (discussion.currentTurn === participant.id) {
        score *= 0.1; // Heavy penalty for consecutive turns
      }

      scores.set(participant.id, score);
    }

    return scores;
  }

  private async calculateExpertiseScore(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<number> {
    // This would integrate with agent intelligence service to analyze
    // participant expertise vs current discussion topics

    // Placeholder implementation
    const baseScore = participant.role === 'expert' ? 0.8 : 0.5;

    // Adjust based on recent contribution relevance
    const context = this.getContext(discussion.id);
    const participantScores = this.participantScores.get(discussion.id);

    if (context && participantScores) {
      const historicalScore = participantScores.get(participant.id) || 0.5;
      return (baseScore + historicalScore) / 2;
    }

    return baseScore;
  }

  private async calculateEngagementScore(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<number> {
    // Calculate based on recent participation frequency and quality
    const context = this.getContext(discussion.id);
    if (!context || !context.metadata.participantStats) {
      return 0.5; // Default score
    }

    const stats = context.metadata.participantStats[participant.id];
    if (!stats) {
      return 0.7; // Favor new participants
    }

    // Score based on time since last contribution
    const timeSinceLastContribution = Date.now() - (stats.lastContribution || 0);
    const hoursAgo = timeSinceLastContribution / (1000 * 60 * 60);

    if (hoursAgo > 2) return 0.9; // High score for participants who haven't contributed recently
    if (hoursAgo > 1) return 0.7;
    if (hoursAgo > 0.5) return 0.5;
    return 0.2; // Low score for very recent contributors
  }

  protected validateStrategySpecificConfig(config: TurnStrategyConfig): string[] {
    const errors: string[] = [];

    if (
      config.expertiseWeight !== undefined &&
      (config.expertiseWeight < 0 || config.expertiseWeight > 1)
    ) {
      errors.push('Expertise weight must be between 0 and 1');
    }

    if (
      config.engagementWeight !== undefined &&
      (config.engagementWeight < 0 || config.engagementWeight > 1)
    ) {
      errors.push('Engagement weight must be between 0 and 1');
    }

    if (
      config.expertiseWeight &&
      config.engagementWeight &&
      config.expertiseWeight + config.engagementWeight > 1
    ) {
      errors.push('Combined expertise and engagement weights cannot exceed 1');
    }

    return errors;
  }

  protected async canParticipantTakeTurnStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<boolean> {
    // Context-aware strategy allows any active participant to take turns
    // The selection logic in getNextParticipant handles prioritization
    return true;
  }

  protected async onParticipantJoinedStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void> {
    // Initialize participant scores
    if (!this.participantScores.has(discussion.id)) {
      this.participantScores.set(discussion.id, new Map());
    }

    const scores = this.participantScores.get(discussion.id)!;
    scores.set(participant.id, 0.6); // Default score for new participants

    // Update context metadata
    const context = this.getContext(discussion.id);
    if (context) {
      if (!context.metadata.participantStats) {
        context.metadata.participantStats = {};
      }
      context.metadata.participantStats[participant.id] = {
        joinedAt: Date.now(),
        messageCount: 0,
        lastContribution: null,
      };
    }
  }

  protected async onParticipantLeftStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void> {
    // Clean up participant data
    const scores = this.participantScores.get(discussion.id);
    if (scores) {
      scores.delete(participant.id);
    }

    const context = this.getContext(discussion.id);
    if (context && context.metadata.participantStats) {
      delete context.metadata.participantStats[participant.id];
    }
  }

  protected async onTurnCompletedStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void> {
    // Update participant statistics
    const context = this.getContext(discussion.id);
    if (context && context.metadata.participantStats) {
      const stats = context.metadata.participantStats[participant.id];
      if (stats) {
        stats.messageCount++;
        stats.lastContribution = Date.now();
      }
    }

    // Update participant score based on contribution quality
    // This would integrate with conversation enhancement service
    const scores = this.participantScores.get(discussion.id);
    if (scores) {
      const currentScore = scores.get(participant.id) || 0.5;
      // Slightly increase score for active participation
      scores.set(participant.id, Math.min(1.0, currentScore + 0.1));
    }
  }

  async cleanup(discussion: Discussion): Promise<void> {
    this.participantScores.delete(discussion.id);
    await super.cleanup(discussion);
  }
}
```

```typescript
// src/strategies/implementations/AdaptiveStrategy.ts
export class AdaptiveStrategy extends BaseDiscussionStrategy {
  readonly name = 'adaptive';
  readonly description =
    'Dynamically adapts turn-taking based on discussion flow and participant behavior';
  readonly defaultConfig: Partial<TurnStrategyConfig> = {
    timeoutMs: 60000,
    allowSkipping: true,
    adaptationEnabled: true,
    flowAnalysisDepth: 10,
    behaviorLearningEnabled: true,
  };

  private adaptationHistory: Map<string, AdaptationRecord[]> = new Map();

  async getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<DiscussionParticipant | null> {
    const activeParticipants = participants.filter((p) => p.status === 'active');
    if (activeParticipants.length === 0) {
      return null;
    }

    // Analyze current discussion flow
    const flowAnalysis = await this.analyzeDiscussionFlow(discussion);

    // Select strategy based on current situation
    const adaptedStrategy = this.selectAdaptedStrategy(flowAnalysis, discussion);

    // Record adaptation decision
    this.recordAdaptation(discussion.id, {
      timestamp: new Date(),
      flowAnalysis,
      selectedStrategy: adaptedStrategy,
      participants: activeParticipants.map((p) => p.id),
    });

    // Apply selected strategy
    return this.applyAdaptedStrategy(adaptedStrategy, discussion, activeParticipants);
  }

  private async analyzeDiscussionFlow(discussion: Discussion): Promise<FlowAnalysis> {
    // This would integrate with conversation enhancement service
    // For now, simplified analysis based on recent activity

    const context = this.getContext(discussion.id);
    const recentActivity = context?.metadata.recentActivity || [];

    return {
      momentum: this.calculateMomentum(recentActivity),
      engagement: this.calculateEngagement(recentActivity),
      topicShifts: this.detectTopicShifts(recentActivity),
      participantDistribution: this.analyzeParticipantDistribution(recentActivity),
      conflictLevel: this.detectConflict(recentActivity),
    };
  }

  private selectAdaptedStrategy(flowAnalysis: FlowAnalysis, discussion: Discussion): string {
    // High engagement, balanced participation -> continue current pattern
    if (flowAnalysis.engagement > 0.7 && flowAnalysis.participantDistribution > 0.6) {
      return 'maintain';
    }

    // Low engagement -> encourage participation
    if (flowAnalysis.engagement < 0.3) {
      return 'encourage';
    }

    // Unbalanced participation -> rebalance
    if (flowAnalysis.participantDistribution < 0.4) {
      return 'rebalance';
    }

    // High conflict -> moderate
    if (flowAnalysis.conflictLevel > 0.6) {
      return 'moderate';
    }

    // Topic shift detected -> context-aware
    if (flowAnalysis.topicShifts > 2) {
      return 'context_aware';
    }

    return 'round_robin'; // Default
  }

  private async applyAdaptedStrategy(
    strategy: string,
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<DiscussionParticipant | null> {
    switch (strategy) {
      case 'maintain':
        return this.maintainCurrentPattern(discussion, participants);
      case 'encourage':
        return this.encourageParticipation(discussion, participants);
      case 'rebalance':
        return this.rebalanceParticipation(discussion, participants);
      case 'moderate':
        return this.moderateDiscussion(discussion, participants);
      case 'context_aware':
        return this.selectByContext(discussion, participants);
      default:
        return this.roundRobinSelection(discussion, participants);
    }
  }

  private maintainCurrentPattern(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): DiscussionParticipant | null {
    // Continue with the current successful pattern
    const context = this.getContext(discussion.id);
    const recentPattern = context?.metadata.successfulPattern;

    if (recentPattern) {
      return participants.find((p) => p.id === recentPattern.nextParticipant) || participants[0];
    }

    return participants[0];
  }

  private encourageParticipation(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): DiscussionParticipant | null {
    // Select participants who haven't contributed recently
    const context = this.getContext(discussion.id);
    const participantStats = context?.metadata.participantStats || {};

    const inactiveParticipants = participants.filter((p) => {
      const stats = participantStats[p.id];
      if (!stats) return true; // New participants

      const timeSinceLastContribution = Date.now() - (stats.lastContribution || 0);
      return timeSinceLastContribution > 300000; // 5 minutes
    });

    return inactiveParticipants.length > 0 ? inactiveParticipants[0] : participants[0];
  }

  private rebalanceParticipation(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): DiscussionParticipant | null {
    // Select participant with lowest contribution count
    const context = this.getContext(discussion.id);
    const participantStats = context?.metadata.participantStats || {};

    let leastActiveParticipant = participants[0];
    let lowestCount = participantStats[participants[0].id]?.messageCount || 0;

    for (const participant of participants) {
      const count = participantStats[participant.id]?.messageCount || 0;
      if (count < lowestCount) {
        lowestCount = count;
        leastActiveParticipant = participant;
      }
    }

    return leastActiveParticipant;
  }

  private moderateDiscussion(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): DiscussionParticipant | null {
    // Prefer moderators or neutral participants
    const moderators = participants.filter((p) => p.role === 'moderator');
    if (moderators.length > 0) {
      return moderators[0];
    }

    // Select participant least involved in recent conflict
    const context = this.getContext(discussion.id);
    const conflictParticipants = context?.metadata.conflictParticipants || new Set();

    const neutralParticipants = participants.filter((p) => !conflictParticipants.has(p.id));
    return neutralParticipants.length > 0 ? neutralParticipants[0] : participants[0];
  }

  private selectByContext(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): DiscussionParticipant | null {
    // Use context-aware strategy logic
    // This would integrate with the ContextAwareStrategy
    return participants[0]; // Simplified for example
  }

  private roundRobinSelection(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): DiscussionParticipant | null {
    // Standard round-robin logic
    if (!discussion.currentTurn) {
      return participants[0];
    }

    const currentIndex = participants.findIndex((p) => p.id === discussion.currentTurn);
    const nextIndex = (currentIndex + 1) % participants.length;
    return participants[nextIndex];
  }

  // Analysis helper methods
  private calculateMomentum(recentActivity: any[]): number {
    // Simplified momentum calculation
    return Math.min(1.0, recentActivity.length / 10);
  }

  private calculateEngagement(recentActivity: any[]): number {
    // Simplified engagement calculation
    const uniqueParticipants = new Set(recentActivity.map((a) => a.participantId)).size;
    return Math.min(1.0, uniqueParticipants / 5);
  }

  private detectTopicShifts(recentActivity: any[]): number {
    // Simplified topic shift detection
    return Math.floor(recentActivity.length / 5);
  }

  private analyzeParticipantDistribution(recentActivity: any[]): number {
    // Simplified distribution analysis
    const participantCounts = new Map();
    recentActivity.forEach((a) => {
      participantCounts.set(a.participantId, (participantCounts.get(a.participantId) || 0) + 1);
    });

    const counts = Array.from(participantCounts.values());
    const max = Math.max(...counts);
    const min = Math.min(...counts);

    return max > 0 ? min / max : 1.0;
  }

  private detectConflict(recentActivity: any[]): number {
    // Simplified conflict detection
    // This would analyze message sentiment and response patterns
    return 0.0; // Placeholder
  }

  private recordAdaptation(discussionId: string, record: AdaptationRecord): void {
    if (!this.adaptationHistory.has(discussionId)) {
      this.adaptationHistory.set(discussionId, []);
    }

    const history = this.adaptationHistory.get(discussionId)!;
    history.push(record);

    // Keep only recent history
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  // Required abstract method implementations
  protected validateStrategySpecificConfig(config: TurnStrategyConfig): string[] {
    const errors: string[] = [];

    if (
      config.flowAnalysisDepth !== undefined &&
      (config.flowAnalysisDepth < 1 || config.flowAnalysisDepth > 50)
    ) {
      errors.push('Flow analysis depth must be between 1 and 50');
    }

    return errors;
  }

  protected async canParticipantTakeTurnStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<boolean> {
    // Adaptive strategy allows flexible turn-taking
    return true;
  }

  protected async onParticipantJoinedStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void> {
    // Initialize tracking for new participant
    const context = this.getContext(discussion.id);
    if (context) {
      if (!context.metadata.participantStats) {
        context.metadata.participantStats = {};
      }
      context.metadata.participantStats[participant.id] = {
        joinedAt: Date.now(),
        messageCount: 0,
        lastContribution: null,
      };
    }
  }

  protected async onParticipantLeftStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void> {
    // Clean up participant tracking
    const context = this.getContext(discussion.id);
    if (context && context.metadata.participantStats) {
      delete context.metadata.participantStats[participant.id];
    }
  }

  protected async onTurnCompletedStrategy(
    participant: DiscussionParticipant,
    discussion: Discussion
  ): Promise<void> {
    // Update participant activity tracking
    const context = this.getContext(discussion.id);
    if (context) {
      if (!context.metadata.participantStats) {
        context.metadata.participantStats = {};
      }

      const stats = context.metadata.participantStats[participant.id];
      if (stats) {
        stats.messageCount++;
        stats.lastContribution = Date.now();
      }

      // Track recent activity for flow analysis
      if (!context.metadata.recentActivity) {
        context.metadata.recentActivity = [];
      }

      context.metadata.recentActivity.push({
        participantId: participant.id,
        timestamp: Date.now(),
        type: 'message',
      });

      // Keep only recent activity
      if (context.metadata.recentActivity.length > 20) {
        context.metadata.recentActivity.splice(0, context.metadata.recentActivity.length - 20);
      }
    }
  }

  async cleanup(discussion: Discussion): Promise<void> {
    this.adaptationHistory.delete(discussion.id);
    await super.cleanup(discussion);
  }
}

interface FlowAnalysis {
  momentum: number;
  engagement: number;
  topicShifts: number;
  participantDistribution: number;
  conflictLevel: number;
}

interface AdaptationRecord {
  timestamp: Date;
  flowAnalysis: FlowAnalysis;
  selectedStrategy: string;
  participants: string[];
}
```

#### 4.2 Strategy Factory and Configuration Service

```typescript
// src/strategies/strategyFactory.ts
export class StrategyFactory {
  private strategies = new Map<string, () => IDiscussionStrategy>();

  constructor() {
    this.registerDefaultStrategies();
  }

  private registerDefaultStrategies(): void {
    this.strategies.set('round_robin', () => new RoundRobinStrategy());
    this.strategies.set('moderated', () => new ModeratedStrategy());
    this.strategies.set('context_aware', () => new ContextAwareStrategy());
    this.strategies.set('adaptive', () => new AdaptiveStrategy());
  }

  registerStrategy(name: string, factory: () => IDiscussionStrategy): void {
    this.strategies.set(name, factory);
  }

  createStrategy(name: string): IDiscussionStrategy {
    const factory = this.strategies.get(name);
    if (!factory) {
      throw new Error(`Unknown strategy: ${name}`);
    }
    return factory();
  }

  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  getStrategyInfo(name: string): { name: string; description: string; defaultConfig: any } | null {
    try {
      const strategy = this.createStrategy(name);
      return {
        name: strategy.name,
        description: strategy.description,
        defaultConfig: strategy.defaultConfig,
      };
    } catch {
      return null;
    }
  }
}

export class StrategyConfigService {
  constructor(private strategyFactory: StrategyFactory) {}

  validateConfig(strategy: string, config: TurnStrategyConfig): ValidationResult {
    try {
      const strategyInstance = this.strategyFactory.createStrategy(strategy);
      return strategyInstance.validateConfig(config);
    } catch (error) {
      return {
        isValid: false,
        errors: [`Invalid strategy: ${strategy}`],
      };
    }
  }

  getDefaultConfig(strategy: string): Partial<TurnStrategyConfig> {
    try {
      const strategyInstance = this.strategyFactory.createStrategy(strategy);
      return strategyInstance.defaultConfig;
    } catch {
      return {};
    }
  }

  mergeWithDefaults(strategy: string, config: Partial<TurnStrategyConfig>): TurnStrategyConfig {
    const defaultConfig = this.getDefaultConfig(strategy);
    return {
      strategy,
      ...defaultConfig,
      ...config,
    } as TurnStrategyConfig;
  }

  getAllStrategiesInfo(): Array<{ name: string; description: string; defaultConfig: any }> {
    return this.strategyFactory
      .getAvailableStrategies()
      .map((name) => this.strategyFactory.getStrategyInfo(name))
      .filter((info) => info !== null) as Array<{
      name: string;
      description: string;
      defaultConfig: any;
    }>;
  }
}
```

## 📁 Final Proposed File Structure (After Complete Refactoring)

```
src/
├── server/
│   ├── discussionServer.ts         // 200 lines (was 805)
│   ├── config/
│   │   ├── serverConfig.ts         // Server configuration
│   │   └── middlewareSetup.ts      // Middleware configuration
│   ├── routes/
│   │   ├── healthRoutes.ts         // Health check endpoints
│   │   └── debugRoutes.ts          // Debug and monitoring endpoints
│   └── startup/
│       ├── serviceInitializer.ts   // Dependency injection setup
│       └── eventSubscriptions.ts   // Event bus subscriptions
├── services/
│   ├── discussionOrchestrationService.ts  // 300 lines (was 1,906)
│   └── discussion/
│       ├── discussionLifecycleService.ts     // Discussion CRUD operations
│       ├── turnManagementService.ts          // Turn advancement logic
│       ├── participantManagementService.ts   // Participant operations
│       ├── messageOrchestrationService.ts    // Message handling
│       └── discussionCleanupService.ts       // Cleanup and memory management
├── websocket/
│   ├── socketIOHandler.ts          // 400 lines (was 2,039 combined)
│   ├── handlers/
│   │   ├── discussionHandler.ts    // Discussion-specific WebSocket events
│   │   ├── chatHandler.ts         // User chat WebSocket events
│   │   └── authHandler.ts         // Authentication WebSocket events
│   └── middleware/
│       └── socketAuthMiddleware.ts // Centralized authentication middleware
├── strategies/
│   ├── base/
│   │   ├── IDiscussionStrategy.ts      // Strategy interface
│   │   └── BaseDiscussionStrategy.ts   // Common strategy implementation
│   ├── implementations/
│   │   ├── RoundRobinStrategy.ts       // Sequential turn-taking
│   │   ├── ModeratedStrategy.ts        // Moderator-controlled turns
│   │   ├── ContextAwareStrategy.ts     // Context-based participant selection
│   │   └── AdaptiveStrategy.ts         // AI-powered adaptive strategy
│   ├── strategyFactory.ts              // Strategy creation factory
│   └── strategyConfigService.ts        // Strategy configuration management
├── events/
│   ├── eventCoordinator.ts         // Central event management
│   ├── eventTypes.ts              // Event type definitions
│   ├── handlers/
│   │   ├── discussionEventHandler.ts   // Discussion lifecycle events
│   │   ├── participantEventHandler.ts  // Participant events
│   │   ├── messageEventHandler.ts      // Message events
│   │   └── turnEventHandler.ts         // Turn management events
│   └── middleware/
│       ├── eventValidationMiddleware.ts    // Event validation
│       ├── eventAuditMiddleware.ts         // Audit logging
│       └── eventEnrichmentMiddleware.ts    // Event enrichment
├── container/
│   ├── serviceContainer.ts         // Dependency injection container
│   └── serviceScope.ts            // Scoped service management
├── interfaces/
│   ├── services/
│   │   ├── ITurnStrategyService.ts         // Turn strategy interface
│   │   ├── IParticipantManagementService.ts // Participant management interface
│   │   ├── IDiscussionLifecycleService.ts   // Lifecycle management interface
│   │   ├── IMessageOrchestrationService.ts  // Message orchestration interface
│   │   └── IDiscussionCleanupService.ts     // Cleanup service interface
│   ├── events/
│   │   ├── IEventCoordinator.ts        // Event coordination interface
│   │   └── IEventHandler.ts           // Event handler interface
│   └── websocket/
│       └── ISocketHandler.ts          // WebSocket handler interface
└── __tests__/
    ├── unit/
    │   ├── services/              // Unit tests for all services
    │   ├── strategies/            // Unit tests for all strategies
    │   ├── events/               // Unit tests for event system
    │   └── websocket/            // Unit tests for WebSocket handlers
    ├── integration/
    │   ├── discussionFlow.test.ts     // End-to-end discussion flow tests
    │   ├── strategyIntegration.test.ts // Strategy integration tests
    │   └── eventFlow.test.ts          // Event flow integration tests
    └── utils/
        ├── mockServices.ts        // Mock service implementations
        ├── testHelpers.ts         // Test utility functions
        └── fixtures.ts            // Test data fixtures
```

## 🎯 Benefits Summary

**Code Quality Improvements:**

- **90% reduction** in largest file sizes (1,906 → 300 lines)
- **Eliminated all duplication** in WebSocket handlers
- **Complete separation** of concerns with single responsibility classes
- **Interface-based development** for maximum testability
- **Strategy pattern** enabling flexible discussion management

**Architectural Benefits:**

- **Dependency injection** for loose coupling and easy testing
- **Event-driven architecture** with centralized coordination
- **Pluggable strategies** for different discussion types
- **Clean service boundaries** with well-defined interfaces
- **Comprehensive error handling** and logging

**Maintainability Gains:**

- **Focused, single-purpose files** easy to understand and modify
- **Clear dependency relationships** through interfaces
- **Extensible strategy system** for new discussion types
- **Centralized configuration** management
- **Systematic testing approach** with proper mocking

**Performance Improvements:**

- **Reduced memory footprint** through better cleanup
- **Faster startup times** with lazy service initialization
- **Better scalability** with service isolation
- **Optimized event processing** through middleware pipeline

**Developer Experience:**

- **Easier debugging** with smaller, focused components
- **Better IDE support** with proper TypeScript interfaces
- **Clear architectural guidelines** for new features
- **Comprehensive documentation** through code structure
- **Simplified onboarding** with obvious code organization

This refactoring plan transforms the discussion-orchestration service from a monolithic, tightly-coupled service into a clean, modular, and highly maintainable microservice that follows SOLID principles and modern architectural patterns.
