import { BaseProvider } from './BaseProvider';
import { LLMRequest, LLMResponse } from '../interfaces';

export class OpenAIProvider extends BaseProvider {
  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      const url = `${this.config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`;
      const messages = [];
      console.log(url);
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

      if (!data.data || !Array.isArray(data.data)) {
        return [];
      }

      // Filter to only chat models - be more inclusive for OpenRouter and custom providers
      const isOpenRouterModels = this.config.baseUrl?.includes('openrouter.ai');
      const isCustomProvider =
        this.config.baseUrl && !this.config.baseUrl.includes('api.openai.com');

      let chatModels: any[];
      if (isOpenRouterModels || isCustomProvider) {
        // For OpenRouter and custom providers, include all models (they usually only return chat models anyway)
        chatModels = data.data;
      } else {
        // For OpenAI, filter to only chat models
        chatModels = data.data.filter(
          (model: any) => model.id.includes('gpt') || model.id.includes('chat')
        );
      }

      return chatModels.map((model: any) => ({
        id: model.id,
        name: model.id,
        description: isOpenRouterModels
          ? `OpenRouter model: ${model.id}${model.owned_by ? ` (${model.owned_by})` : ''}`
          : `OpenAI model: ${model.id}${model.owned_by ? ` (${model.owned_by})` : ''}`,
        source: this.config.baseUrl || 'https://api.openai.com',
        apiEndpoint: `${this.config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to fetch models from OpenAI:`, errorMessage);

      // If we have an API key, return fallback models, otherwise throw error
      if (this.config.apiKey) {
        console.log('Returning fallback OpenAI models since API key is available');
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
        throw new Error(`OpenAI connection failed: ${errorMessage}`);
      }
    }
  }
}
