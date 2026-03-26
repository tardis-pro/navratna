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

export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private cache = new Map<string, unknown>();

  private constructor() {}

  static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) RepositoryFactory.instance = new RepositoryFactory();
    return RepositoryFactory.instance;
  }

  private get<T>(key: string, factory: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, factory());
    return this.cache.get(key) as T;
  }

  getUserRepository(): UserRepository {
    return this.get('user', () => new UserRepository());
  }
  getRefreshTokenRepository(): RefreshTokenRepository {
    return this.get('refreshToken', () => new RefreshTokenRepository());
  }
  getPasswordResetTokenRepository(): PasswordResetTokenRepository {
    return this.get('passwordResetToken', () => new PasswordResetTokenRepository());
  }
  getAgentRepository(): AgentRepository {
    return this.get('agent', () => new AgentRepository());
  }
  getAuditRepository(): AuditRepository {
    return this.get('audit', () => new AuditRepository());
  }
  getToolRepository(): ToolRepository {
    return this.get('tool', () => new ToolRepository());
  }
  getToolExecutionRepository(): ToolExecutionRepository {
    return this.get('toolExecution', () => new ToolExecutionRepository());
  }
  getToolUsageRepository(): ToolUsageRepository {
    return this.get('toolUsage', () => new ToolUsageRepository());
  }
  getOperationRepository(): OperationRepository {
    return this.get('operation', () => new OperationRepository());
  }
  getOperationStateRepository(): OperationStateRepository {
    return this.get('operationState', () => new OperationStateRepository());
  }
  getOperationCheckpointRepository(): OperationCheckpointRepository {
    return this.get('operationCheckpoint', () => new OperationCheckpointRepository());
  }
  getStepResultRepository(): StepResultRepository {
    return this.get('stepResult', () => new StepResultRepository());
  }
  getSecurityPolicyRepository(): SecurityPolicyRepository {
    return this.get('securityPolicy', () => new SecurityPolicyRepository());
  }
  getApprovalWorkflowRepository(): ApprovalWorkflowRepository {
    return this.get('approvalWorkflow', () => new ApprovalWorkflowRepository());
  }
  getApprovalDecisionRepository(): ApprovalDecisionRepository {
    return this.get('approvalDecision', () => new ApprovalDecisionRepository());
  }
  getDiscussionRepository(): DiscussionRepository {
    return this.get('discussion', () => new DiscussionRepository());
  }
  getLLMProviderRepository(): LLMProviderRepository {
    return this.get('llmProvider', () => new LLMProviderRepository());
  }
  getUserLLMProviderRepository(): UserLLMProviderRepository {
    return this.get('userLLMProvider', () => new UserLLMProviderRepository());
  }
  getKnowledgeRepository(): KnowledgeRepository {
    return this.get('knowledge', () => new KnowledgeRepository());
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const repositoryFactory = RepositoryFactory.getInstance();
