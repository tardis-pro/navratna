import { BaseProvider } from './base_provider.js';
import { LLMRequest, LLMResponse, ProviderModelInfo } from '../interfaces.js';
import { logger } from '@uaip/utils';

export class GoogleProvider extends BaseProvider {
  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      // Using OpenAI-compatible endpoint as requested
      const url = `${this.config.baseUrl}/v1beta/openai/chat/completions`;
      const messages = this.buildChatMessages(request.systemPrompt, request.prompt);
      const body = {
        model: request.model || this.config.defaultModel,
        messages,
        stream: request.stream || false,
        max_tokens: request.maxTokens || 200,
        temperature: request.temperature || 0.7,
      };

      const apiKey = await this.getApiKey();
      const headers = {
        'x-goog-api-key': apiKey || '',
      };

      const data = await this.makeRequest(url, body, headers);
      if (!GoogleProvider.isRecord(data)) {
        throw new Error('Invalid response format from Google Gemini');
      }

      const choices: unknown[] = Array.isArray(data.choices) ? data.choices : [];
      const firstChoice = GoogleProvider.isRecord(choices[0]) ? choices[0] : undefined;
      const message = GoogleProvider.isRecord(firstChoice?.message)
        ? firstChoice.message
        : undefined;
      const content = GoogleProvider.toString(message?.content);

      if (!content) {
        throw new Error('No content in response from Google Gemini');
      }

      const usage = GoogleProvider.isRecord(data.usage) ? data.usage : undefined;
      const tokensUsed = GoogleProvider.toNumber(usage?.total_tokens) ?? 0;

      const finishReasonRaw = GoogleProvider.toString(firstChoice?.finish_reason);
      const finishReason: LLMResponse['finishReason'] =
        finishReasonRaw === 'length' ||
        finishReasonRaw === 'tool_calls' ||
        finishReasonRaw === 'error'
          ? finishReasonRaw
          : 'stop';

      return {
        content,
        model: GoogleProvider.toString(data.model) || request.model || this.config.defaultModel || 'unknown',
        tokensUsed,
        confidence: 0.9,
        finishReason,
      };
    } catch (error) {
      return this.handleError(error, 'generateResponse');
    }
  }

  protected async fetchModelsFromProvider(): Promise<ProviderModelInfo[]> {
    // Return known Gemini models
    return [
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        source: this.config.baseUrl,
        apiEndpoint: `${this.config.baseUrl}/v1beta/openai/chat/completions`,
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        source: this.config.baseUrl,
        apiEndpoint: `${this.config.baseUrl}/v1beta/openai/chat/completions`,
      },
    ];
  }
}
