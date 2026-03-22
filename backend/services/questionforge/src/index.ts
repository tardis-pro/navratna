import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';

import { QuestionForgeService } from './services/questionForge.service.js';
import { InterviewCaptureService } from './services/interviewCapture.service.js';
import { registerQuestionForgeRoutes } from './routes/questionforgeRoutes.js';

class QuestionForgeApp extends BaseService {
  private forgeService: QuestionForgeService;
  private interviewService: InterviewCaptureService;

  constructor() {
    const serviceConfig: ServiceConfig = {
      name: 'questionforge',
      port: config.services?.questionforge?.port || 3010,
      version: '1.0.0',
      rateLimitConfig: {
        windowMs: 15 * 60 * 1000,
        max: 50,
      },
      customMiddleware: [],
    };
    super(serviceConfig);
    this.forgeService = new QuestionForgeService(this.eventBusService);
    this.interviewService = new InterviewCaptureService(this.eventBusService);
  }

  protected async initialize(): Promise<void> {
    logger.info('Initializing QuestionForge Service...');

    await this.setupEventSubscriptions().catch((error) => {
      logger.error('Failed to set up QuestionForge event listeners', { error });
    });

    logger.info('QuestionForge Service initialized successfully');
  }

  protected async setupEventSubscriptions(): Promise<void> {
    try {
      // Listen for forge requests from other services
      await this.subscribeWithErrorHandling(
        'questionforge.forge.request',
        async (data) => {
          const result = await this.forgeService.forge(data);
          return {
            ...result,
            questionPacks: Object.fromEntries(result.questionPacks),
            interviewScripts: Object.fromEntries(result.interviewScripts),
          };
        },
        {
          responseEvent: 'questionforge.forge.response',
          errorEvent: 'questionforge.forge.error',
          logPrefix: 'QuestionForge',
        }
      );

      logger.info('QuestionForge event subscriptions set up successfully');
    } catch (error) {
      logger.error('Failed to set up QuestionForge event subscriptions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  protected async setupRoutes(): Promise<void> {
    registerQuestionForgeRoutes(this.app as any, this.forgeService, this.interviewService);

    this.app.get('/status', () => ({
      service: this.config.name,
      version: this.config.version,
      status: 'healthy',
      uptime: process.uptime(),
    }));
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }
}

const service = new QuestionForgeApp();

service.start().catch((error) => {
  logger.error('Failed to start QuestionForge Service:', error);
  process.exit(1);
});

export { service };
