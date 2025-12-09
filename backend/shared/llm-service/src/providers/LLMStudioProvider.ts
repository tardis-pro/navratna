import { BaseProvider } from './BaseProvider.js';
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

  protected async fetchModelsFromProvider(): Promise<
    Array<{
      id: string;
      name: string;
      description?: string;
      source: string;
      apiEndpoint: string;
    }>
  > {
    // Try multiple common LLM Studio endpoints
    const endpoints = ['/v1/models', '/api/models', '/models', '/api/tags'];

    for (const endpoint of endpoints) {
      try {
        const url = `${this.config.baseUrl}${endpoint}`;
        console.log(`LLM Studio: Trying endpoint ${url}`);
        const data = await this.makeGetRequest(url);
        console.log('LLM Studio response:', data);

        // Handle different response formats
        let models = [];

        if (data.data && Array.isArray(data.data)) {
          // OpenAI/LM Studio format
          models = data.data;
        } else if (data.models && Array.isArray(data.models)) {
          // Ollama models format
          models = data.models.map((model: any) => ({
            id: model.name || model.model || model.id,
            owned_by: model.details?.families || 'ollama',
          }));
        } else if (Array.isArray(data)) {
          // Direct array format
          models = data.map((model: any) => ({
            id: model.name || model.model || model.id || model,
            owned_by: 'llmstudio',
          }));
        }

        if (models.length > 0) {
          console.log(`LLM Studio: Found ${models.length} models via ${endpoint}`);
          return models.map((model: any) => ({
            id: model.id,
            name: model.id,
            description: `LLM Studio model: ${model.id}${model.owned_by ? ` (${model.owned_by})` : ''}`,
            source: this.config.baseUrl,
            apiEndpoint: `${this.config.baseUrl}/v1/chat/completions`,
          }));
        }
      } catch (error) {
        console.log(
          `LLM Studio: Endpoint ${endpoint} failed:`,
          error instanceof Error ? error.message : error
        );
        // Continue to next endpoint
      }
    }

    // If all endpoints fail, throw error
    throw new Error(
      `LLM Studio connection failed: No working endpoint found among ${endpoints.join(', ')}`
    );
  }
}
