import { ContextRequest } from '@uaip/types';
import { BaseEmbeddingService } from './base_embedding_service.js';

export class EmbeddingService extends BaseEmbeddingService {
  protected openaiApiKey: string;
  protected embeddingModel: string;
  protected embeddingsUrl: string;

  constructor(openaiApiKey?: string, embeddingModel?: string) {
    super();
    // Env-driven config. Defaults preserve today's behavior (OpenAI, ada-002)
    // when nothing is set; point EMBEDDINGS_URL at the CF embed worker to switch.
    this.embeddingsUrl = process.env.EMBEDDINGS_URL || 'https://api.openai.com/v1/embeddings';
    this.openaiApiKey =
      openaiApiKey || process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY || '';
    this.embeddingModel =
      embeddingModel || process.env.EMBEDDINGS_MODEL || 'text-embedding-ada-002';

    if (!this.openaiApiKey) {
      console.warn('No embeddings API key found (EMBEDDINGS_API_KEY / OPENAI_API_KEY)');
    }
  }

  private async fetchOpenAIEmbeddings(
    input: string | string[]
  ): Promise<{ data: Array<{ embedding: number[] }> }> {
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

    const json = await response.json() as { data: Array<{ embedding: number[] }> };
    return json;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const data = await this.fetchOpenAIEmbeddings(text);
      return data.data[0].embedding;
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
      const data = await this.fetchOpenAIEmbeddings(texts);
      return data.data.map((item: { embedding: number[] }) => item.embedding);
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
