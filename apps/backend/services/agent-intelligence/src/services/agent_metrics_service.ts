/**
 * Agent Metrics Service
 * Handles performance tracking and analytics for agents
 * Part of the refactored agent-intelligence microservices
 */

import { Agent, AgentMetrics } from '@uaip/types';
import { logger, ValidationError } from '@uaip/utils';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/event_bus';
import { AgentIntelligenceStore } from './agent_intelligence_store.js';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge_graph_service.js';
import { AgentMemoryService } from '../agent-memory/agent_memory_service.js';

export interface AgentMetricsConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  knowledgeGraphService?: KnowledgeGraphService;
  agentMemoryService?: AgentMemoryService;
  serviceName: string;
  securityLevel: number;
}

export interface EnhancedAgentMetrics extends AgentMetrics {
  knowledgeStats: {
    totalKnowledgeItems: number;
    knowledgeByType: Record<string, number>;
    memoryHealth: 'good' | 'moderate' | 'poor';
  };
  performanceBreakdown: {
    responseTimeDistribution: Record<string, number>;
    successRateByCategory: Record<string, number>;
    learningEfficiency: number;
    knowledgeUtilization: number;
  };
  trends: {
    performanceChange: number;
    learningVelocity: number;
    engagementLevel: number;
  };
}

interface AgentActivityMetadata extends Record<string, unknown> {
  initiatedBy?: string;
  knowledgeUsed?: number;
}

interface AgentActivityMetricsRow {
  type: string;
  duration: number;
  success: boolean;
  metadata?: AgentActivityMetadata;
}

interface AgentLearningMetricsRow {
  success: boolean;
}

export class AgentMetricsService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private knowledgeGraphService?: KnowledgeGraphService;
  private agentMemoryService?: AgentMemoryService;
  private serviceName: string;
  private securityLevel: number;
  private store: AgentIntelligenceStore;

  constructor(config: AgentMetricsConfig) {
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

    logger.info('Agent Metrics Service initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel,
    });
  }

  /**
   * Set up event bus subscriptions for metrics operations
   */
  private async setupEventSubscriptions(): Promise<void> {
    await this.eventBusService.subscribe('agent.metrics.get', this.handleGetMetrics.bind(this));
    await this.eventBusService.subscribe(
      'agent.metrics.calculate',
      this.handleCalculateMetrics.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.metrics.summary',
      this.handleGenerateSummary.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.metrics.track',
      this.handleTrackActivity.bind(this)
    );

    logger.info('Agent Metrics Service event subscriptions configured');
  }

  /**
   * Get agent performance metrics enhanced with knowledge analytics
   */
  async getAgentMetrics(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<EnhancedAgentMetrics> {
    try {
      this.validateID(agentId, 'agentId');

      logger.info('Getting agent metrics', { agentId, timeRange });

      // Get basic agent metrics from database
      const basicMetrics = await this.calculateBasicMetrics(agentId, timeRange);

      // Get knowledge statistics
      const knowledgeStats = await this.getKnowledgeStatistics(agentId);

      // Get memory statistics
      const memoryStats = await this.getMemoryStatistics(agentId);

      // Calculate performance breakdown
      const performanceBreakdown = await this.calculatePerformanceBreakdown(agentId, timeRange);

      // Calculate trends
      const trends = await this.calculateTrends(agentId, timeRange);

      const enhancedMetrics: EnhancedAgentMetrics = {
        ...basicMetrics,
        knowledgeStats: {
          totalKnowledgeItems: knowledgeStats.totalItems,
          knowledgeByType: knowledgeStats.itemsByType,
          memoryHealth: memoryStats.memoryHealth,
        },
        performanceBreakdown,
        trends,
      };

      // Publish metrics calculated event
      await this.publishMetricsEvent('agent.metrics.calculated', {
        agentId,
        timeRange,
        totalActivities: enhancedMetrics.totalActivities,
        successRate: enhancedMetrics.successRate,
        performanceScore: enhancedMetrics.performanceScore,
      });

      this.auditLog('METRICS_CALCULATED', {
        agentId,
        timeRange,
        totalActivities: enhancedMetrics.totalActivities,
      });

      return enhancedMetrics;
    } catch (error) {
      logger.error('Failed to get agent metrics', { error, agentId });
      throw error;
    }
  }

  /**
   * Calculate comprehensive metrics for an agent
   */
  async calculateMetrics(
    agentId: string,
    options?: {
      includeKnowledge?: boolean;
      includeMemory?: boolean;
      includeTrends?: boolean;
      timeRange?: { start: Date; end: Date };
    }
  ): Promise<unknown> {
    try {
      this.validateID(agentId, 'agentId');

      const timeRange = options?.timeRange || {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        end: new Date(),
      };

      logger.info('Calculating comprehensive metrics', { agentId, options });

      const metrics: Record<string, unknown> = {
        agentId,
        calculatedAt: new Date(),
        timeRange,
      };

      // Basic performance metrics
      metrics.performance = await this.calculateBasicMetrics(agentId, timeRange);

      // Knowledge metrics
      if (options?.includeKnowledge !== false) {
        metrics.knowledge = await this.getKnowledgeStatistics(agentId);
      }

      // Memory metrics
      if (options?.includeMemory !== false) {
        metrics.memory = await this.getMemoryStatistics(agentId);
      }

      // Trend analysis
      if (options?.includeTrends !== false) {
        metrics.trends = await this.calculateTrends(agentId, timeRange);
      }

      // Activity breakdown
      metrics.activities = await this.getActivityBreakdown(agentId, timeRange);

      // Engagement metrics
      metrics.engagement = await this.calculateEngagementMetrics(agentId, timeRange);

      return metrics;
    } catch (error) {
      logger.error('Failed to calculate metrics', { error, agentId });
      throw error;
    }
  }

  /**
   * Generate a comprehensive metrics summary
   */
  async generateMetricsSummary(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    summary: string;
    keyInsights: string[];
    recommendations: string[];
    score: number;
  }> {
    try {
      this.validateID(agentId, 'agentId');

      logger.info('Generating metrics summary', { agentId, timeRange });

      const metrics = await this.getAgentMetrics(agentId, timeRange);
      const agent = await this.getAgentData(agentId);

      // Generate summary text
      const summary = this.buildMetricsSummary(agent, metrics, timeRange);

      // Extract key insights
      const keyInsights = this.extractKeyInsights(metrics);

      // Generate recommendations
      const recommendations = this.generateRecommendations(metrics);

      // Calculate overall score
      const score = this.calculateOverallScore(metrics);

      return {
        summary,
        keyInsights,
        recommendations,
        score,
      };
    } catch (error) {
      logger.error('Failed to generate metrics summary', { error, agentId });
      throw error;
    }
  }

  /**
   * Track agent activity for metrics calculation
   */
  async trackActivity(
    agentId: string,
    activity: {
      type: string;
      duration: number;
      success: boolean;
      context?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      this.validateID(agentId, 'agentId');

      logger.info('Tracking agent activity', { agentId, activityType: activity.type });

      // Store activity in database
      await this.store.storeAgentActivity(agentId, {
        type: activity.type,
        duration: activity.duration,
        success: activity.success,
        context: activity.context,
        metadata: activity.metadata,
        timestamp: new Date(),
      });

      // Publish activity tracked event
      await this.publishMetricsEvent('agent.activity.tracked', {
        agentId,
        activityType: activity.type,
        duration: activity.duration,
        success: activity.success,
      });

      this.auditLog('ACTIVITY_TRACKED', {
        agentId,
        activityType: activity.type,
        success: activity.success,
      });
    } catch (error) {
      logger.error('Failed to track activity', { error, agentId });
      throw error;
    }
  }

  /**
   * Event handlers
   */
  private async handleGetMetrics(event: Record<string, unknown>): Promise<void> {
    const { requestId, agentId, timeRange } = event;
    const parsedRequestId = this.getStringValue(requestId);
    if (!parsedRequestId) {
      logger.warn('Skipping metrics response because requestId is invalid', { requestId });
      return;
    }

    try {
      const parsedAgentId = this.requireStringValue(agentId, 'agentId');
      const parsedTimeRange = this.parseTimeRange(timeRange);
      const metrics = await this.getAgentMetrics(parsedAgentId, parsedTimeRange);
      await this.respondToRequest(parsedRequestId, { success: true, data: metrics });
    } catch (error) {
      await this.respondToRequest(parsedRequestId, {
        success: false,
        error: this.getErrorMessage(error),
      });
    }
  }

  private async handleCalculateMetrics(event: Record<string, unknown>): Promise<void> {
    const { requestId, agentId, options } = event;
    const parsedRequestId = this.getStringValue(requestId);
    if (!parsedRequestId) {
      logger.warn('Skipping metrics response because requestId is invalid', { requestId });
      return;
    }

    try {
      const parsedAgentId = this.requireStringValue(agentId, 'agentId');
      const parsedOptions = this.parseMetricsOptions(options);
      const metrics = await this.calculateMetrics(parsedAgentId, parsedOptions);
      await this.respondToRequest(parsedRequestId, { success: true, data: metrics });
    } catch (error) {
      await this.respondToRequest(parsedRequestId, {
        success: false,
        error: this.getErrorMessage(error),
      });
    }
  }

  private async handleGenerateSummary(event: Record<string, unknown>): Promise<void> {
    const { requestId, agentId, timeRange } = event;
    const parsedRequestId = this.getStringValue(requestId);
    if (!parsedRequestId) {
      logger.warn('Skipping metrics response because requestId is invalid', { requestId });
      return;
    }

    try {
      const parsedAgentId = this.requireStringValue(agentId, 'agentId');
      const parsedTimeRange = this.parseTimeRange(timeRange);
      const summary = await this.generateMetricsSummary(parsedAgentId, parsedTimeRange);
      await this.respondToRequest(parsedRequestId, { success: true, data: summary });
    } catch (error) {
      await this.respondToRequest(parsedRequestId, {
        success: false,
        error: this.getErrorMessage(error),
      });
    }
  }

  private async handleTrackActivity(event: Record<string, unknown>): Promise<void> {
    const { requestId, agentId, activity } = event;
    const parsedRequestId = this.getStringValue(requestId);
    if (!parsedRequestId) {
      logger.warn('Skipping metrics response because requestId is invalid', { requestId });
      return;
    }

    try {
      const parsedAgentId = this.requireStringValue(agentId, 'agentId');
      const parsedActivity = this.parseTrackActivityPayload(activity);
      await this.trackActivity(parsedAgentId, parsedActivity);
      await this.respondToRequest(parsedRequestId, { success: true });
    } catch (error) {
      await this.respondToRequest(parsedRequestId, {
        success: false,
        error: this.getErrorMessage(error),
      });
    }
  }

  /**
   * Helper methods
   */
  private async calculateBasicMetrics(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<AgentMetrics> {
    // Get activities from database
    const activities = await this.getTypedAgentActivities(agentId, timeRange);

    const totalActivities = activities.length;
    const successfulActivities = activities.filter((a) => a.success).length;
    const successRate = totalActivities > 0 ? successfulActivities / totalActivities : 0;

    const totalResponseTime = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    const averageResponseTime = totalActivities > 0 ? totalResponseTime / totalActivities : 0;

    // Calculate performance score based on success rate and response time
    const performanceScore = this.calculatePerformanceScore(successRate, averageResponseTime);

    // Calculate learning progress (simplified)
    const learningProgress = await this.calculateLearningProgress(agentId, timeRange);

    return {
      agentId,
      timeRange,
      totalActivities,
      successRate,
      averageResponseTime,
      performanceScore,
      learningProgress,
    };
  }

  private async getKnowledgeStatistics(agentId: string): Promise<{
    totalItems: number;
    itemsByType: Record<string, number>;
  }> {
    if (!this.knowledgeGraphService) {
      return { totalItems: 0, itemsByType: {} };
    }

    try {
      const stats = await this.knowledgeGraphService.getStatistics();
      return {
        totalItems: stats.totalItems || 0,
        itemsByType: stats.itemsByType || {},
      };
    } catch (error) {
      logger.warn('Failed to get knowledge statistics', { error, agentId });
      return { totalItems: 0, itemsByType: {} };
    }
  }

  private async getMemoryStatistics(agentId: string): Promise<{
    memoryHealth: 'good' | 'moderate' | 'poor';
    episodeCount: number;
    conceptCount: number;
  }> {
    if (!this.agentMemoryService) {
      return { memoryHealth: 'poor', episodeCount: 0, conceptCount: 0 };
    }

    try {
      const stats = await this.agentMemoryService.getMemoryStatistics(agentId);
      return {
        memoryHealth: stats.memoryHealth,
        episodeCount: stats.episodeCount || 0,
        conceptCount: stats.conceptCount || 0,
      };
    } catch (error) {
      logger.warn('Failed to get memory statistics', { error, agentId });
      return { memoryHealth: 'poor', episodeCount: 0, conceptCount: 0 };
    }
  }

  private async calculatePerformanceBreakdown(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    responseTimeDistribution: Record<string, number>;
    successRateByCategory: Record<string, number>;
    learningEfficiency: number;
    knowledgeUtilization: number;
  }> {
    const activities = await this.getTypedAgentActivities(agentId, timeRange);

    // Response time distribution
    const responseTimeDistribution = this.calculateResponseTimeDistribution(activities);

    // Success rate by category
    const successRateByCategory = this.calculateSuccessRateByCategory(activities);

    // Learning efficiency (simplified calculation)
    const learningEfficiency = await this.calculateLearningEfficiency(agentId, timeRange);

    // Knowledge utilization
    const knowledgeUtilization = await this.calculateKnowledgeUtilization(agentId, timeRange);

    return {
      responseTimeDistribution,
      successRateByCategory,
      learningEfficiency,
      knowledgeUtilization,
    };
  }

  private async calculateTrends(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    performanceChange: number;
    learningVelocity: number;
    engagementLevel: number;
  }> {
    // Calculate trends by comparing current period with previous period
    const periodDuration = timeRange.end.getTime() - timeRange.start.getTime();
    const previousTimeRange = {
      start: new Date(timeRange.start.getTime() - periodDuration),
      end: timeRange.start,
    };

    const currentMetrics = await this.calculateBasicMetrics(agentId, timeRange);
    const previousMetrics = await this.calculateBasicMetrics(agentId, previousTimeRange);

    const performanceChange = currentMetrics.performanceScore - previousMetrics.performanceScore;
    const learningVelocity = currentMetrics.learningProgress - previousMetrics.learningProgress;

    // Engagement level based on activity frequency
    const engagementLevel = this.calculateEngagementLevel(
      currentMetrics.totalActivities,
      periodDuration
    );

    return {
      performanceChange,
      learningVelocity,
      engagementLevel,
    };
  }

  private async getActivityBreakdown(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, number>> {
    const activities = await this.getTypedAgentActivities(agentId, timeRange);
    const breakdown: Record<string, number> = {};

    activities.forEach((activity) => {
      breakdown[activity.type] = (breakdown[activity.type] || 0) + 1;
    });

    return breakdown;
  }

  private async calculateEngagementMetrics(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    dailyActivity: number;
    responseConsistency: number;
    proactiveActions: number;
  }> {
    const activities = await this.getTypedAgentActivities(agentId, timeRange);
    const days = Math.ceil(
      (timeRange.end.getTime() - timeRange.start.getTime()) / (24 * 60 * 60 * 1000)
    );

    const dailyActivity = activities.length / Math.max(days, 1);

    // Calculate response consistency (simplified)
    const responseTimes = activities.map((a) => a.duration);
    const avgResponseTime =
      responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const variance =
      responseTimes.reduce((sum, time) => sum + Math.pow(time - avgResponseTime, 2), 0) /
      responseTimes.length;
    const responseConsistency = Math.max(0, 1 - Math.sqrt(variance) / avgResponseTime);

    // Count proactive actions (activities initiated by agent)
    const proactiveActions = activities.filter((a) => a.metadata?.initiatedBy === 'agent').length;

    return {
      dailyActivity,
      responseConsistency: isNaN(responseConsistency) ? 0 : responseConsistency,
      proactiveActions,
    };
  }

  private buildMetricsSummary(
    agent: Pick<Agent, 'name'> | null,
    metrics: EnhancedAgentMetrics,
    timeRange: { start: Date; end: Date }
  ): string {
    const agentName = agent?.name || 'Agent';
    const days = Math.ceil(
      (timeRange.end.getTime() - timeRange.start.getTime()) / (24 * 60 * 60 * 1000)
    );

    return `${agentName} Performance Summary (${days} days):
- Total Activities: ${metrics.totalActivities}
- Success Rate: ${(metrics.successRate * 100).toFixed(1)}%
- Average Response Time: ${metrics.averageResponseTime.toFixed(0)}ms
- Performance Score: ${(metrics.performanceScore * 100).toFixed(1)}%
- Learning Progress: ${(metrics.learningProgress * 100).toFixed(1)}%
- Knowledge Items: ${metrics.knowledgeStats.totalKnowledgeItems}
- Memory Health: ${metrics.knowledgeStats.memoryHealth}`;
  }

  private extractKeyInsights(metrics: EnhancedAgentMetrics): string[] {
    const insights: string[] = [];

    if (metrics.successRate > 0.9) {
      insights.push('Excellent success rate indicates high reliability');
    } else if (metrics.successRate < 0.7) {
      insights.push('Success rate below optimal threshold - needs attention');
    }

    if (metrics.trends.performanceChange > 0.1) {
      insights.push('Performance is trending upward');
    } else if (metrics.trends.performanceChange < -0.1) {
      insights.push('Performance decline detected');
    }

    if (metrics.knowledgeStats.totalKnowledgeItems > 100) {
      insights.push('Rich knowledge base available for enhanced responses');
    }

    if (metrics.trends.learningVelocity > 0.05) {
      insights.push('Active learning and adaptation observed');
    }

    return insights;
  }

  private generateRecommendations(metrics: EnhancedAgentMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.successRate < 0.8) {
      recommendations.push('Consider additional training or capability enhancement');
    }

    if (metrics.averageResponseTime > 2000) {
      recommendations.push('Optimize response time through performance tuning');
    }

    if (metrics.knowledgeStats.memoryHealth === 'poor') {
      recommendations.push('Memory consolidation needed to improve performance');
    }

    if (metrics.trends.engagementLevel < 0.5) {
      recommendations.push('Increase engagement through more diverse interactions');
    }

    if (metrics.performanceBreakdown.knowledgeUtilization < 0.6) {
      recommendations.push('Improve knowledge utilization in responses');
    }

    return recommendations;
  }

  private calculateOverallScore(metrics: EnhancedAgentMetrics): number {
    const weights = {
      successRate: 0.3,
      performanceScore: 0.25,
      learningProgress: 0.2,
      knowledgeUtilization: 0.15,
      engagementLevel: 0.1,
    };

    const score =
      metrics.successRate * weights.successRate +
      metrics.performanceScore * weights.performanceScore +
      metrics.learningProgress * weights.learningProgress +
      metrics.performanceBreakdown.knowledgeUtilization * weights.knowledgeUtilization +
      metrics.trends.engagementLevel * weights.engagementLevel;

    return Math.round(score * 100) / 100;
  }

  private calculatePerformanceScore(successRate: number, averageResponseTime: number): number {
    // Normalize response time (assume 1000ms is optimal, 5000ms is poor)
    const responseTimeScore = Math.max(0, Math.min(1, (5000 - averageResponseTime) / 4000));

    // Combine success rate and response time
    return successRate * 0.7 + responseTimeScore * 0.3;
  }

  private async calculateLearningProgress(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<number> {
    // Simplified learning progress calculation
    // In a real implementation, this would analyze learning records
    const activities = await this.getTypedAgentActivities(agentId, timeRange);
    const learningActivities = activities.filter(
      (a) => a.type === 'learning' || a.type === 'training'
    );

    return Math.min(1, learningActivities.length / 10); // Normalize to 0-1
  }

  private calculateResponseTimeDistribution(
    activities: AgentActivityMetricsRow[]
  ): Record<string, number> {
    const distribution = {
      fast: 0, // < 500ms
      normal: 0, // 500ms - 2000ms
      slow: 0, // 2000ms - 5000ms
      very_slow: 0, // > 5000ms
    };

    activities.forEach((activity) => {
      const duration = activity.duration;
      if (duration < 500) distribution.fast++;
      else if (duration < 2000) distribution.normal++;
      else if (duration < 5000) distribution.slow++;
      else distribution.very_slow++;
    });

    return distribution;
  }

  private calculateSuccessRateByCategory(
    activities: AgentActivityMetricsRow[]
  ): Record<string, number> {
    const categories: Record<string, { total: number; successful: number }> = {};

    activities.forEach((activity) => {
      const category = activity.type;
      if (!categories[category]) {
        categories[category] = { total: 0, successful: 0 };
      }
      categories[category].total++;
      if (activity.success) {
        categories[category].successful++;
      }
    });

    const successRates: Record<string, number> = {};
    Object.keys(categories).forEach((category) => {
      const { total, successful } = categories[category];
      successRates[category] = total > 0 ? successful / total : 0;
    });

    return successRates;
  }

  private async calculateLearningEfficiency(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<number> {
    // Simplified learning efficiency calculation
    const learningRecords = await this.getTypedLearningRecords(agentId, timeRange);
    if (learningRecords.length === 0) return 0.5;

    const totalLearnings = learningRecords.length;
    const successfulLearnings = learningRecords.filter((r) => r.success).length;

    return successfulLearnings / totalLearnings;
  }

  private async calculateKnowledgeUtilization(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<number> {
    // Simplified knowledge utilization calculation
    const activities = await this.getTypedAgentActivities(agentId, timeRange);
    const knowledgeEnhancedActivities = activities.filter(
      (a) => a.metadata?.knowledgeUsed && a.metadata.knowledgeUsed > 0
    );

    return activities.length > 0 ? knowledgeEnhancedActivities.length / activities.length : 0;
  }

  private calculateEngagementLevel(totalActivities: number, periodDurationMs: number): number {
    const days = periodDurationMs / (24 * 60 * 60 * 1000);
    const activitiesPerDay = totalActivities / Math.max(days, 1);

    // Normalize to 0-1 scale (assume 10 activities per day is high engagement)
    return Math.min(1, activitiesPerDay / 10);
  }

  private async getAgentData(agentId: string): Promise<Agent | null> {
    try {
      const response = await this.eventBusService.request('agent.query.get', { agentId });
      if (!this.isRecord(response)) {
        return null;
      }

      const wasSuccessful = this.getBooleanValue(response.success);
      if (!wasSuccessful || !this.isRecord(response.data)) {
        return null;
      }

      const name = this.getStringValue(response.data.name);
      if (!name) {
        return null;
      }

      return { name };
    } catch (error) {
      logger.warn('Failed to get agent data', { error, agentId });
      return null;
    }
  }

  private validateID(value: string, paramName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new ValidationError(`Invalid ${paramName}: must be a non-empty string`);
    }
  }

  private async getTypedAgentActivities(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<AgentActivityMetricsRow[]> {
    const activities = await this.store.getAgentActivities(agentId, timeRange);
    return activities.map((activity) => this.toAgentActivityMetricsRow(activity));
  }

  private async getTypedLearningRecords(
    agentId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<AgentLearningMetricsRow[]> {
    const records = await this.store.getLearningRecords(agentId, timeRange);
    return records.map((record) => this.toAgentLearningMetricsRow(record));
  }

  private toAgentActivityMetricsRow(activity: unknown): AgentActivityMetricsRow {
    if (!this.isRecord(activity)) {
      return {
        type: 'unknown',
        duration: 0,
        success: false,
      };
    }

    const metadata = this.isRecord(activity.metadata)
      ? this.toAgentActivityMetadata(activity.metadata)
      : undefined;

    return {
      type: this.getStringValue(activity.type) ?? 'unknown',
      duration: this.getNumberValue(activity.duration) ?? 0,
      success: this.getBooleanValue(activity.success) ?? false,
      metadata,
    };
  }

  private toAgentLearningMetricsRow(record: unknown): AgentLearningMetricsRow {
    if (!this.isRecord(record)) {
      return { success: false };
    }

    return {
      success: this.getBooleanValue(record.success) ?? false,
    };
  }

  private toAgentActivityMetadata(metadata: Record<string, unknown>): AgentActivityMetadata {
    const normalizedMetadata: AgentActivityMetadata = { ...metadata };
    const initiatedBy = this.getStringValue(metadata.initiatedBy);
    const knowledgeUsed = this.getNumberValue(metadata.knowledgeUsed);

    if (initiatedBy !== undefined) {
      normalizedMetadata.initiatedBy = initiatedBy;
    }

    if (knowledgeUsed !== undefined) {
      normalizedMetadata.knowledgeUsed = knowledgeUsed;
    }

    return normalizedMetadata;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private getStringValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private requireStringValue(value: unknown, fieldName: string): string {
    if (typeof value === 'string') {
      return value;
    }

    throw new ValidationError(`Invalid ${fieldName}: must be a string`);
  }

  private getNumberValue(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private getBooleanValue(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private parseTimeRange(value: unknown): { start: Date; end: Date } {
    if (!this.isRecord(value)) {
      throw new ValidationError('Invalid timeRange: must be an object with start and end dates');
    }

    const start = this.parseDate(value.start, 'timeRange.start');
    const end = this.parseDate(value.end, 'timeRange.end');
    return { start, end };
  }

  private parseDate(value: unknown, fieldName: string): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    throw new ValidationError(`Invalid ${fieldName}: must be a valid date`);
  }

  private parseMetricsOptions(value: unknown): {
    includeKnowledge?: boolean;
    includeMemory?: boolean;
    includeTrends?: boolean;
    timeRange?: { start: Date; end: Date };
  } {
    if (!this.isRecord(value)) {
      return {};
    }

    const includeKnowledge = this.getBooleanValue(value.includeKnowledge);
    const includeMemory = this.getBooleanValue(value.includeMemory);
    const includeTrends = this.getBooleanValue(value.includeTrends);

    const parsedOptions: {
      includeKnowledge?: boolean;
      includeMemory?: boolean;
      includeTrends?: boolean;
      timeRange?: { start: Date; end: Date };
    } = {};

    if (includeKnowledge !== undefined) {
      parsedOptions.includeKnowledge = includeKnowledge;
    }
    if (includeMemory !== undefined) {
      parsedOptions.includeMemory = includeMemory;
    }
    if (includeTrends !== undefined) {
      parsedOptions.includeTrends = includeTrends;
    }
    if (value.timeRange !== undefined) {
      parsedOptions.timeRange = this.parseTimeRange(value.timeRange);
    }

    return parsedOptions;
  }

  private parseTrackActivityPayload(value: unknown): {
    type: string;
    duration: number;
    success: boolean;
    context?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  } {
    if (!this.isRecord(value)) {
      throw new ValidationError('Invalid activity: must be an object');
    }

    const type = this.requireStringValue(value.type, 'activity.type');
    const duration = this.getNumberValue(value.duration) ?? 0;
    const success = this.getBooleanValue(value.success) ?? false;

    return {
      type,
      duration,
      success,
      context: this.isRecord(value.context) ? value.context : undefined,
      metadata: this.isRecord(value.metadata) ? value.metadata : undefined,
    };
  }

  private async publishMetricsEvent(channel: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: this.serviceName,
        securityLevel: this.securityLevel,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to publish metrics event', { channel, error });
    }
  }

  private async respondToRequest(
    requestId: string,
    response: Record<string, unknown>
  ): Promise<void> {
    await this.eventBusService.publish('agent.metrics.response', {
      requestId,
      ...response,
      timestamp: new Date().toISOString(),
    });
  }

  private auditLog(event: string, data: Record<string, unknown>): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true,
    });
  }
}
