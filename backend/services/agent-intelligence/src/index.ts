import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';

import { logger } from '@uaip/utils';
import { errorHandler, rateLimiter, metricsMiddleware, metricsEndpoint } from '@uaip/middleware';
import { 
  DatabaseService, 
  EventBusService, 
  PersonaService, 
  DiscussionService 
} from '@uaip/shared-services';
import { agentRoutes } from './routes/agentRoutes.js';
import { createPersonaRoutes } from './routes/personaRoutes.js';
import { createDiscussionRoutes } from './routes/discussionRoutes.js';
import { healthRoutes } from './routes/healthRoutes.js';
import { PersonaController } from './controllers/personaController.js';
import { DiscussionController } from './controllers/discussionController.js';

class AgentIntelligenceService {
  private app: express.Application;
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private personaService: PersonaService;
  private discussionService: DiscussionService;
  private personaController: PersonaController;
  private discussionController: DiscussionController;

  constructor() {
    this.app = express();
    this.databaseService = new DatabaseService();
    this.eventBusService = new EventBusService({
      url: process.env.RABBITMQ_URL || 'amqp://localhost',
      serviceName: 'agent-intelligence'
    }, logger);
    
    // Initialize persona and discussion services
    this.personaService = new PersonaService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      enableCaching: true,
      enableAnalytics: true
    });
    
    this.discussionService = new DiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      personaService: this.personaService,
      enableRealTimeEvents: true,
      enableAnalytics: true,
      maxParticipants: 20,
      defaultTurnTimeout: 300
    });

    // Initialize controllers with service dependencies
    this.personaController = new PersonaController(this.personaService);
    this.discussionController = new DiscussionController(this.discussionService);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));

    // Performance middleware
    this.app.use(compression());
    this.app.use(rateLimiter);

    // Logging middleware
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) }
    }));

    // Request parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Metrics middleware
    this.app.use(metricsMiddleware);
  }

  private setupRoutes(): void {
    // Metrics endpoint for Prometheus
    this.app.get('/metrics', metricsEndpoint);
    
    // Health check routes
    this.app.use('/health', healthRoutes);
    
    // API routes
    this.app.use('/api/v1/agents', agentRoutes);
    this.app.use('/api/v1/personas', createPersonaRoutes(this.personaController));
    this.app.use('/api/v1/discussions', createDiscussionRoutes(this.discussionController));

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found'
        },
        meta: {
          timestamp: new Date(),
          version: process.env.VERSION || '1.0.0'
        }
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Initialize database service first
      await this.databaseService.initialize();
      logger.info('DatabaseService initialized successfully');
      // await this.databaseService.seedDatabase();
      // logger.info('Database seeding completed successfully');
      
      // Test database connection using health check
      const healthCheck = await this.databaseService.healthCheck();
      if (healthCheck.status === 'healthy') {
        logger.info('Database connection verified');
      } else {
        throw new Error('Database health check failed');
      }

      // Connect to event bus with retry logic
      try {
        await this.eventBusService.connect();
        logger.info('Event bus connected successfully');
      } catch (error) {
        logger.warn('Event bus connection failed, continuing without event publishing:', error);
        // Service can still function without event bus for basic operations
      }

      // Initialize persona and discussion services
      logger.info('Persona and Discussion services initialized');

      // Start HTTP server
      const port = parseInt(process.env.PORT || '3001', 10);
      this.app.listen(port, () => {
        logger.info(`Agent Intelligence Service started on port ${port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`Version: ${process.env.VERSION || '1.0.0'}`);
        logger.info('Available endpoints:');
        logger.info('  - /api/v1/agents - Agent management');
        logger.info('  - /api/v1/personas - Persona management');
        logger.info('  - /api/v1/discussions - Discussion orchestration');
      });

    } catch (error) {
      logger.error('Failed to start Agent Intelligence Service:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      // Close connections if methods exist
      if (this.eventBusService && typeof this.eventBusService.close === 'function') {
        await this.eventBusService.close();
      }
      if (this.databaseService && typeof this.databaseService.close === 'function') {
        await this.databaseService.close();
      }
      logger.info('Agent Intelligence Service stopped gracefully');
    } catch (error) {
      logger.error('Error during service shutdown:', error);
    }
  }
}

// Initialize and start the service
const service = new AgentIntelligenceService();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await service.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await service.stop();
  process.exit(0);
});

// Start the service
service.start().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
}); 