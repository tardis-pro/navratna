import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import {
  CompensationService,
  EnsureSystemActor,
  EnsureWorkflowDefinitionProjectScope,
  EventBusService,
  OperationManagementService,
  ResourceManagerService,
  StateManagerService,
  StepExecutorService,
  TaskService,
} from '@uaip/shared-services'
import { DatabaseService } from '@uaip/infra/database'
import { logger } from '@uaip/utils'

import { TaskController } from './controllers/task_controller.js'
import { OrchestrationEngine } from './orchestration_engine.js'
import { registerDevLoopRoutes } from './routes/dev_loop_routes.js'
import { registerOperationRoutes } from './routes/operation_routes.js'
import { registerTaskRoutes } from './routes/task_routes.js'
import { registerWorkflowRoutes } from './routes/workflow_routes.js'
import { registerWorkflowHookRoutes } from './routes/workflow_hook_routes.js'
import { registerGitHubWebhookRoutes } from './routes/github_webhook_routes.js'
import { registerJiraWebhookRoutes } from './routes/jira_webhook_routes.js'
import { importOpenClawWorkflows } from './seeds/openclaw-workflow-import.js'
import { seedNightlyTriageWorkflow } from './seeds/nightly-triage-workflow.js'
import { DevLoopOrchestrator } from './services/dev_loop_orchestrator.js'
import { HealingAgentService } from './services/healing_agent_service.js'
import { WorkflowEngineService } from './services/workflow_engine_service.js'
import { WorkflowExecutorService } from './services/workflow_executor_service.js'

let taskController: TaskController
let workflowEngineService: WorkflowEngineService
let workflowExecutorService: WorkflowExecutorService
let orchestrationEngine: OrchestrationEngine | undefined
const devLoopServices: {
  devLoopOrchestrator?: DevLoopOrchestrator
  healingAgent?: HealingAgentService
} = {}

export const orchestrationFeature: Feature = {
  name: 'orchestration-pipeline',

  async initialize(deps: ServiceDeps): Promise<void> {
    // DIAGNOSTIC ONLY — FeatureFactory swallows init errors and mounts routes
    // anyway. Enforcement is CrossPlaneGuard in createOperation.
    try {
      await new EnsureSystemActor().verify()
    } catch (error) {
      logger.error('orchestration-pipeline: system actor missing — operation writes will be rejected', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // Schema and the code that reads it arrive in the same deploy. Deliberately
    // NOT allowed to propagate: FeatureFactory swallows init throws, so letting
    // this escape would silently skip everything below it — the workflow executor,
    // the dev loop, the orchestration engine — behind one generic "init failed"
    // line. Only the project scope of a run depends on this column, so bash,
    // httpCall and agentTurn steps keep working; toolCall steps against a
    // project-scoped MCP tool are what break, and the log says so.
    try {
      await new EnsureWorkflowDefinitionProjectScope().run()
    } catch (error) {
      logger.error(
        'Failed to ensure workflow_definitions.project_id — scheduled runs WILL be refused by ' +
          'UnifiedToolRegistry for any project-scoped MCP tool until this succeeds. Other step types continue.',
        { error: error instanceof Error ? error.message : String(error) }
      )
    }

    const taskService = TaskService.getInstance()
    const eventBusService = deps.eventBusService ?? EventBusService.getInstance()
    taskController = new TaskController(taskService)
    workflowEngineService = new WorkflowEngineService(eventBusService)
    workflowExecutorService = new WorkflowExecutorService(eventBusService)

    devLoopServices.healingAgent = new HealingAgentService(eventBusService)
    devLoopServices.devLoopOrchestrator = new DevLoopOrchestrator(eventBusService)

    const databaseService = deps.databaseService ?? DatabaseService.getInstance()
    orchestrationEngine = new OrchestrationEngine(
      databaseService,
      eventBusService,
      new StateManagerService(databaseService),
      new ResourceManagerService(),
      new StepExecutorService(),
      new CompensationService(databaseService, eventBusService),
      new OperationManagementService()
    )

    // Consume the scheduled workflow triggers the engine registers — without this the
    // cron jobs fire into a queue nobody reads. Consumers must be listening before
    // loadAll() registers the cron jobs that produce into them.
    await workflowExecutorService.initialize()
    await devLoopServices.devLoopOrchestrator.initialize()
    await orchestrationEngine.initialize()

    if (process.env.IMPORT_OPENCLAW_WORKFLOWS === 'true') {
      try {
        const result = await importOpenClawWorkflows()
        logger.info('OpenClaw workflow definitions imported', result)
      } catch (error) {
        logger.error('OpenClaw workflow import failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Seeded before loadAll() so the row exists when the cron jobs are registered.
    // It arrives DISABLED, so registering it schedules nothing until a human has
    // watched it run once via the on-demand trigger.
    if (process.env.SEED_NIGHTLY_TRIAGE === 'true') {
      try {
        const result = await seedNightlyTriageWorkflow()
        logger.info('Nightly triage workflow seed', result)
      } catch (error) {
        logger.error('Nightly triage workflow seed failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await workflowEngineService.loadAll()
    logger.info('orchestration-pipeline feature initialized')
  },

  routes(app) {
    app.use(registerTaskRoutes(taskController))
    app.use(registerWorkflowRoutes(workflowEngineService, workflowExecutorService))
    // Ingress for trigger.kind === 'webhook' definitions. Same reasoning as the
    // GitHub receiver below: only mount it when the shared secret exists, so an
    // unconfigured deploy has no route rather than one that 401s on every call.
    if (process.env.WORKFLOW_WEBHOOK_SECRET) {
      app.use(registerWorkflowHookRoutes(workflowEngineService, workflowExecutorService))
    } else {
      logger.warn(
        'WORKFLOW_WEBHOOK_SECRET not set — workflow webhook triggers will register but cannot fire'
      )
    }
    app.use(registerOperationRoutes(orchestrationEngine))
    app.use(registerDevLoopRoutes(devLoopServices))
    // GitHub webhook receiver (push/PR/check_run → CI monitor). HMAC-SHA256
    // signature verification is enforced per-request; only mount it when the
    // shared secret is configured so an unconfigured deploy doesn't expose a
    // route that fails on every request.
    if (process.env.GITHUB_WEBHOOK_SECRET) {
      app.use(registerGitHubWebhookRoutes())
    } else {
      logger.warn('orchestration-pipeline: GITHUB_WEBHOOK_SECRET not set — GitHub webhook route not mounted')
    }
    if (process.env.JIRA_WEBHOOK_SECRET) {
      app.use(registerJiraWebhookRoutes())
    } else {
      logger.warn('orchestration-pipeline: JIRA_WEBHOOK_SECRET not set — Jira webhook route not mounted')
    }
    return app
  },

  async shutdown(): Promise<void> {
    await orchestrationEngine?.shutdown()
  },
}
