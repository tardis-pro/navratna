import { readFileSync } from 'node:fs';
import type {
  ModelConfig,
  ProviderChain,
  AgentModelConfig,
  ModelRoutingConfig,
} from '@uaip/types';

export { ModelConfig, ProviderChain, AgentModelConfig, ModelRoutingConfig };

export class ModelRoutingService {
  private configPath: string;
  private config: ModelRoutingConfig;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  private loadConfig(): ModelRoutingConfig {
    const fileContent = readFileSync(this.configPath, 'utf-8');
    return JSON.parse(fileContent) as ModelRoutingConfig;
  }

  getProviderForAgent(agentId: string): ProviderChain | null {
    const agentConfig = this.config.agents[agentId];
    if (!agentConfig) {
      return null;
    }

    return this.config.providers[agentConfig.primaryProvider] ?? null;
  }

  getModelForAgent(agentId: string, capability: string): ModelConfig | null {
    const agentConfig = this.config.agents[agentId];
    if (!agentConfig) {
      return null;
    }

    const provider = this.getProviderForAgent(agentId);
    if (!provider) {
      return null;
    }

    const preferredModel = provider.models.find((model) => model.capabilities.includes(capability));
    if (preferredModel) {
      return preferredModel;
    }

    for (const fallbackProvider of this.getFallbackProviders(agentId)) {
      const fallbackModel = fallbackProvider.models.find((model) =>
        model.capabilities.includes(capability)
      );
      if (fallbackModel) {
        return fallbackModel;
      }
    }

    return provider.models[0] ?? null;
  }

  getFallbackProviders(agentId: string): ProviderChain[] {
    const agentConfig = this.config.agents[agentId];
    if (!agentConfig) {
      return [];
    }

    return agentConfig.fallbackProviders
      .map((providerName) => this.config.providers[providerName])
      .filter((provider): provider is ProviderChain => Boolean(provider));
  }

  getSystemPrompt(agentId: string): string | null {
    return this.config.agents[agentId]?.systemPrompt ?? null;
  }

  getDefaultModel(capability: keyof ModelRoutingConfig['defaults']): ModelConfig | null {
    const modelName = this.config.defaults[capability];
    if (!modelName) {
      return null;
    }

    for (const provider of Object.values(this.config.providers)) {
      const model = provider.models.find((candidate) => candidate.name === modelName);
      if (model) {
        return model;
      }
    }

    return null;
  }

  getAllAgents(): AgentModelConfig[] {
    return Object.values(this.config.agents);
  }

  getAllProviders(): ProviderChain[] {
    return Object.values(this.config.providers);
  }

  getAgentConfig(agentId: string): AgentModelConfig | null {
    return this.config.agents[agentId] ?? null;
  }

  reload(): void {
    this.config = this.loadConfig();
  }
}
