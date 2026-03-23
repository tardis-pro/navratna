import { logger } from '@uaip/utils';
import { TypeOrmService } from './typeormService';
import {
  EntityTarget,
  ObjectLiteral,
  Repository,
  FindManyOptions,
  FindOptionsWhere,
  DeepPartial as _DeepPartial,
  FindOptionsWhere as _FindOptionsWhere,
} from 'typeorm';
import { UserService } from './services/UserService';
import { ToolService } from './services/ToolService';
import { AgentService } from './services/AgentService';
import { ProjectService } from './services/ProjectService';
import { OperationService } from './services/OperationService';
import { SecurityService } from './services/SecurityService';
import { AuditService } from './services/AuditService';
import { DiscussionService } from './discussionService';
import { ArtifactService } from './services/ArtifactService';
import { SessionService } from './services/SessionService';
import { MFAService } from './services/MFAService';
import { OAuthService } from './services/OAuthService';
import { MCPService } from './services/MCPService';
import { KnowledgeBootstrapService } from './knowledge-graph/bootstrap.service';
import { seedDatabase } from './database/seedDatabase';
import { KnowledgeRepository } from './database/repositories/knowledge.repository';
import { QdrantService } from './qdrant.service';
import { ToolGraphDatabase } from './database/toolGraphDatabase';
import { SmartEmbeddingService } from './knowledge-graph/smart-embedding.service';
import { Persona } from './entities/persona.entity';
import { AgentCapabilityMetric } from './entities/agentCapabilityMetric.entity';
import { PersonaAnalytics as _PersonaAnalytics } from './entities/personaAnalytics.entity';
import { ConversationContext as _ConversationContext } from './entities/conversationContext.entity';
import { Discussion as _Discussion } from './entities/discussion.entity';

// Database error handling
export class DatabaseError extends Error {
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: { code?: string; details?: Record<string, unknown>; originalError?: string }
  ) {
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
      const { KnowledgeItemEntity } = await import('./entities/knowledge-item.entity');
      const { KnowledgeRelationshipEntity } =
        await import('./entities/knowledge-relationship.entity');

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
        logger.warn(
          'Neo4j connection failed for ToolGraphDatabase - service will continue with reduced functionality'
        );
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

      // This discovers data from unknown source and syncs bidirectionally
      await bootstrapService.runPostSeedSync();

      // Get and log statistics
      const stats = await bootstrapService.getSyncStatistics();
      this.logger.info('Database seeded and knowledge synced successfully', { stats });
    } catch (seedError) {
      this.logger.error('Database seeding failed, but continuing service initialization', {
        error: seedError.message,
        stack: seedError.stack,
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

  public getPersonaRepository(): Repository<Persona> {
    return this.typeormService.getRepository(Persona);
  }

  public getCapabilityRepository() {
    return this.agentService.getCapabilityRepository();
  }

  public getAgentCapabilityMetricRepository(): Repository<AgentCapabilityMetric> {
    return this.typeormService.getRepository(AgentCapabilityMetric);
  }

  public getPersonaAnalyticsRepository() {
    // TODO: Implement persona analytics repository
    return this.typeormService.getRepository('persona_analytics' as EntityTarget<ObjectLiteral>);
  }

  public getConversationContextRepository() {
    // TODO: Implement conversation context repository
    return this.typeormService.getRepository(
      'conversation_contexts' as EntityTarget<ObjectLiteral>
    );
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
    return this.typeormService.getRepository('discussions' as EntityTarget<ObjectLiteral>);
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
      const { DiscussionService } = await import('./discussionService');
      const { EventBusService } = await import('./eventBusService');
      const { PersonaService } = await import('./personaService');

      const personaService = new PersonaService({
        databaseService: this as unknown as import('@uaip/infra/database').DatabaseService,
        eventBusService: EventBusService.getInstance(),
        enableAnalytics: false,
        enableRecommendations: false,
        enableCaching: false,
      });

      this.discussionService = new DiscussionService({
        databaseService: this as unknown as import('@uaip/infra/database').DatabaseService,
        eventBusService: EventBusService.getInstance(),
        personaService: personaService,
        enableRealTimeEvents: true,
        enableAnalytics: true,
        maxParticipants: 10,
        defaultTurnTimeout: 30000,
      });
    }
    return this.discussionService;
  }

  // Legacy compatibility methods
  public async getRepository<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>
  ): Promise<Repository<T>> {
    await this.ensureInitialized();
    return this.typeormService.getDataSource().getRepository(entityClass);
  }

  public get dataSource() {
    return this.typeormService.getDataSource();
  }

  // Health check method
  public async healthCheck(): Promise<unknown> {
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
      } else if (
        options?.onConflict === 'update' &&
        options.conflictColumns &&
        options.updateColumns
      ) {
        // Use upsert with update
        const queryBuilder = repository.createQueryBuilder().insert().into(entity).values(records);

        const updateColumns = options.updateColumns;

        await queryBuilder.orUpdate(updateColumns, options.conflictColumns).execute();
      } else {
        // Simple insert
        await repository.save(records as _DeepPartial<T>[]);
      }

      logger.info('Bulk insert completed', {
        entity: entity.toString(),
        recordCount: records.length,
        conflictResolution: options?.onConflict,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Bulk insert failed', {
        entity: entity.toString(),
        recordCount: records.length,
        error: errorMessage,
      });
      throw new DatabaseError('Bulk insert operation failed', {
        code: 'BULK_INSERT_ERROR',
        details: { entity: entity.toString(), recordCount: records.length },
        originalError: errorMessage,
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
      const { DatabaseSeeder } = await import('./database/seeders/DatabaseSeeder');
      const seeder = new DatabaseSeeder(dataSource);
      await seeder.seedAll();

      logger.info('Database seeding completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to seed database', { error: errorMessage });
      throw new DatabaseError('Database seeding failed', {
        originalError: errorMessage,
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
  public async executeQuery<T = unknown>(query: string, parameters?: unknown[]): Promise<T[]> {
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
        originalError: errorMessage,
      });
    }
  }

  // State management delegation methods
  /**
   * Save operation state
   */
  public async saveOperationState(operationId: string, state: unknown): Promise<void> {
    await this.ensureInitialized();
    return this.operationService
      .getOperationStateRepository()
      .saveOperationState(operationId, state as Record<string, unknown>);
  }

  /**
   * Get operation state
   */
  public async getOperationState(operationId: string): Promise<unknown> {
    await this.ensureInitialized();
    return this.operationService.getOperationStateRepository().getOperationState(operationId);
  }

  /**
   * Update operation state
   */
  public async updateOperationState(
    operationId: string,
    state: unknown,
    updates: unknown
  ): Promise<void> {
    await this.ensureInitialized();
    return this.operationService
      .getOperationStateRepository()
      .updateOperationState(
        operationId,
        state as Record<string, unknown>,
        updates as Record<string, unknown>
      );
  }

  /**
   * Save checkpoint
   */
  public async saveCheckpoint(operationId: string, checkpoint: unknown): Promise<void> {
    await this.ensureInitialized();
    return this.operationService
      .getOperationCheckpointRepository()
      .saveCheckpoint(operationId, checkpoint as Record<string, unknown>);
  }

  /**
   * Get checkpoint
   */
  public async getCheckpoint(operationId: string, checkpointId: string): Promise<unknown> {
    await this.ensureInitialized();
    return this.operationService
      .getOperationCheckpointRepository()
      .getCheckpoint(operationId, checkpointId);
  }

  /**
   * List checkpoints
   */
  public async listCheckpoints(operationId: string): Promise<unknown[]> {
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
  public async create<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    data: Partial<T>
  ): Promise<T> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    const entity = repository.create(data as _DeepPartial<T>) as T;
    return await repository.save(entity);
  }

  public async findById<T>(
    entityClass: EntityTarget<ObjectLiteral>,
    id: string,
    relations?: string[]
  ): Promise<T | null> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    return (await repository.findOne({
      where: { id } as FindOptionsWhere<ObjectLiteral>,
      relations,
    })) as T | null;
  }

  public async update<T>(
    entityClass: EntityTarget<ObjectLiteral>,
    id: string,
    data: Partial<T>
  ): Promise<T | null> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    await repository.update(id, data as ObjectLiteral);
    return (await repository.findOne({
      where: { id } as FindOptionsWhere<ObjectLiteral>,
    })) as T | null;
  }

  public async delete<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    id: string
  ): Promise<boolean> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    const result = await repository.delete(id);
    return (result.affected ?? 0) > 0;
  }

  public async findMany<T>(
    entityClass: EntityTarget<ObjectLiteral>,
    conditions: FindOptionsWhere<ObjectLiteral>,
    options?: FindManyOptions<ObjectLiteral>
  ): Promise<T[]> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    return (await repository.find({
      where: conditions,
      ...options,
    })) as T[];
  }

  public async count(
    entityClass: EntityTarget<ObjectLiteral>,
    conditions?: FindOptionsWhere<ObjectLiteral>
  ): Promise<number> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    return await repository.count({ where: conditions });
  }

  public async searchDiscussions(
    _filters: unknown
  ): Promise<{ discussions: unknown[]; total: number }> {
    await this.ensureInitialized();
    // Delegate to discussion repository if it exists
    if (this.discussionService) {
      // For now, return empty results
      return { discussions: [], total: 0 };
    }
    return { discussions: [], total: 0 };
  }

  // Security validation methods (placeholders until implemented)
  public async createApprovalWorkflow(data: unknown): Promise<unknown> {
    await this.ensureInitialized();
    return this.security.getApprovalWorkflowRepository().create(data);
  }

  public async getUserAuthDetails(userId: string): Promise<unknown> {
    await this.ensureInitialized();
    return this.users.findUserById(userId);
  }

  public async getUserPermissions(_userId: string): Promise<unknown> {
    await this.ensureInitialized();
    // TODO: Implement proper permissions lookup
    return { rolePermissions: [], directPermissions: [] };
  }

  public async getUserRiskData(_userId: string): Promise<unknown> {
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

  public async storeAgentState(agentId: string, _state: unknown): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing agent state (placeholder)', { agentId });
    // TODO: Delegate to AgentService
  }

  public async storeAgentCapabilities(agentId: string, _capabilities: unknown): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing agent capabilities (placeholder)', { agentId });
    // TODO: Delegate to AgentService
  }

  public async storeLearningRecord(agentId: string, _record: unknown): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing learning record (placeholder)', { agentId });
    // TODO: Delegate to AuditService
  }

  public async getOperationById(operationId: string): Promise<unknown> {
    await this.ensureInitialized();
    logger.debug('Getting operation (placeholder)', { operationId });
    // TODO: Delegate to OperationService
    return this.operations.getOperationRepository().findById(operationId);
  }

  public async storeAgentActivity(agentId: string, _activity: unknown): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing agent activity (placeholder)', { agentId });
    // TODO: Delegate to AuditService
  }

  public async getAgentActivities(agentId: string, timeRange?: unknown): Promise<unknown[]> {
    await this.ensureInitialized();
    logger.debug('Getting agent activities (placeholder)', { agentId, timeRange });
    // TODO: Delegate to AuditService
    return [];
  }

  public async getLearningRecords(agentId: string, timeRange?: unknown): Promise<unknown[]> {
    await this.ensureInitialized();
    logger.debug('Getting learning records (placeholder)', { agentId, timeRange });
    // TODO: Delegate to AuditService
    return [];
  }

  public async storeExecutionPlan(plan: unknown): Promise<void> {
    await this.ensureInitialized();
    const planId =
      typeof plan === 'object' && plan !== null && 'id' in plan ? String(plan.id) : 'unknown';
    logger.debug('Storing execution plan (placeholder)', { planId });
    // TODO: Delegate to OperationService
  }
}
