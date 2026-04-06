import { BaseProvider } from './base_provider.js';
import { LLMRequest, LLMResponse, ProviderModelInfo } from '../interfaces';

export class LLMStudioProvider extends BaseProvider {

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      const url = `${this.config.baseUrl}/v1/chat/completions`;
      const messages = this.buildChatMessages(request.systemPrompt, request.prompt);
      const body = {
        model: request.model || this.config.defaultModel,
        messages,
        stream: request.stream || false,
        max_tokens: request.maxTokens || 200,
        temperature: request.temperature || 0.7,
        stop: ['<|im_end|>', '<|im_start|>'],
      };

      const data = await this.makeRequest(url, body);
      if (!LLMStudioProvider.isRecord(data)) {
        throw new Error('Invalid response format from LLM Studio');
      }

      const errorValue = LLMStudioProvider.isRecord(data.error) ? data.error : null;
      const errorMessage = errorValue ? LLMStudioProvider.toString(errorValue.message) : null;

      if (errorMessage) {
        throw new Error(`LM Studio error: ${errorMessage}`);
      }

      const choices: Array<Record<string, unknown>> = Array.isArray(data.choices)
        ? data.choices.filter((c): c is Record<string, unknown> => LLMStudioProvider.isRecord(c))
        : [];
      const choice = choices[0];
      const message =
        choice && LLMStudioProvider.isRecord(choice.message) ? choice.message : undefined;
      const messageContent = message?.content;
      const contentFromArray = Array.isArray(messageContent)
        ? messageContent
            .map((part: string | Record<string, unknown>) => {
              if (typeof part === 'string') return part;
              if (LLMStudioProvider.toString(part.text))
                return LLMStudioProvider.toString(part.text) || '';
              if (LLMStudioProvider.toString(part.content))
                return LLMStudioProvider.toString(part.content) || '';
              return '';
            })
            .join(' ')
            .trim()
        : null;
      const content =
        (typeof messageContent === 'string' ? messageContent : null) ||
        contentFromArray ||
        LLMStudioProvider.toString(message?.reasoning_content) ||
        null ||
        LLMStudioProvider.toString(choice?.text) ||
        null ||
        LLMStudioProvider.toString(choice?.content) ||
        null ||
        LLMStudioProvider.toString(data.output_text) ||
        null;

      if (!content) {
        throw new Error('Invalid response format from LLM Studio');
      }

      const usage = LLMStudioProvider.isRecord(data.usage) ? data.usage : undefined;
      const finishReasonRaw = LLMStudioProvider.toString(choice?.finish_reason);
      const finishReason: LLMResponse['finishReason'] =
        finishReasonRaw === 'length' ||
        finishReasonRaw === 'tool_calls' ||
        finishReasonRaw === 'error'
          ? finishReasonRaw
          : 'stop';

      return {
        content,
        model:
          LLMStudioProvider.toString(data.model) ||
          request.model ||
          this.config.defaultModel ||
          'unknown',
        tokensUsed: LLMStudioProvider.toNumber(usage?.total_tokens) ?? 0,
        confidence: 0.8, // LLM Studio doesn't provide confidence scores
        finishReason,
      };
    } catch (error) {
      return this.handleError(error, 'generateResponse');
    }
  }

  protected async fetchModelsFromProvider(): Promise<ProviderModelInfo[]> {
    // Try multiple common LLM Studio endpoints
    const endpoints = ['/v1/models', '/api/models', '/models', '/api/tags'];

    for (const endpoint of endpoints) {
      try {
        const url = `${this.config.baseUrl}${endpoint}`;

        // eslint-disable-next-line no-await-in-loop -- sequential processing required
        const data = await this.makeGetRequest(url);

        // Handle different response formats
        let models: Array<Record<string, unknown>> = [];

        if (LLMStudioProvider.isRecord(data) && Array.isArray(data.data)) {
          // OpenAI/LM Studio format
          models = data.data;
        } else if (LLMStudioProvider.isRecord(data) && Array.isArray(data.models)) {
          // Ollama models format
          models = data.models.map((model: Record<string, unknown>) => ({
            id:
              LLMStudioProvider.toString(model.name) ||
              LLMStudioProvider.toString(model.model) ||
              LLMStudioProvider.toString(model.id) ||
              'unknown',
            owned_by:
              (LLMStudioProvider.isRecord(model.details)
                ? LLMStudioProvider.toString(model.details.families)
                : null) || 'ollama',
          }));
        } else if (Array.isArray(data)) {
          // Direct array format
          models = data.map((model: Record<string, unknown>) => ({
            id:
              LLMStudioProvider.toString(model.name) ||
              LLMStudioProvider.toString(model.model) ||
              LLMStudioProvider.toString(model.id) ||
              'unknown',
            owned_by: 'llmstudio',
          }));
        }

        if (models.length > 0) {
          return models.map((model: Record<string, unknown>) => ({
            id: LLMStudioProvider.toString(model.id) || 'unknown',
            name: LLMStudioProvider.toString(model.id) || 'unknown',
            description: `LLM Studio model: ${LLMStudioProvider.toString(model.id) || 'unknown'}${LLMStudioProvider.toString(model.owned_by) ? ` (${LLMStudioProvider.toString(model.owned_by)})` : ''}`,
            source: this.config.baseUrl,
            apiEndpoint: `${this.config.baseUrl}/v1/chat/completions`,
          }));
        }
      } catch {
        // Continue to next endpoint
      }
    }

    // If all endpoints fail, throw error
    throw new Error(
      `LLM Studio connection failed: No working endpoint found among ${endpoints.join(', ')}`
    );
  }
}
