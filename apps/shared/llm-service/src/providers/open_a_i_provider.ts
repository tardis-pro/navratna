import { BaseProvider } from './base_provider.js';
import { LLMRequest, LLMResponse, ProviderModelInfo } from '../interfaces';
import { LLMImageInput } from '@uaip/types';
import { logger } from '@uaip/utils';

type VisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'auto' | 'low' | 'high' } };

type VisionMessage = { role: string; content: string | VisionContentPart[] };

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
   * Precedence: requested model if available, otherwise the explicitly
   * configured provider default. An unavailable catalog or model is a hard
   * failure: choosing an arbitrary first model can silently change behavior.
   */
  private async resolveModel(requestedModel: string): Promise<string> {
    try {
      const models = await this.getAvailableModels();
      if (!models || models.length === 0) {
        throw new Error(`${this.name}: provider returned no usable models`);
      }
      const availableIds = models.map((m) => m.id);
      if (availableIds.includes(requestedModel)) {
        return requestedModel;
      }
      const fallbackModel = this.config.defaultModel && availableIds.includes(this.config.defaultModel)
        ? this.config.defaultModel
        : undefined;
      if (!fallbackModel) {
        throw new Error(
          `${this.name}: requested model "${requestedModel}" is unavailable and no configured default model is offered`
        );
      }
      logger.warn(
        `${this.name}: requested model "${requestedModel}" not offered by provider; using "${fallbackModel}"`,
        { requestedModel, fallbackModel, availableIds }
      );
      return fallbackModel;
    } catch (error) {
      throw new Error(
        `${this.name}: failed to validate model "${requestedModel}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  private buildVisionMessages(
    systemPrompt: string | undefined,
    prompt: string,
    images: LLMImageInput[]
  ): VisionMessage[] {
    const messages: VisionMessage[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    const parts: VisionContentPart[] = images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: 'high' },
    }));
    parts.push({ type: 'text', text: prompt });
    messages.push({ role: 'user', content: parts });
    return messages;
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      const url = this.getChatCompletionsUrl();
      const messages =
        request.images && request.images.length > 0
          ? this.buildVisionMessages(request.systemPrompt, request.prompt, request.images)
          : this.buildChatMessages(request.systemPrompt, request.prompt);
      const requestedModel = request.model || this.config.defaultModel;
      if (!requestedModel) {
        throw new Error(`${this.name}: no model configured for OpenAI-compatible request`);
      }
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
      logger.error(`${this.name}: failed to fetch provider models`, {
        error: errorMessage,
        baseUrl: this.config.baseUrl,
      });
      throw new Error(`OpenAI connection failed: ${errorMessage}`, { cause: error });
    }
  }
}
