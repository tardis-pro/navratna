import { logger } from '@uaip/utils';
import { TypeOrmService } from './typeormService.js';
import { UserService } from './services/UserService.js';
import { ToolService } from './services/ToolService.js';
import { AgentService } from './services/AgentService.js';
import { ProjectService } from './services/ProjectService.js';
import { OperationService } from './services/OperationService.js';
import { SecurityService } from './services/SecurityService.js';
import { AuditService } from './services/AuditService.js';
import { DiscussionService } from './discussionService.js';
import { ArtifactService } from './services/ArtifactService.js';

/**
 * Refactored DatabaseService that delegates to domain-specific services
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private typeormService: TypeOrmService;
  private isClosing: boolean = false;
  private isInitialized: boolean = false;

  // Domain services
  private userService: UserService;
  private toolService: ToolService;
  private agentService: AgentService;
  private projectService: ProjectService;
  private operationService: OperationService;
  private securityService: SecurityService;
  private auditService: AuditService;
  private discussionService: DiscussionService;
  private artifactService: ArtifactService;

  constructor() {
    this.typeormService = TypeOrmService.getInstance();
    
    // Initialize domain services
    this.userService = UserService.getInstance();
    this.toolService = ToolService.getInstance();
    this.agentService = AgentService.getInstance();
    this.projectService = ProjectService.getInstance();
    this.operationService = OperationService.getInstance();
    this.securityService = SecurityService.getInstance();
    this.auditService = AuditService.getInstance();
    // this.discussionService = DiscussionService.getInstance(); // DiscussionService has a different constructor
    this.artifactService = ArtifactService.getInstance();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initializeConnection();
    }
  }

  private async initializeConnection(): Promise<void> {
    try {
      await this.typeormService.initialize();
      this.isInitialized = true;
      logger.info('Database connection initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database connection:', error);
      throw error;
    }
  }

  public async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  public async isHealthy(): Promise<boolean> {
    try {
      return await this.typeormService.isHealthy();
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isClosing) {
      logger.warn('Database is already closing');
      return;
    }

    this.isClosing = true;

    try {
      await this.typeormService.close();
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect database:', error);
      throw error;
    } finally {
      this.isClosing = false;
      this.isInitialized = false;
    }
  }

  // User-related delegations
  public getUserRepository() {
    return this.userService.getUserRepository();
  }

  public getRefreshTokenRepository() {
    return this.userService.getRefreshTokenRepository();
  }

  public getPasswordResetTokenRepository() {
    return this.userService.getPasswordResetTokenRepository();
  }

  public getOAuthProviderRepository() {
    return this.userService.getOAuthProviderRepository();
  }

  public getOAuthStateRepository() {
    return this.userService.getOAuthStateRepository();
  }

  public getMFAChallengeRepository() {
    return this.userService.getMFAChallengeRepository();
  }

  public getSessionRepository() {
    return this.userService.getSessionRepository();
  }

  // Tool-related delegations
  public getToolRepository() {
    return this.toolService.getToolRepository();
  }

  public getToolExecutionRepository() {
    return this.toolService.getToolExecutionRepository();
  }

  public getToolUsageRepository() {
    return this.toolService.getToolUsageRepository();
  }

  public getToolAssignmentRepository() {
    return this.toolService.getToolAssignmentRepository();
  }

  // Agent-related delegations
  public getAgentRepository() {
    return this.agentService.getAgentRepository();
  }

  public getPersonaRepository() {
    return this.agentService.getPersonaRepository();
  }

  public getCapabilityRepository() {
    return this.agentService.getCapabilityRepository();
  }

  public getAgentCapabilityMetricRepository() {
    return this.agentService.getAgentCapabilityMetricRepository();
  }

  public getPersonaAnalyticsRepository() {
    return this.agentService.getPersonaAnalyticsRepository();
  }

  public getAgentOAuthConnectionRepository() {
    return this.agentService.getAgentOAuthConnectionRepository();
  }

  public getConversationContextRepository() {
    return this.agentService.getConversationContextRepository();
  }

  // Project-related delegations
  public getProjectRepository() {
    return this.projectService.getProjectRepository();
  }

  public getProjectMemberRepository() {
    return this.projectService.getProjectMemberRepository();
  }

  public getProjectFileRepository() {
    return this.projectService.getProjectFileRepository();
  }

  // Operation-related delegations
  public getOperationRepository() {
    return this.operationService.getOperationRepository();
  }

  public getOperationStateRepository() {
    return this.operationService.getOperationStateRepository();
  }

  public getOperationCheckpointRepository() {
    return this.operationService.getOperationCheckpointRepository();
  }

  public getStepResultRepository() {
    return this.operationService.getStepResultRepository();
  }

  // Security-related delegations
  public getSecurityPolicyRepository() {
    return this.securityService.getSecurityPolicyRepository();
  }

  public getApprovalWorkflowRepository() {
    return this.securityService.getApprovalWorkflowRepository();
  }

  public getApprovalDecisionRepository() {
    return this.securityService.getApprovalDecisionRepository();
  }

  // Audit-related delegations
  public getAuditRepository() {
    return this.auditService.getAuditRepository();
  }

  // Discussion-related delegations
  public getDiscussionRepository() {
    return this.discussionService.getDiscussionRepository();
  }

  // Artifact-related delegations
  public getArtifactRepository() {
    return this.artifactService.getArtifactRepository();
  }

  public getArtifactDeploymentRepository() {
    return this.artifactService.getArtifactDeploymentRepository();
  }

  // Expose domain services for direct access
  public get users(): UserService {
    return this.userService;
  }

  public get tools(): ToolService {
    return this.toolService;
  }

  public get agents(): AgentService {
    return this.agentService;
  }

  public get projects(): ProjectService {
    return this.projectService;
  }

  public get operations(): OperationService {
    return this.operationService;
  }

  public get security(): SecurityService {
    return this.securityService;
  }

  public get audit(): AuditService {
    return this.auditService;
  }

  public get discussions(): DiscussionService {
    return this.discussionService;
  }

  public get artifacts(): ArtifactService {
    return this.artifactService;
  }

  // Legacy compatibility methods
  public async getRepository<T>(entityClass: any): Promise<any> {
    await this.ensureInitialized();
    return this.typeormService.dataSource.getRepository(entityClass);
  }

  public get dataSource() {
    return this.typeormService.dataSource;
  }
}
