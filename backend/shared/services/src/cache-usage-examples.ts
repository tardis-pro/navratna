/**
 * Redis Cache Usage Examples
 * Shows how to use the standalone Redis cache service in your applications
 */

import { redisCacheService } from './redis-cache.service.js';
import { getDataSource } from './database/typeorm.config.js';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'cache-examples',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info'
});

/**
 * Example: Security Gateway Service with Redis Cache
 */
export class CachedSecurityGatewayService {
  private readonly CACHE_TTL = {
    SECURITY_POLICIES: 300, // 5 minutes
    USER_PERMISSIONS: 900, // 15 minutes
    RISK_ASSESSMENTS: 180, // 3 minutes
    AUDIT_STATS: 600, // 10 minutes
  };

  /**
   * Get cached security policies
   */
  async getSecurityPolicies(useCache = true): Promise<any[]> {
    const cacheKey = 'security_policies:active';
    
    if (useCache) {
      // Try to get from cache first
      const cached = await redisCacheService.get<any[]>(cacheKey);
      if (cached) {
        logger.debug('Security policies retrieved from cache');
        return cached;
      }
    }

    // Cache miss - get from database
    const policies = await getDataSource()
      .getRepository('SecurityPolicy')
      .find({ where: { isActive: true } });

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, policies, this.CACHE_TTL.SECURITY_POLICIES);
      logger.debug('Security policies cached for future use');
    }

    return policies;
  }

  /**
   * Get cached user permissions
   */
  async getUserPermissions(userId: string, useCache = true): Promise<any> {
    const cacheKey = `user_permissions:${userId}`;
    
    if (useCache) {
      const cached = await redisCacheService.get(cacheKey);
      if (cached) {
        logger.debug('User permissions retrieved from cache', { userId });
        return cached;
      }
    }

    // Get from database
    const permissions = await getDataSource()
      .query(`
        SELECT p.* 
        FROM user_permissions up
        JOIN permissions p ON up.permission_id = p.id
        WHERE up.user_id = $1
      `, [userId]);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, permissions, this.CACHE_TTL.USER_PERMISSIONS);
      logger.debug('User permissions cached', { userId });
    }

    return permissions;
  }

  /**
   * Cache risk assessment results
   */
  async cacheRiskAssessment(userId: string, operationType: string, assessment: any): Promise<void> {
    const cacheKey = `risk_assessment:${userId}:${operationType}`;
    await redisCacheService.set(cacheKey, assessment, this.CACHE_TTL.RISK_ASSESSMENTS);
    logger.debug('Risk assessment cached', { userId, operationType });
  }

  /**
   * Get cached risk assessment
   */
  async getCachedRiskAssessment(userId: string, operationType: string): Promise<any | null> {
    const cacheKey = `risk_assessment:${userId}:${operationType}`;
    const cached = await redisCacheService.get(cacheKey);
    
    if (cached) {
      logger.debug('Risk assessment retrieved from cache', { userId, operationType });
    }
    
    return cached;
  }

  /**
   * Invalidate user-related cache entries
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const patterns = [
      `user_permissions:${userId}`,
      `risk_assessment:${userId}:*`,
      `user_audit_stats:${userId}`,
    ];

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        // Handle wildcard patterns
        const keys = await redisCacheService.keys(pattern);
        for (const key of keys) {
          await redisCacheService.del(key);
        }
      } else {
        await redisCacheService.del(pattern);
      }
    }

    logger.info('User cache invalidated', { userId, patterns });
  }

  /**
   * Get audit statistics with caching
   */
  async getAuditStats(timeRange: 'day' | 'week' | 'month'): Promise<any> {
    const cacheKey = `audit_stats:${timeRange}`;
    
    // Try cache first
    const cached = await redisCacheService.get(cacheKey);
    if (cached) {
      logger.debug('Audit stats retrieved from cache', { timeRange });
      return cached;
    }

    // Calculate from database
    const stats = await this.calculateAuditStats(timeRange);
    
    // Cache the result
    await redisCacheService.set(cacheKey, stats, this.CACHE_TTL.AUDIT_STATS);
    logger.debug('Audit stats calculated and cached', { timeRange });

    return stats;
  }

  private async calculateAuditStats(timeRange: string): Promise<any> {
    // Mock implementation - replace with actual database query
    return {
      timeRange,
      totalEvents: 1000,
      securityViolations: 5,
      approvalRequests: 25,
      calculatedAt: new Date().toISOString()
    };
  }
}

/**
 * Example: Agent Intelligence Service with Redis Cache
 */
export class CachedAgentIntelligenceService {
  private readonly CACHE_TTL = {
    AGENT_METRICS: 300, // 5 minutes
    OPERATION_STATS: 180, // 3 minutes
    KNOWLEDGE_GRAPH: 600, // 10 minutes
  };

  /**
   * Get cached agent metrics
   */
  async getAgentMetrics(agentId: string): Promise<any> {
    const cacheKey = `agent_metrics:${agentId}`;
    
    // Try cache first
    const cached = await redisCacheService.get(cacheKey);
    if (cached) {
      logger.debug('Agent metrics retrieved from cache', { agentId });
      return cached;
    }

    // Get from database
    const metrics = await getDataSource()
      .getRepository('AgentCapabilityMetric')
      .find({ where: { agentId } });

    // Cache the result
    await redisCacheService.set(cacheKey, metrics, this.CACHE_TTL.AGENT_METRICS);
    logger.debug('Agent metrics cached', { agentId });

    return metrics;
  }

  /**
   * Cache operation results
   */
  async cacheOperationResult(operationId: string, result: any): Promise<void> {
    const cacheKey = `operation_result:${operationId}`;
    await redisCacheService.set(cacheKey, result, this.CACHE_TTL.OPERATION_STATS);
    logger.debug('Operation result cached', { operationId });
  }

  /**
   * Bulk cache invalidation for agent
   */
  async invalidateAgentCache(agentId: string): Promise<void> {
    const patterns = [
      `agent_metrics:${agentId}`,
      `agent_operations:${agentId}:*`,
      `agent_knowledge:${agentId}:*`,
    ];

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        const keys = await redisCacheService.keys(pattern);
        for (const key of keys) {
          await redisCacheService.del(key);
        }
      } else {
        await redisCacheService.del(pattern);
      }
    }

    logger.info('Agent cache invalidated', { agentId });
  }
}

/**
 * Cache Health Monitor
 */
export class CacheHealthMonitor {
  /**
   * Get comprehensive cache health status
   */
  async getHealthStatus(): Promise<{
    service: any;
    statistics: any;
    sampleOperations: any;
  }> {
    const serviceHealth = await redisCacheService.healthCheck();
    
    // Get cache statistics
    const client = await redisCacheService.getClient();
    let statistics = null;
    let sampleOperations = null;

    if (client) {
      try {
        // Get Redis info
        const info = await client.info('memory');
        const keyCount = await client.dbsize();
        
        statistics = {
          keyCount,
          memoryInfo: info,
          connected: serviceHealth.connected,
          responseTime: serviceHealth.responseTime
        };

        // Test sample operations
        const testKey = 'health_check_test';
        const testValue = { timestamp: Date.now(), test: true };
        
        const setResult = await redisCacheService.set(testKey, testValue, 10);
        const getValue = await redisCacheService.get(testKey);
        const delResult = await redisCacheService.del(testKey);

        sampleOperations = {
          set: setResult,
          get: getValue !== null,
          delete: delResult,
          roundTrip: getValue?.timestamp === testValue.timestamp
        };

      } catch (error) {
        logger.error('Error getting cache statistics', { error: error.message });
      }
    }

    return {
      service: serviceHealth,
      statistics,
      sampleOperations
    };
  }

  /**
   * Monitor cache performance
   */
  async monitorPerformance(): Promise<void> {
    const health = await this.getHealthStatus();
    
    logger.info('Cache performance report', {
      healthy: health.service.healthy,
      responseTime: health.service.responseTime,
      keyCount: health.statistics?.keyCount,
      operations: health.sampleOperations
    });

    // Alert if performance is degraded
    if (health.service.responseTime && health.service.responseTime > 1000) {
      logger.warn('Cache response time is high', { 
        responseTime: health.service.responseTime 
      });
    }

    if (!health.sampleOperations?.roundTrip) {
      logger.warn('Cache round-trip test failed');
    }
  }
}

// Export instances for easy use
export const cachedSecurityGateway = new CachedSecurityGatewayService();
export const cachedAgentIntelligence = new CachedAgentIntelligenceService();
export const cacheHealthMonitor = new CacheHealthMonitor();

// Export convenience functions
export const getCacheHealth = () => cacheHealthMonitor.getHealthStatus();
export const monitorCachePerformance = () => cacheHealthMonitor.monitorPerformance(); 