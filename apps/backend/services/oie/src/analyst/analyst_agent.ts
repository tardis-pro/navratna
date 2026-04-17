import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import type { TriagedIncident } from '../types/triage.js';

const OIE_INCIDENTS_TOPIC = 'oie.incidents.triaged';
const OIE_ANALYSIS_TOPIC = 'oie.analysis.completed';

export interface RootCauseAnalysis {
  incidentId: string;
  summary: string;
  rootCause: string;
  affectedComponents: string[];
  suggestedFix?: string;
  confidence: number;
  evidenceUrls: string[];
  analyzedAt: Date;
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

export class AnalystAgent {
  private inputWorker: Worker | null = null;
  private outputQueue: Queue | null = null;

  async start(): Promise<void> {
    const connection = getRedisOptions();
    this.outputQueue = new Queue(OIE_ANALYSIS_TOPIC, { connection });

    this.inputWorker = new Worker(
      OIE_INCIDENTS_TOPIC,
      async (job: Job) => this.analyzeIncident(job),
      { connection, concurrency: 1 },
    );

    this.inputWorker.on('failed', (job, err) => {
      logger.error('AnalystAgent: job failed', { jobId: job?.id, error: err.message });
    });

    logger.info('AnalystAgent started');
  }

  private async analyzeIncident(job: Job): Promise<void> {
    const incident = job.data as TriagedIncident;

    if (incident.classification.severity !== 'high' && incident.classification.severity !== 'critical') {
      return;
    }

    logger.info('AnalystAgent: analyzing incident', { incidentId: incident.id, severity: incident.classification.severity });

    const analysis = await this.performAnalysis(incident);

    await this.outputQueue?.add('oie.analysis', analysis, {
      jobId: `analysis:${incident.id}`,
    });

    logger.info('AnalystAgent: analysis published', { incidentId: incident.id, confidence: analysis.confidence });
  }

  private async performAnalysis(incident: TriagedIncident): Promise<RootCauseAnalysis> {
    return {
      incidentId: incident.id,
      summary: `[STUB] Root cause analysis for ${incident.errorCode} in ${incident.service}`,
      rootCause: `[STUB] Analysis not yet implemented. Category: ${incident.classification.category}. Message: ${incident.message}`,
      affectedComponents: [incident.service],
      confidence: 0.0,
      evidenceUrls: [],
      analyzedAt: new Date(),
    };
  }

  async stop(): Promise<void> {
    await this.inputWorker?.close();
    await this.outputQueue?.close();
    logger.info('AnalystAgent stopped');
  }
}
