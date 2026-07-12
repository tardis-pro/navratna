import { BaseProvider } from './base_provider.js';
import { LLMRequest, LLMResponse, ProviderModelInfo } from '../interfaces';
import { logger } from '@uaip/utils';

export class OpenAIProvider extends BaseProvider {

  /**
   * Normalize the configured base URL to a bare origin (no trailing slash, no
   * trailing `/v1`) so callers can append `/v1/...` exactly once. This prevents
   * `/v1/v1` doubling for BYOK providers whose baseUrl already ends in `/v1`
   * (e.g. `https://ai.tardis.digital/v1`), while leaving plain origins such as
   * `https://api.openai.com` unchanged. OpenRouter's `https://openrouter.ai/api/v1`
   * correctly collapses to `https://openrouter.ai/api` and re-appends `/v1/...`.
   */
  private getApiBase(): string {
    const raw = this.config.baseUrl || 'https://api.openai.com';
    return raw.replace(/\/+$/, '').replace(/\/v1$/, '');
  }

  private getChatCompletionsUrl(): string {
    return `${this.getApiBase()}/v1/chat/completions`;
  }

  private getModelsUrl(): string {
    return `${this.getApiBase()}/v1/models`;
  }

  /**
   * Ensure the model actually sent to the provider is one the provider offers.
   * When switching BYOK providers the requested model (from the agent config or
   * the model-selection orchestrator, e.g. `gpt-4o-mini`) may not exist on the
   * active provider (e.g. Omni serves `auto/best-reasoning`, `auto/best-coding`).
   * Precedence: requested model if available → configured defaultModel if
   * available → provider's first available model. If the model list can't be
   * fetched, fall back to the requested model unchanged (no hard failure).
   */
  private async resolveModel(requestedModel: string): Promise<string> {
    try {
      const models = await this.getAvailableModels();
      if (!models || models.length === 0) {
        return requestedModel;
      }
      const availableIds = models.map((m) => m.id);
      if (availableIds.includes(requestedModel)) {
        return requestedModel;
      }
      const fallbackModel =
        this.config.defaultModel && availableIds.includes(this.config.defaultModel)
          ? this.config.defaultModel
          : availableIds[0];
      logger.warn(
        `${this.name}: requested model "${requestedModel}" not offered by provider; using "${fallbackModel}"`,
        { requestedModel, fallbackModel, availableIds }
      );
      return fallbackModel;
    } catch (error) {
      logger.warn(`${this.name}: could not verify model availability, using requested model`, {
        requestedModel,
        error: error instanceof Error ? error.message : error,
      });
      return requestedModel;
    }
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      const url = this.getChatCompletionsUrl();
      const messages = this.buildChatMessages(request.systemPrompt, request.prompt);
      const requestedModel = request.model || this.config.defaultModel || 'gpt-3.5-turbo';
      const model = await this.resolveModel(requestedModel);
      const body = {
        model,
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

      const choices: Array<Record<string, unknown>> = Array.isArray(data.choices)
        ? data.choices.filter((c): c is Record<string, unknown> => OpenAIProvider.isRecord(c))
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

  protected async fetchModelsFromProvider(): Promise<ProviderModelInfo[]> {
    try {
      const url = this.getModelsUrl();

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

      const rawDataArray = Array.isArray(data.data) ? data.data : [];
      const allDataModels: Array<Record<string, unknown>> = rawDataArray.filter(
        (m): m is Record<string, unknown> => OpenAIProvider.isRecord(m)
      );
      let chatModels: Array<Record<string, unknown>>;
      if (isOpenRouterModels || isCustomProvider) {
        chatModels = allDataModels;
      } else {
        chatModels = allDataModels.filter(
          (model) =>
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
        apiEndpoint: this.getChatCompletionsUrl(),
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
            apiEndpoint: this.getChatCompletionsUrl(),
          },
          {
            id: 'gpt-4',
            name: 'gpt-4',
            description: 'OpenAI GPT-4',
            source: this.config.baseUrl || 'https://api.openai.com',
            apiEndpoint: this.getChatCompletionsUrl(),
          },
        ];
      } else {
        throw new Error(`OpenAI connection failed: ${errorMessage}`, { cause: error });
      }
    }
  }
}
