import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';
import { errorHandler, rateLimiter, metricsMiddleware, metricsEndpoint } from '@uaip/middleware';
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';
import { initializeServices } from '@uaip/shared-services';
import jwt from 'jsonwebtoken';

// Import routes
import authRoutes from './routes/authRoutes.js';
import securityRoutes from './routes/securityRoutes.js';
import approvalRoutes from './routes/approvalRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import userRoutes from './routes/userRoutes.js';
import knowledgeRoutes from './routes/knowledgeRoutes.js';
import userLLMProviderRoutes from './routes/userLLMProviderRoutes.js';
// import userManagementRoutes from './routes/userManagementRoutes.js';
// import shortLinkRoutes from './routes/shortLinkRoutes.js';

// Import services
import { SecurityGatewayService } from './services/securityGatewayService.js';
import { ApprovalWorkflowService } from './services/approvalWorkflowService.js';
import { AuditService } from './services/auditService.js';
import { NotificationService } from './services/notificationService.js';

class SecurityGatewayServer {
  private app: express.Application;
  private port: number;
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private enterpriseEventBusService: EventBusService;
  private securityGatewayService: SecurityGatewayService | null = null;
  private approvalWorkflowService: ApprovalWorkflowService | null = null;
  private auditService: AuditService | null = null;
  private notificationService: NotificationService | null = null;
  private isShuttingDown: boolean = false;

  constructor() {
    this.app = express();
    this.port = config.services.securityGateway.port || 3004;
    
    // Initialize only basic services that don't require database
    this.databaseService = new DatabaseService();
    this.eventBusService = new EventBusService(
      {
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
        serviceName: 'security-gateway'
      },
      logger
    );

    // Initialize enterprise event bus for enterprise exchange
    this.enterpriseEventBusService = new EventBusService(
      {
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
        serviceName: 'security-gateway',
        exchangePrefix: 'uaip.enterprise',
        complianceMode: true
      },
      logger
    );

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private async initializeServices(): Promise<void> {
    // Initialize services that depend on database after database is ready
    this.auditService = new AuditService(this.databaseService);
    this.notificationService = new NotificationService();
    this.approvalWorkflowService = new ApprovalWorkflowService(
      this.databaseService,
      this.eventBusService,
      this.notificationService,
      this.auditService
    );
    this.securityGatewayService = new SecurityGatewayService(
      this.databaseService,
      this.approvalWorkflowService,
      this.auditService
    );

    // Initialize knowledge services
    try {
      await initializeServices();
      logger.info('Knowledge services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize knowledge services:', error);
      // Don't fail the entire startup, but log the error
    }

    // Start cron jobs after database is ready
    this.approvalWorkflowService.startCronJobs();

    logger.info('All services initialized successfully');
  }

  // Getter methods for services (for potential future use)
  public getSecurityGatewayService(): SecurityGatewayService {
    if (!this.securityGatewayService) {
      throw new Error('SecurityGatewayService not initialized. Call start() first.');
    }
    return this.securityGatewayService;
  }

  public getApprovalWorkflowService(): ApprovalWorkflowService {
    if (!this.approvalWorkflowService) {
      throw new Error('ApprovalWorkflowService not initialized. Call start() first.');
    }
    return this.approvalWorkflowService;
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS is handled by nginx API gateway - disable service-level CORS
    // this.app.use(cors({
    //   origin: config.cors.allowedOrigins,
    //   credentials: true,
    //   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    //   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    // }));

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    this.app.use(rateLimiter);

    // Metrics middleware
    this.app.use(metricsMiddleware);

    // Request logging
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      // @ts-ignore
      req.startTime = startTime;
      
      logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info('Request completed', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          ip: req.ip
        });
      });

      next();
    });
  }

  private setupRoutes(): void {
    // Metrics endpoint for Prometheus
    this.app.get('/metrics', metricsEndpoint);
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'security-gateway',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API routes
    this.app.use('/api/v1/auth', authRoutes);
    this.app.use('/api/v1/security', securityRoutes);
    this.app.use('/api/v1/approvals', approvalRoutes);
    this.app.use('/api/v1/audit', auditRoutes);
    this.app.use('/api/v1/users', userRoutes);
    this.app.use('/api/v1/knowledge', knowledgeRoutes);
    this.app.use('/api/v1/llm', userLLMProviderRoutes);
    // this.app.use('/api', userManagementRoutes);
    // this.app.use('/s', shortLinkRoutes); // Short links at /s/{shortCode}
    // this.app.use('/api/v1/links', shortLinkRoutes); // Full API at /api/v1/links

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
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

      // Initialize all dependent services after database is ready
      await this.initializeServices();

      // Initialize standard event bus
      await this.eventBusService.connect();
      logger.info('Standard event bus connected successfully');

      // Initialize enterprise event bus
      await this.enterpriseEventBusService.connect();
      logger.info('Enterprise event bus connected successfully');

      // Setup event subscriptions for both buses
      await this.setupEventSubscriptions();
      logger.info('Event subscriptions configured for both standard and enterprise buses');

      // Start the server
      this.app.listen(this.port, () => {
        logger.info(`Security Gateway service started on port ${this.port}`, {
          port: this.port,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString()
        });
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start Security Gateway service', { error });
      process.exit(1);
    }
  }

  private async setupEventSubscriptions(): Promise<void> {
    // Setup standard event bus subscriptions
    await this.setupStandardEventSubscriptions();
    
    // Setup enterprise event bus subscriptions
    await this.setupEnterpriseEventSubscriptions();
  }

  private async setupStandardEventSubscriptions(): Promise<void> {
    // Subscribe to WebSocket authentication requests
    await this.eventBusService.subscribe('security.auth.validate', async (event) => {
      try {
        const { token, correlationId, service, operation } = event.data;
        
        logger.info('Processing WebSocket auth validation', { 
          service, 
          operation, 
          correlationId: correlationId?.substring(0, 10) + '...' 
        });

        // Validate JWT token using existing auth service
        const authResult = await this.validateJWTToken(token);
        
        // Publish response back to requesting service
        await this.eventBusService.publish('security.auth.response', {
          correlationId,
          valid: authResult.valid,
          userId: authResult.userId,
          sessionId: authResult.sessionId,
          securityLevel: authResult.securityLevel,
          complianceFlags: authResult.complianceFlags,
          email: authResult.email,
          role: authResult.role,
          reason: authResult.reason
        });

        logger.info('WebSocket auth validation completed', { 
          correlationId: correlationId?.substring(0, 10) + '...', 
          valid: authResult.valid 
        });

      } catch (error) {
        logger.error('WebSocket auth validation failed', { error });
        
        // Send error response
        if (event.data.correlationId) {
          await this.eventBusService.publish('security.auth.response', {
            correlationId: event.data.correlationId,
            valid: false,
            reason: 'Internal authentication error'
          });
        }
      }
    });
  }

  private async setupEnterpriseEventSubscriptions(): Promise<void> {
    // Subscribe to enterprise security events (same event name, enterprise exchange, explicit queue name)
    await this.enterpriseEventBusService.subscribe('security.auth.validate', async (event) => {
      try {
        const { token, correlationId, service, operation, complianceLevel } = event.data;
        
        logger.info('Processing enterprise auth validation', { 
          service, 
          operation, 
          complianceLevel,
          correlationId: correlationId?.substring(0, 10) + '...' 
        });

        // Validate JWT token with enhanced enterprise validation
        const authResult = await this.validateJWTToken(token);
        
        // Add enterprise-specific compliance checks
        const enterpriseAuthResult = {
          ...authResult,
          complianceLevel: complianceLevel || 'standard',
          auditTrail: true,
          enterpriseValidation: true
        };
        
        // Publish response back to requesting service via enterprise bus
        await this.enterpriseEventBusService.publish('security.auth.response', {
          correlationId,
          valid: enterpriseAuthResult.valid,
          userId: enterpriseAuthResult.userId,
          sessionId: enterpriseAuthResult.sessionId,
          securityLevel: enterpriseAuthResult.securityLevel,
          complianceFlags: enterpriseAuthResult.complianceFlags,
          complianceLevel: enterpriseAuthResult.complianceLevel,
          email: enterpriseAuthResult.email,
          role: enterpriseAuthResult.role,
          reason: enterpriseAuthResult.reason,
          auditTrail: enterpriseAuthResult.auditTrail,
          enterpriseValidation: enterpriseAuthResult.enterpriseValidation
        });

        logger.info('Enterprise auth validation completed', { 
          correlationId: correlationId?.substring(0, 10) + '...', 
          valid: enterpriseAuthResult.valid,
          complianceLevel: enterpriseAuthResult.complianceLevel
        });

      } catch (error) {
        logger.error('Enterprise auth validation failed', { error });
        
        // Send error response via enterprise bus
        if (event.data.correlationId) {
          await this.enterpriseEventBusService.publish('security.auth.response', {
            correlationId: event.data.correlationId,
            valid: false,
            reason: 'Internal enterprise authentication error',
            auditTrail: true
          });
        }
      }
    }, { queue: 'security-gateway.enterprise.auth.validate' });

    // Subscribe to enterprise audit events
    await this.enterpriseEventBusService.subscribe('security.enterprise.audit.log', async (event) => {
      try {
        const { auditData, correlationId } = event.data;
        
        logger.info('Processing enterprise audit log', { 
          correlationId: correlationId?.substring(0, 10) + '...',
          auditType: auditData?.type 
        });

        // Process audit data through audit service
        if (this.auditService && auditData) {
          await this.auditService.logEvent(auditData);
        }

        logger.info('Enterprise audit log processed', { 
          correlationId: correlationId?.substring(0, 10) + '...' 
        });

      } catch (error) {
        logger.error('Enterprise audit log processing failed', { error });
      }
    });
  }

  private async validateJWTToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    sessionId?: string;
    securityLevel?: number;
    complianceFlags?: string[];
    email?: string;
    role?: string;
    reason?: string;
  }> {
    try {
      // Use the same JWT validation logic as authMiddleware
      const jwtSecret = config.jwt.secret;
      if (!jwtSecret) {
        return { valid: false, reason: 'JWT secret not configured' };
      }

      // Verify JWT token
      const decoded = jwt.verify(token, jwtSecret) as any;

      // Validate token payload
      if (!decoded.userId || !decoded.email || !decoded.role) {
        return { valid: false, reason: 'Invalid token payload structure' };
      }

      // Check if token is expired (additional check beyond JWT verification)
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        return { valid: false, reason: 'Token expired' };
      }
      
      return {
        valid: true,
        userId: decoded.userId,
        sessionId: decoded.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        securityLevel: decoded.securityLevel || 3,
        complianceFlags: decoded.complianceFlags || [],
        email: decoded.email,
        role: decoded.role
      };

    } catch (error) {
      logger.warn('JWT token validation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return { 
        valid: false, 
        reason: error instanceof Error ? error.message : 'Token validation failed'
      };
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.debug(`Shutdown already in progress for ${signal}, skipping`);
        return;
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, starting graceful shutdown`);

      // Cleanup approval workflow service
      try {
        if (this.approvalWorkflowService) {
          await this.approvalWorkflowService.cleanup();
          logger.info('Approval workflow service cleaned up');
        }
      } catch (error) {
        logger.error('Error cleaning up approval workflow service', { error });
      }

      // Close database connections
      try {
        await this.databaseService.close();
        logger.info('Database disconnected');
      } catch (error) {
        logger.error('Error closing database connection', { error });
      }

      // TypeORM connection is managed by DatabaseService

      // Close event bus connections
      try {
        await this.eventBusService.close();
        logger.info('Standard event bus disconnected');
      } catch (error) {
        logger.error('Error closing standard event bus connection', { error });
      }

      try {
        await this.enterpriseEventBusService.close();
        logger.info('Enterprise event bus disconnected');
      } catch (error) {
        logger.error('Error closing enterprise event bus connection', { error });
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

// Start the server
const server = new SecurityGatewayServer();
server.start().catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});

export default SecurityGatewayServer; 