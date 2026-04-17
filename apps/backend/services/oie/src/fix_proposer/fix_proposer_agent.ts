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

function routeByConfidence(confidence: number): FixRoutingDecision {
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

  private async proposeFix(job: Job): Promise<void> {
    const analysis = job.data as RootCauseAnalysis;

    if (analysis.confidence === 0) {
      logger.info('FixProposerAgent: skipping stub analysis', { incidentId: analysis.incidentId });
      return;
    }

    const confidence = 0.0;
    const routing = routeByConfidence(confidence);

    const proposal: FixProposal = {
      incidentId: analysis.incidentId,
      diff: '',
      explanation: '[STUB] Fix proposal not yet implemented',
      affectedFiles: analysis.affectedComponents,
      confidence,
      routing,
      proposedAt: new Date(),
    };

    await this.outputQueue?.add('oie.fix', proposal, { jobId: `fix:${analysis.incidentId}` });
    logger.info('FixProposerAgent: proposal published', { incidentId: analysis.incidentId, routing });
  }

  async stop(): Promise<void> {
    await this.inputWorker?.close();
    await this.outputQueue?.close();
    logger.info('FixProposerAgent stopped');
  }
}
