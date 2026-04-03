import { logger } from '@uaip/utils';
import { MemoryConsolidator, WorkingMemoryManager } from '@uaip/shared-services';

const CONSOLIDATION_INTERVAL_MS = 30 * 60 * 1000;

export class MemoryConsolidationScheduler {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private readonly trackedAgentIds = new Set<string>();

  constructor(
    private readonly memoryConsolidator: MemoryConsolidator,
    private readonly workingMemoryManager: WorkingMemoryManager
  ) {}

  start(): void {
    if (this.intervalHandle !== null) {
      return;
    }

    logger.info('Memory consolidation scheduler started', {
      intervalMs: CONSOLIDATION_INTERVAL_MS,
    });

    this.intervalHandle = setInterval(() => {
      void this.runConsolidationCycle();
    }, CONSOLIDATION_INTERVAL_MS);

    if (this.intervalHandle.unref) {
      this.intervalHandle.unref();
    }
  }

  stop(): void {
    if (this.intervalHandle === null) {
      return;
    }

    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    logger.info('Memory consolidation scheduler stopped');
  }

  trackAgent(agentId: string): void {
    this.trackedAgentIds.add(agentId);
  }

  untrackAgent(agentId: string): void {
    this.trackedAgentIds.delete(agentId);
  }

  async runConsolidationCycle(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Consolidation cycle already in progress, skipping');
      return;
    }

    this.isRunning = true;

    try {
      const discoveredIds = await this.workingMemoryManager.getActiveAgentIds();
      for (const id of discoveredIds) {
        this.trackedAgentIds.add(id);
      }

      if (this.trackedAgentIds.size === 0) {
        logger.debug('No active agents to consolidate');
        return;
      }

      logger.info('Starting memory consolidation cycle', {
        agentCount: this.trackedAgentIds.size,
      });

      let consolidated = 0;
      let skipped = 0;
      let failed = 0;

      for (const agentId of this.trackedAgentIds) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- sequential consolidation avoids memory spikes
          const result = await this.memoryConsolidator.consolidateMemories(agentId);
          if (result.consolidated) {
            consolidated++;
            logger.debug('Consolidated memories for agent', {
              agentId,
              episodesCreated: result.episodesCreated,
              conceptsLearned: result.conceptsLearned,
              connectionsFormed: result.connectionsFormed,
            });
          } else {
            skipped++;
          }
        } catch (error) {
          failed++;
          logger.error('Consolidation failed for agent', {
            agentId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('Memory consolidation cycle complete', {
        consolidated,
        skipped,
        failed,
        total: this.trackedAgentIds.size,
      });
    } catch (error) {
      logger.error('Memory consolidation cycle error', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isRunning = false;
    }
  }
}
