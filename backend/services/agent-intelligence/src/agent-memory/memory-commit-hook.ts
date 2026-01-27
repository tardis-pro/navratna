import { WorkingMemoryManager } from './working-memory.manager.js';
import { EpisodicMemoryManager } from './episodic-memory.manager.js';
import {
  ActionRecommendation,
  ToolDefinition,
  SecurityLevel,
  TemporaryLearning,
} from '@uaip/types';
import { logger } from '@uaip/utils';

export interface MemoryEntry {
  id: string;
  type: 'action_execution' | 'decision_made' | 'tool_usage' | 'interaction';
  timestamp: Date;
  agentId: string;
  content: {
    action?: ActionRecommendation;
    tool?: ToolDefinition;
    result?: any;
    success: boolean;
    duration?: number;
    metadata?: any;
  };
  significance: {
    importance: number; // 0-1 scale
    novelty: number; // 0-1 scale
    impact: number; // 0-1 scale
    success: number; // 0-1 scale
  };
}

export class MemoryCommitHook {
  constructor(
    private workingMemoryManager: WorkingMemoryManager,
    private episodicMemoryManager?: EpisodicMemoryManager
  ) {}

  async commitActionExecution(
    agentId: string,
    action: ActionRecommendation,
    tools: ToolDefinition[],
    result: any,
    success: boolean,
    duration?: number,
    metadata?: any
  ): Promise<void> {
    try {
      const entry: MemoryEntry = {
        id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'action_execution',
        timestamp: new Date(),
        agentId,
        content: {
          action,
          result,
          success,
          duration,
          metadata: {
            ...metadata,
            toolsUsed: tools.map((t) => ({ id: t.id, name: t.name, category: t.category })),
          },
        },
        significance: this.calculateSignificance(action, success, duration),
      };

      // Add to working memory immediately
      await this.addToWorkingMemory(agentId, entry);

      // Add to episodic memory if manager available and entry is significant
      if (this.episodicMemoryManager && entry.significance.importance > 0.3) {
        await this.addToEpisodicMemory(agentId, entry);
      }

      logger.debug(
        `Memory committed for agent ${agentId}: ${entry.type} (${success ? 'success' : 'failure'})`
      );
    } catch (error) {
      logger.error(`Failed to commit memory for agent ${agentId}:`, error);
      // Don't throw - memory commit failures shouldn't break execution
    }
  }

  async commitToolUsage(
    agentId: string,
    tool: ToolDefinition,
    result: any,
    success: boolean,
    duration?: number,
    metadata?: any
  ): Promise<void> {
    try {
      const entry: MemoryEntry = {
        id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'tool_usage',
        timestamp: new Date(),
        agentId,
        content: {
          tool,
          result,
          success,
          duration,
          metadata,
        },
        significance: this.calculateToolSignificance(tool, success, duration),
      };

      await this.addToWorkingMemory(agentId, entry);

      // Only commit significant tool usage to episodic memory
      if (this.episodicMemoryManager && entry.significance.importance > 0.4) {
        await this.addToEpisodicMemory(agentId, entry);
      }

      logger.debug(
        `Tool usage memory committed for agent ${agentId}: ${tool.name} (${success ? 'success' : 'failure'})`
      );
    } catch (error) {
      logger.error(`Failed to commit tool usage memory for agent ${agentId}:`, error);
    }
  }

  async commitDecision(
    agentId: string,
    selectedAction: ActionRecommendation,
    confidence: number,
    reasoning: string,
    metadata?: any
  ): Promise<void> {
    try {
      const entry: MemoryEntry = {
        id: `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'decision_made',
        timestamp: new Date(),
        agentId,
        content: {
          action: selectedAction,
          success: true, // decisions are considered successful if made
          metadata: {
            ...metadata,
            confidence,
            reasoning,
          },
        },
        significance: {
          importance: confidence,
          novelty: selectedAction.type === 'hybrid_workflow' ? 0.8 : 0.5,
          impact: selectedAction.confidence,
          success: 1,
        },
      };

      await this.addToWorkingMemory(agentId, entry);

      logger.debug(`Decision memory committed for agent ${agentId}: ${selectedAction.type}`);
    } catch (error) {
      logger.error(`Failed to commit decision memory for agent ${agentId}:`, error);
    }
  }

  private async addToWorkingMemory(agentId: string, entry: MemoryEntry): Promise<void> {
    // Add as recent interaction to working memory
    await this.workingMemoryManager.addInteraction(agentId, {
      id: entry.id,
      type: entry.type,
      description: this.generateDescription(entry),
      timestamp: entry.timestamp,
      participants: [agentId],
      context: entry.content,
      success: entry.content.success,
      impact: entry.significance.impact,
      novelty: entry.significance.novelty,
      emotionalIntensity: entry.significance.importance,
      emotionalResponse: {
        emotion: entry.content.success ? 'satisfaction' : 'disappointment',
        intensity: entry.significance.importance,
        trigger: entry.type,
        timestamp: entry.timestamp,
      },
    });

    // Also add as temporary learning if significant
    if (entry.significance.importance > 0.6) {
      const current = await this.workingMemoryManager.getWorkingMemory(agentId);
      if (current) {
        const learning: TemporaryLearning = {
          concept: entry.type,
          description: this.generateDescription(entry),
          confidence: entry.significance.importance,
          source: `agent-memory-commit`,
          timestamp: entry.timestamp,
        };
        current.shortTermMemory.temporaryLearnings.push(learning);

        // Evict oldest if capacity exceeded
        if (current.shortTermMemory.temporaryLearnings.length > 10) {
          current.shortTermMemory.temporaryLearnings =
            current.shortTermMemory.temporaryLearnings.slice(-10);
        }
      }
    }
  }

  private async addToEpisodicMemory(agentId: string, entry: MemoryEntry): Promise<void> {
    if (!this.episodicMemoryManager) return;

    await this.episodicMemoryManager.storeEpisode(agentId, {
      agentId,
      episodeId: entry.id,
      type: 'operation',
      context: {
        when: entry.timestamp,
        where: 'agent-memory',
        who: [agentId],
        what: this.generateDescription(entry),
        why: this.generateTitle(entry),
        how: entry.content.action ? entry.content.action.reasoning : 'automated',
      },
      experience: {
        actions: [],
        decisions: [],
        outcomes: [
          {
            id: `${entry.id}-outcome`,
            type: entry.content.success ? 'success' : 'failure',
            description: this.generateDescription(entry),
            success: entry.content.success,
            impact: entry.significance.impact,
            timestamp: entry.timestamp,
            metadata: { confidence: entry.significance.importance },
          },
        ],
        emotions: [],
        learnings: [],
      },
      significance: entry.significance,
      connections: {
        relatedEpisodes: [],
        triggeredBy: [],
        ledTo: [],
        similarTo: [],
      },
    });
  }

  private calculateSignificance(action: ActionRecommendation, success: boolean, duration?: number) {
    let importance = action.confidence;

    // Boost importance for successful complex actions
    if (success && action.type === 'hybrid_workflow') {
      importance += 0.2;
    }

    // Reduce importance for failures
    if (!success) {
      importance *= 0.7;
    }

    const novelty = action.type === 'clarification' ? 0.2 : 0.6;
    const impact = success ? action.confidence : action.confidence * 0.5;

    return {
      importance: Math.min(1, importance),
      novelty,
      impact,
      success: success ? 1 : 0,
    };
  }

  private calculateToolSignificance(tool: ToolDefinition, success: boolean, duration?: number) {
    let importance = success ? 0.5 : 0.3;

    // Higher importance for restricted/dangerous tools
    if (
      tool.securityLevel === SecurityLevel.HIGH ||
      tool.securityLevel === SecurityLevel.CRITICAL
    ) {
      importance += 0.3;
    }

    // Higher importance for longer executions
    if (duration && duration > 60000) {
      // > 1 minute
      importance += 0.2;
    }

    return {
      importance: Math.min(1, importance),
      novelty: tool.requiresApproval ? 0.7 : 0.4,
      impact: success ? 0.6 : 0.3,
      success: success ? 1 : 0,
    };
  }

  private generateTitle(entry: MemoryEntry): string {
    switch (entry.type) {
      case 'action_execution':
        return `${entry.content.action?.type} - ${entry.content.success ? 'Success' : 'Failed'}`;
      case 'tool_usage':
        return `Used ${entry.content.tool?.name} - ${entry.content.success ? 'Success' : 'Failed'}`;
      case 'decision_made':
        return `Decided on ${entry.content.action?.type}`;
      default:
        return `${entry.type} at ${entry.timestamp.toISOString()}`;
    }
  }

  private generateDescription(entry: MemoryEntry): string {
    switch (entry.type) {
      case 'action_execution':
        return `Executed ${entry.content.action?.type} action with ${entry.content.success ? 'success' : 'failure'}. ${entry.content.action?.reasoning || ''}`;
      case 'tool_usage':
        return `Used tool ${entry.content.tool?.name} (${entry.content.tool?.category}) with ${entry.content.success ? 'success' : 'failure'}`;
      case 'decision_made':
        return `Made decision to execute ${entry.content.action?.type}: ${entry.content.metadata?.reasoning || ''}`;
      default:
        return `${entry.type} event occurred`;
    }
  }

  private generateTags(entry: MemoryEntry): string[] {
    const tags: string[] = [entry.type];

    if (entry.content.action) {
      tags.push(`action_${entry.content.action.type}`, `risk_${entry.content.action.riskLevel}`);
    }

    if (entry.content.tool) {
      tags.push(
        `category_${entry.content.tool.category}`,
        `security_${entry.content.tool.securityLevel}`
      );
    }

    tags.push(entry.content.success ? 'success' : 'failure');

    return tags;
  }
}
