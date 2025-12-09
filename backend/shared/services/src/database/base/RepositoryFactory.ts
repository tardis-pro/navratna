import { EntityTarget, ObjectLiteral } from 'typeorm';
import { TypeOrmService } from '../../typeormService.js';

// Repository imports
import {
  UserRepository,
  RefreshTokenRepository,
  PasswordResetTokenRepository,
} from '../repositories/UserRepository.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { AuditRepository } from '../repositories/AuditRepository.js';
import {
  ToolRepository,
  ToolExecutionRepository,
  ToolUsageRepository,
} from '../repositories/ToolRepository.js';
import {
  OperationRepository,
  OperationStateRepository,
  OperationCheckpointRepository,
  StepResultRepository,
} from '../repositories/OperationRepository.js';
import {
  SecurityPolicyRepository,
  ApprovalWorkflowRepository,
  ApprovalDecisionRepository,
} from '../repositories/SecurityRepository.js';
import { DiscussionRepository } from '../repositories/DiscussionRepository.js';
import { LLMProviderRepository } from '../repositories/LLMProviderRepository.js';
import { UserLLMProviderRepository } from '../repositories/UserLLMProviderRepository.js';
import { KnowledgeRepository } from '../repositories/knowledge.repository.js';

/**
 * Repository Factory - Centralized repository creation and management
 * Provides singleton instances and dependency injection for repositories
 */
export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private repositoryInstances = new Map<string, any>();
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
      const { KnowledgeItemEntity } = require('../../entities/knowledge-item.entity.js');
      const {
        KnowledgeRelationshipEntity,
      } = require('../../entities/knowledge-relationship.entity.js');
      const knowledgeRepo = this.typeormService.getRepository(KnowledgeItemEntity) as any;
      const relationshipRepo = this.typeormService.getRepository(
        KnowledgeRelationshipEntity
      ) as any;
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
  public getRepositoryInstances(): Map<string, any> {
    return new Map(this.repositoryInstances);
  }
}

// Export singleton instance
export const repositoryFactory = RepositoryFactory.getInstance();
