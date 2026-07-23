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

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const data = await this.fetchEmbeddings(text);
      const first = data.data[0];
      if (!first) {
        throw new Error('Embedding response contained no vectors');
      }
      return first.embedding;
    } catch (error) {
      console.error('Embedding generation error:', error);
      const wrappedError = new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`);
      Object.assign(wrappedError, { cause: error });
      throw wrappedError;
    }
  }

  async generateEmbeddings(content: string): Promise<number[][]> {
    const chunks = this.splitIntoChunks(content);
    const embeddings: number[][] = [];

    for (const chunk of chunks) {
      // oxlint-disable-next-line no-await-in-loop
      const embedding = await this.generateEmbedding(chunk);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  async generateContextEmbedding(context: ContextRequest): Promise<number[]> {
    const contextText = this.buildContextText(context);
    return this.generateEmbedding(contextText);
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const data = await this.fetchEmbeddings(texts);
      return data.data.map((item) => item.embedding);
    } catch (error) {
      console.error('Batch embedding generation error:', error);
      const embeddings: number[][] = [];
      for (const text of texts) {
        // oxlint-disable-next-line no-await-in-loop
        const embedding = await this.generateEmbedding(text);
        embeddings.push(embedding);
      }
      return embeddings;
    }
  }
}
