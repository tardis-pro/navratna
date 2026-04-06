/**
 * Agent Learning Service
 * Handles learning and adaptation for agents
 * Part of the refactored agent-intelligence microservices
 */

import {
  LearningResult,
  AgentInteraction,
  Action,
  Episode,
  SemanticMemory,
  WorkingMemoryUpdate,
  KnowledgeType,
  SourceType,
  KnowledgeItem,
} from '@uaip/types';
import type { EventBusMessage } from '@uaip/types';
import { logger, ApiError, ValidationError } from '@uaip/utils';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/event_bus';
import {
  Operation,
  MEMORY_CONSOLIDATION_REQUEST,
  MEMORY_CONSOLIDATION_RESULT,
} from '@uaip/shared-services';
import type {
  MemoryConsolidationRequestEvent,
  MemoryConsolidationResultEvent,
} from '@uaip/shared-services';
import { AgentIntelligenceStore } from './agent_intelligence_store.js';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge_graph_service.js';
import { AgentMemoryService } from '../agent-memory/agent_memory_service.js';

export interface AgentLearningConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  knowledgeGraphService?: KnowledgeGraphService;
  agentMemoryService?: AgentMemoryService;
  serviceName: string;
  securityLevel: number;
}

interface LearningData {
  newKnowledge: string[];
  improvedCapabilities: string[];
  adjustedStrategies: string[];
  enhancedInsights: string[];
}

interface OperationOutcomes {
  success?: boolean;
  successfulActions?: string[];
}

interface OperationFeedback {
  insights?: string[];
  improvements?: string[];
  keyLearnings?: string[];
  satisfaction?: number;
}

interface ExtractedLearning {
  concept: string;
  description: string;
  properties: Record<string, unknown>;
  confidence: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isMemoryConsolidationPayload(
  data: unknown
): data is { agentId: string; requestId: string; requestedAt: string } {
  if (!isRecord(data)) return false;
  return (
    typeof data.agentId === 'string' &&
    typeof data.requestId === 'string' &&
    typeof data.requestedAt === 'string'
  );
}

export class AgentLearningService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private knowledgeGraphService?: KnowledgeGraphService;
  private agentMemoryService?: AgentMemoryService;
  private serviceName: string;
  private securityLevel: number;
  private store: AgentIntelligenceStore;

  constructor(config: AgentLearningConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.knowledgeGraphService = config.knowledgeGraphService;
    this.agentMemoryService = config.agentMemoryService;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;
    this.store = new AgentIntelligenceStore();
  }

  async initialize(): Promise<void> {
    // Set up event subscriptions
    await this.setupEventSubscriptions();

    logger.info('Agent Learning Service initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel,
    });
  }

  /**
   * Set up event bus subscriptions for learning operations
   */
  private async setupEventSubscriptions(): Promise<void> {
    await this.eventBusService.subscribe(
      'agent.learning.operation',
      this.handleLearnFromOperation.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.learning.interaction',
      this.handleLearnFromInteraction.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.learning.consolidate',
      this.handleConsolidateMemory.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.learning.update',
      this.handleUpdateKnowledge.bind(this)
    );
    await this.eventBusService.subscribe(
      MEMORY_CONSOLIDATION_REQUEST,
      this.handleMemoryConsolidationRequest.bind(this)
    );

    logger.info('Agent Learning Service event subscriptions configured');
  }

  /**
   * Enhanced learning from operations with knowledge graph updates
   */
  async learnFromOperation(
    agentId: string,
    operationId: string,
    outcomes: Record<string, unknown>,
    feedback: Record<string, unknown>
  ): Promise<LearningResult> {
    try {
      this.validateID(agentId, 'agentId');
      this.validateID(operationId, 'operationId');

      logger.info('Learning from operation', { agentId, operationId });

      // Get operation details
      const operation = await this.getOperation(operationId);
      if (!operation || operation.agentId !== agentId) {
        throw new ApiError(404, 'Operation not found', 'OPERATION_NOT_FOUND');
      }

      // Enhanced learning extraction with knowledge graph
      const learningData = await this.extractEnhancedLearning(operation, outcomes, feedback);

      // Update knowledge graph with new insights
      await this.updateKnowledgeGraph(agentId, learningData);

      // Store learning as episodic memory
      await this.storeOperationEpisode(agentId, operationId, operation, outcomes, learningData);

      // Update semantic memory
      await this.updateSemanticMemoryFromOperation(agentId, learningData);

      // Calculate enhanced confidence adjustments
      const confidenceAdjustments = this.calculateEnhancedConfidenceAdjustments(
        operation,
        outcomes,
        feedback,
        learningData
      );

      // Store enhanced learning record
      await this.storeEnhancedLearningRecord(
        agentId,
        operationId,
        learningData,
        confidenceAdjustments
      );

      const result: LearningResult = {
        learningApplied: true,
        confidenceAdjustments,
        newKnowledge: learningData.newKnowledge,
        improvedCapabilities: learningData.improvedCapabilities,
      };

      // Publish learning applied event
      await this.publishLearningEvent('agent.learning.applied', {
        agentId,
        operationId,
        learningData: result,
        knowledgeUpdated: true,
      });

      this.auditLog('LEARNING_APPLIED', {
        agentId,
        operationId,
        newKnowledgeCount: learningData.newKnowledge?.length || 0,
        capabilitiesImproved: learningData.improvedCapabilities?.length || 0,
      });

      return result;
    } catch (error) {
      logger.error('Failed to learn from operation', { error, agentId, operationId });
      throw error;
    }
  }

  /**
   * Learn from agent interactions and update knowledge
   */
  async learnFromInteraction(agentId: string, interaction: AgentInteraction): Promise<void> {
    try {
      this.validateID(agentId, 'agentId');

      logger.info('Learning from interaction', {
        agentId,
        interactionType: interaction.interactionType,
      });

      // Extract learnings from the interaction
      const learnings = this.extractLearnings(interaction);

      // Update semantic memory with new concepts
      for (const learning of learnings) {
        const concept: SemanticMemory = {
          agentId,
          concept: learning.concept,
          knowledge: {
            definition: learning.description,
            properties: learning.properties || {},
            relationships: [],
            examples: [interaction.context],
            counterExamples: [],
          },
          confidence: learning.confidence,
          sources: {
            episodeIds: [],
            externalSources: [interaction.interactionType],
            reinforcements: 1,
          },
          usage: {
            timesAccessed: 1,
            lastUsed: new Date(),
            successRate: interaction.outcome === 'success' ? 1.0 : 0.0,
            contexts: [interaction.interactionType],
          },
        };

        if (this.agentMemoryService) {
          // oxlint-disable-next-line no-await-in-loop -- sequential processing required
          await this.agentMemoryService.updateSemanticMemory(agentId, concept);
        }
      }

      // Store interaction as knowledge in the Knowledge Graph
      if (this.knowledgeGraphService) {
        await this.knowledgeGraphService.ingest([
          {
            content: `Agent Interaction: ${interaction.interactionType}
Context: ${interaction.context}
Outcome: ${interaction.outcome}
Learning Points: ${interaction.learningPoints.join('; ')}
Performance: Efficiency=${interaction.performanceMetrics.efficiency}, Accuracy=${interaction.performanceMetrics.accuracy}`,
            type: KnowledgeType.EXPERIENTIAL,
            tags: [
              'agent-learning',
              `agent-${agentId}`,
              interaction.interactionType,
              interaction.outcome,
            ],
            source: {
              type: SourceType.AGENT_INTERACTION,
              identifier: `interaction-${Date.now()}`,
              metadata: { agentId, interaction },
            },
            confidence: interaction.performanceMetrics.efficiency,
          },
        ]);
      }

      // Check if memory consolidation is needed
      if (this.agentMemoryService && (await this.agentMemoryService.shouldConsolidate(agentId))) {
        await this.consolidateMemory(agentId);
      }

      // Publish interaction learned event
      await this.publishLearningEvent('agent.interaction.learned', {
        agentId,
        interactionType: interaction.interactionType,
        outcome: interaction.outcome,
        learningsCount: learnings.length,
      });

      this.auditLog('INTERACTION_LEARNED', {
        agentId,
        interactionType: interaction.interactionType,
        outcome: interaction.outcome,
      });
    } catch (error) {
      logger.error('Failed to learn from interaction', { error, agentId });
      throw error;
    }
  }

  /**
   * Update agent knowledge with new information
   */
  async updateAgentKnowledge(agentId: string, knowledgeItems: KnowledgeItem[]): Promise<void> {
    try {
      this.validateID(agentId, 'agentId');

      logger.info('Updating agent knowledge', { agentId, itemsCount: knowledgeItems.length });

      if (this.knowledgeGraphService) {
        // Convert knowledge items to ingestible format
        const ingestItems = knowledgeItems.map((item) => ({
          content: item.content,
          type: item.type || KnowledgeType.FACTUAL,
          tags: [...(item.tags || []), `agent-${agentId}`, 'knowledge-update'],
          source: {
            type: SourceType.AGENT_INTERACTION,
            identifier: `knowledge-update-${Date.now()}`,
            metadata: { agentId, updateType: 'manual' },
          },
          confidence: item.confidence || 0.8,
        }));

        await this.knowledgeGraphService.ingest(ingestItems);
      }

      // Update working memory if available
      if (this.agentMemoryService) {
        const memoryUpdate: WorkingMemoryUpdate = {
          knowledgeUpdated: {
            timestamp: new Date(),
            itemsAdded: knowledgeItems.length,
            categories: [...new Set(knowledgeItems.map((item) => item.type))],
          },
        };
        await this.agentMemoryService.updateWorkingMemory(agentId, memoryUpdate);
      }

      // Publish knowledge updated event
      await this.publishLearningEvent('agent.knowledge.updated', {
        agentId,
        itemsCount: knowledgeItems.length,
        categories: [...new Set(knowledgeItems.map((item) => item.type))],
      });

      this.auditLog('KNOWLEDGE_UPDATED', {
        agentId,
        itemsCount: knowledgeItems.length,
      });
    } catch (error) {
      logger.error('Failed to update agent knowledge', { error, agentId });
      throw error;
    }
  }

  async consolidateMemory(agentId: string): Promise<void> {
    this.validateID(agentId, 'agentId');

    const requestId = `consolidate-${Date.now()}-${agentId}`;
    const payload: MemoryConsolidationRequestEvent = {
      agentId,
      requestId,
      requestedAt: new Date().toISOString(),
    };

    await this.eventBusService.publish(MEMORY_CONSOLIDATION_REQUEST, payload);

    logger.info('Memory consolidation enqueued', { agentId, requestId });
    this.auditLog('MEMORY_CONSOLIDATION_ENQUEUED', { agentId, requestId });
  }

  private async handleMemoryConsolidationRequest(message: EventBusMessage): Promise<void> {
    const rawData = message.data;
    if (!isMemoryConsolidationPayload(rawData)) {
      logger.warn('Invalid MemoryConsolidationRequestEvent payload', { data: rawData });
      return;
    }
    const event: MemoryConsolidationRequestEvent = rawData;
    const { agentId, requestId } = event;

    if (!this.agentMemoryService) {
      logger.warn('Memory consolidation requested but no memory service available', {
        agentId,
        requestId,
      });
      return;
    }

    logger.info('Processing memory consolidation job', { agentId, requestId });

    const result = await this.agentMemoryService.consolidateMemories(agentId);

    const resultPayload: MemoryConsolidationResultEvent = {
      agentId,
      requestId,
      consolidated: result.consolidated,
      episodesCreated: result.episodesCreated,
      conceptsLearned: result.conceptsLearned,
      connectionsFormed: result.connectionsFormed,
      reason: result.reason,
      completedAt: new Date().toISOString(),
    };

    await this.eventBusService.publish(MEMORY_CONSOLIDATION_RESULT, resultPayload);

    logger.info('Memory consolidation completed', {
      agentId,
      requestId,
      consolidated: result.consolidated,
      episodesCreated: result.episodesCreated,
      conceptsLearned: result.conceptsLearned,
    });

    this.auditLog('MEMORY_CONSOLIDATED', { agentId, requestId, consolidated: result.consolidated });
  }

  /**
   * Event handlers
   */
  private async handleLearnFromOperation(event: Record<string, unknown>): Promise<void> {
    const requestId = this.requireString(event.requestId, 'requestId');
    const agentId = this.requireString(event.agentId, 'agentId');
    const operationId = this.requireString(event.operationId, 'operationId');
    const outcomes = this.toRecord(event.outcomes);
    const feedback = this.toRecord(event.feedback);

    try {
      const result = await this.learnFromOperation(agentId, operationId, outcomes, feedback);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error) {
      logger.error('Operation failed', {
        error,
        context: 'handleLearnFromOperation',
        requestId,
        agentId,
        operationId,
      });
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleLearnFromInteraction(event: Record<string, unknown>): Promise<void> {
    const requestId = this.requireString(event.requestId, 'requestId');
    const agentId = this.requireString(event.agentId, 'agentId');
    const interaction = this.requireAgentInteraction(event.interaction);

    try {
      await this.learnFromInteraction(agentId, interaction);
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      logger.error('Operation failed', {
        error,
        context: 'handleLearnFromInteraction',
        requestId,
        agentId,
      });
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleConsolidateMemory(event: Record<string, unknown>): Promise<void> {
    const requestId = this.requireString(event.requestId, 'requestId');
    const agentId = this.requireString(event.agentId, 'agentId');

    try {
      await this.consolidateMemory(agentId);
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      logger.error('Operation failed', {
        error,
        context: 'handleConsolidateMemory',
        requestId,
        agentId,
      });
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleUpdateKnowledge(event: Record<string, unknown>): Promise<void> {
    const requestId = this.requireString(event.requestId, 'requestId');
    const agentId = this.requireString(event.agentId, 'agentId');
    const knowledgeItems = this.requireKnowledgeItems(event.knowledgeItems);

    try {
      await this.updateAgentKnowledge(agentId, knowledgeItems);
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      logger.error('Operation failed', {
        error,
        context: 'handleUpdateKnowledge',
        requestId,
        agentId,
      });
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  /**
   * Helper methods
   */
  private async extractEnhancedLearning(
    operation: Operation,
    outcomes: Record<string, unknown>,
    feedback: Record<string, unknown>
  ): Promise<LearningData> {
    const typedOutcomes = this.parseOperationOutcomes(outcomes);
    const typedFeedback = this.parseOperationFeedback(feedback);

    return {
      newKnowledge: typedFeedback.insights ?? [],
      improvedCapabilities: typedOutcomes.successfulActions ?? [],
      adjustedStrategies: typedFeedback.improvements ?? [],
      enhancedInsights: [
        `Operation ${operation.id} completed with ${typedOutcomes.success ? 'success' : 'failure'}`,
        `Key learnings: ${typedFeedback.keyLearnings?.join(', ') || 'None specified'}`,
      ],
    };
  }

  private async updateKnowledgeGraph(agentId: string, learningData: LearningData): Promise<void> {
    if (this.knowledgeGraphService && learningData.enhancedInsights.length > 0) {
      await this.knowledgeGraphService.ingest(
        learningData.enhancedInsights.map((insight: string) => ({
          content: insight,
          type: KnowledgeType.EXPERIENTIAL,
          tags: ['agent-learning', `agent-${agentId}`, 'operation-feedback'],
          source: {
            type: SourceType.AGENT_INTERACTION,
            identifier: `learning-${Date.now()}`,
            metadata: { agentId, learningData },
          },
          confidence: 0.8,
        }))
      );
    }
  }

  private async storeOperationEpisode(
    agentId: string,
    operationId: string,
    operation: Operation,
    outcomes: Record<string, unknown>,
    learningData: LearningData
  ): Promise<void> {
    const typedOutcomes = this.parseOperationOutcomes(outcomes);

    if (this.agentMemoryService) {
      const episode: Episode = {
        agentId,
        episodeId: `operation-${operationId}-${Date.now()}`,
        type: 'operation',
        context: {
          when: new Date(),
          where: 'operation-environment',
          who: [agentId],
          what: `Executed operation: ${operation.type}`,
          why: 'Learning from operation outcomes',
          how: 'Automated operation execution',
          operationType: operation.type,
        },
        experience: {
          actions: this.extractActionsFromOperation(operation),
          decisions: [],
          outcomes: [],
          emotions: [],
          learnings: learningData.enhancedInsights,
        },
        significance: {
          importance: 0.8,
          novelty: 0.6,
          success: typedOutcomes.success ? 1.0 : 0.2,
          impact: 0.7,
        },
        connections: {
          relatedEpisodes: [],
          triggeredBy: [`operation-${operationId}`],
          ledTo: [],
          similarTo: [],
        },
      };

      await this.agentMemoryService.storeEpisode(agentId, episode);
    }
  }

  private async updateSemanticMemoryFromOperation(
    agentId: string,
    learningData: LearningData
  ): Promise<void> {
    if (this.agentMemoryService && learningData.newKnowledge.length > 0) {
      for (const knowledge of learningData.newKnowledge) {
        const concept: SemanticMemory = {
          agentId,
          concept: `operation_learning_${Date.now()}`,
          knowledge: {
            definition: knowledge,
            properties: {},
            relationships: [],
            examples: [],
            counterExamples: [],
          },
          confidence: 0.7,
          sources: {
            episodeIds: [],
            externalSources: ['operation_feedback'],
            reinforcements: 1,
          },
          usage: {
            timesAccessed: 1,
            lastUsed: new Date(),
            successRate: 1.0,
            contexts: ['operation_learning'],
          },
        };

        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        await this.agentMemoryService.updateSemanticMemory(agentId, concept);
      }
    }
  }

  private calculateEnhancedConfidenceAdjustments(
    operation: Operation,
    outcomes: Record<string, unknown>,
    feedback: Record<string, unknown>,
    learningData: LearningData
  ): Record<string, unknown> {
    const typedOutcomes = this.parseOperationOutcomes(outcomes);
    const typedFeedback = this.parseOperationFeedback(feedback);

    const baseAdjustment = typedOutcomes.success ? 0.1 : -0.05;
    const feedbackAdjustment = typedFeedback.satisfaction ? typedFeedback.satisfaction * 0.05 : 0;
    const learningAdjustment = learningData.newKnowledge.length > 0 ? 0.02 : 0;

    return {
      overall: Math.max(
        -0.2,
        Math.min(0.2, baseAdjustment + feedbackAdjustment + learningAdjustment)
      ),
      specific: {
        operationType: operation.type,
        adjustment: baseAdjustment,
        reason: typedOutcomes.success ? 'successful_operation' : 'failed_operation',
      },
    };
  }

  private async storeEnhancedLearningRecord(
    agentId: string,
    operationId: string,
    learningData: LearningData,
    confidenceAdjustments: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.store.storeLearningRecord(agentId, {
        operationId,
        learningData: this.toRecord(learningData),
        confidenceAdjustments,
        timestamp: new Date(),
        version: '2.0.0',
      });
    } catch (error) {
      logger.warn('Failed to store learning record', { error, agentId, operationId });
    }
  }

  private async getOperation(operationId: string): Promise<Operation | null> {
    return await this.store.getOperationById(operationId);
  }

  private extractLearnings(interaction: AgentInteraction): ExtractedLearning[] {
    const learnings: ExtractedLearning[] = [];

    // Extract learnings from interaction context
    if (interaction.context && interaction.learningPoints.length > 0) {
      learnings.push({
        concept: `${interaction.interactionType}_pattern`,
        description: `Pattern learned from ${interaction.interactionType} interaction`,
        properties: {
          context: interaction.context,
          outcome: interaction.outcome,
          efficiency: interaction.performanceMetrics.efficiency,
          accuracy: interaction.performanceMetrics.accuracy,
        },
        confidence: interaction.performanceMetrics.efficiency,
      });
    }

    // Extract specific learning points
    interaction.learningPoints.forEach((point, index) => {
      learnings.push({
        concept: `learning_point_${index}`,
        description: point,
        properties: {
          source: interaction.interactionType,
          context: interaction.context,
        },
        confidence: 0.7,
      });
    });

    return learnings;
  }

  private validateID(value: string, paramName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new ValidationError(`Invalid ${paramName}: must be a non-empty string`);
    }
  }

  private async publishLearningEvent(
    channel: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: this.serviceName,
        securityLevel: this.securityLevel,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to publish learning event', { channel, error });
    }
  }

  private async respondToRequest(
    requestId: string,
    response: Record<string, unknown>
  ): Promise<void> {
    await this.eventBusService.publish('agent.learning.response', {
      requestId,
      ...response,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Process learning data from agent execution
   * This is the public method called by routes
   */
  async processLearningData(params: {
    agentId: string;
    executionData: Record<string, unknown>;
  }): Promise<LearningResult> {
    try {
      // Extract operation info from execution data
      const operationId = typeof params.executionData.operationId === 'string' ? params.executionData.operationId : 'unknown';
      const rawOutcome = params.executionData.outcome;
      const outcome: Record<string, unknown> = this.isRecord(rawOutcome) ? rawOutcome : {};

      // Create a simplified learning interaction
      const interaction: AgentInteraction = {
        agentId: params.agentId,
        interactionType: 'operation_execution',
        context: JSON.stringify(params.executionData),
        outcome: outcome.success ? 'success' : 'failure',
        learningPoints: [],
        performanceMetrics: {
          efficiency: typeof outcome.efficiency === 'number' ? outcome.efficiency : 0.5,
          accuracy: typeof outcome.accuracy === 'number' ? outcome.accuracy : 0.5,
          userSatisfaction: typeof outcome.userSatisfaction === 'number' ? outcome.userSatisfaction : 0.5,
        },
        timestamp: new Date(),
      };

      // Process learning from this interaction
      await this.learnFromInteraction(params.agentId, interaction);

      // Return a learning result
      return {
        learningApplied: true,
        confidenceAdjustments: {
          overallAdjustment: 0.05,
          specificAdjustments: {
            operationType: operationId,
            outcome: interaction.outcome,
          },
        },
        newKnowledge: [`Learned from ${operationId} execution`],
        improvedCapabilities: [],
      };
    } catch (error) {
      logger.error('Failed to process learning data', { error, agentId: params.agentId });
      return {
        learningApplied: false,
        confidenceAdjustments: {
          overallAdjustment: 0,
          specificAdjustments: {},
        },
        newKnowledge: [],
        improvedCapabilities: [],
      };
    }
  }

  private auditLog(event: string, data: Record<string, unknown>): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true,
    });
  }

  private parseOperationOutcomes(outcomes: Record<string, unknown>): OperationOutcomes {
    return {
      success: this.toBoolean(outcomes.success),
      successfulActions: this.toStringArray(outcomes.successfulActions),
    };
  }

  private parseOperationFeedback(feedback: Record<string, unknown>): OperationFeedback {
    return {
      insights: this.toStringArray(feedback.insights),
      improvements: this.toStringArray(feedback.improvements),
      keyLearnings: this.toStringArray(feedback.keyLearnings),
      satisfaction: this.toNumber(feedback.satisfaction),
    };
  }

  private extractActionsFromOperation(operation: Operation): Action[] {
    const steps = operation.executionPlan?.steps;

    if (!Array.isArray(steps)) {
      return [];
    }

    const actions: Action[] = [];

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const stepRecord = this.toRecord(step);
      const id = this.toNonEmptyString(stepRecord.id) ?? `step-${index}`;
      const description =
        this.toNonEmptyString(stepRecord.description) ??
        this.toNonEmptyString(stepRecord.type) ??
        `Operation step ${index + 1}`;
      const type = this.toNonEmptyString(stepRecord.type) ?? 'operation_step';

      actions.push({
        id,
        description,
        type,
        timestamp: new Date(),
        success: true,
        metadata: stepRecord,
      });
    }

    return actions;
  }

  private requireString(value: unknown, fieldName: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    throw new ApiError(400, `Invalid ${fieldName}`, 'INVALID_EVENT_PAYLOAD');
  }

  private requireAgentInteraction(value: unknown): AgentInteraction {
    if (!this.isRecord(value)) {
      throw new ApiError(400, 'Invalid interaction payload', 'INVALID_EVENT_PAYLOAD');
    }

    const interactionType = value.interactionType;
    const outcome = value.outcome;
    const context = value.context;
    const learningPoints = value.learningPoints;
    const performanceMetrics = value.performanceMetrics;
    const timestamp = value.timestamp;
    const agentId = value.agentId;

    if (
      typeof interactionType !== 'string' ||
      (interactionType !== 'discussion_participation' &&
        interactionType !== 'operation_execution' &&
        interactionType !== 'knowledge_query')
    ) {
      throw new ApiError(400, 'Invalid interactionType', 'INVALID_EVENT_PAYLOAD');
    }

    if (
      typeof outcome !== 'string' ||
      (outcome !== 'success' && outcome !== 'failure' && outcome !== 'partial')
    ) {
      throw new ApiError(400, 'Invalid outcome', 'INVALID_EVENT_PAYLOAD');
    }

    if (!this.isRecord(performanceMetrics)) {
      throw new ApiError(400, 'Invalid performanceMetrics', 'INVALID_EVENT_PAYLOAD');
    }

    const efficiency = this.toNumber(performanceMetrics.efficiency);
    const accuracy = this.toNumber(performanceMetrics.accuracy);

    if (
      typeof context !== 'string' ||
      !Array.isArray(learningPoints) ||
      efficiency === undefined ||
      accuracy === undefined
    ) {
      throw new ApiError(400, 'Invalid interaction payload', 'INVALID_EVENT_PAYLOAD');
    }

    const typedTimestamp = timestamp instanceof Date ? timestamp : new Date();
    const typedLearningPoints = learningPoints.filter(
      (point): point is string => typeof point === 'string'
    );

    return {
      agentId: typeof agentId === 'string' ? agentId : 'unknown',
      interactionType,
      context,
      outcome,
      learningPoints: typedLearningPoints,
      performanceMetrics: {
        efficiency,
        accuracy,
        userSatisfaction: this.toNumber(performanceMetrics.userSatisfaction),
      },
      timestamp: typedTimestamp,
    };
  }

  private requireKnowledgeItems(value: unknown): KnowledgeItem[] {
    if (!Array.isArray(value)) {
      throw new ApiError(400, 'Invalid knowledgeItems payload', 'INVALID_EVENT_PAYLOAD');
    }

    const knowledgeItems = value.filter((item): item is KnowledgeItem =>
      this.isKnowledgeItem(item)
    );

    if (knowledgeItems.length !== value.length) {
      throw new ApiError(400, 'Invalid knowledge item entry', 'INVALID_EVENT_PAYLOAD');
    }

    return knowledgeItems;
  }

  private isKnowledgeItem(value: unknown): value is KnowledgeItem {
    if (!this.isRecord(value)) {
      return false;
    }

    return (
      typeof value.id === 'string' &&
      typeof value.content === 'string' &&
      typeof value.type === 'string' &&
      Array.isArray(value.tags) &&
      typeof value.confidence === 'number'
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private toBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private toNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private toNonEmptyString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    return undefined;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }
}
