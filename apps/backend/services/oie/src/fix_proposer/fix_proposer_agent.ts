import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import type { RootCauseAnalysis } from '../analyst/analyst_agent.js';

const OIE_ANALYSIS_TOPIC = 'oie.analysis.completed';
const OIE_FIX_TOPIC = 'oie.fix.proposed';

const CONFIDENCE_THRESHOLD = parseFloat(process.env.OIE_CONFIDENCE_THRESHOLD ?? '0.8');

export type FixRoutingDecision = 'auto_pr' | 'shadow_jury' | 'jira_comment_only';

export interface FixProposal {
  incidentId: string;
  diff: string;
  explanation: string;
  affectedFiles: string[];
  confidence: number;
  routing: FixRoutingDecision;
  proposedAt: Date;
}

function getRedisOptions() {
  return {
    host: config.redis?.host ?? 'localhost',
    port: config.redis?.port ?? 6379,
    password: config.redis?.password ?? undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

/**
 * Genuine routing policy, kept exported so it survives proposeFix() being
 * unimplemented — a real fix proposer will still need exactly this decision.
 */
export function routeByConfidence(confidence: number): FixRoutingDecision {
  if (confidence >= CONFIDENCE_THRESHOLD) return 'auto_pr';
  if (confidence >= 0.5) return 'shadow_jury';
  return 'jira_comment_only';
}

export class FixProposerAgent {
  private inputWorker: Worker | null = null;
  private outputQueue: Queue | null = null;

  async start(): Promise<void> {
    const connection = getRedisOptions();
    this.outputQueue = new Queue(OIE_FIX_TOPIC, { connection });

    this.inputWorker = new Worker(
      OIE_ANALYSIS_TOPIC,
      async (job: Job) => this.proposeFix(job),
      { connection, concurrency: 1 },
    );

    this.inputWorker.on('failed', (job, err) => {
      logger.error('FixProposerAgent: job failed', { jobId: job?.id, error: err.message });
    });

    logger.info('FixProposerAgent started', { confidenceThreshold: CONFIDENCE_THRESHOLD });
  }

  /**
   * NOT IMPLEMENTED.
   *
   * This used to publish a FixProposal onto the `oie.fix` queue carrying
   * `diff: ''`, a hardcoded `confidence: 0.0`, and the explanation
   * "[STUB] Fix proposal not yet implemented" — then log
   * "FixProposerAgent: proposal published". Downstream consumers had no way to
   * tell that apart from a real proposal with low confidence, so the queue filled
   * with empty diffs presented as work product.
   *
   * Throwing fails the BullMQ job instead, which the 'failed' handler registered
   * in start() already logs. A failed job is the truthful state: an analysis
   * arrived and no fix was produced for it.
   */
  private async proposeFix(job: Job): Promise<void> {
    const analysis = job.data as RootCauseAnalysis;

    if (analysis.confidence === 0) {
      logger.info('FixProposerAgent: skipping stub analysis', { incidentId: analysis.incidentId });
      return;
    }

    throw new Error(
      `FixProposerAgent.proposeFix is not implemented (incident ${analysis.incidentId}, ` +
        `components: ${analysis.affectedComponents.join(', ') || 'none'}). It previously ` +
        `published an empty diff at confidence 0.0 onto the oie.fix queue as though it ` +
        `were a real proposal.`
    );
  }

  async stop(): Promise<void> {
    await this.inputWorker?.close();
    await this.outputQueue?.close();
    logger.info('FixProposerAgent stopped');
  }
}
