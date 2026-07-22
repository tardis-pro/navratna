import { EventBusService, getControlDb } from '@uaip/shared-services';
import { eq } from '@uaip/shared-services/drizzle/clients';
import {
  workflowDefinitions,
  type WorkflowDefinition,
} from '@uaip/shared-services/drizzle/control';
import type { RepeatableJob, RepeatOptions } from '@uaip/types';
import { logger, ValidationError } from '@uaip/utils';
const WORKFLOW_QUEUE_EVENT = 'workflow.definition.trigger';

export class WorkflowEngineService {
  constructor(private readonly eventBusService: EventBusService) {}

  async registerOrUpdate(definition: WorkflowDefinition): Promise<void> {
    await this.unregister(definition.id);

    if (!definition.enabled) {
      logger.info('Workflow disabled, skipping registration', { workflowDefinitionId: definition.id });
      return;
    }

    const repeat = this.buildRepeatOptions(definition);
    if (!repeat) {
      logger.info('Workflow trigger is not repeatable, skipping queue registration', {
        workflowDefinitionId: definition.id,
        triggerKind: definition.trigger.kind,
      });
      return;
    }

    const queue = this.getQueue();
    const jobName = this.toJobName(definition.id);
    const jobId = this.toJobId(definition.id);

    await queue.add(
      jobName,
      {
        workflowDefinitionId: definition.id,
        workflowName: definition.name,
        trigger: definition.trigger,
      },
      {
        jobId,
        repeat,
          removeOnComplete: { age: 86400, count: 100 },
          removeOnFail: { age: 604800, count: 100 },
      }
    );

    logger.info('Workflow repeatable job registered', {
      workflowDefinitionId: definition.id,
      triggerKind: definition.trigger.kind,
      expr: definition.trigger.expr,
    });
  }

  async unregister(id: string): Promise<void> {
    const queue = this.getQueue();
    const jobId = this.toJobId(id);
    const jobName = this.toJobName(id);

    const repeatableJobs: RepeatableJob[] = await queue.getRepeatableJobs();
    const jobsToRemove = repeatableJobs.filter(
      (job) => job.name === jobName || job.id === jobId || job.key.includes(jobId)
    );

    for (const job of jobsToRemove) {
      // oxlint-disable-next-line no-await-in-loop -- remove repeatable jobs sequentially
      await queue.removeRepeatableByKey(job.key);
    }

    if (jobsToRemove.length > 0) {
      logger.info('Workflow repeatable jobs removed', {
        workflowDefinitionId: id,
        removed: jobsToRemove.length,
      });
    }
  }

  async loadAll(): Promise<void> {
    const db = getControlDb();
    const definitions = await db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.enabled, true));

    for (const definition of definitions) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- deterministic startup registration
        await this.registerOrUpdate(definition);
      } catch (error) {
        logger.error('Failed to register workflow definition at startup', {
          workflowDefinitionId: definition.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Workflow engine loaded enabled definitions', {
      loaded: definitions.length,
    });
  }

  private getQueue() {
    return this.eventBusService.getOrCreateQueue(WORKFLOW_QUEUE_EVENT);
  }

  private buildRepeatOptions(definition: WorkflowDefinition): RepeatOptions | null {
    if (definition.trigger.kind === 'cron') {
      return {
        pattern: definition.trigger.expr,
        ...(definition.trigger.tz ? { tz: definition.trigger.tz } : {}),
      };
    }

    if (definition.trigger.kind === 'every') {
      const every = Number.parseInt(definition.trigger.expr, 10);
      if (!Number.isFinite(every) || every <= 0) {
        throw new ValidationError(`Invalid 'every' expression for workflow ${definition.id}: ${definition.trigger.expr}`);
      }

      return { every };
    }

    return null;
  }

  private toJobId(workflowDefinitionId: string): string {
    return `workflow-definition:${workflowDefinitionId}`;
  }

  private toJobName(workflowDefinitionId: string): string {
    return `workflow-definition-${workflowDefinitionId}`;
  }
}
