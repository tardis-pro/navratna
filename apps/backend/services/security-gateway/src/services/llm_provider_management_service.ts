import { LLMProviderRepository, LLMProvider } from '@uaip/shared-services';
import { EventBusService } from '@uaip/infra/event_bus';
import {
  LLMProviderType,
  LLMProviderStatus,
  LLMProviderUsageType,
  CreateLLMProviderRequest,
  UpdateLLMProviderRequest,
  LLMProviderResponse,
} from '@uaip/types';
import { logger, ConflictError, NotFoundError } from '@uaip/utils';

export class LLMProviderManagementService {
  private static instance: LLMProviderManagementService;
  private llmProviderRepository!: LLMProviderRepository;
  private eventBusService: EventBusService | null = null;
  private initialized = false;

  private constructor() {
    this.initializeRepository();
  }

  public static getInstance(): LLMProviderManagementService {
    if (!LLMProviderManagementService.instance) {
      LLMProviderManagementService.instance = new LLMProviderManagementService();
    }
    return LLMProviderManagementService.instance;
  }

  public setEventBusService(eventBusService: EventBusService): void {
    this.eventBusService = eventBusService;
  }

  private async initializeRepository(): Promise<void> {
    try {
      this.llmProviderRepository = new LLMProviderRepository();

      this.initialized = true;
      logger.info('LLM Provider Management Service initialized');
    } catch (error) {
      logger.error('Failed to initialize LLM Provider Management Service', { error });
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeRepository();
    }
  }

  /**
   * Get all LLM providers
   */
  async getAllProviders(): Promise<LLMProviderResponse[]> {
    try {
      await this.ensureInitialized();
      const providers = await this.llmProviderRepository.findMany();
      return providers.map((provider) => this.mapToResponse(provider, this.computeStats(provider)));
    } catch (error) {
      logger.error('Error getting all LLM providers', { error });
      throw error;
    }
  }

  /**
   * Get active LLM providers
   */
  async getActiveProviders(): Promise<LLMProviderResponse[]> {
    try {
      await this.ensureInitialized();
      const providers = await this.llmProviderRepository.findActiveProviders();
      return providers.map((provider) => this.mapToResponse(provider, this.computeStats(provider)));
    } catch (error) {
      logger.error('Error getting active LLM providers', { error });
      throw error;
    }
  }

  /**
   * Get active LLM providers filtered by usage type (e.g. chat, embedding, reranking)
   */
  async getProvidersByUsageType(usageType: LLMProviderUsageType): Promise<LLMProviderResponse[]> {
    try {
      await this.ensureInitialized();
      const providers = await this.llmProviderRepository.findMany({ isActive: true });
      return providers
        .filter((provider) => provider.usageType === usageType)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .map((provider) => this.mapToResponse(provider, this.computeStats(provider)));
    } catch (error) {
      logger.error('Error getting LLM providers by usage type', { usageType, error });
      throw error;
    }
  }

  /**
   * Get LLM provider by ID
   */
  async getProviderById(id: string): Promise<LLMProviderResponse | null> {
    try {
      await this.ensureInitialized();
      const provider = await this.llmProviderRepository.findById(id);
      if (!provider) return null;
      return this.mapToResponse(provider, this.computeStats(provider));
    } catch (error) {
      logger.error('Error getting LLM provider by ID', { id, error });
      throw error;
    }
  }

  /**
   * Create a new LLM provider
   */
  async createProvider(
    request: CreateLLMProviderRequest,
    createdBy?: string
  ): Promise<LLMProviderResponse> {
    try {
      await this.ensureInitialized();

      // Check if provider with same name already exists
      const allProviders = await this.llmProviderRepository.findMany();
      const existingProvider = allProviders.find((p) => p.name === request.name) ?? null;
      if (existingProvider) {
        throw new ConflictError(`LLM provider with name '${request.name}' already exists`);
      }
      const provider = await this.llmProviderRepository.create({
        name: request.name,
        type: request.type,
        baseUrl: request.baseUrl,
        description: request.description,
        defaultModel: request.defaultModel,
        configuration: request.configuration,
        priority: request.priority ?? 0,
        createdBy,
      });

      // Test the provider connection
      await this.testProviderConnection(provider.id);

      // Notify LLM service to refresh providers and cache
      await this.notifyProviderChange('provider.created', provider.id, provider.type);

      return this.mapToResponse(provider, this.computeStats(provider));
    } catch (error) {
      logger.error('Error creating LLM provider', { request, error });
      throw error;
    }
  }

  /**
   * Update an existing LLM provider
   */
  async updateProvider(
    id: string,
    request: UpdateLLMProviderRequest,
    updatedBy?: string
  ): Promise<LLMProviderResponse> {
    try {
      await this.ensureInitialized();

      const provider = await this.llmProviderRepository.findById(id);
      if (!provider) {
        throw new NotFoundError(`LLM provider with id ${id} not found`);
      }

      // Update fields
      if (request.name !== undefined) provider.name = request.name;
      if (request.description !== undefined) provider.description = request.description;
      if (request.baseUrl !== undefined) provider.baseUrl = request.baseUrl;
      if (request.defaultModel !== undefined) provider.defaultModel = request.defaultModel;
      if (request.configuration !== undefined) provider.configuration = request.configuration;
      if (request.priority !== undefined) provider.priority = request.priority;
      if (request.status !== undefined) provider.status = request.status;

      // Update API key if provided
      if (request.apiKey !== undefined) {
        provider.apiKeyEncrypted = request.apiKey;
      }

      provider.updatedBy = updatedBy ?? null;

      const updatedProvider = await this.llmProviderRepository.update(id, provider);
      if (!updatedProvider) {
        throw new NotFoundError(`LLM provider with id ${id} not found after update`);
      }

      if (request.baseUrl || request.apiKey || request.configuration) {
        await this.testProviderConnection(id);
      }

      await this.notifyProviderChange('provider.updated', id, provider.type);

      return this.mapToResponse(updatedProvider, this.computeStats(updatedProvider));
    } catch (error) {
      logger.error('Error updating LLM provider', { id, request, error });
      throw error;
    }
  }

  /**
   * Delete an LLM provider (soft delete)
   */
  async deleteProvider(id: string, deletedBy?: string): Promise<void> {
    try {
      await this.ensureInitialized();

      const provider = await this.llmProviderRepository.findById(id);
      await this.llmProviderRepository.update(id, { isActive: false, updatedBy: deletedBy });

      // Notify LLM service to refresh providers and cache
      await this.notifyProviderChange('provider.deleted', id, provider?.type);

      logger.info('LLM provider deleted', { id, deletedBy });
    } catch (error) {
      logger.error('Error deleting LLM provider', { id, error });
      throw error;
    }
  }

  /**
   * Test provider connection and health
   */
  async testProviderConnection(id: string): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
  }> {
    try {
      await this.ensureInitialized();

      const provider = await this.llmProviderRepository.findById(id);
      if (!provider) {
        throw new NotFoundError(`LLM provider with id ${id} not found`);
      }

      const startTime = Date.now();
      let result: { success: boolean; latency?: number; error?: string };

      try {
        const testEndpoint = this.getTestEndpoint(provider);
        const testPayload = this.getTestPayload(provider);

        const response = await fetch(testEndpoint, {
          method: 'POST',
          headers: this.getTestHeaders(provider),
          body: JSON.stringify(testPayload),
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        const latency = Date.now() - startTime;

        if (response.ok) {
          result = { success: true, latency };

          // Update health check result
          await this.llmProviderRepository.update(id, {
            healthCheckResult: { status: 'healthy', latency, checkedAt: new Date() },
            lastHealthCheckAt: new Date(),
          });
        } else {
          const errorText = await response.text();
          result = {
            success: false,
            latency,
            error: `HTTP ${response.status}: ${errorText}`,
          };

          // Update health check result
          await this.llmProviderRepository.update(id, {
            healthCheckResult: { status: 'unhealthy', latency, error: result.error, checkedAt: new Date() },
            lastHealthCheckAt: new Date(),
          });
        }
      } catch (error) {
        const latency = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        result = {
          success: false,
          latency,
          error: errorMessage,
        };

        // Update health check result
        await this.llmProviderRepository.update(id, {
          healthCheckResult: { status: 'unhealthy', latency, error: errorMessage, checkedAt: new Date() },
          lastHealthCheckAt: new Date(),
        });
      }

      logger.info('Provider connection test completed', {
        id,
        name: provider.name,
        success: result.success,
        latency: result.latency,
        error: result.error,
      });

      return result;
    } catch (error) {
      logger.error('Error testing provider connection', { id, error });
      throw error;
    }
  }

  /**
   * Get provider statistics
   */
  async getProviderStatistics(): Promise<{
    totalProviders: number;
    activeProviders: number;
    totalRequests: string;
    totalTokensUsed: string;
    totalErrors: string;
    averageErrorRate: number;
  }> {
    try {
      await this.ensureInitialized();

      const allProviders = await this.llmProviderRepository.findMany();
      const activeProviders = allProviders.filter((p) => p.isActive && p.status === 'active');

      let totalRequests = BigInt(0);
      let totalTokensUsed = BigInt(0);
      let totalErrors = BigInt(0);

      for (const provider of allProviders) {
        totalRequests += BigInt(provider.totalRequests);
        totalTokensUsed += BigInt(provider.totalTokensUsed);
        totalErrors += BigInt(provider.totalErrors);
      }

      const averageErrorRate =
        totalRequests > 0 ? (Number(totalErrors) / Number(totalRequests)) * 100 : 0;

      return {
        totalProviders: allProviders.length,
        activeProviders: activeProviders.length,
        totalRequests: totalRequests.toString(),
        totalTokensUsed: totalTokensUsed.toString(),
        totalErrors: totalErrors.toString(),
        averageErrorRate: Math.round(averageErrorRate * 100) / 100,
      };
    } catch (error) {
      logger.error('Error getting provider statistics', { error });
      throw error;
    }
  }

  // Private helper methods

  private computeStats(provider: LLMProvider): {
    totalRequests: string;
    totalTokensUsed: string;
    totalErrors: string;
    errorRate: number;
    lastUsedAt?: Date;
    healthStatus?: string;
  } {
    const totalReqs = provider.totalRequests ?? 0;
    const totalErrs = provider.totalErrors ?? 0;
    return {
      totalRequests: String(totalReqs),
      totalTokensUsed: String(provider.totalTokensUsed ?? 0),
      totalErrors: String(totalErrs),
      errorRate: totalReqs > 0 ? totalErrs / totalReqs : 0,
      lastUsedAt: provider.lastUsedAt ?? undefined,
      healthStatus: provider.healthCheckResult?.status ?? undefined,
    };
  }

  private mapToResponse(
    provider: LLMProvider,
    stats: {
      totalRequests: string;
      totalTokensUsed: string;
      totalErrors: string;
      errorRate: number;
      lastUsedAt?: Date;
      healthStatus?: string;
    },
  ): LLMProviderResponse {
    return {
      id: provider.id,
      name: provider.name,
      description: provider.description ?? undefined,
      type: provider.type,
      baseUrl: provider.baseUrl,
      hasApiKey: Boolean(provider.apiKeyEncrypted),
      defaultModel: provider.defaultModel ?? undefined,
      configuration: provider.configuration,
      status: provider.status ?? LLMProviderStatus.INACTIVE,
      isActive: provider.isActive,
      priority: provider.priority,
      stats,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  private getTestEndpoint(provider: LLMProvider): string {
    switch (provider.type) {
      case LLMProviderType.OLLAMA:
        return `${provider.baseUrl}/api/generate`;
      case LLMProviderType.OPENAI:
      case LLMProviderType.LLMSTUDIO:
        return `${provider.baseUrl}/v1/chat/completions`;
      default:
        return `${provider.baseUrl}/v1/chat/completions`;
    }
  }

  private getTestPayload(provider: LLMProvider): unknown {
    const testPrompt = 'Hello, this is a connection test. Please respond with "OK".';

    switch (provider.type) {
      case 'ollama':
        return {
          model: provider.defaultModel || 'llama2',
          prompt: testPrompt,
          stream: false,
          options: {
            num_predict: 10,
          },
        };
      case 'openai':
      case 'llmstudio':
        return {
          model: provider.defaultModel || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 10,
          stream: false,
        };
      default:
        return {
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 10,
        };
    }
  }

  private getTestHeaders(provider: LLMProvider): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const apiKey = provider.apiKeyEncrypted;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Add custom headers if configured
    if (provider.configuration?.headers) {
      Object.assign(headers, provider.configuration.headers);
    }

    return headers;
  }

  /**
   * Notify other services about provider changes via event bus
   */
  private async notifyProviderChange(
    eventType: string,
    providerId: string,
    providerType?: string
  ): Promise<void> {
    if (!this.eventBusService) {
      logger.warn('EventBusService not available, skipping provider change notification', {
        eventType,
        providerId,
      });
      return;
    }

    try {
      await this.eventBusService.publish('llm.provider.changed', {
        eventType,
        providerId,
        providerType,
        timestamp: new Date().toISOString(),
      });
      logger.debug(`Published provider change event`, { eventType, providerId, providerType });
    } catch (error) {
      logger.warn('Failed to publish provider change event', { error, eventType, providerId });
      // Don't throw here as provider operation succeeded, event notification is secondary
    }
  }
}

export const llmProviderManagementService = LLMProviderManagementService.getInstance();
