import { logger } from '@uaip/utils';
import { TypeOrmService } from './typeormService.js';
import { EntityTarget, ObjectLiteral } from 'typeorm';
import { UserService } from './services/UserService.js';
import { ToolService } from './services/ToolService.js';
import { AgentService } from './services/AgentService.js';
import { ProjectService } from './services/ProjectService.js';
import { OperationService } from './services/OperationService.js';
import { SecurityService } from './services/SecurityService.js';
import { AuditService } from './services/AuditService.js';
import { DiscussionService } from './discussionService.js';
import { ArtifactService } from './services/ArtifactService.js';
import { SessionService } from './services/SessionService.js';
import { MFAService } from './services/MFAService.js';
import { OAuthService } from './services/OAuthService.js';
import { MCPService } from './services/MCPService.js';
import { KnowledgeBootstrapService } from './knowledge-graph/bootstrap.service.js';
import { seedDatabase } from './database/seedDatabase.js';
import { KnowledgeRepository } from './database/repositories/knowledge.repository.js';
import { QdrantService } from './qdrant.service.js';
import { ToolGraphDatabase } from './database/toolGraphDatabase.js';
import { SmartEmbeddingService } from './knowledge-graph/smart-embedding.service.js';

// Database error handling
export class DatabaseError extends Error {
  public readonly code?: string;
  public readonly details?: any;

  constructor(message: string, options?: { code?: string; details?: any; originalError?: string }) {
    super(message);
    this.name = 'DatabaseError';
    this.code = options?.code;
    this.details = options?.details;

    if (options?.originalError) {
      this.stack = `${this.stack}\nCaused by: ${options.originalError}`;
    }
  }
}

/**
 * Refactored DatabaseService that delegates to domain-specific services
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private typeormService: TypeOrmService;
  private isClosing: boolean = false;
  private isInitialized: boolean = false;
  private logger = logger;

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
  private sessionService: SessionService;
  private mfaService: MFAService;
  private oauthService: OAuthService;
  private mcpService: MCPService;

  // Knowledge graph services (lazy-loaded)
  private _knowledgeRepository: KnowledgeRepository | null = null;
  private _qdrantService: QdrantService | null = null;
  private _toolGraphDatabase: ToolGraphDatabase | null = null;
  private _smartEmbeddingService: SmartEmbeddingService | null = null;

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
    this.artifactService = ArtifactService.getInstance();
    this.sessionService = SessionService.getInstance();
    this.mfaService = MFAService.getInstance();
    this.oauthService = OAuthService.getInstance();
    this.mcpService = MCPService.getInstance();
    
    // Note: DiscussionService will be lazily initialized when accessed via getter
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

  // Knowledge graph service getters (lazy initialization)
  public async getKnowledgeRepository(): Promise<KnowledgeRepository> {
    if (!this._knowledgeRepository) {
      await this.ensureInitialized();
      const dataSource = this.typeormService.getDataSource();
      const { KnowledgeItemEntity } = await import('./entities/knowledge-item.entity.js');
      const { KnowledgeRelationshipEntity } = await import('./entities/knowledge-relationship.entity.js');
      
      this._knowledgeRepository = new KnowledgeRepository(
        dataSource.getRepository(KnowledgeItemEntity),
        dataSource.getRepository(KnowledgeRelationshipEntity)
      );
    }
    return this._knowledgeRepository;
  }

  public async getQdrantService(): Promise<QdrantService> {
    if (!this._qdrantService) {
      this._qdrantService = new QdrantService();
    }
    return this._qdrantService;
  }

  public async getToolGraphDatabase(): Promise<ToolGraphDatabase> {
    if (!this._toolGraphDatabase) {
      this._toolGraphDatabase = new ToolGraphDatabase();
      // verifyConnectivity now handles failures gracefully and doesn't throw
      await this._toolGraphDatabase.verifyConnectivity();
      const status = this._toolGraphDatabase.getConnectionStatus();
      if (status.isConnected) {
        logger.info('Neo4j connection verified for ToolGraphDatabase');
      } else {
        logger.warn('Neo4j connection failed for ToolGraphDatabase - service will continue with reduced functionality');
      }
    }
    return this._toolGraphDatabase;
  }

  public async getSmartEmbeddingService(): Promise<SmartEmbeddingService> {
    if (!this._smartEmbeddingService) {
      this._smartEmbeddingService = new SmartEmbeddingService();
    }
    return this._smartEmbeddingService;
  }

  public async initialize(): Promise<void> {
    await this.ensureInitialized();
    
    // Run database seeding and knowledge sync if enabled
    if (process.env.TYPEORM_SYNC === 'true') {
      await this.runDatabaseSeedingAndSync();
    }
  }

  private async runDatabaseSeedingAndSync(): Promise<void> {
    try {
      this.logger.info('Starting database migrations and seeding process...');
      
      // Run database migrations first
      const dataSource = this.typeormService.getDataSource();
      this.logger.info('Running database migrations...');
      await dataSource.runMigrations();
      this.logger.info('Database migrations completed successfully');
      
      // Run database seeding
      this.logger.info('Starting database seeding...');
      await seedDatabase(dataSource);
      
      // Initialize knowledge graph services
      const knowledgeRepository = await this.getKnowledgeRepository();
      const qdrantService = await this.getQdrantService();
      const toolGraphDatabase = await this.getToolGraphDatabase();
      const smartEmbeddingService = await this.getSmartEmbeddingService();
      
      // Create and run knowledge bootstrap service
      const bootstrapService = new KnowledgeBootstrapService(
        knowledgeRepository,
        qdrantService,
        toolGraphDatabase,
        smartEmbeddingService
      );
      
      // This discovers data from any source and syncs bidirectionally
      await bootstrapService.runPostSeedSync();
      
      // Get and log statistics
      const stats = await bootstrapService.getSyncStatistics();
      this.logger.info('Database seeded and knowledge synced successfully', { stats });
      
    } catch (seedError) {
      this.logger.error('Database seeding failed, but continuing service initialization', {
        error: seedError.message,
        stack: seedError.stack
      });
      // Don't throw the error - allow service to continue without seeding
      // This prevents the entire service from failing due to seeding issues
    }
  }

  public async getDataSource() {
    await this.ensureInitialized();
    return this.typeormService.getDataSource();
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

  // OAuth-related delegations
  public getOAuthProviderRepository() {
    return this.oauthService.getOAuthProviderRepository();
  }

  public getOAuthStateRepository() {
    return this.oauthService.getOAuthStateRepository();
  }

  public getAgentOAuthConnectionRepository() {
    return this.oauthService.getAgentOAuthConnectionRepository();
  }

  // MFA-related delegations
  public getMFAChallengeRepository() {
    return this.mfaService.getMFAChallengeRepository();
  }

  // Session-related delegations
  public getSessionRepository() {
    return this.sessionService.getSessionRepository();
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
    // TODO: Implement persona repository
    return this.typeormService.getRepository('personas' as any);
  }

  public getCapabilityRepository() {
    return this.agentService.getCapabilityRepository();
  }

  public getAgentCapabilityMetricRepository() {
    // TODO: Implement capability metrics repository
    return this.typeormService.getRepository('agent_capability_metrics' as any);
  }

  public getPersonaAnalyticsRepository() {
    // TODO: Implement persona analytics repository
    return this.typeormService.getRepository('persona_analytics' as any);
  }

  public getConversationContextRepository() {
    // TODO: Implement conversation context repository
    return this.typeormService.getRepository('conversation_contexts' as any);
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

  // Discussion-related delegations (placeholder for now)
  public getDiscussionRepository() {
    // TODO: Implement proper discussion repository when DiscussionService is refactored
    return this.typeormService.getRepository('discussions' as any);
  }

  // Artifact-related delegations
  public getArtifactRepository() {
    return this.artifactService.getArtifactRepository();
  }

  public getArtifactDeploymentRepository() {
    return this.artifactService.getArtifactDeploymentRepository();
  }

  // LLM provider repository delegation to UserService
  public get llmProviderRepository() {
    return this.userService.getLLMProviderRepository();
  }

  public get userLLMProviderRepository() {
    return this.userService.getUserLLMProviderRepository();
  }
  public getUserLLMPreferenceRepository() {
    return this.userService.getUserLLMPreferenceRepository();
  }
  public getAgentLLMPreferenceRepository() {
    return this.agentService.getAgentLLMPreferenceRepository();
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
    if (!this.discussionService) {
      // DiscussionService not initialized. Use getDiscussionService() instead for proper async initialization.
      throw new Error('DiscussionService not initialized. Use getDiscussionService() instead.');
    }
    return this.discussionService;
  }

  public get artifacts(): ArtifactService {
    return this.artifactService;
  }

  public get sessions(): SessionService {
    return this.sessionService;
  }

  public get mfa(): MFAService {
    return this.mfaService;
  }

  public get oauth(): OAuthService {
    return this.oauthService;
  }

  // Service getters for dependency injection
  public getAgentService(): AgentService {
    return this.agentService;
  }

  public getMCPService(): MCPService {
    // Initialize the MCP service with the dataSource if not already done
    try {
      const dataSource = this.typeormService.getDataSource();
      this.mcpService.setDataSource(dataSource);
    } catch (error) {
      logger.warn('DataSource not available for MCP service:', error);
    }
    return this.mcpService;
  }

  public async getDiscussionService(): Promise<DiscussionService> {
    if (!this.discussionService) {
      // Lazy initialize DiscussionService with required dependencies
      const { DiscussionService } = await import('./discussionService.js');
      const { EventBusService } = await import('./eventBusService.js');
      const { PersonaService } = await import('./personaService.js');
      
      const personaService = new PersonaService({
        databaseService: this,
        eventBusService: EventBusService.getInstance(),
        enableAnalytics: false,
        enableRecommendations: false,
        enableCaching: false
      });

      this.discussionService = new DiscussionService({
        databaseService: this,
        eventBusService: EventBusService.getInstance(),
        personaService: personaService,
        enableRealTimeEvents: true,
        enableAnalytics: true,
        maxParticipants: 10,
        defaultTurnTimeout: 30000
      });
    }
    return this.discussionService;
  }

  // Legacy compatibility methods
  public async getRepository(entityClass: any): Promise<any> {
    await this.ensureInitialized();
    return this.typeormService.getDataSource().getRepository(entityClass);
  }

  public get dataSource() {
    return this.typeormService.getDataSource();
  }

  // Health check method
  public async healthCheck(): Promise<any> {
    return await this.typeormService.healthCheck();
  }

  // Close method
  public async close(): Promise<void> {
    this.isClosing = true;
    await this.typeormService.close();
  }













  // Enhanced database operations from database/DatabaseService.ts

  /**
   * Bulk insert with conflict resolution
   */
  public async bulkInsert<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    records: Partial<T>[],
    options?: {
      onConflict?: 'ignore' | 'update';
      conflictColumns?: string[];
      updateColumns?: string[];
    }
  ): Promise<void> {
    await this.ensureInitialized();

    if (!records || records.length === 0) {
      return;
    }

    try {
      const repository = this.typeormService.getRepository(entity);

      if (options?.onConflict === 'ignore') {
        // Use upsert with ignore
        await repository
          .createQueryBuilder()
          .insert()
          .into(entity)
          .values(records)
          .orIgnore()
          .execute();
      } else if (options?.onConflict === 'update' && options.conflictColumns && options.updateColumns) {
        // Use upsert with update
        const queryBuilder = repository
          .createQueryBuilder()
          .insert()
          .into(entity)
          .values(records);

        const updateColumns = options.updateColumns;

        await queryBuilder
          .orUpdate(updateColumns, options.conflictColumns)
          .execute();
      } else {
        // Simple insert
        await repository.save(records as any[]);
      }

      logger.info('Bulk insert completed', {
        entity: entity.toString(),
        recordCount: records.length,
        conflictResolution: options?.onConflict
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Bulk insert failed', {
        entity: entity.toString(),
        recordCount: records.length,
        error: errorMessage
      });
      throw new DatabaseError('Bulk insert operation failed', {
        code: 'BULK_INSERT_ERROR',
        details: { entity: entity.toString(), recordCount: records.length },
        originalError: errorMessage
      });
    }
  }

  /**
   * Database seeding method
   */
  public async seedDatabase(): Promise<void> {
    try {
      logger.info('Starting database seeding...');

      const dataSource = this.typeormService.getDataSource();

      if (!dataSource.isInitialized) {
        throw new Error('DataSource not initialized');
      }

      // Use the existing DatabaseSeeder infrastructure
      const { DatabaseSeeder } = await import('./database/seeders/DatabaseSeeder.js');
      const seeder = new DatabaseSeeder(dataSource);
      await seeder.seedAll();

      logger.info('Database seeding completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to seed database', { error: errorMessage });
      throw new DatabaseError('Database seeding failed', {
        originalError: errorMessage
      });
    }
  }

  /**
   * Database maintenance methods
   */
  public async vacuum(tableName?: string): Promise<void> {
    await this.ensureInitialized();
    const manager = this.typeormService.getEntityManager();
    const query = tableName ? `VACUUM ${tableName}` : 'VACUUM';
    await manager.query(query);
    logger.info('Database vacuum completed', { tableName });
  }

  public async analyze(tableName?: string): Promise<void> {
    await this.ensureInitialized();
    const manager = this.typeormService.getEntityManager();
    const query = tableName ? `ANALYZE ${tableName}` : 'ANALYZE';
    await manager.query(query);
    logger.info('Database analyze completed', { tableName });
  }

  public async reindex(indexName?: string): Promise<void> {
    await this.ensureInitialized();
    const manager = this.typeormService.getEntityManager();
    const query = indexName ? `REINDEX INDEX ${indexName}` : 'REINDEX DATABASE';
    await manager.query(query);
    logger.info('Database reindex completed', { indexName });
  }

  /**
   * Get entity manager for advanced operations
   */
  public getEntityManager() {
    return this.typeormService.getEntityManager();
  }

  /**
   * Execute raw SQL query (use with caution)
   */
  public async executeQuery<T = any>(
    query: string,
    parameters?: any[]
  ): Promise<T[]> {
    await this.ensureInitialized();
    try {
      const result = await this.typeormService.getEntityManager().query(query, parameters);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Query execution failed', { query, error: errorMessage });
      throw new DatabaseError('Query execution failed', {
        code: 'QUERY_ERROR',
        details: { query },
        originalError: errorMessage
      });
    }
  }

  // State management delegation methods
  /**
   * Save operation state
   */
  public async saveOperationState(operationId: string, state: any): Promise<void> {
    await this.ensureInitialized();
    return this.operationService.getOperationStateRepository().saveOperationState(operationId, state);
  }

  /**
   * Get operation state
   */
  public async getOperationState(operationId: string): Promise<any> {
    await this.ensureInitialized();
    return this.operationService.getOperationStateRepository().getOperationState(operationId);
  }

  /**
   * Update operation state
   */
  public async updateOperationState(operationId: string, state: any, updates: any): Promise<void> {
    await this.ensureInitialized();
    return this.operationService.getOperationStateRepository().updateOperationState(operationId, state, updates);
  }

  /**
   * Save checkpoint
   */
  public async saveCheckpoint(operationId: string, checkpoint: any): Promise<void> {
    await this.ensureInitialized();
    return this.operationService.getOperationCheckpointRepository().saveCheckpoint(operationId, checkpoint);
  }

  /**
   * Get checkpoint
   */
  public async getCheckpoint(operationId: string, checkpointId: string): Promise<any> {
    await this.ensureInitialized();
    return this.operationService.getOperationCheckpointRepository().getCheckpoint(operationId, checkpointId);
  }

  /**
   * List checkpoints
   */
  public async listCheckpoints(operationId: string): Promise<any[]> {
    await this.ensureInitialized();
    return this.operationService.getOperationCheckpointRepository().listCheckpoints(operationId);
  }

  /**
   * Delete old operation states
   */
  public async deleteOldOperationStates(cutoffDate: Date): Promise<number> {
    await this.ensureInitialized();
    return this.operationService.getOperationStateRepository().deleteOldOperationStates(cutoffDate);
  }

  /**
   * Get state statistics
   */
  public async getStateStatistics(): Promise<{
    totalOperations: number;
    activeOperations: number;
    totalCheckpoints: number;
    averageStateSize: number;
  }> {
    await this.ensureInitialized();
    return this.operationService.getOperationStateRepository().getStateStatistics();
  }

  // Generic CRUD methods for backward compatibility
  public async create<T>(entityClass: any, data: Partial<T>): Promise<T> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    const entity = repository.create(data as any);
    return await repository.save(entity) as T;
  }

  public async findById<T>(entityClass: any, id: string, relations?: string[]): Promise<T | null> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    return await repository.findOne({ 
      where: { id } as any,
      relations
    }) as T | null;
  }

  public async update<T>(entityClass: any, id: string, data: Partial<T>): Promise<T | null> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    await repository.update(id, data as any);
    return await repository.findOne({ where: { id } as any }) as T | null;
  }

  public async findMany<T>(entityClass: any, conditions: any, options?: any): Promise<T[]> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    return await repository.find({ 
      where: conditions,
      ...options
    }) as T[];
  }

  public async count(entityClass: any, conditions?: any): Promise<number> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    return await repository.count({ where: conditions });
  }

  // Discussion-specific search method
  public async searchDiscussions(filters: any): Promise<{ discussions: any[]; total: number }> {
    await this.ensureInitialized();
    // Delegate to discussion repository if it exists
    if (this.discussionService) {
      // For now, return empty results
      return { discussions: [], total: 0 };
    }
    return { discussions: [], total: 0 };
  }

  // Security validation methods (placeholders until implemented)
  public async createApprovalWorkflow(data: any): Promise<any> {
    await this.ensureInitialized();
    return this.security.getApprovalWorkflowRepository().create(data);
  }

  public async getUserAuthDetails(userId: string): Promise<any> {
    await this.ensureInitialized();
    return this.users.findUserById(userId);
  }

  public async getUserPermissions(userId: string): Promise<any> {
    await this.ensureInitialized();
    // TODO: Implement proper permissions lookup
    return { rolePermissions: [], directPermissions: [] };
  }

  public async getUserRiskData(userId: string): Promise<any> {
    await this.ensureInitialized();
    // TODO: Implement risk data lookup
    return { riskLevel: 'low', factors: [] };
  }

  public async getUserHighestRole(userId: string): Promise<string> {
    await this.ensureInitialized();
    const user = await this.users.findUserById(userId);
    return user?.role || 'user';
  }

  // Agent Intelligence Service placeholders - to be migrated to domain services
  // TODO: Migrate these to AgentService and AuditService per Technical Plan Phase 1.2
  
  public async storeAgentState(agentId: string, state: any): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing agent state (placeholder)', { agentId });
    // TODO: Delegate to AgentService
  }

  public async storeAgentCapabilities(agentId: string, capabilities: any): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing agent capabilities (placeholder)', { agentId });
    // TODO: Delegate to AgentService
  }

  public async storeLearningRecord(agentId: string, record: any): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing learning record (placeholder)', { agentId });
    // TODO: Delegate to AuditService
  }

  public async getOperationById(operationId: string): Promise<any> {
    await this.ensureInitialized();
    logger.debug('Getting operation (placeholder)', { operationId });
    // TODO: Delegate to OperationService
    return this.operations.getOperationRepository().findById(operationId);
  }

  public async storeAgentActivity(agentId: string, activity: any): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing agent activity (placeholder)', { agentId });
    // TODO: Delegate to AuditService
  }

  public async getAgentActivities(agentId: string, timeRange?: any): Promise<any[]> {
    await this.ensureInitialized();
    logger.debug('Getting agent activities (placeholder)', { agentId, timeRange });
    // TODO: Delegate to AuditService
    return [];
  }

  public async getLearningRecords(agentId: string, timeRange?: any): Promise<any[]> {
    await this.ensureInitialized();
    logger.debug('Getting learning records (placeholder)', { agentId, timeRange });
    // TODO: Delegate to AuditService
    return [];
  }

  public async storeExecutionPlan(plan: any): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing execution plan (placeholder)', { planId: plan.id });
    // TODO: Delegate to OperationService
  }
}
