import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import marketplaceRoutes from './routes/marketplaceRoutes.js';

class MarketplaceServiceServer extends BaseService {
  constructor() {
    super({
      name: 'marketplace-service',
      port: parseInt(process.env.MARKETPLACE_SERVICE_PORT || '3006', 10)
    });
  }

  protected async initialize(): Promise<void> {
    logger.info('Marketplace Service initialized');
  }

  protected async setupRoutes(): Promise<void> {
    // API routes
    this.app.use('/api/v1/marketplace', marketplaceRoutes);
  }

  protected async checkServiceHealth(): Promise<boolean> {
    // Add service-specific health checks here
    return true;
  }

  protected onServerStarted(): void {
    logger.info(`📊 Health check: http://localhost:${this.config.port}/health`);
    logger.info(`🏪 Marketplace API: http://localhost:${this.config.port}/api/v1/marketplace`);
  }
}

// Create and start the server
const server = new MarketplaceServiceServer();

// Start the server
server.start().catch((error) => {
  logger.error('Failed to start Marketplace Service:', error);
  process.exit(1);
});

export default server;