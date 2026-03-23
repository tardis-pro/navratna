import { KnowledgeIngestRequest, KnowledgeItem } from '@uaip/types';

/**
 * Port interface for knowledge ingestion.
 * Abstracts the ingest capability so BatchProcessorService doesn't depend
 * on KnowledgeGraphService directly.
 */
export interface KnowledgeIngestionPort {
  ingest(
    items: (KnowledgeIngestRequest & { scope?: { userId?: string; agentId?: string } })[]
  ): Promise<{ items: KnowledgeItem[]; processedCount: number; errors?: string[] }>;
}