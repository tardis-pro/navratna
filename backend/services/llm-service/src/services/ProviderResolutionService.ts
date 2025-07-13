import { UserLLMService } from '@uaip/llm-service';
import { logger } from '@uaip/utils';

// Configuration constants
export const LLM_CONFIG = {
  DEFAULT_MODEL: 'llama2',
  DEFAULT_MAX_TOKENS: 500,
  DEFAULT_TEMPERATURE: 0.7,
  CONFIDENCE_THRESHOLDS: {
    HIGH: 0.9,
    MEDIUM: 0.7,
    LOW: 0.5
  },
  RESPONSE_TIMEOUT: 30000,
  UUID_REGEX: /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
} as const;

export interface ProviderResolution {
  effectiveProvider?: string;
  effectiveModel: string;
  resolutionPath: 'agent-specific' | 'user-provider' | 'global-fallback';
  confidence: number;
  warnings?: string[];
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  maxTokens: number;
  supportedModalities: string[];
}

export interface IProviderResolutionService {
  resolveProvider(agent: any, requestedModel?: string, requestedProvider?: string): Promise<ProviderResolution>;
  validateProvider(providerType: string, model: string): boolean;
  getProviderCapabilities(providerType: string): ProviderCapabilities;
}

export class ProviderResolutionService implements IProviderResolutionService {
  constructor(
    private userLLMService: UserLLMService
  ) {}

  async resolveProvider(
    agent: any, 
    requestedModel?: string, 
    requestedProvider?: string
  ): Promise<ProviderResolution> {
    // 1. Try agent-specific provider
    const agentResolution = await this.resolveAgentProvider(agent, requestedModel);
    if (agentResolution.effectiveProvider) {
      return agentResolution;
    }

    // 2. Try user providers that support the model
    const userResolution = await this.resolveUserProvider(agent, requestedModel);
    if (userResolution.effectiveProvider) {
      return userResolution;
    }

    // 3. Fall back to global provider
    return this.resolveGlobalProvider(requestedModel, requestedProvider);
  }

  private async resolveAgentProvider(agent: any, model?: string): Promise<ProviderResolution> {
    if (!agent?.userLLMProviderId) {
      return { 
        effectiveModel: model || LLM_CONFIG.DEFAULT_MODEL, 
        resolutionPath: 'agent-specific', 
        confidence: 0 
      };
    }

    try {
      const provider = await this.userLLMService.getUserProviderById(agent.userLLMProviderId);
      if (provider?.isActive) {
        return {
          effectiveProvider: provider.type,
          effectiveModel: model || agent.modelId || provider.defaultModel || LLM_CONFIG.DEFAULT_MODEL,
          resolutionPath: 'agent-specific',
          confidence: LLM_CONFIG.CONFIDENCE_THRESHOLDS.HIGH
        };
      }
    } catch (error) {
      logger.warn('Failed to resolve agent provider', { 
        agentId: agent.id, 
        providerId: agent.userLLMProviderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return { 
      effectiveModel: model || LLM_CONFIG.DEFAULT_MODEL, 
      resolutionPath: 'agent-specific', 
      confidence: 0 
    };
  }

  private async resolveUserProvider(agent: any, model?: string): Promise<ProviderResolution> {
    if (!agent?.createdBy) {
      return { 
        effectiveModel: model || LLM_CONFIG.DEFAULT_MODEL, 
        resolutionPath: 'user-provider', 
        confidence: 0 
      };
    }

    try {
      const userProviders = await this.userLLMService.getActiveUserProviders(agent.createdBy);
      const effectiveModel = model || agent.modelId || LLM_CONFIG.DEFAULT_MODEL;

      // Try UUID extraction from model name
      const providerFromModel = this.extractProviderFromModelId(effectiveModel, userProviders);
      if (providerFromModel) {
        return {
          effectiveProvider: providerFromModel.type,
          effectiveModel,
          resolutionPath: 'user-provider',
          confidence: LLM_CONFIG.CONFIDENCE_THRESHOLDS.MEDIUM + 0.1
        };
      }

      // Try model-to-provider mapping
      const providerFromMapping = this.findProviderByModelType(effectiveModel, userProviders);
      if (providerFromMapping) {
        return {
          effectiveProvider: providerFromMapping.type,
          effectiveModel,
          resolutionPath: 'user-provider',
          confidence: LLM_CONFIG.CONFIDENCE_THRESHOLDS.MEDIUM
        };
      }
    } catch (error) {
      logger.warn('Failed to resolve user provider', { 
        userId: agent.createdBy,
        model,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return { 
      effectiveModel: model || LLM_CONFIG.DEFAULT_MODEL, 
      resolutionPath: 'user-provider', 
      confidence: 0 
    };
  }

  private resolveGlobalProvider(model?: string, provider?: string): ProviderResolution {
    const effectiveModel = model || LLM_CONFIG.DEFAULT_MODEL;
    const effectiveProvider = provider || this.getProviderTypeFromModel(effectiveModel);

    return {
      effectiveProvider,
      effectiveModel,
      resolutionPath: 'global-fallback',
      confidence: LLM_CONFIG.CONFIDENCE_THRESHOLDS.LOW
    };
  }

  private extractProviderFromModelId(modelId: string, providers: any[]): any | null {
    const match = modelId.match(LLM_CONFIG.UUID_REGEX);
    
    if (match) {
      return providers.find(p => p.id === match[1] && p.isActive);
    }
    
    return null;
  }

  private findProviderByModelType(model: string, providers: any[]): any | null {
    const modelLower = model.toLowerCase();
    
    if (modelLower.includes('gpt') || modelLower.includes('openai')) {
      return providers.find(p => p.type === 'openai' && p.isActive);
    }
    
    if (modelLower.includes('claude') || modelLower.includes('anthropic')) {
      return providers.find(p => p.type === 'anthropic' && p.isActive);
    }
    
    if (modelLower.includes('llama') || modelLower.includes('ollama')) {
      return providers.find(p => p.type === 'ollama' && p.isActive);
    }
    
    return null;
  }

  private getProviderTypeFromModel(model: string): string {
    const modelLower = model.toLowerCase();
    
    if (modelLower.includes('gpt') || modelLower.includes('openai')) return 'openai';
    if (modelLower.includes('claude') || modelLower.includes('anthropic')) return 'anthropic';
    if (modelLower.includes('llama') || modelLower.includes('ollama')) return 'ollama';
    
    return 'ollama'; // Default fallback
  }

  validateProvider(providerType: string, model: string): boolean {
    return this.findProviderByModelType(model, [{ type: providerType, isActive: true }]) !== null;
  }

  getProviderCapabilities(providerType: string): ProviderCapabilities {
    const baseCapabilities = {
      supportsStreaming: true,
      maxTokens: 4096,
      supportedModalities: ['text']
    };

    switch (providerType) {
      case 'openai':
        return {
          ...baseCapabilities,
          maxTokens: 128000,
          supportedModalities: ['text', 'image']
        };
      case 'anthropic':
        return {
          ...baseCapabilities,
          maxTokens: 200000,
          supportedModalities: ['text', 'image']
        };
      case 'ollama':
        return {
          ...baseCapabilities,
          maxTokens: 32768,
          supportedModalities: ['text']
        };
      default:
        return baseCapabilities;
    }
  }
}