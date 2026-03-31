import { LLMRequest, LLMResponse, ProviderModelInfo, LLMProviderConfig } from '../interfaces';
import { logger } from '@uaip/utils';
import { ApiKeyDecryptionService } from '../services/api_key_decryption_service.js';

export abstract class BaseProvider {
  protected config: LLMProviderConfig;
  protected name: string;

  constructor(config: LLMProviderConfig, name: string) {
    this.config = config;
    this.name = name;
  }

  abstract generateResponse(request: LLMRequest): Promise<LLMResponse>;

  async getAvailableModels(): Promise<ProviderModelInfo[]> {
    // Default implementation - should be overridden by specific providers
    try {
      logger.info(`${this.name}: Fetching models from ${this.config.baseUrl}`);
      const models = await this.fetchModelsFromProvider();
      logger.info(`${this.name}: Successfully fetched ${models.length} models`);
      return models;
    } catch (error) {
      logger.error(`Failed to fetch models from ${this.name}`, {
        error: error instanceof Error ? error.message : error,
        baseUrl: this.config.baseUrl,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return [];
    }
  }

  protected async fetchModelsFromProvider(): Promise<ProviderModelInfo[]> {
    // Base implementation - should be overridden by specific providers
    return [];
  }

  protected static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  protected static toString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  protected static toNumber(value: unknown): number | null {
    return typeof value === 'number' ? value : null;
  }

  protected buildChatMessages(systemPrompt: string | undefined, prompt: string): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  getName(): string {
    return this.name;
  }

  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  getDefaultModel(): string | undefined {
    return this.config.defaultModel;
  }

  /**
   * Get API key, using event-driven decryption if needed
   */
  protected async getApiKey(): Promise<string | undefined> {
    // If we have a plain text API key, use it directly
    if (this.config.apiKey) {
      return this.config.apiKey;
    }

    // If we have an encrypted API key, request decryption from Security Gateway
    if (this.config.apiKeyEncrypted) {
      try {
        const decryptionService = ApiKeyDecryptionService.getInstance();
        const decryptedKey = await decryptionService.decryptApiKey(
          'provider-id', // TODO: Pass actual provider ID
          this.name,
          this.config.apiKeyEncrypted
        );
        return decryptedKey;
      } catch (error) {
        logger.error(`Failed to decrypt API key for ${this.name}`, { error });
        return undefined;
      }
    }

    return undefined;
  }

  private async executeWithRetry(
    url: string,
    fetchOptions: RequestInit,
    label: string
  ): Promise<Record<string, unknown>> {
    const maxRetries = this.config.retries || 3;
    const timeout = this.config.timeout || 30000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`${this.name} ${label} attempt ${attempt}`, { url, attempt, maxRetries });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // eslint-disable-next-line no-await-in-loop -- sequential retry required
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // eslint-disable-next-line no-await-in-loop -- sequential retry required
        const data = (await response.json()) as Record<string, unknown>;
        logger.info(`${this.name} ${label} successful`, { attempt, status: response.status });

        return data;
      } catch (error) {
        logger.error(`${this.name} ${label} failed`, {
          attempt,
          maxRetries,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (attempt === maxRetries) {
          throw error;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        // eslint-disable-next-line no-await-in-loop -- sequential retry required
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed after ${maxRetries} attempts`);
  }

  protected async makeRequest(
    url: string,
    body: Record<string, unknown>,
    headers: Record<string, string> = {}
  ): Promise<Record<string, unknown>> {
    const apiKey = await this.getApiKey();
    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
    if (apiKey) requestHeaders['Authorization'] = `Bearer ${apiKey}`;

    return this.executeWithRetry(
      url,
      { method: 'POST', headers: requestHeaders, body: JSON.stringify(body) },
      'API request'
    );
  }

  protected async makeGetRequest(
    url: string,
    headers: Record<string, string> = {}
  ): Promise<Record<string, unknown>> {
    const apiKey = await this.getApiKey();
    const requestHeaders: Record<string, string> = { ...headers };
    if (apiKey) requestHeaders['Authorization'] = `Bearer ${apiKey}`;

    return this.executeWithRetry(url, { method: 'GET', headers: requestHeaders }, 'GET request');
  }

  protected handleError(error: unknown, context: string): LLMResponse {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`${this.name} ${context} error`, { error: errorMessage });

    return {
      content:
        'I apologize, but I am currently unable to generate a response. Please try again later.',
      model: this.config.defaultModel || 'unknown',
      error: errorMessage,
      finishReason: 'error',
    };
  }
}
