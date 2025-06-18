import { BaseProvider } from './BaseProvider';
import { LLMRequest, LLMResponse } from '../interfaces';

export class OpenAIProvider extends BaseProvider {
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

      const data = await this.makeRequest(url, body);

      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from OpenAI');
      }

      const choice = data.choices[0];
      return {
        content: choice.message.content,
        model: data.model || request.model || this.config.defaultModel || 'unknown',
        tokensUsed: data.usage?.total_tokens || 0,
        confidence: 0.9, // OpenAI generally provides high-quality responses
        finishReason: choice.finish_reason || 'stop',
      };
    } catch (error) {
      return this.handleError(error, 'generateResponse');
    }
  }
} 