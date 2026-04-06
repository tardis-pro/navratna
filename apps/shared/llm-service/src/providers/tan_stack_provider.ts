import { chat } from '@tanstack/ai';
import { openai } from '@tanstack/ai-openai';
import { anthropic } from '@tanstack/ai-anthropic';
import { ollama } from '@tanstack/ai-ollama';
import { BaseProvider } from './base_provider.js';
import { LLMRequest, LLMResponse, LLMProviderConfig, ProviderModelInfo } from '../interfaces.js';
import { StreamChunk, StreamingLLMRequest } from '@uaip/types';
import { logger } from '@uaip/utils';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class TanStackProvider extends BaseProvider {
  constructor(config: LLMProviderConfig) {
    super(config, `TanStack-${config.type}`);
  }

  private async createAdapter(): Promise<unknown> {
    const { type, baseUrl } = this.config;

    switch (type) {
      case 'openai':
        return openai({
          baseURL: baseUrl || 'https://api.openai.com/v1',
        });

      case 'anthropic':
        return anthropic({
          baseURL: baseUrl,
        });

      case 'ollama':
        return ollama({
          baseURL: baseUrl || 'http://localhost:11434',
        });

      default:
        // Fallback to OpenAI-compatible for custom providers
        return openai({
          baseURL: baseUrl,
        });
    }
  }

  private buildTanStackMessages(systemPrompt: string | undefined, prompt: string): Array<{ role: 'user'; content: string }> {
    const userContent = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    return [{ role: 'user' as const, content: userContent }];
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      const adapter = await this.createAdapter();
      const messages = this.buildTanStackMessages(request.systemPrompt, request.prompt);
      const model = request.model || this.config.defaultModel || 'gpt-4o';

      // @ts-expect-error -- adapter is unknown; model/maxTokens/temperature are runtime-valid but not in TextActivityOptions type
      const response = await chat({ adapter, model, messages, maxTokens: request.maxTokens || 2000, temperature: request.temperature || 0.7 });

      // Collect full response from stream
      let content = '';
      let tokensUsed = 0;

      for await (const chunk of response) {
        if (!isRecord(chunk)) continue;
        if (chunk.type === 'done') {
          const usage = isRecord(chunk.usage) ? chunk.usage : null;
          tokensUsed = typeof usage?.totalTokens === 'number' ? usage.totalTokens : 0;
        } else if (typeof chunk.content === 'string') {
          content += chunk.content;
        }
      }

      return {
        content,
        model: request.model || this.config.defaultModel || 'unknown',
        tokensUsed,
        confidence: 0.9,
        finishReason: 'stop',
      };
    } catch (error) {
      logger.error('TanStackProvider generateResponse error', { error });
      return this.handleError(error, 'generateResponse');
    }
  }

  /**
   * Stream response - yields chunks as they arrive
   */
  async *streamResponse(request: StreamingLLMRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const adapter = await this.createAdapter();
    const messages = this.buildTanStackMessages(request.systemPrompt, request.prompt);
    const model = request.model || this.config.defaultModel || 'gpt-4o';

    // @ts-expect-error -- adapter is unknown; model/maxTokens/temperature are runtime-valid but not in TextActivityOptions type
    const stream = await chat({ adapter, model, messages, maxTokens: request.maxTokens || 2000, temperature: request.temperature || 0.7 });

    let tokenIndex = 0;

    for await (const chunk of stream) {
      if (!isRecord(chunk)) continue;

      if (typeof chunk.content === 'string') {
        yield {
          id: `chunk-${tokenIndex++}`,
          type: 'token',
          content: chunk.content,
          timestamp: Date.now(),
        };
      } else if (chunk.type === 'tool_call') {
        yield {
          id: `tool-${tokenIndex++}`,
          type: 'tool-call',
          content: JSON.stringify(chunk),
          timestamp: Date.now(),
          metadata: { toolName: chunk.name },
        };
      } else if (chunk.type === 'tool_result') {
        yield {
          id: `tool-result-${tokenIndex++}`,
          type: 'tool-result',
          content: JSON.stringify(chunk),
          timestamp: Date.now(),
        };
      } else if (chunk.type === 'done') {
        yield {
          id: `done-${Date.now()}`,
          type: 'done',
          timestamp: Date.now(),
          metadata: { usage: chunk.usage },
        };
      } else if (chunk.type === 'error') {
        const errorMessage =
          typeof chunk.message === 'string' ? chunk.message : 'Unknown error';
        yield {
          id: `error-${Date.now()}`,
          type: 'error',
          content: errorMessage,
          timestamp: Date.now(),
        };
      }
    }
  }

  protected async fetchModelsFromProvider(): Promise<ProviderModelInfo[]> {
    // TanStack AI doesn't have a models endpoint - return configured models
    const defaultModels = this.getDefaultModelsForType();
    return defaultModels.map((model) => ({
      id: model,
      name: model,
      description: `${this.config.type} model: ${model}`,
      source: this.config.baseUrl || 'default',
      apiEndpoint: this.config.baseUrl || '',
    }));
  }

  private getDefaultModelsForType(): string[] {
    switch (this.config.type) {
      case 'openai':
        return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
      case 'anthropic':
        return ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
      case 'ollama':
        return ['llama3.2', 'mistral', 'codellama'];
      default:
        return ['default'];
    }
  }
}
