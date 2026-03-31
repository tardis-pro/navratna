import { ModelSelectionOrchestrator } from './model_selection_orchestrator';
import type { ModelSelectionRequest, ModelSelectionResult, FallbackChain } from '@uaip/types';
import { LLMTaskType, RoutingRequest } from '@uaip/types';
import { logger } from '@uaip/utils';
import { AgentRepository } from '../database/repositories/agent_repository';
import { UserLLMPreferenceRepository } from '../database/repositories/user_l_l_m_preference_repository';
import { AgentLLMPreferenceRepository } from '../database/repositories/agent_l_l_m_preference_repository';
import { LLMProviderRepository } from '../database/repositories/l_l_m_provider_repository';

type UserLLMProvider = Record<string, string | number | boolean | null>;

type OrchestratorAgentRepository = AgentRepository & {
    findOne: (query: { where: { id: string }; select?: string[] }) => Promise<{ createdBy?: string } | null>;
};

type OrchestratorUserPreferenceRepository = UserLLMPreferenceRepository & {
    findOne: (query: {
        where: { userId?: string; agentId?: string; taskType: LLMTaskType; isActive: boolean };
    }) => Promise<null>;
};

type OrchestratorAgentPreferenceRepository = AgentLLMPreferenceRepository & {
    findOne: (query: {
        where: { userId?: string; agentId?: string; taskType: LLMTaskType; isActive: boolean };
    }) => Promise<null>;
    find: (query: { where: { agentId: string; taskType: LLMTaskType } }) => Promise<[]>;
};

// =============================================================================
// UNIFIED FACADE INTERFACES
// =============================================================================

export interface UnifiedModelSelection {
    // Model selection result
    model: ModelSelectionResult;

    // Complete fallback chain
    fallbackChain: FallbackChain;

    // Selection metadata
    metadata: {
        selectionTimeMs: number;
        strategiesAttempted: string[];
    };
}

export interface UnifiedSelectionRequest {
    // Agent context
    agentId?: string;
    agentProviderId?: string;

    // User context
    userId?: string;
    userProviders?: UserLLMProvider[];

    // Task details
    taskType: LLMTaskType;
    requestedModel?: string;
    requestedProvider?: string;

    // Context and constraints
    context?: RoutingRequest;
    urgency?: 'low' | 'medium' | 'high' | 'critical';
    complexity?: 'low' | 'medium' | 'high';

    // Fallback preferences
    allowFallbacks?: boolean;
    maxFallbacks?: number;
    requireHealthyProvider?: boolean;
}

export interface SelectionMetrics {
    totalSelections: number;
    successfulSelections: number;
    averageSelectionTimeMs: number;
    strategyUsageCount: Record<string, number>;
    providerUsageCount: Record<string, number>;
}

// =============================================================================
// UNIFIED MODEL SELECTION FACADE
// =============================================================================

export class UnifiedModelSelectionFacade {
    private orchestrator: ModelSelectionOrchestrator;
    private metrics: SelectionMetrics;

    constructor(
        agentRepository?: AgentRepository,
        userLLMPreferenceRepository?: UserLLMPreferenceRepository,
        agentLLMPreferenceRepository?: AgentLLMPreferenceRepository,
        llmProviderRepository?: LLMProviderRepository
    ) {
        const resolvedAgentRepository =
            (agentRepository as OrchestratorAgentRepository) ??
            Object.assign(new AgentRepository(), {
                findOne: async ({ where }: { where: { id: string } }): Promise<{ createdBy?: string } | null> => {
                    const agent = await new AgentRepository().findById(where.id);
                    return agent ? { createdBy: agent.createdBy } : null;
                },
            });

        const resolvedUserPrefRepository =
            (userLLMPreferenceRepository as OrchestratorUserPreferenceRepository) ??
            Object.assign(new UserLLMPreferenceRepository(), {
                findOne: async (): Promise<null> => null,
            });

        const resolvedAgentPrefRepository =
            (agentLLMPreferenceRepository as OrchestratorAgentPreferenceRepository) ??
            Object.assign(new AgentLLMPreferenceRepository(), {
                findOne: async (): Promise<null> => null,
                find: async (): Promise<[]> => [],
            });

        const resolvedProviderRepository = llmProviderRepository ?? new LLMProviderRepository();

        this.orchestrator = new ModelSelectionOrchestrator(
            resolvedAgentRepository,
            resolvedUserPrefRepository,
            resolvedAgentPrefRepository,
            resolvedProviderRepository
        );

        this.metrics = {
            totalSelections: 0,
            successfulSelections: 0,
            averageSelectionTimeMs: 0,
            strategyUsageCount: {},
            providerUsageCount: {},
        };
    }

    /**
     * Main unified model selection method
     * Uses only orchestrator model selection - no fallback logic
     */
    async selectModel(request: UnifiedSelectionRequest): Promise<UnifiedModelSelection> {
        const startTime = Date.now();
        const strategiesAttempted: string[] = [];

        try {
            this.metrics.totalSelections++;

            // Use orchestrator to select the best model - no fallbacks
            const modelRequest: ModelSelectionRequest = {
                agentId: request.agentId,
                userId: request.userId,
                taskType: request.taskType,
                requestedModel: request.requestedModel,
                requestedProvider: request.requestedProvider,
                context: request.context,
                urgency: request.urgency,
                complexity: request.complexity,
            };

            const modelSelection = await this.orchestrator.selectModel(modelRequest);
            strategiesAttempted.push(modelSelection.selectionStrategy);

            // Generate fallback chain (simplified - no provider fallbacks)
            const fallbackChain: FallbackChain = { primary: modelSelection, fallbacks: [] };

            // Build unified result
            const selectionTime = Date.now() - startTime;
            const result: UnifiedModelSelection = {
                model: modelSelection,
                fallbackChain,
                metadata: {
                    selectionTimeMs: selectionTime,
                    strategiesAttempted,
                },
            };

            // Update metrics
            this.updateMetrics(result, true);

            logger.info('Unified model selection completed', {
                model: modelSelection.model,
                provider: modelSelection.provider,
                strategy: modelSelection.selectionStrategy,
                confidence: modelSelection.confidence,
                selectionTimeMs: selectionTime,
            });

            return result;
        } catch (error) {
            const selectionTime = Date.now() - startTime;

            logger.error('Unified model selection failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                taskType: request.taskType,
                selectionTimeMs: selectionTime,
                strategiesAttempted,
            });

            // Update metrics for failure
            this.updateMetrics(null, false);

            // No fallbacks - fail immediately
            throw error;
        }
    }

    /**
     * Simplified selection method for common use cases
     */
    async selectForAgent(
        agentId: string,
        taskType: LLMTaskType,
        options?: {
            model?: string;
            provider?: string;
            urgency?: 'low' | 'medium' | 'high' | 'critical';
            context?: RoutingRequest;
        }
    ): Promise<UnifiedModelSelection> {
        return this.selectModel({
            agentId,
            taskType,
            requestedModel: options?.model,
            requestedProvider: options?.provider,
            urgency: options?.urgency,
            context: options?.context,
            allowFallbacks: true,
            requireHealthyProvider: true,
        });
    }

    /**
     * Simplified selection method for user tasks
     */
    async selectForUser(
        userId: string,
        taskType: LLMTaskType,
        options?: {
            model?: string;
            provider?: string;
            userProviders?: UserLLMProvider[];
            urgency?: 'low' | 'medium' | 'high' | 'critical';
        }
    ): Promise<UnifiedModelSelection> {
        return this.selectModel({
            userId,
            taskType,
            requestedModel: options?.model,
            requestedProvider: options?.provider,
            userProviders: options?.userProviders,
            urgency: options?.urgency,
            allowFallbacks: true,
            requireHealthyProvider: true,
        });
    }

    /**
     * System-level selection for internal tasks
     */
    async selectForSystem(
        taskType: LLMTaskType,
        options?: {
            model?: string;
            provider?: string;
            urgency?: 'low' | 'medium' | 'high' | 'critical';
        }
    ): Promise<UnifiedModelSelection> {
        return this.selectModel({
            taskType,
            requestedModel: options?.model,
            requestedProvider: options?.provider,
            urgency: options?.urgency,
            allowFallbacks: true,
            requireHealthyProvider: false, // System tasks are more tolerant
        });
    }

    /**
     * Update usage statistics after model execution
     */
    async updateUsageStats(
        selection: UnifiedModelSelection,
        request: UnifiedSelectionRequest,
        responseTime: number,
        success: boolean,
        quality?: number
    ): Promise<void> {
        try {
            // Update orchestrator stats
            await this.orchestrator.updateUsageStats(
                {
                    agentId: request.agentId,
                    userId: request.userId,
                    taskType: request.taskType,
                    context: request.context,
                },
                selection.model,
                responseTime,
                success,
                quality
            );

            // Update internal metrics
            if (success) {
                this.metrics.successfulSelections++;
            }

            logger.debug('Usage stats updated', {
                strategy: selection.model.selectionStrategy,
                provider: selection.model.provider,
                success,
                responseTime,
                quality,
            });
        } catch (error) {
            logger.error('Failed to update usage stats', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Get selection metrics for monitoring
     */
    getMetrics(): SelectionMetrics {
        return { ...this.metrics };
    }

    /**
     * Reset metrics (useful for testing or periodic resets)
     */
    resetMetrics(): void {
        this.metrics = {
            totalSelections: 0,
            successfulSelections: 0,
            averageSelectionTimeMs: 0,
            strategyUsageCount: {},
            providerUsageCount: {},
        };
    }

    // =============================================================================
    // PRIVATE HELPER METHODS
    // =============================================================================

    private updateMetrics(result: UnifiedModelSelection | null, success: boolean): void {
        if (result) {
            // Update strategy usage
            const strategy = result.model.selectionStrategy;
            this.metrics.strategyUsageCount[strategy] =
                (this.metrics.strategyUsageCount[strategy] || 0) + 1;

            // Update provider usage (if available)
            if (result.model.provider) {
                this.metrics.providerUsageCount[result.model.provider] =
                    (this.metrics.providerUsageCount[result.model.provider] || 0) + 1;
            }

            // Update average selection time
            const currentAvg = this.metrics.averageSelectionTimeMs;
            const newTime = result.metadata.selectionTimeMs;
            this.metrics.averageSelectionTimeMs =
                (currentAvg * (this.metrics.totalSelections - 1) + newTime) / this.metrics.totalSelections;
        }

        if (success) {
            this.metrics.successfulSelections++;
        }
    }
}
