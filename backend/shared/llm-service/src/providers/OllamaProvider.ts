import { BaseProvider } from './BaseProvider';
import { LLMRequest, LLMResponse } from '../interfaces';

export class OllamaProvider extends BaseProvider {
  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      const url = `${this.config.baseUrl}/api/generate`;
      const body = {
        model: request.model || this.config.defaultModel,
        prompt: request.prompt,
        system: request.systemPrompt,
        stream: request.stream || false,
        options: {
          num_predict: request.maxTokens || 200,
          temperature: request.temperature || 0.7,
        },
      };

      const data = await this.makeRequest(url, body);

      if (!data.response) {
        throw new Error('No response received from Ollama');
      }

      return {
        content: data.response,
        model: data.model || request.model || this.config.defaultModel || 'unknown',
        tokensUsed: data.eval_count || 0,
        confidence: 0.8, // Ollama doesn't provide confidence scores
        finishReason: data.done ? 'stop' : 'length',
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
      const url = `${this.config.baseUrl}/api/tags`;
      const data = await this.makeGetRequest(url);

      if (!data.models || !Array.isArray(data.models)) {
        return [];
      }

      return data.models.map((model: any) => ({
        id: model.name,
        name: model.name,
        description: `Ollama model: ${model.name}${model.size ? ` (${this.formatSize(model.size)})` : ''}`,
        source: this.config.baseUrl,
        apiEndpoint: `${this.config.baseUrl}/api/generate`,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to fetch models from Ollama at ${this.config.baseUrl}:`, errorMessage);
      // Re-throw the error so it can be properly logged by BaseProvider
      throw new Error(`Ollama connection failed: ${errorMessage}`);
    }
  }

  private formatSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
