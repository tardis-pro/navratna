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
} 