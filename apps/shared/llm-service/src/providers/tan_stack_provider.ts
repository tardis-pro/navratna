import { chat } from '@tanstack/ai';
import type { AIAdapter } from '@tanstack/ai';
import { createOpenAI } from '@tanstack/ai-openai';
import { createAnthropic } from '@tanstack/ai-anthropic';
import { createOllama } from '@tanstack/ai-ollama';
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

  private async createAdapter(): Promise<AIAdapter> {
    const { type, baseUrl } = this.config;

    switch (type) {
      case 'openai': {
        const apiKey = await this.getApiKey();
        return createOpenAI(apiKey, {
          baseURL: baseUrl || 'https://api.openai.com/v1',
        });
      }

      case 'anthropic': {
        const apiKey = await this.getApiKey();
        return createAnthropic(apiKey);
      }

      case 'ollama':
        return createOllama(baseUrl || 'http://localhost:11434');

      default: {
        // Fallback to OpenAI-compatible for custom providers
        const apiKey = await this.getApiKey();
        return createOpenAI(apiKey, {
          baseURL: baseUrl,
        });
      }
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
      const model = request.model || this.config.defaultModel;
      if (!model) {
        throw new Error(`${this.name}: no model configured for TanStack request`);
      }

      const response = chat({ adapter, model, messages, options: { maxTokens: request.maxTokens || 2000, temperature: request.temperature || 0.7 } });

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
    const model = request.model || this.config.defaultModel;
    if (!model) {
      throw new Error(`${this.name}: no model configured for TanStack stream`);
    }

    const stream = chat({ adapter, model, messages, options: { maxTokens: request.maxTokens || 2000, temperature: request.temperature || 0.7 } });

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
    if (!this.config.defaultModel) {
      return [];
    }

    return [{
      id: this.config.defaultModel,
      name: this.config.defaultModel,
      description: `${this.config.type} model: ${this.config.defaultModel}`,
      source: this.config.baseUrl || 'default',
      apiEndpoint: this.config.baseUrl || '',
    }];
  }
}
