/**
 * WorkflowEngineService — turns a stored WorkflowDefinition into something that
 * actually fires.
 *
 * Previously only 'cron' and 'every' triggers were registrable:
 * buildRepeatOptions() returned `null` for 'webhook' and 'event', and
 * registerOrUpdate() logged "skipping queue registration" and returned. The API
 * accepted those definitions, persisted them, and reported success — and they
 * never fired, ever. A malformed 'every' expression threw loudly while an entire
 * trigger kind failed in silence.
 *
 * Every trigger kind now has a real registration path, and an unregistrable
 * definition raises instead of being quietly dropped:
 *
 *   cron / every  → a BullMQ Job Scheduler on `workflow.definition.trigger`
 *   event         → a bus subscription on the topic named by trigger.expr,
 *                   which enqueues onto the same trigger topic on match
 *   webhook       → a routing-key registration; the HMAC-verified ingress at
 *                   POST /api/v1/workflows/hooks/:routingKey resolves it
 *
 * NOTE ON BULLMQ 6: the legacy repeatable-job API (the `repeat` option on
 * Queue#add, getRepeatableJobs(), removeRepeatableByKey()) was removed in v6.
 * Job Schedulers replace it, and upsertJobScheduler() is idempotent by id, so
 * registerOrUpdate no longer needs an unregister-then-add dance for schedules.
 */

import { EventBusService, getControlDb } from '@uaip/shared-services';
import { eq } from '@uaip/shared-services/drizzle/clients';
import {
  workflowDefinitions,
  type WorkflowDefinition,
} from '@uaip/shared-services/drizzle/control';
import type { RepeatOptions } from '@uaip/types';
import { logger, ValidationError } from '@uaip/utils';
import { parseIntervalExpression } from './interval_expression.js';

const WORKFLOW_QUEUE_EVENT = 'workflow.definition.trigger';

/** Handler kept per definition so unregister() can detach the exact subscription. */
type BusHandler = Parameters<EventBusService['subscribe']>[1];

export class WorkflowEngineService {
  /** workflowDefinitionId → { topic, handler } for 'event' triggers. */
  private eventSubscriptions = new Map<string, { topic: string; handler: BusHandler }>();

  /** routingKey → workflowDefinitionId for 'webhook' triggers. */
  private webhookRoutes = new Map<string, string>();

  constructor(private readonly eventBusService: EventBusService) {}

  async registerOrUpdate(definition: WorkflowDefinition): Promise<void> {
    await this.unregister(definition.id);

    if (!definition.enabled) {
      logger.info('Workflow disabled, skipping registration', {
        workflowDefinitionId: definition.id,
      });
      return;
    }

    switch (definition.trigger.kind) {
      case 'cron':
      case 'every':
        await this.registerSchedule(definition);
        return;
      case 'event':
        await this.registerEventTrigger(definition);
        return;
      case 'webhook':
        this.registerWebhookTrigger(definition);
        return;
      default: {
        // Exhaustiveness guard. A new TriggerKind added to the type without a
        // branch here must fail at registration, not fire into nothing.
        const unknownKind: never = definition.trigger.kind;
        throw new ValidationError(
          `Workflow ${definition.id} has unsupported trigger kind '${String(unknownKind)}'. ` +
            `Supported kinds: cron, every, event, webhook.`
        );
      }
    }
  }

  // ── cron / every ───────────────────────────────────────────────────────────

  private async registerSchedule(definition: WorkflowDefinition): Promise<void> {
    const repeat = this.buildRepeatOptions(definition);
    const queue = this.getQueue();

    await queue.upsertJobScheduler(this.toSchedulerId(definition.id), repeat, {
      name: this.toJobName(definition.id),
      data: {
        workflowDefinitionId: definition.id,
        workflowName: definition.name,
        trigger: definition.trigger,
      },
      opts: {
        removeOnComplete: { age: 86400, count: 100 },
        removeOnFail: { age: 604800, count: 100 },
      },
    });

    logger.info('Workflow schedule registered', {
      workflowDefinitionId: definition.id,
      triggerKind: definition.trigger.kind,
      expr: definition.trigger.expr,
    });
  }

  /**
   * Repeat options for a schedule trigger. Unlike the version this replaces, it
   * cannot return null — a non-schedule kind never reaches here, and a malformed
   * expression throws for 'cron' as loudly as it always did for 'every'.
   */
  private buildRepeatOptions(definition: WorkflowDefinition): RepeatOptions {
    if (definition.trigger.kind === 'cron') {
      const pattern = definition.trigger.expr?.trim();
      if (!pattern) {
        throw new ValidationError(
          `Workflow ${definition.id} has a 'cron' trigger with an empty expression.`
        );
      }
      return {
        pattern,
        ...(definition.trigger.tz ? { tz: definition.trigger.tz } : {}),
      };
    }

    const every = parseIntervalExpression(definition.trigger.expr);
    if (every === null) {
      throw new ValidationError(
        `Invalid 'every' expression for workflow ${definition.id}: ${definition.trigger.expr}`
      );
    }
    return { every };
  }

  // ── event ──────────────────────────────────────────────────────────────────

  /**
   * Subscribes to the bus topic named by trigger.expr. On a matching message the
   * definition is enqueued onto the same `workflow.definition.trigger` topic the
   * schedules use, so WorkflowExecutorService handles all kinds identically and
   * the firing is queued (retried, deduped) rather than run inline on the
   * subscriber thread.
   */
  private async registerEventTrigger(definition: WorkflowDefinition): Promise<void> {
    const topic = definition.trigger.expr?.trim();
    if (!topic) {
      throw new ValidationError(
        `Workflow ${definition.id} has an 'event' trigger with no topic in 'expr'.`
      );
    }
    if (topic.includes(':')) {
      // Event types become BullMQ queue names; assertValidEventType would throw
      // later, at subscribe time, where it is far less obvious why.
      throw new ValidationError(
        `Workflow ${definition.id} has an 'event' trigger on topic '${topic}', which ` +
          `cannot contain ':' — event topics become BullMQ queue names. Use dots.`
      );
    }
    if (topic === WORKFLOW_QUEUE_EVENT) {
      throw new ValidationError(
        `Workflow ${definition.id} cannot trigger on '${WORKFLOW_QUEUE_EVENT}' — that is the ` +
          `topic workflow firings are published to, so it would re-trigger itself forever.`
      );
    }

    const handler: BusHandler = async (message) => {
      logger.info('Event trigger matched, enqueuing workflow', {
        workflowDefinitionId: definition.id,
        topic,
      });
      await this.eventBusService.publish(WORKFLOW_QUEUE_EVENT, {
        workflowDefinitionId: definition.id,
        workflowName: definition.name,
        trigger: definition.trigger,
        triggeredBy: { kind: 'event', topic, event: message.data },
      });
    };

    await this.eventBusService.subscribe(topic, handler);
    this.eventSubscriptions.set(definition.id, { topic, handler });

    logger.info('Workflow event trigger registered', {
      workflowDefinitionId: definition.id,
      topic,
    });
  }

  // ── webhook ────────────────────────────────────────────────────────────────

  /**
   * Registers the routing key the HMAC-verified ingress looks up. There is no
   * queue registration to do — the firing originates from an inbound request —
   * but the definition must still be *resolvable*, which is what makes this
   * different from the old silent skip.
   */
  private registerWebhookTrigger(definition: WorkflowDefinition): void {
    const routingKey = definition.trigger.expr?.trim();
    if (!routingKey) {
      throw new ValidationError(
        `Workflow ${definition.id} has a 'webhook' trigger with no routing key in 'expr'. ` +
          `Set 'expr' to the path segment the hook will be called on.`
      );
    }
    if (!/^[A-Za-z0-9._-]+$/.test(routingKey)) {
      throw new ValidationError(
        `Workflow ${definition.id} has webhook routing key '${routingKey}', which must ` +
          `contain only letters, digits, '.', '_' or '-' (it becomes a URL path segment).`
      );
    }

    const existing = this.webhookRoutes.get(routingKey);
    if (existing && existing !== definition.id) {
      throw new ValidationError(
        `Webhook routing key '${routingKey}' is already registered to workflow ${existing}. ` +
          `Routing keys must be unique.`
      );
    }

    this.webhookRoutes.set(routingKey, definition.id);

    logger.info('Workflow webhook trigger registered', {
      workflowDefinitionId: definition.id,
      routingKey,
      path: `/api/v1/workflows/hooks/${routingKey}`,
    });
  }

  /** Resolves an inbound hook path segment to a workflow definition id. */
  resolveWebhookRoute(routingKey: string): string | null {
    return this.webhookRoutes.get(routingKey) ?? null;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  async unregister(id: string): Promise<void> {
    const queue = this.getQueue();
    const removed = await queue.removeJobScheduler(this.toSchedulerId(id));
    if (removed) {
      logger.info('Workflow schedule removed', { workflowDefinitionId: id });
    }

    const subscription = this.eventSubscriptions.get(id);
    if (subscription) {
      await this.eventBusService.unsubscribe(subscription.topic, subscription.handler);
      this.eventSubscriptions.delete(id);
      logger.info('Workflow event trigger removed', {
        workflowDefinitionId: id,
        topic: subscription.topic,
      });
    }

    for (const [routingKey, definitionId] of this.webhookRoutes) {
      if (definitionId === id) {
        this.webhookRoutes.delete(routingKey);
        logger.info('Workflow webhook trigger removed', {
          workflowDefinitionId: id,
          routingKey,
        });
      }
    }
  }

  async loadAll(): Promise<void> {
    const db = getControlDb();
    const definitions = await db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.enabled, true));

    let failed = 0;
    for (const definition of definitions) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- deterministic startup registration
        await this.registerOrUpdate(definition);
      } catch (error) {
        failed += 1;
        logger.error('Failed to register workflow definition at startup', {
          workflowDefinitionId: definition.id,
          triggerKind: definition.trigger.kind,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Workflow engine loaded enabled definitions', {
      loaded: definitions.length - failed,
      failed,
    });
  }

  private getQueue() {
    return this.eventBusService.getOrCreateQueue(WORKFLOW_QUEUE_EVENT);
  }

  private toSchedulerId(workflowDefinitionId: string): string {
    return `workflow-definition-${workflowDefinitionId}`;
  }

  private toJobName(workflowDefinitionId: string): string {
    return `workflow-definition-${workflowDefinitionId}`;
  }
}
