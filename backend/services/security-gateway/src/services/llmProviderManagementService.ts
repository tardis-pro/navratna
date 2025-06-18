import { 
  LLMProviderRepository, 
  LLMProvider, 
  LLMProviderType, 
  LLMProviderStatus 
} from '@uaip/llm-service';
import { DatabaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';

export interface CreateLLMProviderRequest {
  name: string;
  description?: string;
  type: LLMProviderType;
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  modelsList?: string[];
  configuration?: {
    timeout?: number;
    retries?: number;
    rateLimit?: number;
    headers?: Record<string, string>;
    customEndpoints?: {
      models?: string;
      chat?: string;
      completions?: string;
    };
  };
  priority?: number;
}

export interface UpdateLLMProviderRequest {
  name?: string;
  description?: string;
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  modelsList?: string[];
  configuration?: any;
  priority?: number;
  status?: LLMProviderStatus;
}

export interface LLMProviderResponse {
  id: string;
  name: string;
  description?: string;
  type: LLMProviderType;
  baseUrl: string;
  hasApiKey: boolean;
  defaultModel?: string;
  modelsList?: string[];
  configuration?: any;
  status: LLMProviderStatus;
  isActive: boolean;
  priority: number;
  stats: {
    totalRequests: string;
    totalTokensUsed: string;
    totalErrors: string;
    errorRate: number;
    lastUsedAt?: Date;
    healthStatus?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class LLMProviderManagementService {
  private static instance: LLMProviderManagementService;
  private llmProviderRepository: LLMProviderRepository;
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

  private async initializeRepository(): Promise<void> {
    try {
      const databaseService = DatabaseService.getInstance();
      await databaseService.initialize();
      
      const dataSource = databaseService.getDataSource();
      const repository = dataSource.getRepository(LLMProvider);
      this.llmProviderRepository = new LLMProviderRepository(repository);
      
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
      
      const providers = await this.llmProviderRepository.findAll();
      const responses: LLMProviderResponse[] = [];

      for (const provider of providers) {
        const stats = await this.llmProviderRepository.getProviderStats(provider.id);
        responses.push(this.mapToResponse(provider, stats));
      }

      return responses;
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
      const responses: LLMProviderResponse[] = [];

      for (const provider of providers) {
        const stats = await this.llmProviderRepository.getProviderStats(provider.id);
        responses.push(this.mapToResponse(provider, stats));
      }

      return responses;
    } catch (error) {
      logger.error('Error getting active LLM providers', { error });
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
      if (!provider) {
        return null;
      }

      const stats = await this.llmProviderRepository.getProviderStats(provider.id);
      return this.mapToResponse(provider, stats);
    } catch (error) {
      logger.error('Error getting LLM provider by ID', { id, error });
      throw error;
    }
  }

  /**
   * Create a new LLM provider
   */
  async createProvider(request: CreateLLMProviderRequest, createdBy?: string): Promise<LLMProviderResponse> {
    try {
      await this.ensureInitialized();

      // Check if provider with same name already exists
      const existingProvider = await this.llmProviderRepository.findByName(request.name);
      if (existingProvider) {
        throw new Error(`LLM provider with name '${request.name}' already exists`);
      }

      const provider = await this.llmProviderRepository.createProvider({
        ...request,
        createdBy
      });

      // Test the provider connection
      await this.testProviderConnection(provider.id);

      const stats = await this.llmProviderRepository.getProviderStats(provider.id);
      return this.mapToResponse(provider, stats);
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
        throw new Error(`LLM provider with id ${id} not found`);
      }

      // Update fields
      if (request.name !== undefined) provider.name = request.name;
      if (request.description !== undefined) provider.description = request.description;
      if (request.baseUrl !== undefined) provider.baseUrl = request.baseUrl;
      if (request.defaultModel !== undefined) provider.defaultModel = request.defaultModel;
      if (request.modelsList !== undefined) provider.modelsList = request.modelsList;
      if (request.configuration !== undefined) provider.configuration = request.configuration;
      if (request.priority !== undefined) provider.priority = request.priority;
      if (request.status !== undefined) provider.status = request.status;

      // Update API key if provided
      if (request.apiKey !== undefined) {
        provider.setApiKey(request.apiKey);
      }

      provider.updatedBy = updatedBy;
      
      const updatedProvider = await this.llmProviderRepository.update(id, provider);

      // Test connection if configuration changed
      if (request.baseUrl || request.apiKey || request.configuration) {
        await this.testProviderConnection(id);
      }

      const stats = await this.llmProviderRepository.getProviderStats(id);
      return this.mapToResponse(updatedProvider, stats);
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
      
      await this.llmProviderRepository.softDelete(id, deletedBy);
      
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
        throw new Error(`LLM provider with id ${id} not found`);
      }

      const startTime = Date.now();
      let result: { success: boolean; latency?: number; error?: string };

      try {
        // Create a simple test request based on provider type
        const testEndpoint = this.getTestEndpoint(provider);
        const testPayload = this.getTestPayload(provider);

        const response = await fetch(testEndpoint, {
          method: 'POST',
          headers: this.getTestHeaders(provider),
          body: JSON.stringify(testPayload),
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        const latency = Date.now() - startTime;

        if (response.ok) {
          result = { success: true, latency };
          
          // Update health check result
          await this.llmProviderRepository.updateHealthCheck(id, {
            status: 'healthy',
            latency
          });
        } else {
          const errorText = await response.text();
          result = { 
            success: false, 
            latency, 
            error: `HTTP ${response.status}: ${errorText}` 
          };
          
          // Update health check result
          await this.llmProviderRepository.updateHealthCheck(id, {
            status: 'unhealthy',
            latency,
            error: result.error
          });
        }
      } catch (error) {
        const latency = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        result = { 
          success: false, 
          latency, 
          error: errorMessage 
        };
        
        // Update health check result
        await this.llmProviderRepository.updateHealthCheck(id, {
          status: 'unhealthy',
          latency,
          error: errorMessage
        });
      }

      logger.info('Provider connection test completed', {
        id,
        name: provider.name,
        success: result.success,
        latency: result.latency,
        error: result.error
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
      
      const allProviders = await this.llmProviderRepository.findAll();
      const activeProviders = allProviders.filter(p => p.isActive && p.status === 'active');

      let totalRequests = BigInt(0);
      let totalTokensUsed = BigInt(0);
      let totalErrors = BigInt(0);

      for (const provider of allProviders) {
        totalRequests += BigInt(provider.totalRequests);
        totalTokensUsed += BigInt(provider.totalTokensUsed);
        totalErrors += BigInt(provider.totalErrors);
      }

      const averageErrorRate = totalRequests > 0 
        ? Number(totalErrors) / Number(totalRequests) * 100 
        : 0;

      return {
        totalProviders: allProviders.length,
        activeProviders: activeProviders.length,
        totalRequests: totalRequests.toString(),
        totalTokensUsed: totalTokensUsed.toString(),
        totalErrors: totalErrors.toString(),
        averageErrorRate: Math.round(averageErrorRate * 100) / 100
      };
    } catch (error) {
      logger.error('Error getting provider statistics', { error });
      throw error;
    }
  }

  // Private helper methods
  private mapToResponse(provider: LLMProvider, stats: any): LLMProviderResponse {
    return {
      id: provider.id,
      name: provider.name,
      description: provider.description,
      type: provider.type,
      baseUrl: provider.baseUrl,
      hasApiKey: provider.hasApiKey(),
      defaultModel: provider.defaultModel,
      modelsList: provider.modelsList,
      configuration: provider.configuration,
      status: provider.status,
      isActive: provider.isActive,
      priority: provider.priority,
      stats: stats || {
        totalRequests: '0',
        totalTokensUsed: '0',
        totalErrors: '0',
        errorRate: 0
      },
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt
    };
  }

  private getTestEndpoint(provider: LLMProvider): string {
    switch (provider.type) {
      case 'ollama':
        return `${provider.baseUrl}/api/generate`;
      case 'openai':
      case 'llmstudio':
        return `${provider.baseUrl}/v1/chat/completions`;
      default:
        return `${provider.baseUrl}/v1/chat/completions`;
    }
  }

  private getTestPayload(provider: LLMProvider): any {
    const testPrompt = 'Hello, this is a connection test. Please respond with "OK".';
    
    switch (provider.type) {
      case 'ollama':
        return {
          model: provider.defaultModel || 'llama2',
          prompt: testPrompt,
          stream: false,
          options: {
            num_predict: 10
          }
        };
      case 'openai':
      case 'llmstudio':
        return {
          model: provider.defaultModel || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 10,
          stream: false
        };
      default:
        return {
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 10
        };
    }
  }

  private getTestHeaders(provider: LLMProvider): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = provider.getApiKey();
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Add custom headers if configured
    if (provider.configuration?.headers) {
      Object.assign(headers, provider.configuration.headers);
    }

    return headers;
  }
}

export const llmProviderManagementService = LLMProviderManagementService.getInstance(); 