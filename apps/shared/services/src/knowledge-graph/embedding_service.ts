import { createHash } from 'node:crypto';
import { ContextRequest } from '@uaip/types';
import { BaseEmbeddingService } from './base_embedding_service.js';
import type { ResolvedEmbeddingProvider } from './embedding_provider_resolver';
import type { EmbeddingPort } from './provider_reranking';

export interface EmbeddingServiceOptions {
  apiKey?: string;
  model?: string;
  provider?: ResolvedEmbeddingProvider | null;
}

interface OpenAIEmbeddingItem {
  embedding: number[];
  index?: number;
}

interface NormalizedEmbeddingResponse {
  data: OpenAIEmbeddingItem[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => typeof n === 'number');
}

function isNumberMatrix(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every((row) => isNumberArray(row));
}

/**
 * Normalize OpenAI-shaped embedding responses (`{ data: [{ embedding }] }`)
 * with runtime validation. Also accepts the safe bare-vector variants
 * (`number[]` for single input, `number[][]` for batch) returned by some
 * hosted embedding gateways.
 */
export function normalizeEmbeddingResponse(body: unknown): NormalizedEmbeddingResponse {
  if (isNumberMatrix(body)) {
    return { data: body.map((embedding, index) => ({ embedding, index })) };
  }

  if (isNumberArray(body)) {
    return { data: [{ embedding: body, index: 0 }] };
  }

  if (isPlainRecord(body) && Array.isArray(body.data)) {
    const items: OpenAIEmbeddingItem[] = [];
    for (const entry of body.data) {
      if (!isPlainRecord(entry) || !isNumberArray(entry.embedding)) {
        throw new Error('Embedding response contains an entry without a numeric embedding vector');
      }
      items.push({
        embedding: entry.embedding,
        index: typeof entry.index === 'number' ? entry.index : undefined,
      });
    }
    return { data: items };
  }

  throw new Error('Embedding response is not an OpenAI-shaped object or numeric vector payload');
}

const DEFAULT_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-ada-002';

/**
 * Max inputs sent in a single embeddings request. Providers accept large
 * batches, but an unbounded batch turns one slow item into one enormous
 * payload; 64 keeps request size predictable while still collapsing the
 * per-call round-trip overhead that dominates ingest.
 */
const MAX_BATCH_INPUTS = 64;

/**
 * Max combined characters per embeddings request. Guards against a batch of
 * long documents producing a multi-megabyte body.
 */
const MAX_BATCH_CHARS = 200_000;

const DEFAULT_CACHE_ENTRIES = 2048;

function resolveCacheCapacity(): number {
  const raw = process.env.EMBEDDINGS_CACHE_SIZE;
  if (!raw) {
    return DEFAULT_CACHE_ENTRIES;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_CACHE_ENTRIES;
  }
  return parsed;
}

/**
 * Process-wide content-addressed embedding cache.
 *
 * Embedding is a pure function of (model, text), so identical text never needs
 * to be re-embedded. This matters because relationship detection re-embeds the
 * same recent knowledge items on every single ingested item — without a cache
 * that is ~50 redundant provider round-trips per item.
 *
 * Shared across service instances so a rebuilt service (or a second consumer)
 * keeps the warm set. Insertion-ordered Map = LRU.
 */
class EmbeddingCache {
  private readonly entries = new Map<string, number[]>();

  constructor(private readonly capacity: number) {}

  get(key: string): number[] | undefined {
    if (this.capacity === 0) {
      return undefined;
    }
    const hit = this.entries.get(key);
    if (!hit) {
      return undefined;
    }
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, hit);
    // Defensive copy: callers must never be able to corrupt a shared vector.
    return hit.slice();
  }

  set(key: string, embedding: number[]): void {
    if (this.capacity === 0) {
      return;
    }
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, embedding.slice());
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done) {
        break;
      }
      this.entries.delete(oldest.value);
    }
  }
}

const embeddingCache = new EmbeddingCache(resolveCacheCapacity());

/**
 * Split texts into provider requests bounded by both input count and total
 * characters. A single text over the char budget still gets its own request.
 */
function chunkByBudget(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const text of texts) {
    const wouldExceed =
      current.length >= MAX_BATCH_INPUTS ||
      (current.length > 0 && currentChars + text.length > MAX_BATCH_CHARS);

    if (wouldExceed) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(text);
    currentChars += text.length;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

/**
 * Order a batch response back onto its request inputs. Providers return an
 * `index` per item; when every item carries one we sort by it rather than
 * trusting array order.
 */
function orderedEmbeddings(response: NormalizedEmbeddingResponse, expected: number): number[][] {
  const items = response.data;
  if (items.length !== expected) {
    throw new Error(
      `Embedding response returned ${items.length} vectors for ${expected} inputs`
    );
  }

  const everyIndexed = items.every((item) => typeof item.index === 'number');
  if (!everyIndexed) {
    return items.map((item) => item.embedding);
  }

  const ordered = [...items].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return ordered.map((item) => item.embedding);
}

export class EmbeddingService extends BaseEmbeddingService implements EmbeddingPort {
  protected openaiApiKey: string;
  protected embeddingModel: string;
  protected embeddingsUrl: string;

  constructor(options?: EmbeddingServiceOptions);
  constructor(openaiApiKey?: string, embeddingModel?: string);
  constructor(
    optionsOrApiKey?: EmbeddingServiceOptions | string,
    legacyEmbeddingModel?: string
  ) {
    super();
    let options: EmbeddingServiceOptions;
    if (typeof optionsOrApiKey === 'string') {
      options = { apiKey: optionsOrApiKey, model: legacyEmbeddingModel };
    } else if (optionsOrApiKey === undefined) {
      options = { model: legacyEmbeddingModel };
    } else {
      options = optionsOrApiKey;
    }

    // Env-driven config. Defaults preserve OpenAI/ada-002 behavior when nothing
    // is set; EMBEDDINGS_URL is the environment embedding fallback (e.g. the CF
    // embed worker). A resolved DB provider overrides env values.
    const provider = options.provider ?? null;
    this.embeddingsUrl = provider?.endpoint || process.env.EMBEDDINGS_URL || DEFAULT_EMBEDDINGS_URL;
    this.openaiApiKey =
      provider?.apiKey ||
      options.apiKey ||
      process.env.EMBEDDINGS_API_KEY ||
      process.env.OPENAI_API_KEY ||
      '';
    this.embeddingModel =
      provider?.model || options.model || process.env.EMBEDDINGS_MODEL || DEFAULT_EMBEDDING_MODEL;

    if (!this.openaiApiKey) {
      console.warn('No embeddings API key found (EMBEDDINGS_API_KEY / OPENAI_API_KEY)');
    }
  }

  protected async fetchEmbeddings(input: string | string[]): Promise<NormalizedEmbeddingResponse> {
    const response = await fetch(this.embeddingsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.openaiApiKey}`,
        // Also sent so this works against the CF embed worker's X-Embed-Auth
        // guard. Harmless (ignored) when the endpoint is OpenAI.
        'X-Embed-Auth': this.openaiApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input, model: this.embeddingModel }),
    });

    if (!response.ok) {
      throw new Error(`Embeddings API error: ${response.statusText}`);
    }

    const json: unknown = await response.json();
    return normalizeEmbeddingResponse(json);
  }

  /** Cache key for a text under the currently configured model. */
  private cacheKey(text: string): string {
    return `${this.embeddingModel}:${createHash('sha256').update(text).digest('hex')}`;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const key = this.cacheKey(text);
    const cached = embeddingCache.get(key);
    if (cached) {
      return cached;
    }

    try {
      const data = await this.fetchEmbeddings(text);
      const first = data.data[0];
      if (!first) {
        throw new Error('Embedding response contained no vectors');
      }
      embeddingCache.set(key, first.embedding);
      return first.embedding;
    } catch (error) {
      console.error('Embedding generation error:', error);
      const wrappedError = new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`);
      Object.assign(wrappedError, { cause: error });
      throw wrappedError;
    }
  }

  async generateEmbeddings(content: string): Promise<number[][]> {
    // Chunks of one document are independent, so they go out as one batch
    // instead of N sequential round-trips.
    return this.generateBatchEmbeddings(this.splitIntoChunks(content));
  }

  async generateContextEmbedding(context: ContextRequest): Promise<number[]> {
    const contextText = this.buildContextText(context);
    return this.generateEmbedding(contextText);
  }

  /**
   * Embed many texts with one provider round-trip per batch.
   *
   * Cached texts are served locally and duplicates within the request are
   * embedded once, so only genuinely new text reaches the provider. On batch
   * failure this degrades to per-text calls so one bad input cannot fail the
   * whole set.
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const results = new Array<number[] | undefined>(texts.length);
    // Distinct uncached text -> every position in `texts` that wants it.
    const pending = new Map<string, number[]>();

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const cached = embeddingCache.get(this.cacheKey(text));
      if (cached) {
        results[i] = cached;
        continue;
      }
      const positions = pending.get(text);
      if (positions) {
        positions.push(i);
      } else {
        pending.set(text, [i]);
      }
    }

    const uniqueTexts = [...pending.keys()];

    for (const batch of chunkByBudget(uniqueTexts)) {
      let vectors: number[][];

      try {
        // oxlint-disable-next-line no-await-in-loop
        const response = await this.fetchEmbeddings(batch);
        vectors = orderedEmbeddings(response, batch.length);
      } catch (error) {
        console.error('Batch embedding generation error:', error);
        vectors = [];
        for (const text of batch) {
          // oxlint-disable-next-line no-await-in-loop
          vectors.push(await this.generateEmbedding(text));
        }
      }

      for (let b = 0; b < batch.length; b++) {
        const text = batch[b];
        const vector = vectors[b];
        embeddingCache.set(this.cacheKey(text), vector);
        for (const position of pending.get(text) ?? []) {
          results[position] = vector;
        }
      }
    }

    return results.map((vector, index) => {
      if (!vector) {
        throw new Error(`Embedding missing for input at index ${index}`);
      }
      return vector;
    });
  }
}
