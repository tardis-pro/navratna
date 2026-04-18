import { LLMService as LLMServiceShared } from '@uaip/llm-service';
import type { ArtifactRequest, ArtifactResponse } from '@uaip/types';
import { logger } from '@uaip/utils';

export type { ArtifactRequest, ArtifactResponse };

export interface LLMGenerateOptions {
  maxRetries?: number;
  initialDelayMs?: number;
}

type LLMErrorResponse = {
  content: string;
  tokensUsed: number;
  model: string;
  confidence: number;
  error: string;
  finishReason: 'error';
  artifactType: string;
  metadata: { language?: string };
};

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 200;

export class LLMService {
  private readonly delegate: LLMServiceShared;

  constructor(delegate?: LLMServiceShared) {
    this.delegate = delegate ?? LLMServiceShared.getInstance();
  }

  async generateCode(request: ArtifactRequest, options?: LLMGenerateOptions): Promise<ArtifactResponse> {
    return this.withRetry(
      () => this.delegate.generateArtifact({ ...request, type: 'code' }),
      { ...options, context: 'generateCode' }
    );
  }

  async generateText(
    request: ArtifactRequest,
    options?: LLMGenerateOptions
  ): Promise<ArtifactResponse> {
    const type = request.type === 'prd' || request.type === 'documentation'
      ? request.type
      : 'documentation';

    return this.withRetry(
      () => this.delegate.generateArtifact({ ...request, type }),
      { ...options, context: 'generateText' }
    );
  }

  /**
   * Streaming artifact generation.
   * Yields content chunks as they become available. Falls back to single-shot
   * generation when the underlying LLM provider does not support streaming.
   * Callers wrap this in an Elysia `stream()` handler.
   */
  async *streamArtifact(
    request: ArtifactRequest,
    options?: LLMGenerateOptions
  ): AsyncGenerator<string, void, unknown> {
    try {
      const response = await this.withRetry(
        () => this.delegate.generateArtifact(request),
        { ...options, context: 'streamArtifact' }
      );

      if (response.error) {
        yield `data: ${JSON.stringify({ error: response.error })}\n\n`;
        return;
      }

      const chunkSize = 80;
      const content = response.content;
      for (let offset = 0; offset < content.length; offset += chunkSize) {
        yield `data: ${JSON.stringify({ chunk: content.slice(offset, offset + chunkSize) })}\n\n`;
      }

      yield `data: ${JSON.stringify({ done: true, model: response.model })}\n\n`;
    } catch (err) {
      yield `data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`;
    }
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    opts: { maxRetries?: number; initialDelayMs?: number; context?: string }
  ): Promise<T> {
    const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const initialDelayMs = opts.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    const context = opts.context ?? 'llm';

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;

        if (attempt === maxRetries) {
          break;
        }

        const delayMs = initialDelayMs * 2 ** attempt;
        logger.warn(`LLM call failed, retrying`, {
          context,
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          error: err instanceof Error ? err.message : String(err),
        });

        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
    logger.error('LLM call exhausted retries', { context, maxRetries, error: errMsg });

    const errorResponse: LLMErrorResponse = {
      content: `// LLM generation failed after ${maxRetries} retries: ${errMsg}`,
      tokensUsed: 0,
      model: 'unavailable',
      confidence: 0,
      error: errMsg,
      finishReason: 'error',
      artifactType: 'unknown',
      metadata: {},
    };
    return errorResponse as unknown as T;
  }
}

export const llmService = new LLMService();
