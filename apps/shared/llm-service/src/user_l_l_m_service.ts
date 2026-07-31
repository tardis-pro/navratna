import {
  LLMRequest,
  LLMResponse,
  AgentResponseRequest,
  AgentResponseResponse,
  LLMProviderConfig,
} from './interfaces.js';
import { getContextManager, ContextManager } from './context-manager/context_manager.js';
import { BaseProvider } from './providers/base_provider.js';
import { OllamaProvider } from './providers/ollama_provider.js';
import { LLMStudioProvider } from './providers/l_l_m_studio_provider.js';
import { OpenAIProvider } from './providers/open_a_i_provider.js';
import { AnthropicProvider } from './providers/anthropic_provider.js';
import { GoogleProvider } from './providers/google_provider.js';
import {
  UserLLMProviderRepository,
  DatabaseService,
  UnifiedModelSelectionFacade,
  UnifiedModelSelection,
  AgentTaskTypeResolver,
} from '@uaip/shared-services';
import { LLMTaskType, AgentRole, AgentSkill } from '@uaip/types';
import type { AgentAssignedTool } from '@uaip/types';
import { logger } from '@uaip/utils';
import { recordLLMRequest } from '@uaip/middleware';
import { selectUserProviderForModel } from './provider_selection.js';
import { runToolCallingLoop } from './tool_calling.js';
import { AgentToolExecutor, type ToolExecutionRpcBus } from './agent_tool_executor.js';

type UserLLMProviderType = 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'google' | 'custom';

type AgentMCPToolItem = {
  toolId: string;
  toolName: string;
  serverName: string;
  enabled: boolean;
  priority?: number;
  parameters?: Record<string, unknown>;
};

export interface UserLLMProvider {
  id: string;
  userId: string;
  name: string;
  type: UserLLMProviderType;
  description?: string;
  baseUrl?: string;
  apiKeyEncrypted?: string;
  isDefault: boolean;
  configuration?: Record<string, unknown>;
  isActive?: boolean;
  defaultModel?: string;
  modelId?: string;
}

// DB row shape returned by UserLLMProviderRepository (matches Drizzle $inferSelect)
interface UserLLMProviderDbRow {
  id: string;
  userId: string;
  providerId: string;
  apiKeyEncrypted?: string | null;
  isDefault: boolean;
  configuration?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

function isUserLLMProviderDbRow(v: unknown): v is UserLLMProviderDbRow {
  if (typeof v !== 'object' || v === null) return false;
  return (
    typeof Reflect.get(v, 'id') === 'string' &&
    typeof Reflect.get(v, 'userId') === 'string' &&
    typeof Reflect.get(v, 'providerId') === 'string' &&
    typeof Reflect.get(v, 'isDefault') === 'boolean'
  );
}

const validUserLLMProviderTypes = [
  'ollama',
  'llmstudio',
  'openai',
  'anthropic',
  'google',
  'custom',
] as const;

const validUserLLMProviderTypesSet = new Set<unknown>(validUserLLMProviderTypes);

function isUserLLMProviderType(v: unknown): v is UserLLMProviderType {
  return validUserLLMProviderTypesSet.has(v);
}

const userLLMProviderTypeLabels: Record<UserLLMProviderType, string> = {
  ollama: 'Ollama',
  llmstudio: 'LLM Studio',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  custom: 'Custom',
};

/**
 * Map a DB row (which stores name/type/baseUrl inside configuration) to UserLLMProvider.
 * When creating a provider, we store those fields in configuration (see createUserProvider).
 */
function mapDbRowToUserLLMProvider(row: UserLLMProviderDbRow): UserLLMProvider {
  const cfg = row.configuration ?? {};
  const rawType = cfg.type ?? row.providerId;
  const resolvedType: UserLLMProviderType = isUserLLMProviderType(rawType) ? rawType : 'custom';
  return {
    id: row.id,
    userId: row.userId,
    name: typeof cfg.name === 'string' ? cfg.name : userLLMProviderTypeLabels[resolvedType],
    type: resolvedType,
    description: typeof cfg.description === 'string' ? cfg.description : undefined,
    baseUrl: typeof cfg.baseUrl === 'string' ? cfg.baseUrl : undefined,
    apiKeyEncrypted: row.apiKeyEncrypted ?? undefined,
    isDefault: row.isDefault,
    configuration: cfg,
    isActive: typeof cfg.isActive === 'boolean' ? cfg.isActive : true,
    defaultModel: typeof cfg.defaultModel === 'string' ? cfg.defaultModel : undefined,
    modelId: row.providerId,
  };
}

function mapDbRowsToUserLLMProviders(rows: UserLLMProviderDbRow[]): UserLLMProvider[] {
  return rows.map(mapDbRowToUserLLMProvider);
}

function toUserLLMProviderDbRows(raw: unknown[]): UserLLMProviderDbRow[] {
  return raw.filter(isUserLLMProviderDbRow);
}

export class UserLLMService {
  private userLLMProviderRepository: UserLLMProviderRepository | null = null;
  private providerCache: Map<string, BaseProvider> = new Map(); // Cache providers by user+type
  private modelSelectionFacade: UnifiedModelSelectionFacade | null = null;
  private taskTypeResolver: AgentTaskTypeResolver | null = null;
  private contextManager: ContextManager;
  private toolExecutionBus: ToolExecutionRpcBus | null = null;

  constructor(modelSelectionFacade?: UnifiedModelSelectionFacade) {
    this.modelSelectionFacade = modelSelectionFacade || null;
    this.contextManager = getContextManager();
    logger.info('UserLLMService constructor called', {
      facadeProvided: !!modelSelectionFacade,
      facadeType: typeof modelSelectionFacade,
      facadeConstructor: modelSelectionFacade?.constructor?.name,
      facadeStored: !!this.modelSelectionFacade,
    });
  }

  // Lazy initialization of repository
  private async getUserLLMProviderRepository(): Promise<UserLLMProviderRepository> {
    if (!this.userLLMProviderRepository) {
      const databaseService = DatabaseService.getInstance();
      await databaseService.initialize(); // Ensure database is initialized
      this.userLLMProviderRepository = databaseService.userLLMProviderRepository;
    }
    return this.userLLMProviderRepository;
  }

  // Lazy initialization of task type resolver
  private async getTaskTypeResolver(): Promise<AgentTaskTypeResolver> {
    if (!this.taskTypeResolver) {
      const databaseService = DatabaseService.getInstance();
      await databaseService.initialize(); // Ensure database is initialized
      this.taskTypeResolver = new AgentTaskTypeResolver(databaseService);
    }
    return this.taskTypeResolver;
  }

  // Provider Management Methods

  /**
   * Create a new LLM provider for a user
   */
  async createUserProvider(
    userId: string,
    data: {
      name: string;
      description?: string;
      type: UserLLMProviderType;
      baseUrl?: string;
      apiKey?: string;
      defaultModel?: string;
      configuration?: Record<string, unknown>;
      priority?: number;
    }
  ): Promise<UserLLMProvider> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const providerRecord = await repository.create({
        userId,
        providerId: data.type,
        apiKeyEncrypted: data.apiKey,
        isDefault: false,
        configuration: {
          ...(data.configuration ?? {}),
          name: data.name,
          description: data.description,
          type: data.type,
          baseUrl: data.baseUrl,
          defaultModel: data.defaultModel,
          isActive: true,
          priority: data.priority,
        },
      });

      const createdProvider: UserLLMProvider = {
        id: providerRecord.id,
        userId: providerRecord.userId,
        name: data.name,
        type: data.type,
        description: data.description,
        baseUrl: data.baseUrl,
        apiKeyEncrypted: providerRecord.apiKeyEncrypted ?? undefined,
        isDefault: providerRecord.isDefault,
        configuration: providerRecord.configuration,
        isActive: true,
        defaultModel: data.defaultModel,
        modelId: providerRecord.providerId,
      };

      // Clear cache for this user
      this.clearUserCache(userId);

      logger.info('Created user LLM provider', {
        userId,
        providerId: createdProvider.id,
        type: createdProvider.type,
        name: createdProvider.name,
      });

      return createdProvider;
    } catch (error) {
      logger.error('Error creating user LLM provider', { userId, data, error });
      throw error;
    }
  }

  /**
   * Get all providers for a user
   */
  async getUserProviders(userId: string): Promise<UserLLMProvider[]> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const providers = await repository.findByUserId(userId);
      return mapDbRowsToUserLLMProviders(toUserLLMProviderDbRows(providers));
    } catch (error) {
      logger.error('Error getting user LLM providers', { userId, error });
      throw error;
    }
  }

  /**
   * Get active providers for a user
   */
  async getActiveUserProviders(userId: string): Promise<UserLLMProvider[]> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const providers = await repository.findActiveByUserId(userId);
      return mapDbRowsToUserLLMProviders(toUserLLMProviderDbRows(providers));
    } catch (error) {
      logger.error('Error getting active user LLM providers', { userId, error });
      throw error;
    }
  }

  /**
   * Get providers by type for a user
   */
  async getUserProvidersByType(
    userId: string,
    type: UserLLMProviderType
  ): Promise<UserLLMProvider[]> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const providers = await repository.findByUserId(userId);
      const rows = toUserLLMProviderDbRows(providers);
      const filtered = rows.filter((row) => row.providerId === type);
      return mapDbRowsToUserLLMProviders(filtered);
    } catch (error) {
      logger.error('Error getting user LLM providers by type', { userId, type, error });
      throw error;
    }
  }

  /**
   * Get a specific user provider by ID
   */
  async getUserProviderById(providerId: string): Promise<UserLLMProvider | null> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const result = await repository.findById(providerId);
      if (!result) return null;
      if (!isUserLLMProviderDbRow(result)) return null;
      return mapDbRowToUserLLMProvider(result);
    } catch (error) {
      logger.error('Error getting user LLM provider by ID', { providerId, error });
      throw error;
    }
  }

  /**
   * Update a user's provider configuration
   */
  async updateUserProviderConfig(
    userId: string,
    providerId: string,
    config: {
      name?: string;
      description?: string;
      baseUrl?: string;
      defaultModel?: string;
      priority?: number;
      type?: UserLLMProviderType;
      isActive?: boolean;
      configuration?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const existing = await repository.findById(providerId);
      if (!existing || existing.userId !== userId) {
        throw new Error('Provider not found or access denied');
      }

      const existingProvider = isUserLLMProviderDbRow(existing)
        ? mapDbRowToUserLLMProvider(existing)
        : null;
      if (!existingProvider) {
        throw new Error('Invalid provider record');
      }

      const mergedConfiguration: Record<string, unknown> = {
        ...(existingProvider.configuration ?? {}),
        ...(config.configuration ?? {}),
      };

      if (config.name !== undefined) mergedConfiguration.name = config.name;
      if (config.description !== undefined) mergedConfiguration.description = config.description;
      if (config.baseUrl !== undefined) mergedConfiguration.baseUrl = config.baseUrl;
      if (config.defaultModel !== undefined) mergedConfiguration.defaultModel = config.defaultModel;
      if (config.priority !== undefined) mergedConfiguration.priority = config.priority;
      if (config.type !== undefined) mergedConfiguration.type = config.type;
      if (config.isActive !== undefined) mergedConfiguration.isActive = config.isActive;

      await repository.update(providerId, {
        providerId: config.type ?? existing.providerId,
        configuration: mergedConfiguration,
      });

      // Clear cache for this user
      this.clearUserCache(userId);

      logger.info('Updated user LLM provider configuration', { userId, providerId, config });
    } catch (error) {
      logger.error('Error updating user LLM provider configuration', {
        userId,
        providerId,
        config,
        error,
      });
      throw error;
    }
  }

  /**
   * Update a user's provider API key
   */
  async updateUserProviderApiKey(
    userId: string,
    providerId: string,
    apiKey: string
  ): Promise<void> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const existing = await repository.findById(providerId);
      if (!existing || existing.userId !== userId) {
        throw new Error('Provider not found or access denied');
      }
      await repository.update(providerId, { apiKeyEncrypted: apiKey });

      // Clear cache for this user
      this.clearUserCache(userId);

      logger.info('Updated user LLM provider API key', { userId, providerId });
    } catch (error) {
      logger.error('Error updating user LLM provider API key', { userId, providerId, error });
      throw error;
    }
  }

  /**
   * Delete a user's provider
   */
  async deleteUserProvider(userId: string, providerId: string): Promise<void> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      await repository.delete(providerId);

      // Clear cache for this user
      this.clearUserCache(userId);

      logger.info('Deleted user LLM provider', { userId, providerId });
    } catch (error) {
      logger.error('Error deleting user LLM provider', { userId, providerId, error });
      throw error;
    }
  }

  async setDefaultProvider(userId: string, providerId: string): Promise<void> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const existing = await repository.findById(providerId);
      if (!existing || existing.userId !== userId) {
        throw new Error('Provider not found or access denied');
      }

      await repository.setDefault(userId, providerId);
      this.clearUserCache(userId);

      logger.info('Set default user LLM provider', { userId, providerId });
    } catch (error) {
      logger.error('Error setting default user LLM provider', { userId, providerId, error });
      throw error;
    }
  }

  /**
   * Test a user's provider connectivity
   */
  async testUserProvider(userId: string, providerId?: string): Promise<{
    isHealthy: boolean;
    error?: string;
    modelCount: number;
    responseTime: number;
  }> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const rows = await repository.findByUserId(userId);
      const userProviders = mapDbRowsToUserLLMProviders(toUserLLMProviderDbRows(rows));
      const activeProviders = userProviders.filter((candidate) => candidate.isActive !== false);
      const userProvider = providerId
        ? activeProviders.find((candidate) => candidate.id === providerId)
        : activeProviders.find((candidate) => candidate.isDefault) ?? activeProviders[0];
      if (!userProvider) {
        throw new Error('Provider not found or access denied');
      }

      const startTime = Date.now();
      const provider = await this.createProviderInstance(userProvider);

      try {
        const models = await provider.getAvailableModels();
        const responseTime = Date.now() - startTime;
        if (models.length === 0) {
          return {
            isHealthy: false,
            error: 'Provider returned no models',
            modelCount: 0,
            responseTime,
          };
        }
        return {
          isHealthy: true,
          modelCount: models.length,
          responseTime,
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return {
          isHealthy: false,
          error: errorMessage,
          modelCount: 0,
          responseTime,
        };
      }
    } catch (error) {
      logger.error('Error testing user LLM provider', { userId, error });
      throw error;
    }
  }

  // LLM Generation Methods

  /**
   * Generate LLM response using user's providers
   */
  async generateResponse(
    userId: string,
    request: LLMRequest,
    provider?: UserLLMProvider
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      // Get provider if not provided
      if (!provider) {
        const providers = await this.getActiveUserProviders(userId);
        const configuredProviders = providers.filter(
          (candidate) =>
            typeof candidate.apiKeyEncrypted === 'string' &&
            candidate.apiKeyEncrypted.length > 0 &&
            (typeof candidate.baseUrl === 'string' ||
              (typeof candidate.configuration === 'object' && candidate.configuration !== null))
        );
        if (configuredProviders.length === 0) {
          throw new Error('No LLM providers configured for user');
        }
        provider = configuredProviders.find((candidate) => candidate.isDefault) ?? configuredProviders[0];
      }

      // Ensure we have a fresh entity instance if the provider might be a plain object
      const providerRecord = provider;
      if (providerRecord.id) {
        const repository = await this.getUserLLMProviderRepository();
        const freshRow = await repository.findById(providerRecord.id);
        if (freshRow && isUserLLMProviderDbRow(freshRow)) {
          const freshProvider = mapDbRowToUserLLMProvider(freshRow);
          Object.assign(providerRecord, freshProvider);
        }
      }

      logger.info('Generating LLM response for user', {
        userId,
        provider: providerRecord.type,
        promptLength: request.prompt.length,
        model: request.model,
      });

      const providerInstance = await this.getOrCreateProviderInstance(providerRecord);
      const response = await providerInstance.generateResponse(request);

      const duration = Date.now() - startTime;

      logger.info('LLM response generated successfully for user', {
        userId,
        providerId: providerRecord.id,
        tokensUsed: response.tokensUsed,
        duration,
        isError: !!response.error,
      });

      recordLLMRequest({
        agentId: request.agentId,
        provider: providerRecord.type,
        model: response.model || request.model,
        requestType: 'user',
        status: response.error ? 'failure' : 'success',
        durationMs: duration,
        tokensUsed: response.tokensUsed,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error generating LLM response for user', {
        userId,
        error: error instanceof Error ? error.message : error,
        duration,
      });

      recordLLMRequest({
        agentId: request.agentId,
        provider: provider?.type,
        model: request.model,
        requestType: 'user',
        status: 'failure',
        durationMs: duration,
      });

      return {
        content: '',
        model: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        finishReason: 'error',
      };
    }
  }

  /**
   * Generate agent response using user's providers
   */
  async generateAgentResponse(
    userId: string,
    request: AgentResponseRequest
  ): Promise<AgentResponseResponse> {
    try {
      // Log the incoming request structure
      logger.info('UserLLMService.generateAgentResponse - Incoming request', {
        userId,
        hasAgent: !!request.agent,
        hasMessages: !!request.messages,
        messagesCount: request.messages?.length || 0,
        hasContext: !!request.context,
        hasTools: !!request.tools,
        toolsCount: request.tools?.length || 0,
      });

      // Build the LLM request from the agent context
      const prompt = this.buildAgentPrompt(request);
      const systemPrompt = this.buildAgentSystemPrompt(request);

      const llmRequest: LLMRequest = {
        prompt,
        systemPrompt,
        maxTokens: request.agent.maxTokens,
        temperature: request.agent.temperature,
        model: request.agent.modelId,
        userId,
        agentId: request.agent.id,
        ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {}),
      };

      logger.info('Built LLM request for agent', {
        userId,
        agentId: request.agent.id,
        agentName: request.agent.name,
        hasPrompt: !!prompt,
        hasSystemPrompt: !!systemPrompt,
        maxTokens: llmRequest.maxTokens,
        temperature: llmRequest.temperature,
        model: llmRequest.model,
      });

      let response: LLMResponse;

      // Check if we have model selection facade and agent ID for intelligent selection
      if (this.modelSelectionFacade && request.agent.id) {
        logger.info('Using model selection facade for agent', {
          agentId: request.agent.id,
          agentName: request.agent.name,
        });

        // Convert the types Agent to a partial database Agent for task type determination
        const now = new Date();
        const agentRoleSet = new Set<string>(Object.values(AgentRole));
        const isAgentRole = (r: string): r is AgentRole => agentRoleSet.has(r);
        const resolvedRole: AgentRole = isAgentRole(request.agent.role)
          ? request.agent.role
          : AgentRole.ASSISTANT;
        const agentForTaskType = {
          id: request.agent.id,
          name: request.agent.name,
          description: request.agent.description ?? '',
          role: resolvedRole,
          capabilities: request.agent.capabilities || new Array<string>(),
          learningHistory: new Array<Record<string, unknown>>(),
          securityLevel: 'medium',
          complianceTags: new Array<string>(),
          auditTrail: new Array<Record<string, unknown>>(),
          performanceMetrics: {},
          configuration: request.agent.configuration || {},
          preferences: {},
          tags: new Array<string>(),
          metadata: request.agent.metadata || {},
          organizationId: '',
          version: String(request.agent.version ?? 1),
          toolPermissions: {},
          toolPreferences: {},
          toolBudget: {},
          maxConcurrentTools: 3,
          modelId: request.agent.modelId ?? '',
          apiType: request.agent.apiType ?? '',
          userLLMProviderId: request.agent.userLLMProviderId ?? '',
          temperature: request.agent.temperature ?? 0.7,
          maxTokens: request.agent.maxTokens ?? 2000,
          systemPrompt: request.agent.systemPrompt ?? '',
          status: 'active',
          createdBy: '',
          createdAt: now,
          updatedAt: now,
          personaId: '',
          legacyPersona: {},
          intelligenceConfig: {},
          securityContext: {},
          isActive: true,
          lastActiveAt: now,
          skills: new Array<AgentSkill>(),
          capabilityScores: {},
          deploymentEnvironment: 'production',
          totalOperations: 0,
          successfulOperations: 0,
          averageResponseTime: 0,
          lastPerformanceReview: now,
          assignedMCPTools: new Array<AgentMCPToolItem>(),
          mcpToolSettings: {},
        };

        // Determine appropriate task type for the agent
        const taskTypeResolver = await this.getTaskTypeResolver();
        const taskType = await taskTypeResolver.determineTaskType(
          agentForTaskType as Parameters<typeof taskTypeResolver.determineTaskType>[0],
          {
            userIntent: request.messages?.[0]?.content,
            conversationHistory: request.messages,
          }
        );

        // Use facade to select model and provider
        const modelSelection = await this.modelSelectionFacade.selectForAgent(
          request.agent.id,
          taskType,
          {
            model: llmRequest.model,
            urgency: 'medium',
          }
        );

        logger.info('Model selection facade result', {
          selectedModel: modelSelection.model.model,
          selectedProvider: modelSelection.model.provider,
          confidence: modelSelection.model.confidence,
          taskType: taskType,
        });

        // Use the selected model and provider type to find a matching user provider
        const selectedProvider = await this.resolveProviderForSelection(
          userId,
          modelSelection.model.provider,
          modelSelection.model.model,
          request.agent.userLLMProviderId
        );

        llmRequest.model = request.agent.modelId;
        if (modelSelection.model.settings?.temperature !== undefined) {
          llmRequest.temperature = modelSelection.model.settings.temperature;
        }
        if (modelSelection.model.settings?.maxTokens !== undefined) {
          llmRequest.maxTokens = modelSelection.model.settings.maxTokens;
        }

        logger.info('Using selected provider from facade', {
          providerId: selectedProvider.id,
          providerName: selectedProvider.name,
          selectedModel: modelSelection.model.model,
        });

        response = await this.runWithTools(
          llmRequest,
          (next) => this.generateResponse(userId, next, selectedProvider),
          request.agent.assignedMCPTools ?? []
        );
      } else {
        logger.info('Using traditional user provider lookup', {
          reason: !this.modelSelectionFacade ? 'no facade' : 'no agent id',
        });
        response = await this.runWithTools(
          llmRequest,
          (next) => this.generateResponse(userId, next),
          request.agent.assignedMCPTools ?? []
        );
      }

      return {
        content: response.content,
        model: response.model,
        tokensUsed: response.tokensUsed,
        confidence: response.confidence,
        finishReason: response.finishReason,
        error: response.error,
        toolsExecuted: response.toolsExecuted,
        suggestedTools: response.suggestedTools,
      };
    } catch (error) {
      logger.error('Error generating agent response for user', { userId, error });
      throw error;
    }
  }

  /**
   * Runs the provider call through the tool-calling loop when the agent has
   * tools bound. Without tools the provider is invoked exactly once, so an
   * agent with no bound tools behaves identically to before.
   */
  private async runWithTools(
    llmRequest: LLMRequest,
    callProvider: (request: LLMRequest) => Promise<LLMResponse>,
    bindings: AgentAssignedTool[]
  ): Promise<LLMResponse> {
    if (!llmRequest.tools || llmRequest.tools.length === 0 || !this.toolExecutionBus) {
      return callProvider(llmRequest);
    }

    const executor = new AgentToolExecutor(this.toolExecutionBus, bindings);

    return runToolCallingLoop({
      request: llmRequest,
      callProvider,
      executeTool: (call) => executor.execute(call, llmRequest.agentId, llmRequest.userId),
      requiresApproval: (call) => executor.requiresApproval(call.function.name),
    });
  }

  setToolExecutionBus(bus: ToolExecutionRpcBus): void {
    this.toolExecutionBus = bus;
  }

  /**
   * Select a provider for streaming based on agent preferences when available
   */
  async selectProviderForAgent(
    userId: string,
    agentId: string,
    options?: {
      model?: string;
      provider?: UserLLMProviderType;
      taskType?: LLMTaskType;
    }
  ): Promise<{ provider: UserLLMProvider; selection: UnifiedModelSelection } | null> {
    if (!this.modelSelectionFacade) {
      return null;
    }

    const taskType = options?.taskType ?? LLMTaskType.REASONING;
    const selection = await this.modelSelectionFacade.selectForAgent(agentId, taskType, {
      model: options?.model,
      provider: options?.provider,
      urgency: 'medium',
    });

    const provider = await this.resolveProviderForSelection(
      userId,
      selection.model.provider,
      selection.model.model
    );

    return { provider, selection };
  }

  /**
   * Get available models for a user
   */
  async getAvailableModels(userId: string): Promise<
    Array<{
      id: string;
      name: string;
      description?: string;
      source: string;
      apiEndpoint: string;
      apiType: UserLLMProviderType;
      provider: string;
      isAvailable: boolean;
    }>
  > {
    try {
      const userProviders = await this.getActiveUserProviders(userId);
      const allModels = [];
      logger.info('Getting models for user', { userId, userProviders });
      for (const userProvider of userProviders) {
        try {
          // eslint-disable-next-line no-await-in-loop -- sequential processing required
          const providerInstance = await this.getOrCreateProviderInstance(userProvider);
          logger.info('Getting models from provider', {
            userId,
            providerId: userProvider.id,
            providerName: userProvider.name,
          });
          // eslint-disable-next-line no-await-in-loop -- sequential processing required
          const models = await providerInstance.getAvailableModels();
          logger.info('Models from provider', {
            userId,
            providerId: userProvider.id,
            providerName: userProvider.name,
            models,
          });
          allModels.push(
            ...models.map((model) => ({
              ...model,
              provider: userProvider.name,
              apiType: userProvider.type,
              isAvailable: true,
            }))
          );
        } catch (error) {
          logger.error(`Failed to get models from user provider ${userProvider.id}`, {
            userId,
            providerId: userProvider.id,
            error,
          });
        }
      }

      return allModels;
    } catch (error) {
      logger.error('Error getting available models for user', { userId, error });
      throw error;
    }
  }

  /**
   * Get the best available provider for a user (optionally filtered by type)
   */
  async getBestProviderForUser(
    userId: string,
    preferredType?: UserLLMProviderType
  ): Promise<UserLLMProvider | null> {
    return this.getBestUserProvider(userId, preferredType);
  }

  // Private Helper Methods

  private async getBestUserProvider(
    userId: string,
    preferredType?: UserLLMProviderType
  ): Promise<UserLLMProvider | null> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const rawRows = await repository.findActiveByUserId(userId);
      const rows = toUserLLMProviderDbRows(rawRows);
      const providers = mapDbRowsToUserLLMProviders(rows);
      if (preferredType) {
        const filtered = providers.filter((provider) => provider.type === preferredType);
        if (filtered.length > 0) {
          return filtered[0];
        }
      }
      const defaultProvider = providers.find((provider) => provider.isDefault === true);
      return defaultProvider ?? providers[0] ?? null;
    } catch (error) {
      logger.error('Error getting best user provider', { userId, preferredType, error });
      return null;
    }
  }

  private async resolveProviderForSelection(
    userId: string,
    providerType: UserLLMProviderType,
    model?: string,
    preferredProviderId?: string
  ): Promise<UserLLMProvider> {
    const repository = await this.getUserLLMProviderRepository();
    const rawRows = await repository.findActiveByUserId(userId);
    const providers = mapDbRowsToUserLLMProviders(toUserLLMProviderDbRows(rawRows));
    const selectedProvider = selectUserProviderForModel(
      providers,
      providerType,
      model,
      preferredProviderId
    );

    if (!selectedProvider) {
      logger.error('Selected provider not found', { userId, providerType, model, preferredProviderId });
      throw new Error(`Selected provider not found: ${providerType}`);
    }

    return selectedProvider;
  }

  private async getOrCreateProviderInstance(userProvider: UserLLMProvider): Promise<BaseProvider> {
    const cacheKey = `${userProvider.userId}-${userProvider.id}`;

    if (this.providerCache.has(cacheKey)) {
      return this.providerCache.get(cacheKey)!;
    }

    const provider = await this.createProviderInstance(userProvider);
    this.providerCache.set(cacheKey, provider);
    return provider;
  }

  /**
   * Get provider configuration safely
   */
  getProviderConfig(userProvider: UserLLMProvider): LLMProviderConfig {
    const getDefaultBaseUrl = (type: UserLLMProviderType): string => {
      switch (type) {
        case 'openai':
          return 'https://api.openai.com';
        case 'anthropic':
          return 'https://api.anthropic.com';
        case 'google':
          return 'https://generativelanguage.googleapis.com';
        case 'ollama':
          return 'http://host.docker.internal:11434';
        case 'llmstudio':
          return 'http://host.docker.internal:1234';
        default:
          return userProvider.baseUrl || '';
      }
    };

    const cfg = userProvider.configuration ?? {};
    const timeout = typeof cfg.timeout === 'number' ? cfg.timeout : undefined;
    const retries = typeof cfg.retries === 'number' ? cfg.retries : undefined;

    // Normalize type: 'google' and 'anthropic' map to 'custom' for LLMProviderConfig
    const rawType = userProvider.type;
    const providerConfigType: LLMProviderConfig['type'] =
      rawType === 'google' || rawType === 'anthropic' ? 'custom' : rawType;

    return {
      providerId: userProvider.id,
      type: providerConfigType,
      baseUrl: userProvider.baseUrl || getDefaultBaseUrl(userProvider.type),
      // apiKeyEncrypted is already decrypted to plaintext by the repository read
      // path (UserLLMProviderRepository.decryptProviderRow). Pass it as the plain
      // apiKey so BaseProvider.getApiKey() can authenticate model-fetch/chat calls.
      apiKey: userProvider.apiKeyEncrypted,
      defaultModel: userProvider.defaultModel,
      timeout,
      retries,
    };
  }

  private async createProviderInstance(userProvider: UserLLMProvider): Promise<BaseProvider> {
    // Get config safely - handle both entity instances and plain objects
    const config = this.getProviderConfig(userProvider);

    switch (userProvider.type) {
      case 'ollama':
        return new OllamaProvider(config, userProvider.name);
      case 'llmstudio':
        return new LLMStudioProvider(config, userProvider.name);
      case 'anthropic':
        return new AnthropicProvider(config, userProvider.name);
      case 'google':
        return new GoogleProvider(config, userProvider.name);
      case 'openai':
      case 'custom':
        return new OpenAIProvider(config, userProvider.name);
      default:
        throw new Error(`Unsupported provider type: ${userProvider.type}`);
    }
  }

  private clearUserCache(userId: string): void {
    // Remove all cached providers for this user
    for (const [key] of this.providerCache) {
      if (key.startsWith(`${userId}-`)) {
        this.providerCache.delete(key);
      }
    }
  }

  private buildAgentPrompt(request: AgentResponseRequest): string {
    const { agent, messages = [], context, tools = [] } = request;

    // Create optimized rolling window context
    const contextDocs = context ? [context] : [];
    const systemPrompt = this.buildAgentSystemPrompt(request);
    const systemPromptTokens = this.contextManager.estimateTokens(systemPrompt);

    const window = this.contextManager.createRollingWindow(
      messages.map((m) => ({ ...m })),
      systemPromptTokens,
      tools.length,
      contextDocs
    );

    // Log context health
    const health = this.contextManager.analyzeContextHealth(window);
    if (health.status !== 'healthy') {
      logger.warn('UserLLM Context health issue', {
        status: health.status,
        warnings: health.warnings,
        recommendations: health.recommendations,
        agentId: agent.id,
      });
    }

    let prompt = '';

    // Add deduplicated context documents
    if (window.contextDocuments.length > 0) {
      window.contextDocuments.forEach((doc) => {
        prompt += `Context Document:\nTitle: ${doc.title}\nContent: ${doc.content}\n\n`;
      });
    }

    // Add summarized older context if available
    if (window.summarizedContext) {
      prompt += `${window.summarizedContext}\n\n`;
    }

    // Add recent conversation history
    if (window.recentMessages.length > 0) {
      prompt += 'Recent Conversation:\n';
      window.recentMessages.forEach((msg) => {
        prompt += `${msg.sender}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    prompt += `${agent.name}:`;

    logger.info('UserLLM Context window created', {
      agentId: agent.id,
      totalMessages: messages.length,
      recentMessages: window.recentMessages.length,
      hasSummary: !!window.summarizedContext,
      estimatedTokens: window.estimatedTokens,
      contextHealth: health.status,
    });

    return prompt;
  }

  private buildAgentSystemPrompt(request: AgentResponseRequest): string {
    const { agent, tools = [] } = request;

    // Check cache for persona prompt
    const cachedPrompt = this.contextManager.getCachedPersonaPrompt(agent.id);
    if (cachedPrompt) {
      return cachedPrompt;
    }

    let systemPrompt = `You are ${agent.name}`;

    if (agent.persona?.description) {
      systemPrompt += `, ${agent.persona.description}`;
    }

    systemPrompt += '.\n\n';

    if (typeof agent.persona?.systemPrompt === 'string' && agent.persona.systemPrompt.trim()) {
      systemPrompt += `PERSONA INSTRUCTIONS:\n${agent.persona.systemPrompt.trim()}\n\n`;
    }

    const traits = Array.isArray(agent.persona?.traits)
      ? agent.persona.traits
          .map((trait) => {
            if (typeof trait === 'string') return trait;
            if (typeof trait === 'object' && trait !== null && 'name' in trait) {
              const name = Reflect.get(trait, 'name');
              return typeof name === 'string' ? name : null;
            }
            return null;
          })
          .filter((trait): trait is string => Boolean(trait))
      : [];
    if (traits.length > 0) {
      systemPrompt += `Persona traits: ${traits.join(', ')}\n`;
    }

    const expertise = Array.isArray(agent.persona?.expertise)
      ? agent.persona.expertise
          .map((item) => (typeof item === 'string' ? item : null))
          .filter((item): item is string => Boolean(item))
      : [];
    if (expertise.length > 0) {
      systemPrompt += `Expertise: ${expertise.join(', ')}\n`;
    }

    if (agent.persona?.restrictions && Object.keys(agent.persona.restrictions).length > 0) {
      systemPrompt += `Restrictions: ${JSON.stringify(agent.persona.restrictions)}\n`;
    }

    if (agent.systemPrompt?.trim()) {
      systemPrompt += `Agent-specific instructions:\n${agent.systemPrompt.trim()}\n`;
    }

    if (traits.length > 0 || expertise.length > 0 || agent.persona?.restrictions || agent.systemPrompt?.trim()) {
      systemPrompt += '\n';
    }

    // Dynamic response limits based on available context
    const availableTokens = this.contextManager.calculateOptimalResponseLimit(
      this.contextManager.config.maxTokens - this.contextManager.estimateTokens(systemPrompt)
    );
    const responseWordLimit = Math.max(200, Math.floor(availableTokens / 4)); // Rough tokens to words

    systemPrompt += `RESPONSE GUIDELINES:\n`;
    systemPrompt += `- Keep responses under ${responseWordLimit} words unless the query explicitly requires more detail\n`;
    systemPrompt += '- Be direct and concise while maintaining helpfulness\n';
    systemPrompt +=
      '- Use structured format (bullet points, numbered lists) for complex information\n';
    systemPrompt += '- Offer to elaborate on specific aspects if the topic is complex\n\n';
    systemPrompt += 'DISCUSSION GUIDELINES:\n';
    systemPrompt += '- Stay at the decision and tradeoff level unless explicitly asked for implementation details\n';
    systemPrompt += '- Add a genuinely new angle, risk, constraint, stakeholder concern, or decision criterion\n';
    systemPrompt += '- Avoid repeating points already made; if you agree, say what that agreement unlocks\n';
    systemPrompt += '- When enough angles are covered, synthesize a conclusion with decision, rationale, risks, and next steps\n\n';

    if (agent.persona?.capabilities && agent.persona.capabilities.length > 0) {
      systemPrompt += `Your capabilities include: ${agent.persona.capabilities.join(', ')}\n`;
    }

    if (tools.length > 0) {
      systemPrompt += '\nAvailable tools:\n';
      tools.forEach((tool) => {
        systemPrompt += `- ${tool.name}: ${tool.description}\n`;
      });
    }

    // Cache the persona prompt to avoid rebuilding
    this.contextManager.cachePersonaPrompt(agent.id, systemPrompt);

    return systemPrompt;
  }
}
