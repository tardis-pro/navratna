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

  protected async fetchModelsFromProvider(): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    source: string; 
    apiEndpoint: string;
  }>> {
    try {
      const url = `${this.config.baseUrl || 'https://api.openai.com'}/v1/models`;
      const data = await this.makeGetRequest(url);

      if (!data.data || !Array.isArray(data.data)) {
        return [];
      }

      // Filter to only chat models
      const chatModels = data.data.filter((model: any) => 
        model.id.includes('gpt') || model.id.includes('chat')
      );

      return chatModels.map((model: any) => ({
        id: model.id,
        name: model.id,
        description: `OpenAI model: ${model.id}${model.owned_by ? ` (${model.owned_by})` : ''}`,
        source: this.config.baseUrl || 'https://api.openai.com',
        apiEndpoint: `${this.config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`
      }));
    } catch (error) {
      console.error(`Failed to fetch models from OpenAI:`, error);
      // Return common OpenAI models as fallback
      return [
        {
          id: 'gpt-3.5-turbo',
          name: 'gpt-3.5-turbo',
          description: 'OpenAI GPT-3.5 Turbo',
          source: this.config.baseUrl || 'https://api.openai.com',
          apiEndpoint: `${this.config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`
        },
        {
          id: 'gpt-4',
          name: 'gpt-4',
          description: 'OpenAI GPT-4',
          source: this.config.baseUrl || 'https://api.openai.com',
          apiEndpoint: `${this.config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`
        }
      ];
    }
  }
} 