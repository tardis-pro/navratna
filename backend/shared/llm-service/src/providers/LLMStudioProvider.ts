import { BaseProvider } from './BaseProvider';
import { LLMRequest, LLMResponse } from '../interfaces';

export class LLMStudioProvider extends BaseProvider {
  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      const url = `${this.config.baseUrl}/v1/chat/completions`;
      const messages = [];

      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }

      messages.push({ role: 'user', content: request.prompt });

      const body = {
        model: request.model || this.config.defaultModel,
        messages,
        stream: request.stream || false,
        max_tokens: request.maxTokens || 200,
        temperature: request.temperature || 0.7,
      };

      const data = await this.makeRequest(url, body);

      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from LLM Studio');
      }

      const choice = data.choices[0];
      return {
        content: choice.message.content,
        model: data.model || request.model || this.config.defaultModel || 'unknown',
        tokensUsed: data.usage?.total_tokens || 0,
        confidence: 0.8, // LLM Studio doesn't provide confidence scores
        finishReason: choice.finish_reason || 'stop',
      };
    } catch (error) {
      return this.handleError(error, 'generateResponse');
    }
  }

  protected async fetchModelsFromProvider(): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    source: string;
    apiEndpoint: string;
  }>> {
    try {
      const url = `${this.config.baseUrl}/v1/models`;
      const data = await this.makeGetRequest(url);

      if (!data.data || !Array.isArray(data.data)) {
        return [];
      }

      return data.data.map((model: any) => ({
        id: model.id,
        name: model.id,
        description: `LLM Studio model: ${model.id}${model.owned_by ? ` (${model.owned_by})` : ''}`,
        source: this.config.baseUrl,
        apiEndpoint: `${this.config.baseUrl}/v1/chat/completions`
      }));
    } catch (error) {
      console.error(`Failed to fetch models from LLM Studio at ${this.config.baseUrl}:`, error);
      return [];
    }
  }
} 