import { ServiceFactory } from './ServiceFactory.js';
import { UserKnowledgeService } from './user-knowledge.service.js';
import { ContextOrchestrationService } from './context-orchestration.service.js';
import { AgentMemoryService } from './agent-memory/agent-memory.service.js';

/**
 * Service Initializer for API routes
 * Provides easy access to initialized services for controllers
 */
export class ServiceInitializer {
  private static initPromise: Promise<void> | null = null;

  /**
   * Initialize all services (call once at application startup)
   */
  static async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = ServiceFactory.initialize();
    return this.initPromise;
  }

  /**
   * Get UserKnowledgeService for API routes
   */
  static async getUserKnowledgeService(): Promise<UserKnowledgeService> {
    await this.ensureInitialized();
    return ServiceFactory.getUserKnowledgeService();
  }

  /**
   * Get ContextOrchestrationService for API routes
   */
  static async getContextOrchestrationService(): Promise<ContextOrchestrationService> {
    await this.ensureInitialized();
    return ServiceFactory.getContextOrchestrationService();
  }

  /**
   * Get AgentMemoryService for API routes
   */
  static async getAgentMemoryService(): Promise<AgentMemoryService> {
    await this.ensureInitialized();
    return ServiceFactory.getAgentMemoryService();
  }

  /**
   * Health check for all services
   */
  static async healthCheck(): Promise<{
    healthy: boolean;
    services: Record<string, boolean>;
    error?: string;
  }> {
    try {
      await this.ensureInitialized();
      const status = await ServiceFactory.getHealthStatus();
      
      const allHealthy = status.initialized && Object.values(status.services).every(healthy => healthy);
      
      return {
        healthy: allHealthy,
        services: status.services
      };
    } catch (error) {
      return {
        healthy: false,
        services: {},
        error: error.message
      };
    }
  }

  /**
   * Reset services (useful for testing)
   */
  static reset(): void {
    ServiceFactory.clearCache();
    this.initPromise = null;
  }

  private static async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      await this.initialize();
    }
  }
}

// Export convenience functions for use in API routes
export const initializeServices = () => ServiceInitializer.initialize();
export const getUserKnowledgeService = () => ServiceInitializer.getUserKnowledgeService();
export const getContextOrchestrationService = () => ServiceInitializer.getContextOrchestrationService();
export const getAgentMemoryService = () => ServiceInitializer.getAgentMemoryService();
export const servicesHealthCheck = () => ServiceInitializer.healthCheck(); 