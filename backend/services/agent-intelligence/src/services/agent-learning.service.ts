/**
 * Agent Learning Service
 * Handles learning and adaptation for agents
 * Part of the refactored agent-intelligence microservices
 */

import {
  Agent,
  LearningResult,
  AgentInteraction,
  Episode,
  SemanticMemory,
  WorkingMemoryUpdate,
  KnowledgeType,
  SourceType,
  KnowledgeItem
} from '@uaip/types';
import { logger, ApiError } from '@uaip/utils';
import {
  DatabaseService,
  EventBusService,
  KnowledgeGraphService,
  AgentMemoryService
} from '@uaip/shared-services';

export interface AgentLearningConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  knowledgeGraphService?: KnowledgeGraphService;
  agentMemoryService?: AgentMemoryService;
  serviceName: string;
  securityLevel: number;
}

export class AgentLearningService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private knowledgeGraphService?: KnowledgeGraphService;
  private agentMemoryService?: AgentMemoryService;
  private serviceName: string;
  private securityLevel: number;

  constructor(config: AgentLearningConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.knowledgeGraphService = config.knowledgeGraphService;
    this.agentMemoryService = config.agentMemoryService;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;
  }

  async initialize(): Promise<void> {
    // Set up event subscriptions
    await this.setupEventSubscriptions();

    logger.info('Agent Learning Service initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel
    });
  }

  /**
   * Set up event bus subscriptions for learning operations
   */
  private async setupEventSubscriptions(): Promise<void> {
    await this.eventBusService.subscribe('agent.learning.operation', this.handleLearnFromOperation.bind(this));
    await this.eventBusService.subscribe('agent.learning.interaction', this.handleLearnFromInteraction.bind(this));
    await this.eventBusService.subscribe('agent.learning.consolidate', this.handleConsolidateMemory.bind(this));
    await this.eventBusService.subscribe('agent.learning.update', this.handleUpdateKnowledge.bind(this));

    logger.info('Agent Learning Service event subscriptions configured');
  }

  /**
   * Enhanced learning from operations with knowledge graph updates
   */
  async learnFromOperation(
    agentId: string,
    operationId: string,
    outcomes: any,
    feedback: any
  ): Promise<LearningResult> {
    try {
      this.validateID(agentId, 'agentId');
      this.validateID(operationId, 'operationId');

      logger.info('Learning from operation', { agentId, operationId });

      // Get operation details
      const operation = await this.getOperation(operationId);
      if (!operation || operation.agent_id !== agentId) {
        throw new ApiError(404, 'Operation not found', 'OPERATION_NOT_FOUND');
      }

      // Enhanced learning extraction with knowledge graph
      const learningData = await this.extractEnhancedLearning(operation, outcomes, feedback);

      // Update knowledge graph with new insights
      await this.updateKnowledgeGraph(agentId, learningData);

      // Store learning as episodic memory
      await this.storeOperationEpisode(agentId, operationId, operation, outcomes, feedback, learningData);

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
      await this.storeEnhancedLearningRecord(agentId, operationId, learningData, confidenceAdjustments);

      const result: LearningResult = {
        learningApplied: true,
        confidenceAdjustments,
        newKnowledge: learningData.newKnowledge,
        improvedCapabilities: learningData.improvedCapabilities
      };

      // Publish learning applied event
      await this.publishLearningEvent('agent.learning.applied', {
        agentId,
        operationId,
        learningData: result,
        knowledgeUpdated: true
      });

      this.auditLog('LEARNING_APPLIED', {
        agentId,
        operationId,
        newKnowledgeCount: learningData.newKnowledge?.length || 0,
        capabilitiesImproved: learningData.improvedCapabilities?.length || 0
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

      logger.info('Learning from interaction', { agentId, interactionType: interaction.interactionType });

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
            counterExamples: []
          },
          confidence: learning.confidence,
          sources: {
            episodeIds: [],
            externalSources: [interaction.interactionType],
            reinforcements: 1
          },
          usage: {
            timesAccessed: 1,
            lastUsed: new Date(),
            successRate: interaction.outcome === 'success' ? 1.0 : 0.0,
            contexts: [interaction.interactionType]
          }
        };

        if (this.agentMemoryService) {
          await this.agentMemoryService.updateSemanticMemory(agentId, concept);
        }
      }

      // Store interaction as knowledge in the Knowledge Graph
      if (this.knowledgeGraphService) {
        await this.knowledgeGraphService.ingest([{
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
            interaction.outcome
          ],
          source: {
            type: SourceType.AGENT_INTERACTION,
            identifier: `interaction-${Date.now()}`,
            metadata: { agentId, interaction }
          },
          confidence: interaction.performanceMetrics.efficiency
        }]);
      }

      // Check if memory consolidation is needed
      if (this.agentMemoryService && await this.agentMemoryService.shouldConsolidate(agentId)) {
        await this.consolidateMemory(agentId);
      }

      // Publish interaction learned event
      await this.publishLearningEvent('agent.interaction.learned', {
        agentId,
        interactionType: interaction.interactionType,
        outcome: interaction.outcome,
        learningsCount: learnings.length
      });

      this.auditLog('INTERACTION_LEARNED', {
        agentId,
        interactionType: interaction.interactionType,
        outcome: interaction.outcome
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
        const ingestItems = knowledgeItems.map(item => ({
          content: item.content,
          type: item.type || KnowledgeType.FACTUAL,
          tags: [...(item.tags || []), `agent-${agentId}`, 'knowledge-update'],
          source: {
            type: SourceType.AGENT_INTERACTION,
            identifier: `knowledge-update-${Date.now()}`,
            metadata: { agentId, updateType: 'manual' }
          },
          confidence: item.confidence || 0.8
        }));

        await this.knowledgeGraphService.ingest(ingestItems);
      }

      // Update working memory if available
      if (this.agentMemoryService) {
        const memoryUpdate: WorkingMemoryUpdate = {
          knowledgeUpdated: {
            timestamp: new Date(),
            itemsAdded: knowledgeItems.length,
            categories: [...new Set(knowledgeItems.map(item => item.type))]
          }
        };
        await this.agentMemoryService.updateWorkingMemory(agentId, memoryUpdate);
      }

      // Publish knowledge updated event
      await this.publishLearningEvent('agent.knowledge.updated', {
        agentId,
        itemsCount: knowledgeItems.length,
        categories: [...new Set(knowledgeItems.map(item => item.type))]
      });

      this.auditLog('KNOWLEDGE_UPDATED', {
        agentId,
        itemsCount: knowledgeItems.length
      });
    } catch (error) {
      logger.error('Failed to update agent knowledge', { error, agentId });
      throw error;
    }
  }

  /**
   * Consolidate agent memory
   */
  async consolidateMemory(agentId: string): Promise<void> {
    try {
      this.validateID(agentId, 'agentId');

      logger.info('Consolidating agent memory', { agentId });

      if (this.agentMemoryService) {
        await this.agentMemoryService.consolidateMemories(agentId);
      }

      // Publish memory consolidated event
      await this.publishLearningEvent('agent.memory.consolidated', {
        agentId,
        timestamp: new Date().toISOString()
      });

      this.auditLog('MEMORY_CONSOLIDATED', { agentId });
    } catch (error) {
      logger.error('Failed to consolidate memory', { error, agentId });
      throw error;
    }
  }

  /**
   * Event handlers
   */
  private async handleLearnFromOperation(event: any): Promise<void> {
    const { requestId, agentId, operationId, outcomes, feedback } = event;
    try {
      const result = await this.learnFromOperation(agentId, operationId, outcomes, feedback);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleLearnFromInteraction(event: any): Promise<void> {
    const { requestId, agentId, interaction } = event;
    try {
      await this.learnFromInteraction(agentId, interaction);
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleConsolidateMemory(event: any): Promise<void> {
    const { requestId, agentId } = event;
    try {
      await this.consolidateMemory(agentId);
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleUpdateKnowledge(event: any): Promise<void> {
    const { requestId, agentId, knowledgeItems } = event;
    try {
      await this.updateAgentKnowledge(agentId, knowledgeItems);
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  /**
   * Helper methods
   */
  private async extractEnhancedLearning(operation: any, outcomes: any, feedback: any): Promise<any> {
    return {
      newKnowledge: feedback?.insights || [],
      improvedCapabilities: outcomes?.successfulActions || [],
      adjustedStrategies: feedback?.improvements || [],
      enhancedInsights: [
        `Operation ${operation.id} completed with ${outcomes?.success ? 'success' : 'failure'}`,
        `Key learnings: ${feedback?.keyLearnings?.join(', ') || 'None specified'}`
      ]
    };
  }

  private async updateKnowledgeGraph(agentId: string, learningData: any): Promise<void> {
    if (this.knowledgeGraphService && learningData.enhancedInsights?.length > 0) {
      await this.knowledgeGraphService.ingest(learningData.enhancedInsights.map((insight: string) => ({
        content: insight,
        type: KnowledgeType.EXPERIENTIAL,
        tags: ['agent-learning', `agent-${agentId}`, 'operation-feedback'],
        source: {
          type: SourceType.AGENT_INTERACTION,
          identifier: `learning-${Date.now()}`,
          metadata: { agentId, learningData }
        },
        confidence: 0.8
      })));
    }
  }

  private async storeOperationEpisode(
    agentId: string,
    operationId: string,
    operation: any,
    outcomes: any,
    feedback: any,
    learningData: any
  ): Promise<void> {
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
          operationType: operation.type
        },
        experience: {
          actions: operation.actions || [],
          decisions: [],
          outcomes: [],
          emotions: [],
          learnings: learningData.enhancedInsights || []
        },
        significance: {
          importance: 0.8,
          novelty: 0.6,
          success: outcomes?.success ? 1.0 : 0.2,
          impact: 0.7
        },
        connections: {
          relatedEpisodes: [],
          triggeredBy: [`operation-${operationId}`],
          ledTo: [],
          similarTo: []
        }
      };

      await this.agentMemoryService.storeEpisode(agentId, episode);
    }
  }

  private async updateSemanticMemoryFromOperation(agentId: string, learningData: any): Promise<void> {
    if (this.agentMemoryService && learningData.newKnowledge?.length > 0) {
      for (const knowledge of learningData.newKnowledge) {
        const concept: SemanticMemory = {
          agentId,
          concept: `operation_learning_${Date.now()}`,
          knowledge: {
            definition: knowledge,
            properties: {},
            relationships: [],
            examples: [],
            counterExamples: []
          },
          confidence: 0.7,
          sources: {
            episodeIds: [],
            externalSources: ['operation_feedback'],
            reinforcements: 1
          },
          usage: {
            timesAccessed: 1,
            lastUsed: new Date(),
            successRate: 1.0,
            contexts: ['operation_learning']
          }
        };

        await this.agentMemoryService.updateSemanticMemory(agentId, concept);
      }
    }
  }

  private calculateEnhancedConfidenceAdjustments(
    operation: any,
    outcomes: any,
    feedback: any,
    learningData: any
  ): any {
    const baseAdjustment = outcomes?.success ? 0.1 : -0.05;
    const feedbackAdjustment = feedback?.satisfaction ? feedback.satisfaction * 0.05 : 0;
    const learningAdjustment = learningData.newKnowledge?.length > 0 ? 0.02 : 0;

    return {
      overall: Math.max(-0.2, Math.min(0.2, baseAdjustment + feedbackAdjustment + learningAdjustment)),
      specific: {
        operationType: operation.type,
        adjustment: baseAdjustment,
        reason: outcomes?.success ? 'successful_operation' : 'failed_operation'
      }
    };
  }

  private async storeEnhancedLearningRecord(
    agentId: string,
    operationId: string,
    learningData: any,
    confidenceAdjustments: any
  ): Promise<void> {
    try {
      await this.databaseService.storeLearningRecord(agentId, {
        operationId,
        learningData,
        confidenceAdjustments,
        timestamp: new Date(),
        version: '2.0.0'
      });
    } catch (error) {
      logger.warn('Failed to store learning record', { error, agentId, operationId });
    }
  }

  private async getOperation(operationId: string): Promise<any> {
    return await this.databaseService.getOperationById(operationId);
  }

  private extractLearnings(interaction: AgentInteraction): any[] {
    const learnings = [];

    // Extract learnings from interaction context
    if (interaction.context && interaction.learningPoints.length > 0) {
      learnings.push({
        concept: `${interaction.interactionType}_pattern`,
        description: `Pattern learned from ${interaction.interactionType} interaction`,
        properties: {
          context: interaction.context,
          outcome: interaction.outcome,
          efficiency: interaction.performanceMetrics.efficiency,
          accuracy: interaction.performanceMetrics.accuracy
        },
        confidence: interaction.performanceMetrics.efficiency
      });
    }

    // Extract specific learning points
    interaction.learningPoints.forEach((point, index) => {
      learnings.push({
        concept: `learning_point_${index}`,
        description: point,
        properties: {
          source: interaction.interactionType,
          context: interaction.context
        },
        confidence: 0.7
      });
    });

    return learnings;
  }

  private validateID(value: string, paramName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Invalid ${paramName}: must be a non-empty string`);
    }
  }

  private async publishLearningEvent(channel: string, data: any): Promise<void> {
    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: this.serviceName,
        securityLevel: this.securityLevel,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to publish learning event', { channel, error });
    }
  }

  private async respondToRequest(requestId: string, response: any): Promise<void> {
    await this.eventBusService.publish('agent.learning.response', {
      requestId,
      ...response,
      timestamp: new Date().toISOString()
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
      const operationId = params.executionData.operationId as string || 'unknown';
      const outcome = params.executionData.outcome as Record<string, unknown> || {};
      
      // Create a simplified learning interaction
      const interaction: AgentInteraction = {
        agentId: params.agentId,
        interactionType: 'operation_execution',
        context: JSON.stringify(params.executionData),
        outcome: outcome.success ? 'success' : 'failure',
        learningPoints: [],
        performanceMetrics: {
          efficiency: outcome.efficiency as number || 0.5,
          accuracy: outcome.accuracy as number || 0.5,
          userSatisfaction: outcome.userSatisfaction as number || 0.5
        },
        timestamp: new Date()
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
            outcome: interaction.outcome
          }
        },
        newKnowledge: [`Learned from ${operationId} execution`],
        improvedCapabilities: []
      };
    } catch (error) {
      logger.error('Failed to process learning data', { error, agentId: params.agentId });
      return {
        learningApplied: false,
        confidenceAdjustments: {
          overallAdjustment: 0,
          specificAdjustments: {}
        },
        newKnowledge: [],
        improvedCapabilities: []
      };
    }
  }

  private auditLog(event: string, data: any): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true
    });
  }
}
