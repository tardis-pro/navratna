import { BaseProvider } from './base_provider.js';
import { LLMRequest, LLMResponse, ProviderModelInfo } from '../interfaces.js';
import { logger } from '@uaip/utils';

export class AnthropicProvider extends BaseProvider {
  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      const url = `${this.config.baseUrl}/v1/messages`;
      const messages = this.buildAnthropicMessages(request.systemPrompt, request.prompt);
      const body = {
        model: request.model || this.config.defaultModel,
        messages,
        system: request.systemPrompt,
        max_tokens: request.maxTokens || 200,
        temperature: request.temperature || 0.7,
      };

      const apiKey = await this.getApiKey();
      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
      };

      const data = await this.makeRequest(url, body, headers);
      
      if (!AnthropicProvider.isRecord(data) || !Array.isArray(data.content)) {
        throw new Error('Invalid response format from Anthropic');
      }

      const content = data.content
        .filter(
          (block: unknown): block is Record<string, unknown> =>
            AnthropicProvider.isRecord(block) && block.type === 'text'
        )
        .map((block) => AnthropicProvider.toString(block.text) ?? '')
        .join('');

      const usage = AnthropicProvider.isRecord(data.usage) ? data.usage : undefined;
      const inputTokens = AnthropicProvider.toNumber(usage?.input_tokens) ?? 0;
      const outputTokens = AnthropicProvider.toNumber(usage?.output_tokens) ?? 0;
      const tokensUsed = inputTokens + outputTokens;

      return {
        content,
        model: AnthropicProvider.toString(data.model) || request.model || this.config.defaultModel || 'unknown',
        tokensUsed,
        confidence: 0.9,
        finishReason: AnthropicProvider.mapStopReason(
          AnthropicProvider.toString(data.stop_reason)
        ),
      };
    } catch (error) {
      return this.handleError(error, 'generateResponse');
    }
  }

  private buildAnthropicMessages(systemPrompt: string | undefined, prompt: string): Array<{ role: string; content: string }> {
    return [{ role: 'user', content: prompt }];
  }

  // 'stop' for a truncated response would hide it from callers.
  private static mapStopReason(stopReason: string | undefined): LLMResponse['finishReason'] {
    switch (stopReason) {
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }

  protected async fetchModelsFromProvider(): Promise<ProviderModelInfo[]> {
    // Anthropic doesn't have a public list models endpoint; return known models
    return [
      {
        id: 'claude-3-5-sonnet-20240620',
        name: 'Claude 3.5 Sonnet',
        source: this.config.baseUrl,
        apiEndpoint: `${this.config.baseUrl}/v1/messages`,
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        source: this.config.baseUrl,
        apiEndpoint: `${this.config.baseUrl}/v1/messages`,
      },
    ];
  }
}
