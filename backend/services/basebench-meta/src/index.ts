import type { AnyElysia } from 'elysia';
import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';

import { registerBaseBenchRoutes } from './routes/basebenchRoutes.js';
import { BaseBenchMetaService } from './services/basebenchMeta.service.js';

class BaseBenchMetaApp extends BaseService {
  private readonly baseBenchService: BaseBenchMetaService;

  constructor() {
    const serviceConfig: ServiceConfig = {
      name: 'basebench-meta',
      port: config.services.basebenchMeta?.port || 3009,
      version: '1.0.0',
      rateLimitConfig: {
        windowMs: 15 * 60 * 1000,
        max: 100,
      },
      customMiddleware: [],
    };
    super(serviceConfig);
    this.baseBenchService = new BaseBenchMetaService();
  }

  protected async initialize(): Promise<void> {
    logger.info('Initializing BaseBench-Meta service...');
    await this.setupEventSubscriptions().catch((error) => {
      logger.error('Failed to set up BaseBench-Meta event listeners', { error });
    });
    logger.info('BaseBench-Meta service initialized successfully');
  }

  protected async setupEventSubscriptions(): Promise<void> {
    try {
      await this.subscribeWithErrorHandling(
        'basebench.evaluate.request',
        async (data) => this.baseBenchService.evaluateCase(data),
        {
          responseEvent: 'basebench.evaluate.response',
          errorEvent: 'basebench.evaluate.error',
          logPrefix: 'BaseBench-Meta',
        }
      );

      await this.subscribeWithErrorHandling(
        'basebench.evaluate.batch.request',
        async (data) => this.baseBenchService.evaluateBatch(data.entries ?? []),
        {
          responseEvent: 'basebench.evaluate.batch.response',
          errorEvent: 'basebench.evaluate.batch.error',
          logPrefix: 'BaseBench-Meta Batch',
        }
      );

      logger.info('BaseBench-Meta event subscriptions set up successfully');
    } catch (error) {
      logger.error('Failed to set up BaseBench-Meta event subscriptions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  protected async setupRoutes(): Promise<void> {
    registerBaseBenchRoutes(this.app as AnyElysia, this.baseBenchService);

    this.app.get('/status', () => ({
      service: this.config.name,
      version: this.config.version,
      status: 'healthy',
      uptime: process.uptime(),
      caseCount: this.baseBenchService.listCases().length,
    }));
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return this.baseBenchService.listCases().length > 0;
  }
}

const service = new BaseBenchMetaApp();

service.start().catch((error) => {
  logger.error('Failed to start BaseBench-Meta service:', error);
  process.exit(1);
});

export { service };
