/**
 * Jira Outcome Bridge Service
 *
 * Subscribes to jira.operation.completed events and forwards outcomes
 * to the agent.learning.operation channel for AgentLearningService consumption.
 */

import { EventBusService } from '@uaip/infra';
import type { EventBusMessage, JiraOperationOutcome } from '@uaip/types';
import { logger } from '@uaip/utils';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isJiraOperationOutcome(v: unknown): v is JiraOperationOutcome {
  return (
    isRecord(v) &&
    typeof v.operationType === 'string' &&
    typeof v.issueKey === 'string' &&
    typeof v.agentId === 'string' &&
    typeof v.operationId === 'string' &&
    typeof v.status === 'string' &&
    typeof v.timestamp === 'string'
  );
}

const JIRA_OPERATION_EVENT = 'jira.operation.completed';
const LEARNING_OPERATION_EVENT = 'agent.learning.operation';

interface LearningOperationPayload {
  agentId: string;
  operationId: string;
  outcomes: {
    jiraIssueKey: string;
    jiraStatus: string;
    operationType: string;
    result: Record<string, string | number | boolean>;
  };
  feedback: {
    source: string;
    type: 'positive' | 'negative';
    timestamp: string;
  };
}

export class JiraOutcomeBridgeService {
  private readonly eventBus: EventBusService;

  constructor(eventBus: EventBusService) {
    this.eventBus = eventBus;
  }

  async initialize(): Promise<void> {
    await this.eventBus.subscribe(
      JIRA_OPERATION_EVENT,
      async (message: EventBusMessage) => {
        if (!isJiraOperationOutcome(message.data)) {
          logger.warn('Received invalid JiraOperationOutcome payload', { data: message.data });
          return;
        }
        await this.forwardToLearningService(message.data);
      },
      { queue: 'capability-registry.jira-outcome-bridge' }
    );

    logger.info('JiraOutcomeBridgeService initialized', {
      subscribedTo: JIRA_OPERATION_EVENT,
      forwardsTo: LEARNING_OPERATION_EVENT,
    });
  }

  private async forwardToLearningService(outcome: JiraOperationOutcome): Promise<void> {
    const payload: LearningOperationPayload = {
      agentId: outcome.agentId,
      operationId: outcome.operationId,
      outcomes: {
        jiraIssueKey: outcome.issueKey,
        jiraStatus: outcome.status,
        operationType: outcome.operationType,
        result: outcome.result,
      },
      feedback: {
        source: 'jira-adapter',
        type: outcome.status === 'success' ? 'positive' : 'negative',
        timestamp: outcome.timestamp,
      },
    };

    try {
      await this.eventBus.publish(LEARNING_OPERATION_EVENT, payload);

      logger.debug('Forwarded Jira outcome to learning service', {
        agentId: outcome.agentId,
        operationId: outcome.operationId,
        issueKey: outcome.issueKey,
        status: outcome.status,
      });
    } catch (error) {
      logger.error('Failed to forward Jira outcome to learning service', {
        error: error instanceof Error ? error.message : String(error),
        agentId: outcome.agentId,
        operationId: outcome.operationId,
        issueKey: outcome.issueKey,
      });
    }
  }
}
