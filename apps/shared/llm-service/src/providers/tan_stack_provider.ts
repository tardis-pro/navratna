import { chat } from '@tanstack/ai';
import type { AIAdapter } from '@tanstack/ai';
import { createAnthropic } from '@tanstack/ai-anthropic';
import { createOllama } from '@tanstack/ai-ollama';
import OpenAI from 'openai';
import { BaseProvider } from './base_provider.js';
import { LLMRequest, LLMResponse, LLMProviderConfig, ProviderModelInfo } from '../interfaces.js';
import { StreamChunk, StreamingLLMRequest } from '@uaip/types';
import { logger } from '@uaip/utils';

type SupportedFinishReason = NonNullable<LLMResponse['finishReason']>;

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
      case 'anthropic': {
        const apiKey = await this.getApiKey();
        return createAnthropic(apiKey);
      }

      case 'ollama':
        return createOllama(baseUrl || 'http://localhost:11434');

      default:
        throw new Error(`${this.name}: ${type} uses the OpenAI-compatible client, not a TanStack adapter`);
    }
  }

  private isOpenAICompatible(): boolean {
    return this.config.type !== 'anthropic' && this.config.type !== 'ollama';
  }

  private async createOpenAIClient(): Promise<OpenAI> {
    return new OpenAI({
      apiKey: await this.getApiKey(),
      baseURL: this.config.baseUrl || 'https://api.openai.com/v1',
      defaultHeaders: {
        'User-Agent': null,
      },
    });
  }

  private buildOpenAIMessages(systemPrompt: string | undefined, prompt: string): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  private async generateOpenAIResponse(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.config.defaultModel;
    if (!model) throw new Error(`${this.name}: no model configured for OpenAI-compatible request`);

    const response = await (await this.createOpenAIClient()).chat.completions.create({
      model,
      messages: this.buildOpenAIMessages(request.systemPrompt, request.prompt),
      max_tokens: request.maxTokens || 2000,
      temperature: request.temperature || 0.7,
    });

    return {
      content: response.choices[0]?.message.content || '',
      model: response.model || model,
      tokensUsed: response.usage?.total_tokens || 0,
      confidence: 0.9,
      finishReason: this.normalizeFinishReason(response.choices[0]?.finish_reason),
    };
  }

  private normalizeFinishReason(reason: OpenAI.Chat.Completions.ChatCompletion.Choice['finish_reason'] | undefined): SupportedFinishReason {
    if (reason === 'length') return 'length';
    if (reason === 'tool_calls' || reason === 'function_call') return 'tool_calls';
    if (reason === 'content_filter') return 'error';
    return 'stop';
  }

  private async *streamOpenAIResponse(request: StreamingLLMRequest): AsyncGenerator<StreamChunk> {
    const model = request.model || this.config.defaultModel;
    if (!model) throw new Error(`${this.name}: no model configured for OpenAI-compatible stream`);

    const stream = await (await this.createOpenAIClient()).chat.completions.create({
      model,
      messages: this.buildOpenAIMessages(request.systemPrompt, request.prompt),
      max_tokens: request.maxTokens || 2000,
      temperature: request.temperature || 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta.content;
      if (content) yield { type: 'token', content };
    }

    yield { type: 'done' };
  }

  private buildTanStackMessages(systemPrompt: string | undefined, prompt: string): Array<{ role: 'user'; content: string }> {
    const userContent = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    return [{ role: 'user' as const, content: userContent }];
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      if (this.isOpenAICompatible()) return await this.generateOpenAIResponse(request);

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
    if (this.isOpenAICompatible()) {
      yield* this.streamOpenAIResponse(request);
      return;
    }

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
