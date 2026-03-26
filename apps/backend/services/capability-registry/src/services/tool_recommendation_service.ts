import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra';
import { logger } from '@uaip/utils';
import type { ToolDefinition } from '@uaip/types';

interface RecommendationContext {
  userId?: string;
  agentId?: string;
  projectId?: string;
  currentToolId?: string;
  recentTools?: string[];
  taskType?: string;
  parameters?: Record<string, unknown>;
}

interface ToolRecommendation {
  toolId: string;
  tool: ToolDefinition;
  score: number;
  reason: string;
  relationships: string[];
}

/**
 * Service for providing intelligent tool recommendations based on usage patterns
 */
export class ToolRecommendationService {
  private static instance: ToolRecommendationService;
  // Graph database operations handled by knowledge graph service
  private database: DatabaseService;
  private eventBus: EventBusService;

  private asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  private asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
  }

  private asNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' ? value : fallback;
  }

  private constructor() {
    // Initialize based on existing patterns in the codebase
    this.database = DatabaseService.getInstance();
    this.eventBus = EventBusService.getInstance();
    this.setupEventListeners();
  }

  static getInstance(): ToolRecommendationService {
    if (!ToolRecommendationService.instance) {
      ToolRecommendationService.instance = new ToolRecommendationService();
    }
    return ToolRecommendationService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Initialize graph database if available
      // Note: This follows the pattern from index.ts where Neo4j initialization can fail gracefully
      logger.info('Tool Recommendation Service initialized');
    } catch (error) {
      logger.error('Failed to initialize tool recommendation service', error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    // Listen for tool execution events to update patterns
    this.eventBus.subscribe(
      'tool.execution.completed',
      this.handleToolExecutionCompleted.bind(this)
    );
    this.eventBus.subscribe('tool.execution.failed', this.handleToolExecutionFailed.bind(this));
  }

  /**
   * Get tool recommendations based on context
   */
  async getRecommendations(
    context: RecommendationContext,
    limit: number = 5
  ): Promise<ToolRecommendation[]> {
    try {
      const _recommendations: ToolRecommendation[] = [];

      // For now, return basic recommendations based on enabled tools
      // This would be enhanced with Neo4j when properly integrated
      const tools = await this.getBasicToolRecommendations(limit);

      logger.info('Generated tool recommendations', {
        context: {
          agentId: context.agentId,
          projectId: context.projectId,
          currentToolId: context.currentToolId,
        },
        count: tools.length,
      });

      return tools;
    } catch (error) {
      logger.error('Failed to get tool recommendations', error);
      return [];
    }
  }

  /**
   * Get basic tool recommendations from database
   */
  private async getBasicToolRecommendations(_limit: number): Promise<ToolRecommendation[]> {
    try {
      // This would query the database for popular tools
      // For now, return empty array to avoid database schema dependencies
      return [];
    } catch (error) {
      logger.error('Failed to get basic tool recommendations', error);
      return [];
    }
  }

  /**
   * Update usage patterns when tool execution completes
   */
  private async handleToolExecutionCompleted(event: unknown): Promise<void> {
    try {
      const eventRecord = this.asRecord(event);
      const toolId = this.asString(eventRecord.toolId, '');
      const agentId = this.asString(eventRecord.agentId, '');
      const executionTime = this.asNumber(eventRecord.executionTime, 0);

      // This would update usage patterns in Neo4j when properly integrated
      logger.debug('Tool execution completed', { toolId, agentId, executionTime });
    } catch (error) {
      logger.error('Failed to handle tool execution completed', error);
    }
  }

  /**
   * Update failure patterns when tool execution fails
   */
  private async handleToolExecutionFailed(event: unknown): Promise<void> {
    try {
      const eventRecord = this.asRecord(event);
      const toolId = this.asString(eventRecord.toolId, '');
      const agentId = this.asString(eventRecord.agentId, '');
      const errorMessage = this.asString(eventRecord.error, 'Unknown error');

      // This would update failure patterns in Neo4j when properly integrated
      logger.debug('Tool execution failed', { toolId, agentId, error: errorMessage });
    } catch (error) {
      logger.error('Failed to handle tool execution failed', error);
    }
  }

  /**
   * Helper method to get tool definition
   */
  private async getToolDefinition(toolId: string): Promise<ToolDefinition | null> {
    try {
      // This would query the tool definition from database
      // For now, return null to avoid schema dependencies
      return null;
    } catch (error) {
      logger.error('Failed to get tool definition', { toolId, error });
      return null;
    }
  }

  /**
   * Analyze tool relationships and discover new patterns
   */
  async analyzeToolRelationships(): Promise<void> {
    try {
      logger.info('Starting tool relationship analysis');

      // This would analyze patterns when Neo4j is properly integrated

      logger.info('Tool relationship analysis completed');
    } catch (error) {
      logger.error('Failed to analyze tool relationships', error);
    }
  }
}
