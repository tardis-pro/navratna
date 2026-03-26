import { BaseProvider } from './base_provider.js';
import { LLMRequest, LLMResponse } from '../interfaces';

export class OpenAIProvider extends BaseProvider {
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private static toString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private static toNumber(value: unknown): number | null {
    return typeof value === 'number' ? value : null;
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      const url = `${this.config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`;
      const messages = [];

      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }

      messages.push({ role: 'user', content: request.prompt });

      const body = {
        model: request.model || this.config.defaultModel || 'gpt-3.5-turbo',
        messages,
        stream: request.stream || false,
        max_tokens: request.maxTokens || 200,
        temperature: request.temperature || 0.7,
      };

      // OpenRouter requires specific headers
      const isOpenRouter = this.config.baseUrl?.includes('openrouter.ai');
      const headers = isOpenRouter
        ? {
            'HTTP-Referer': 'https://Navratna.tardis.digital',
            'X-Title': 'Navratna',
          }
        : {};

      const data = await this.makeRequest(url, body, headers);
      if (!OpenAIProvider.isRecord(data)) {
        throw new Error('Invalid response format from OpenAI');
      }

      const choices = Array.isArray(data.choices)
        ? (data.choices as Array<Record<string, unknown>>)
        : [];
      const firstChoice = choices[0];
      const message =
        firstChoice && OpenAIProvider.isRecord(firstChoice.message)
          ? firstChoice.message
          : undefined;
      const content = OpenAIProvider.toString(message?.content);

      if (!content) {
        throw new Error('Invalid response format from OpenAI');
      }

      const usage = OpenAIProvider.isRecord(data.usage) ? data.usage : undefined;
      const totalTokens = OpenAIProvider.toNumber(usage?.total_tokens) ?? 0;

      const finishReasonRaw = OpenAIProvider.toString(firstChoice?.finish_reason);
      const finishReason: LLMResponse['finishReason'] =
        finishReasonRaw === 'length' ||
        finishReasonRaw === 'tool_calls' ||
        finishReasonRaw === 'error'
          ? finishReasonRaw
          : 'stop';

      return {
        content,
        model:
          OpenAIProvider.toString(data.model) ||
          request.model ||
          this.config.defaultModel ||
          'unknown',
        tokensUsed: totalTokens,
        confidence: 0.9, // OpenAI generally provides high-quality responses
        finishReason,
      };
    } catch (error) {
      return this.handleError(error, 'generateResponse');
    }
  }

  protected async fetchModelsFromProvider(): Promise<
    Array<{
      id: string;
      name: string;
      description?: string;
      source: string;
      apiEndpoint: string;
    }>
  > {
    try {
      const url = `${this.config.baseUrl || 'https://api.openai.com'}/v1/models`;

      // OpenRouter requires specific headers
      const isOpenRouter = this.config.baseUrl?.includes('openrouter.ai');
      const headers = isOpenRouter
        ? {
            'HTTP-Referer': 'https://Navratna.tardis.digital',
            'X-Title': 'Navratna',
          }
        : {};

      const data = await this.makeGetRequest(url, headers);
      if (!OpenAIProvider.isRecord(data)) {
        return [];
      }

      if (!Array.isArray(data.data)) {
        return [];
      }

      // Filter to only chat models - be more inclusive for OpenRouter and custom providers
      const isOpenRouterModels = this.config.baseUrl?.includes('openrouter.ai');
      const isCustomProvider =
        this.config.baseUrl && !this.config.baseUrl.includes('api.openai.com');

      let chatModels: Array<Record<string, unknown>>;
      if (isOpenRouterModels || isCustomProvider) {
        // For OpenRouter and custom providers, include all models (they usually only return chat models anyway)
        chatModels = data.data as Array<Record<string, unknown>>;
      } else {
        // For OpenAI, filter to only chat models
        chatModels = (data.data as Array<Record<string, unknown>>).filter(
          (model: Record<string, unknown>) =>
            (OpenAIProvider.toString(model.id) || '').includes('gpt') ||
            (OpenAIProvider.toString(model.id) || '').includes('chat')
        );
      }

      return chatModels.map((model: Record<string, unknown>) => ({
        id: OpenAIProvider.toString(model.id) || 'unknown',
        name: OpenAIProvider.toString(model.id) || 'unknown',
        description: isOpenRouterModels
          ? `OpenRouter model: ${OpenAIProvider.toString(model.id) || 'unknown'}${OpenAIProvider.toString(model.owned_by) ? ` (${OpenAIProvider.toString(model.owned_by)})` : ''}`
          : `OpenAI model: ${OpenAIProvider.toString(model.id) || 'unknown'}${OpenAIProvider.toString(model.owned_by) ? ` (${OpenAIProvider.toString(model.owned_by)})` : ''}`,
        source: this.config.baseUrl || 'https://api.openai.com',
        apiEndpoint: `${this.config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to fetch models from OpenAI:`, errorMessage);

      // If we have an API key, return fallback models, otherwise throw error
      if (this.config.apiKey) {
        return [
          {
            id: 'gpt-3.5-turbo',
            name: 'gpt-3.5-turbo',
            description: 'OpenAI GPT-3.5 Turbo',
            source: this.config.baseUrl || 'https://api.openai.com',
            apiEndpoint: `${this.config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`,
          },
          {
            id: 'gpt-4',
            name: 'gpt-4',
            description: 'OpenAI GPT-4',
            source: this.config.baseUrl || 'https://api.openai.com',
            apiEndpoint: `${this.config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`,
          },
        ];
      } else {
        throw new Error(`OpenAI connection failed: ${errorMessage}`, { cause: error });
      }
    }
  }
}
