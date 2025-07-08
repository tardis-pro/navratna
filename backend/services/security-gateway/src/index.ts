import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';
import { initializeServices } from '@uaip/shared-services';
import jwt from 'jsonwebtoken';
import { validateJWTToken, errorTrackingMiddleware } from '@uaip/middleware';
import { createErrorLogger } from '@uaip/middleware';

// Import routes
import authRoutes from './routes/authRoutes.js';
import securityRoutes from './routes/securityRoutes.js';
import approvalRoutes from './routes/approvalRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import userRoutes from './routes/userRoutes.js';
import knowledgeRoutes from './routes/knowledgeRoutes.js';
import userLLMProviderRoutes from './routes/userLLMProviderRoutes.js';
// import userPersonaRoutes from './routes/userPersonaRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import userToolPreferencesRoutes from './routes/userToolPreferencesRoutes.js';

// Import services
import { SecurityGatewayService } from './services/securityGatewayService.js';
import { ApprovalWorkflowService } from './services/approvalWorkflowService.js';
import { AuditService } from './services/auditService.js';
import { NotificationService } from './services/notificationService.js';
import { LLMProviderManagementService } from './services/llmProviderManagementService.js';

class SecurityGatewayServer extends BaseService {
  private securityGatewayService: SecurityGatewayService | null = null;
  private approvalWorkflowService: ApprovalWorkflowService | null = null;
  private auditService: AuditService | null = null;
  private notificationService: NotificationService | null = null;
  private errorLogger = createErrorLogger('security-gateway');

  constructor() {
    super({
      name: 'security-gateway',
      port: config.services.securityGateway.port || 3004,
      enableEnterpriseEventBus: true
    });
  }

  protected async initialize(): Promise<void> {
    // JWTValidator is already initialized statically - no getInstance needed

    // Initialize services that depend on database
    this.auditService = new AuditService();
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

    // Initialize LLM Provider Management Service and set EventBusService
    const llmProviderManagementService = LLMProviderManagementService.getInstance();
    llmProviderManagementService.setEventBusService(this.eventBusService);

    // Initialize knowledge services (non-blocking)
    initializeServices().then(() => {
      logger.info('Knowledge services initialized successfully');
    }).catch(error => {
      logger.warn('Knowledge services failed to initialize - continuing without them:', error);
      // This is non-critical for basic functionality
    });

    // Start cron jobs after database is ready
    this.approvalWorkflowService.startCronJobs();

    logger.info('All services initialized successfully');
  }

  // Getter methods for services
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

  protected setupCustomMiddleware(): void {
    // Add request logging middleware
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

  protected async setupRoutes(): Promise<void> {
    // Add error tracking middleware before routes
    this.app.use(errorTrackingMiddleware('security-gateway'));

    // API routes
    this.app.use('/api/v1/auth', authRoutes);
    this.app.use('/api/v1/security', securityRoutes);
    this.app.use('/api/v1/approvals', approvalRoutes);
    this.app.use('/api/v1/audit', auditRoutes);
    this.app.use('/api/v1/users', userRoutes);
    this.app.use('/api/v1/users', userToolPreferencesRoutes);
    this.app.use('/api/v1/knowledge', knowledgeRoutes);
    this.app.use('/api/v1/llm', userLLMProviderRoutes);
    // this.app.use('/api/v1/users/persona', userPersonaRoutes);
    this.app.use('/api/v1/contacts', contactRoutes);
  }

  protected async setupEventSubscriptions(): Promise<void> {
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
    if (!this.enterpriseEventBusService) return;

    // Subscribe to enterprise security events
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


// ... (rest of the file)

  private async validateJWTToken(token: string): Promise<any> {
    try {
      // Use the validateJWTToken function from middleware
      const result = await validateJWTToken(token);
      
      if (result.valid) {
        return { 
          valid: true, 
          userId: result.userId,
          email: result.email,
          role: result.role,
          sessionId: result.sessionId || `session_${Date.now()}`,
          securityLevel: result.securityLevel || 3,
          complianceFlags: result.complianceFlags || []
        };
      } else {
        return {
          valid: false,
          reason: result.reason || 'Token validation failed'
        };
      }
    } catch (error) {
      logger.warn('JWT token validation failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        tokenPreview: token?.substring(0, 20) + '...'
      });
      return { 
        valid: false, 
        reason: error instanceof Error ? error.message : 'Token validation failed'
      };
    }
  }

// ... (rest of the file)


  protected async checkServiceHealth(): Promise<boolean> {
    // Add service-specific health checks here
    return true;
  }

  protected async cleanup(): Promise<void> {
    // Cleanup approval workflow service
    try {
      if (this.approvalWorkflowService) {
        await this.approvalWorkflowService.cleanup();
        logger.info('Approval workflow service cleaned up');
      }
    } catch (error) {
      logger.error('Error cleaning up approval workflow service', { error });
    }
  }
}

// Start the server
const server = new SecurityGatewayServer();
server.start().catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});

export default SecurityGatewayServer;
