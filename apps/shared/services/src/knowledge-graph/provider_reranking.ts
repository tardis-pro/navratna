import type { ContextRequest } from '@uaip/types';
import { logger } from '@uaip/utils';

/**
 * Port for embedding generation. Implemented by EmbeddingService /
 * SmartEmbeddingService and (legacy) TEIEmbeddingService. Consumers like
 * EnhancedRAGService depend on this interface, never on a concrete TEI client.
 */
export interface EmbeddingPort {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(content: string): Promise<number[][]>;
  generateContextEmbedding(context: ContextRequest): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
  calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number>;
}

export interface ProviderEmbeddingPort extends EmbeddingPort {
  rerank?(query: string, documents: string[], topK?: number): Promise<RerankResultItem[] | null>;
}

export interface RerankResultItem {
  index: number;
  score: number;
}

/**
 * Port for second-stage reranking. Implementations MUST return real
 * provider-assigned scores; fabricating scores is forbidden. When no reranker
 * is configured the port is simply absent (null), and callers keep the
 * first-stage vector order.
 */
export interface RerankingPort {
  rerank(query: string, documents: string[], topK?: number): Promise<RerankResultItem[]>;
}

export type RerankLimitField = 'top_n' | 'top_k';

export interface RerankingClientConfig {
  endpoint: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  limitField?: RerankLimitField;
}

export interface RerankingProviderConfig {
  endpoint: string;
  apiKey?: string;
  model?: string;
}

interface NormalizedRerankItem {
  index: number;
  score: number;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumericField(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function normalizeRerankItem(value: unknown): NormalizedRerankItem | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const index = readNumericField(value, ['index']);
  // Conventional hosted rerankers (Cohere, Jina, Voyage, TEI) all use one of
  // these score field names.
  const score = readNumericField(value, ['relevance_score', 'score', 'relevanceScore']);
  if (index === null || score === null || index < 0) {
    return null;
  }
  return { index, score: score ?? 0 };
}

function extractResultArray(body: unknown): unknown[] | null {
  if (Array.isArray(body)) {
    return body;
  }
  if (isPlainRecord(body)) {
    for (const key of ['results', 'data', 'ranking'] as const) {
      const candidate = body[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Normalize hosted rerank responses of the conventional shape
 * `{ results: [{ index, relevance_score }] }` plus safe provider variants
 * (bare arrays, `data`/`ranking` wrappers, `score`/`relevanceScore` fields).
 * Throws when the body does not contain any recognizable result array.
 */
export function normalizeRerankResponse(body: unknown): RerankResultItem[] {
  const items = extractResultArray(body);
  if (!items) {
    throw new Error('Rerank response does not contain a results array');
  }

  const normalized: RerankResultItem[] = [];
  for (let position = 0; position < items.length; position++) {
    const parsed = normalizeRerankItem(items[position]);
    if (parsed) {
      normalized.push({ index: parsed.index, score: parsed.score });
    }
  }
  return normalized;
}

const DEFAULT_RERANK_TIMEOUT_MS = 30000;

/**
 * HTTP client for a hosted reranking provider (Cohere/Jina/Voyage/TEI-shaped).
 * Only constructed with an explicitly configured provider — there is no
 * default endpoint, so the default production path never calls localhost.
 */
export class ProviderRerankingClient implements RerankingPort {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly model?: string;
  private readonly timeoutMs: number;
  private readonly limitField: RerankLimitField;

  constructor(config: RerankingClientConfig) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_RERANK_TIMEOUT_MS;
    this.limitField = config.limitField ?? (config.endpoint.toLowerCase().includes('voyage') ? 'top_k' : 'top_n');
  }

  async rerank(query: string, documents: string[], topK?: number): Promise<RerankResultItem[]> {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }
    const validDocuments = documents.filter((doc) => doc && doc.trim().length > 0);
    if (validDocuments.length === 0) {
      return [];
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: query.trim(),
          documents: validDocuments,
          ...(this.model ? { model: this.model } : {}),
          ...(topK ? { [this.limitField]: topK } : {}),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`Reranking provider error: ${response.status} ${response.statusText}`);
    }

    const body: unknown = await response.json();
    const results = normalizeRerankResponse(body);
    results.sort((a, b) => b.score - a.score);
    return topK ? results.slice(0, topK) : results;
  }
}

/**
 * Build a reranking port from resolved provider config. Returns null when no
 * reranker is configured — callers degrade to first-stage vector order.
 */
export function createRerankingPort(
  provider: RerankingProviderConfig | null | undefined
): RerankingPort | null {
  if (!provider?.endpoint) {
    logger.info('No reranking provider configured; retrieval will use first-stage vector order', {
      service: 'provider-reranking',
    });
    return null;
  }
  return new ProviderRerankingClient({
    endpoint: provider.endpoint,
    apiKey: provider.apiKey,
    model: provider.model,
  });
}
