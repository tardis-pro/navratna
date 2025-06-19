import { LLMRequest, LLMResponse, LLMProviderConfig } from '../interfaces';
import { logger } from '@uaip/utils';

export abstract class BaseProvider {
  protected config: LLMProviderConfig;
  protected name: string;

  constructor(config: LLMProviderConfig, name: string) {
    this.config = config;
    this.name = name;
  }

  abstract generateResponse(request: LLMRequest): Promise<LLMResponse>;

  async getAvailableModels(): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    source: string;
    apiEndpoint: string;
  }>> {
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
        stack: error instanceof Error ? error.stack : undefined
      });
      return [];
    }
  }

  protected async fetchModelsFromProvider(): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    source: string;
    apiEndpoint: string;
  }>> {
    // Base implementation - should be overridden by specific providers
    return [];
  }

  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  getDefaultModel(): string | undefined {
    return this.config.defaultModel;
  }

  protected async makeRequest(
    url: string,
    body: any,
    headers: Record<string, string> = {}
  ): Promise<any> {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (this.config.apiKey) {
      defaultHeaders['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const maxRetries = this.config.retries || 3;
    const timeout = this.config.timeout || 30000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`${this.name} API request attempt ${attempt}`, {
          url,
          attempt,
          maxRetries,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method: 'POST',
          headers: defaultHeaders,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        logger.info(`${this.name} API request successful`, {
          attempt,
          status: response.status,
        });

        return data;
      } catch (error) {
        logger.error(`${this.name} API request failed`, {
          attempt,
          maxRetries,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed after ${maxRetries} attempts`);
  }

  protected async makeGetRequest(
    url: string,
    headers: Record<string, string> = {}
  ): Promise<any> {
    const defaultHeaders = {
      ...headers,
    };

    if (this.config.apiKey) {
      defaultHeaders['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const maxRetries = this.config.retries || 3;
    const timeout = this.config.timeout || 30000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`${this.name} GET request attempt ${attempt}`, {
          url,
          attempt,
          maxRetries,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method: 'GET',
          headers: defaultHeaders,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        logger.info(`${this.name} GET request successful`, {
          attempt,
          status: response.status,
        });

        return data;
      } catch (error) {
        logger.error(`${this.name} GET request failed`, {
          attempt,
          maxRetries,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed after ${maxRetries} attempts`);
  }

  protected handleError(error: any, context: string): LLMResponse {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`${this.name} ${context} error`, { error: errorMessage });

    return {
      content: 'I apologize, but I am currently unable to generate a response. Please try again later.',
      model: this.config.defaultModel || 'unknown',
      error: errorMessage,
      finishReason: 'error',
    };
  }
} 