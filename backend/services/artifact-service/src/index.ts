import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { authMiddleware } from '@uaip/middleware';

import { ArtifactFactory } from './ArtifactFactory.js';
import { ArtifactService } from './ArtifactService.js';
import { artifactRoutes } from './routes/artifactRoutes.js';

class ArtifactServiceApp extends BaseService {
  private artifactFactory: ArtifactFactory;
  private artifactService: ArtifactService;

  constructor() {
    const serviceConfig: ServiceConfig = {
      name: 'artifact-service',
      port: config.services?.artifactService?.port || 3006,
      version: '1.0.0',
      rateLimitConfig: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
      },
      customMiddleware: []
    };
    super(serviceConfig);
    this.artifactFactory = new ArtifactFactory();
    this.artifactService = new ArtifactService();
  }

  protected async initialize(): Promise<void> {
    logger.info('Initializing Artifact Service...');
    
    // Service-specific initialization
    await this.artifactService.initialize();
    
    logger.info('Artifact Service initialized successfully');
  }

  protected async setupRoutes(): Promise<void> {
    // API routes with auth middleware
    this.app.use('/api/v1/artifacts', authMiddleware, artifactRoutes(this.artifactService));
    
    // Service-specific status endpoint
    this.app.get('/status', (req, res) => {
      const factoryStatus = this.artifactFactory.getSystemStatus();
      const serviceHealth = this.artifactService.getServiceHealth();
      res.json({
        service: this.config.name,
        version: this.config.version,
        factory: factoryStatus,
        serviceHealth: serviceHealth
      });
    });
  }

  protected async checkServiceHealth(): Promise<boolean> {
    try {
      const serviceHealth = this.artifactService.getServiceHealth();
      return serviceHealth.status === 'healthy';
    } catch (error) {
      logger.error('Service health check failed:', error);
      return false;
    }
  }

  // Expose services for external access
  public getArtifactFactory(): ArtifactFactory {
    return this.artifactFactory;
  }

  public getArtifactService(): ArtifactService {
    return this.artifactService;
  }
}

// Create and start service
const service = new ArtifactServiceApp();

// Start the service
service.start().catch(error => {
  logger.error('Failed to start Artifact Service:', error);
  process.exit(1);
});

export { service };
