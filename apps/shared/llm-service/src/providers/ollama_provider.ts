import { BaseProvider } from './base_provider.js';
import { LLMRequest, LLMResponse } from '../interfaces';

export class OllamaProvider extends BaseProvider {
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private static toString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private static toNumber(value: unknown): number | null {
    return typeof value === 'number' ? value : null;
  }

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
      if (!OllamaProvider.isRecord(data)) {
        throw new Error('Invalid response format from Ollama');
      }

      const responseText = OllamaProvider.toString(data.response);

      if (!responseText) {
        throw new Error('No response received from Ollama');
      }

      const resolvedModel =
        OllamaProvider.toString(data.model) ||
        request.model ||
        this.config.defaultModel ||
        'unknown';
      const tokensUsed = OllamaProvider.toNumber(data.eval_count) ?? 0;
      const done = data.done === true;

      return {
        content: responseText,
        model: resolvedModel,
        tokensUsed,
        confidence: 0.8, // Ollama doesn't provide confidence scores
        finishReason: done ? 'stop' : 'length',
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
      if (!OllamaProvider.isRecord(data)) {
        return [];
      }

      if (!Array.isArray(data.models)) {
        return [];
      }

      return data.models.map((model: Record<string, unknown>) => ({
        id: OllamaProvider.toString(model.name) || 'unknown',
        name: OllamaProvider.toString(model.name) || 'unknown',
        description: `Ollama model: ${OllamaProvider.toString(model.name) || 'unknown'}${typeof model.size === 'number' ? ` (${this.formatSize(model.size)})` : ''}`,
        source: this.config.baseUrl,
        apiEndpoint: `${this.config.baseUrl}/api/generate`,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to fetch models from Ollama at ${this.config.baseUrl}:`, errorMessage);
      // Re-throw the error so it can be properly logged by BaseProvider
      throw new Error(`Ollama connection failed: ${errorMessage}`, { cause: error });
    }
  }

  private formatSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
