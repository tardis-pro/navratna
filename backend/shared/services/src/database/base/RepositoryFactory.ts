import { EntityTarget, ObjectLiteral } from 'typeorm';
import { TypeOrmService } from '../../typeormService';

// Repository imports
import {
  UserRepository,
  RefreshTokenRepository,
  PasswordResetTokenRepository,
} from '../repositories/UserRepository';
import { AgentRepository } from '../repositories/AgentRepository';
import { AuditRepository } from '../repositories/AuditRepository';
import {
  ToolRepository,
  ToolExecutionRepository,
  ToolUsageRepository,
} from '../repositories/ToolRepository';
import {
  OperationRepository,
  OperationStateRepository,
  OperationCheckpointRepository,
  StepResultRepository,
} from '../repositories/OperationRepository';
import {
  SecurityPolicyRepository,
  ApprovalWorkflowRepository,
  ApprovalDecisionRepository,
} from '../repositories/SecurityRepository';
import { DiscussionRepository } from '../repositories/DiscussionRepository';
import { LLMProviderRepository } from '../repositories/LLMProviderRepository';
import { UserLLMProviderRepository } from '../repositories/UserLLMProviderRepository';
import { KnowledgeRepository } from '../repositories/knowledge.repository';

/**
 * Repository Factory - Centralized repository creation and management
 * Provides singleton instances and dependency injection for repositories
 */
export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private repositoryInstances = new Map<string, unknown>();
  private typeormService: TypeOrmService;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

  public static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory();
    }
    return RepositoryFactory.instance;
  }

  /**
   * Get or create repository instance
   */
  private getOrCreateRepository<T>(key: string, factory: () => T): T {
    if (!this.repositoryInstances.has(key)) {
      this.repositoryInstances.set(key, factory());
    }
    return this.repositoryInstances.get(key);
  }

  // Core repositories
  public getUserRepository(): UserRepository {
    return this.getOrCreateRepository('user', () => new UserRepository());
  }

  public getRefreshTokenRepository(): RefreshTokenRepository {
    return this.getOrCreateRepository('refreshToken', () => new RefreshTokenRepository());
  }

  public getPasswordResetTokenRepository(): PasswordResetTokenRepository {
    return this.getOrCreateRepository(
      'passwordResetToken',
      () => new PasswordResetTokenRepository()
    );
  }

  public getAgentRepository(): AgentRepository {
    return this.getOrCreateRepository('agent', () => new AgentRepository());
  }

  public getAuditRepository(): AuditRepository {
    return this.getOrCreateRepository('audit', () => new AuditRepository());
  }

  public getToolRepository(): ToolRepository {
    return this.getOrCreateRepository('tool', () => new ToolRepository());
  }

  public getToolExecutionRepository(): ToolExecutionRepository {
    return this.getOrCreateRepository('toolExecution', () => new ToolExecutionRepository());
  }

  public getToolUsageRepository(): ToolUsageRepository {
    return this.getOrCreateRepository('toolUsage', () => new ToolUsageRepository());
  }

  public getOperationRepository(): OperationRepository {
    return this.getOrCreateRepository('operation', () => new OperationRepository());
  }

  public getOperationStateRepository(): OperationStateRepository {
    return this.getOrCreateRepository('operationState', () => new OperationStateRepository());
  }

  public getOperationCheckpointRepository(): OperationCheckpointRepository {
    return this.getOrCreateRepository(
      'operationCheckpoint',
      () => new OperationCheckpointRepository()
    );
  }

  public getStepResultRepository(): StepResultRepository {
    return this.getOrCreateRepository('stepResult', () => new StepResultRepository());
  }

  public getSecurityPolicyRepository(): SecurityPolicyRepository {
    return this.getOrCreateRepository('securityPolicy', () => new SecurityPolicyRepository());
  }

  public getApprovalWorkflowRepository(): ApprovalWorkflowRepository {
    return this.getOrCreateRepository('approvalWorkflow', () => new ApprovalWorkflowRepository());
  }

  public getApprovalDecisionRepository(): ApprovalDecisionRepository {
    return this.getOrCreateRepository('approvalDecision', () => new ApprovalDecisionRepository());
  }

  public getDiscussionRepository(): DiscussionRepository {
    return this.getOrCreateRepository('discussion', () => new DiscussionRepository());
  }

  public getLLMProviderRepository(): LLMProviderRepository {
    return this.getOrCreateRepository('llmProvider', () => new LLMProviderRepository());
  }

  public getUserLLMProviderRepository(): UserLLMProviderRepository {
    return this.getOrCreateRepository('userLLMProvider', () => new UserLLMProviderRepository());
  }

  public getKnowledgeRepository(): KnowledgeRepository {
    return this.getOrCreateRepository('knowledge', () => {
      const { KnowledgeItemEntity } = require('../../entities/knowledge-item.entity.ts');
      const {
        KnowledgeRelationshipEntity,
      } = require('../../entities/knowledge-relationship.entity.ts');
      const knowledgeRepo = this.typeormService.getRepository(KnowledgeItemEntity);
      const relationshipRepo = this.typeormService.getRepository(KnowledgeRelationshipEntity);
      return new KnowledgeRepository(knowledgeRepo, relationshipRepo);
    });
  }

  /**
   * Generic repository getter for any entity
   */
  public getGenericRepository<T extends ObjectLiteral>(entity: EntityTarget<T>) {
    return this.typeormService.getRepository(entity);
  }

  /**
   * Clear all cached repository instances (useful for testing)
   */
  public clearCache(): void {
    this.repositoryInstances.clear();
  }

  /**
   * Get all repository instances (for debugging)
   */
  public getRepositoryInstances(): Map<string, unknown> {
    return new Map(this.repositoryInstances);
  }
}

// Export singleton instance
export const repositoryFactory = RepositoryFactory.getInstance();
