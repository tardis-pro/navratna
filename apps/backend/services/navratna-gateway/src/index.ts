import { BaseService, TaskService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';

import { registerAuthRoutes } from '../../security-gateway/src/http/auth.elysia.js';
import { registerUserRoutes } from '../../security-gateway/src/http/users.elysia.js';
import { registerApprovalRoutes } from '../../security-gateway/src/http/approval.elysia.js';
import { registerAuditRoutes } from '../../security-gateway/src/http/audit.elysia.js';
import { registerSecurityRoutes } from '../../security-gateway/src/http/security.elysia.js';
import { registerProviderRoutes } from '../../security-gateway/src/http/providers.elysia.js';
import { registerOAuthRoutes } from '../../security-gateway/src/http/oauth.elysia.js';
import { registerPersonaRoutes } from '../../security-gateway/src/http/persona.elysia.js';
import { registerKnowledgeRoutes } from '../../security-gateway/src/http/knowledge.elysia.js';
import { registerContactRoutes } from '../../security-gateway/src/http/contacts.elysia.js';
import { registerProjectRoutes } from '../../orchestration-pipeline/src/routes/projectRoutes.js';
import { registerTaskRoutes } from '../../orchestration-pipeline/src/routes/taskRoutes.js';
import { TaskController } from '../../orchestration-pipeline/src/controllers/taskController.js';
import { registerCapabilityRoutes } from '../../capability-registry/src/routes/capabilityRoutes.js';
import { registerMCPRoutes } from '../../capability-registry/src/routes/mcpRoutes.js';
import { registerHealthRoutes } from '../../capability-registry/src/routes/healthRoutes.js';

class NavratnaGatewayService extends BaseService {
  private taskService!: TaskService;
  private taskController!: TaskController;

  constructor() {
    super({
      name: 'navratna-gateway',
      port: parseInt(process.env.NAVRATNA_GATEWAY_PORT || '3002', 10),
      version: '3.0.0',
      enableEnterpriseEventBus: true,
    });
    this.registerEntities([]);
  }

  protected async initialize(): Promise<void> {
    this.taskService = TaskService.getInstance();
    this.taskController = new TaskController(this.taskService);
    logger.info('navratna-gateway services initialized');
  }

  protected async setupRoutes(): Promise<void> {
    registerAuthRoutes(this.app);
    registerUserRoutes(this.app);
    registerApprovalRoutes(this.app);
    registerAuditRoutes(this.app);
    registerSecurityRoutes(this.app);
    registerProviderRoutes(this.app);
    registerOAuthRoutes(this.app);
    registerPersonaRoutes(this.app);
    registerKnowledgeRoutes(this.app);
    registerContactRoutes(this.app);

    registerProjectRoutes(this.app);
    registerTaskRoutes(this.app, this.taskController);

    registerCapabilityRoutes(this.app);
    registerMCPRoutes(this.app);
    registerHealthRoutes(this.app);

    this.app.get('/health', () => ({
      status: 'ok',
      service: 'navratna-gateway',
      consolidates: ['security-gateway', 'orchestration-pipeline', 'capability-registry'],
    }));

    logger.info('navratna-gateway routes configured');
  }

  protected async setupEventSubscriptions(): Promise<void> {
    logger.info('navratna-gateway event subscriptions configured');
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }
}

const service = new NavratnaGatewayService();
service.start().catch((error) => {
  logger.error('Failed to start navratna-gateway', { error });
  process.exit(1);
});
