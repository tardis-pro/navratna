import type { KnowledgeIngestRequest, KnowledgeIngestResponse, KnowledgeScope } from '@uaip/types';

export interface KnowledgeIngestionPort {
  ingest(
    items: (KnowledgeIngestRequest & { scope?: KnowledgeScope })[]
  ): Promise<KnowledgeIngestResponse>;
}
