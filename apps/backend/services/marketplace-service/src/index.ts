import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { marketplaceRoutes } from './routes/marketplaceRoutes.js';

class MarketplaceServiceApp extends BaseService {
  constructor() {
    const config: ServiceConfig = {
      name: 'marketplace-service',
      port: parseInt(process.env.MARKETPLACE_SERVICE_PORT || '3008', 10),
      version: '1.0.0',
    };
    super(config);
  }

  protected async initialize(): Promise<void> {
    logger.info('Marketplace Service initialized');
  }

  protected async setupRoutes(): Promise<void> {
    this.app.mount('/api/v1/marketplace', marketplaceRoutes);
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }
}

const service = new MarketplaceServiceApp();

service.start().catch((error) => {
  logger.error('Failed to start Marketplace Service:', error);
  process.exit(1);
});
