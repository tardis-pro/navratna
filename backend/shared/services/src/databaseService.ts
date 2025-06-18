import { Repository, QueryRunner, EntityTarget, ObjectLiteral, EntityManager, LessThan } from 'typeorm';
import { config } from '@uaip/config';
import { logger, DatabaseError } from '@uaip/utils';
import { AuditEventType, SecurityLevel } from '@uaip/types';
import { TypeOrmService } from './typeormService.js';

// Import new repositories
import { UserRepository } from './database/repositories/UserRepository.js';
import { RefreshTokenRepository } from './database/repositories/UserRepository.js';
import { PasswordResetTokenRepository } from './database/repositories/UserRepository.js';
import { AuditRepository } from './database/repositories/AuditRepository.js';
import { ToolRepository } from './database/repositories/ToolRepository.js';
import { ToolExecutionRepository } from './database/repositories/ToolRepository.js';
import { ToolUsageRepository } from './database/repositories/ToolRepository.js';
import { OperationRepository } from './database/repositories/OperationRepository.js';
import { OperationStateRepository } from './database/repositories/OperationRepository.js';
import { OperationCheckpointRepository } from './database/repositories/OperationRepository.js';
import { StepResultRepository } from './database/repositories/OperationRepository.js';
import { AgentRepository } from './database/repositories/AgentRepository.js';
import { SecurityPolicyRepository } from './database/repositories/SecurityRepository.js';
import { ApprovalWorkflowRepository } from './database/repositories/SecurityRepository.js';
import { ApprovalDecisionRepository } from './database/repositories/SecurityRepository.js';
import { CapabilityRepository } from './database/repositories/CapabilityRepository.js';
import { DiscussionRepository } from './database/repositories/DiscussionRepository.js';

// Import entities for backward compatibility
import { Operation } from './entities/operation.entity.js';
import { OperationState } from './entities/operationState.entity.js';
import { OperationCheckpoint } from './entities/operationCheckpoint.entity.js';
import { StepResult } from './entities/stepResult.entity.js';
import { Agent } from './entities/agent.entity.js';
import { Persona } from './entities/persona.entity.js';
import { Artifact } from './entities/artifact.entity.js';
import { ArtifactDeployment } from './entities/artifactDeployment.entity.js';
import { ToolDefinition } from './entities/toolDefinition.entity.js';
import { ToolExecution } from './entities/toolExecution.entity.js';
import { ToolUsageRecord } from './entities/toolUsageRecord.entity.js';
import { ConversationContext } from './entities/conversationContext.entity.js';
import { ApprovalWorkflow } from './entities/approvalWorkflow.entity.js';
import { ApprovalDecision } from './entities/approvalDecision.entity.js';
import { AuditEvent } from './entities/auditEvent.entity.js';
import { SecurityPolicy } from './entities/securityPolicy.entity.js';
import { AgentCapabilityMetric } from './entities/agentCapabilityMetric.entity.js';
import { PersonaAnalytics } from './entities/personaAnalytics.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { RefreshTokenEntity } from './entities/refreshToken.entity.js';
import { PasswordResetTokenEntity } from './entities/passwordResetToken.entity.js';
import { DatabaseSeeder } from './database/seedDatabase.js';

export class DatabaseService {
  private static instance: DatabaseService;
  private typeormService: TypeOrmService;
  private isClosing: boolean = false;
  private isInitialized: boolean = false;

  // Repository instances - will be initialized lazily
  private _userRepository: UserRepository | null = null;
  private _refreshTokenRepository: RefreshTokenRepository | null = null;
  private _passwordResetTokenRepository: PasswordResetTokenRepository | null = null;
  private _auditRepository: AuditRepository | null = null;
  private _toolRepository: ToolRepository | null = null;
  private _toolExecutionRepository: ToolExecutionRepository | null = null;
  private _toolUsageRepository: ToolUsageRepository | null = null;
  private _operationRepository: OperationRepository | null = null;
  private _operationStateRepository: OperationStateRepository | null = null;
  private _operationCheckpointRepository: OperationCheckpointRepository | null = null;
  private _stepResultRepository: StepResultRepository | null = null;
  private _agentRepository: AgentRepository | null = null;
  private _securityPolicyRepository: SecurityPolicyRepository | null = null;
  private _approvalWorkflowRepository: ApprovalWorkflowRepository | null = null;
  private _approvalDecisionRepository: ApprovalDecisionRepository | null = null;
  private _capabilityRepository: CapabilityRepository | null = null;
  private _discussionRepository: DiscussionRepository | null = null;

  constructor() {
    // Debug: Log the actual config values being used
    console.log('[DB DEBUG] Database config:', {
      host: config.database.postgres.host,
      port: config.database.postgres.port,
      user: config.database.postgres.user,
      password: config.database.postgres.password ? '***' : 'undefined',
      database: config.database.postgres.database
    });

    this.typeormService = TypeOrmService.getInstance();
    
    // Don't initialize repositories here - do it lazily when needed
    // Don't initialize connection in constructor - do it explicitly when needed
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initializeConnection();
    }
  }

  // Lazy getters for repositories
  private get userRepository(): UserRepository {
    if (!this._userRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._userRepository = new UserRepository();
    }
    return this._userRepository;
  }

  private get refreshTokenRepository(): RefreshTokenRepository {
    if (!this._refreshTokenRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._refreshTokenRepository = new RefreshTokenRepository();
    }
    return this._refreshTokenRepository;
  }

  private get passwordResetTokenRepository(): PasswordResetTokenRepository {
    if (!this._passwordResetTokenRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._passwordResetTokenRepository = new PasswordResetTokenRepository();
    }
    return this._passwordResetTokenRepository;
  }

  private get auditRepository(): AuditRepository {
    if (!this._auditRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._auditRepository = new AuditRepository();
    }
    return this._auditRepository;
  }

  private get toolRepository(): ToolRepository {
    if (!this._toolRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._toolRepository = new ToolRepository();
    }
    return this._toolRepository;
  }

  private get toolExecutionRepository(): ToolExecutionRepository {
    if (!this._toolExecutionRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._toolExecutionRepository = new ToolExecutionRepository();
    }
    return this._toolExecutionRepository;
  }

  private get toolUsageRepository(): ToolUsageRepository {
    if (!this._toolUsageRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._toolUsageRepository = new ToolUsageRepository();
    }
    return this._toolUsageRepository;
  }

  private get operationRepository(): OperationRepository {
    if (!this._operationRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._operationRepository = new OperationRepository();
    }
    return this._operationRepository;
  }

  private get operationStateRepository(): OperationStateRepository {
    if (!this._operationStateRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._operationStateRepository = new OperationStateRepository();
    }
    return this._operationStateRepository;
  }

  private get operationCheckpointRepository(): OperationCheckpointRepository {
    if (!this._operationCheckpointRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._operationCheckpointRepository = new OperationCheckpointRepository();
    }
    return this._operationCheckpointRepository;
  }

  private get stepResultRepository(): StepResultRepository {
    if (!this._stepResultRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._stepResultRepository = new StepResultRepository();
    }
    return this._stepResultRepository;
  }

  private get agentRepository(): AgentRepository {
    if (!this._agentRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._agentRepository = new AgentRepository();
    }
    return this._agentRepository;
  }

  private get securityPolicyRepository(): SecurityPolicyRepository {
    if (!this._securityPolicyRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._securityPolicyRepository = new SecurityPolicyRepository();
    }
    return this._securityPolicyRepository;
  }

  private get approvalWorkflowRepository(): ApprovalWorkflowRepository {
    if (!this._approvalWorkflowRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._approvalWorkflowRepository = new ApprovalWorkflowRepository();
    }
    return this._approvalWorkflowRepository;
  }

  private get approvalDecisionRepository(): ApprovalDecisionRepository {
    if (!this._approvalDecisionRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._approvalDecisionRepository = new ApprovalDecisionRepository();
    }
    return this._approvalDecisionRepository;
  }

  private get capabilityRepository(): CapabilityRepository {
    if (!this._capabilityRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._capabilityRepository = new CapabilityRepository();
    }
    return this._capabilityRepository;
  }

  private get discussionRepository(): DiscussionRepository {
    if (!this._discussionRepository) {
      if (!this.isInitialized) {
        throw new Error('DatabaseService not initialized. Call ensureInitialized() first.');
      }
      this._discussionRepository = new DiscussionRepository();
    }
    return this._discussionRepository;
  }

  private async initializeConnection(): Promise<void> {
    try {
      await this.typeormService.initialize();
      this.isInitialized = true;
      logger.info('DatabaseService initialized with TypeORM');
    } catch (error) {
      logger.error('Failed to initialize TypeORM connection', { error });
      throw error;
    }
  }

  // Singleton pattern for database connection
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // Public method to ensure initialization
  public async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  // Get repository for any entity
  public async getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Promise<Repository<T>> {
    await this.ensureInitialized();
    return this.typeormService.getRepository(entity);
  }

  // Get entity manager for complex operations
  public async getEntityManager(): Promise<EntityManager> {
    await this.ensureInitialized();
    return this.typeormService.getDataSource().manager;
  }

  // Get a query runner for transaction handling
  public async getClient(): Promise<QueryRunner> {
    try {
      const queryRunner = this.typeormService.getDataSource().createQueryRunner();
      await queryRunner.connect();
      logger.debug('Database client acquired for transaction');
      return queryRunner;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to acquire database client', { error: errorMessage });
      throw new DatabaseError('Failed to acquire database client', {
        originalError: errorMessage
      });
    }
  }

  // Release a client back to the pool
  public releaseClient(client: QueryRunner): void {
    try {
      client.release();
      logger.debug('Database client released');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error releasing database client', { error: errorMessage });
    }
  }

  // Execute multiple operations in a transaction
  public async transaction<T>(
    callback: (manager: EntityManager) => Promise<T>
  ): Promise<T> {
    return await this.typeormService.transaction(callback);
  }

  // Health check method
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      totalConnections: number;
      idleConnections: number;
      waitingConnections: number;
      responseTime?: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      // Ensure TypeORM is initialized before health check
      await this.ensureInitialized();
      
      // Use TypeORM to test connection
      const manager = await this.getEntityManager();
      await manager.query('SELECT 1 as health_check');
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        details: {
          connected: true,
          totalConnections: 0, // TypeORM doesn't expose pool stats directly
          idleConnections: 0,
          waitingConnections: 0,
          responseTime
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Database health check failed', { error: errorMessage });
      
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          totalConnections: 0,
          idleConnections: 0,
          waitingConnections: 0
        }
      };
    }
  }

  // Get connection pool statistics
  public getPoolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } {
    // TypeORM doesn't expose pool stats directly, return defaults
    return {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0
    };
  }

  // Bulk insert helper using TypeORM
  public async bulkInsert<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    records: Partial<T>[],
    options?: {
      onConflict?: 'ignore' | 'update' | 'error';
      conflictColumns?: string[];
      updateColumns?: string[];
    }
  ): Promise<number> {
    if (records.length === 0) {
      return 0;
    }

    const startTime = Date.now();
    
    try {
      const repository = await this.getRepository(entity);
      
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
      
      const duration = Date.now() - startTime;
      logger.info('Bulk insert completed', {
        entity: entity.toString(),
        rowCount: records.length,
        insertedCount: records.length,
        duration
      });

      return records.length;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Bulk insert failed', {
        entity: entity.toString(),
        rowCount: records.length,
        error: errorMessage
      });
      throw error;
    }
  }

  // Close the connection (for graceful shutdown)
  public async close(): Promise<void> {
    if (this.isClosing) {
      logger.debug('Database connection close already in progress, skipping');
      return;
    }

    this.isClosing = true;
    
    try {
      await this.typeormService.close();
      logger.info('Database connection closed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error closing database connection', { error: errorMessage });
      throw error;
    }
  }

  // Stream query results using TypeORM QueryBuilder
  public async *streamQuery<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    conditions?: Record<string, any>,
    batchSize: number = 1000
  ): AsyncGenerator<T[], void, unknown> {
    try {
      const repository = await this.getRepository(entity);
      logger.debug('Starting streaming query', {
        entity: entity.toString(),
        batchSize
      });

      let offset = 0;
      let hasMoreRows = true;

      while (hasMoreRows) {
        const queryBuilder = repository.createQueryBuilder();
        
        // Add WHERE conditions
        if (conditions) {
          Object.keys(conditions).forEach((key, index) => {
            if (index === 0) {
              queryBuilder.where(`${key} = :${key}`, { [key]: conditions[key] });
            } else {
              queryBuilder.andWhere(`${key} = :${key}`, { [key]: conditions[key] });
            }
          });
        }

        const results = await queryBuilder
          .limit(batchSize)
          .offset(offset)
          .getMany();
        
        if (results.length === 0) {
          hasMoreRows = false;
        } else {
          yield results;
          offset += batchSize;
          hasMoreRows = results.length === batchSize;
        }
      }
    } catch (error) {
      logger.error('Streaming query failed', { entity: entity.toString(), error });
      throw error;
    }
  }

  public async seedDatabase(): Promise<void> {
    const dataSource = this.typeormService.getDataSource();
    const seeder = new DatabaseSeeder(dataSource);
    await seeder.seedAll();
    
    console.log('🎉 Database seeding completed successfully! Yo');
  }

  // Methods for StateManagerService using TypeORM
  public async saveOperationState(operationId: string, state: any): Promise<void> {
    return await this.operationStateRepository.saveOperationState(operationId, state);
  }

  public async getOperationState(operationId: string): Promise<any> {
    return await this.operationStateRepository.getOperationState(operationId);
  }

  public async updateOperationState(operationId: string, state: any, updates: any): Promise<void> {
    return await this.operationStateRepository.updateOperationState(operationId, state, updates);
  }

  public async saveCheckpoint(operationId: string, checkpoint: any): Promise<void> {
    return await this.operationCheckpointRepository.saveCheckpoint(operationId, checkpoint);
  }

  public async getCheckpoint(operationId: string, checkpointId: string): Promise<any> {
    return await this.operationCheckpointRepository.getCheckpoint(operationId, checkpointId);
  }

  public async listCheckpoints(operationId: string): Promise<any[]> {
    return await this.operationCheckpointRepository.listCheckpoints(operationId);
  }

  public async deleteOldOperationStates(cutoffDate: Date): Promise<number> {
    return await this.operationStateRepository.deleteOldOperationStates(cutoffDate);
  }

  public async getStateStatistics(): Promise<{
    totalOperations: number;
    activeOperations: number;
    totalCheckpoints: number;
    averageStateSize: number;
  }> {
    return await this.operationStateRepository.getStateStatistics();
  }

  // Methods for OrchestrationEngine using TypeORM
  public async getOperation(operationId: string): Promise<Operation | null> {
    return await this.operationRepository.findById(operationId);
  }

  public async createOperation(operationData: Partial<Operation>): Promise<Operation> {
    return await this.operationRepository.create(operationData);
  }

  public async saveStepResult(operationId: string, result: any): Promise<void> {
    return await this.stepResultRepository.saveStepResult(operationId, result);
  }

    public async updateOperationResult(operationId: string, result: any): Promise<void> {
    return await this.operationRepository.updateOperationResult(operationId, result);
  }

  // Database schema initialization methods
  public async initializeTables(): Promise<void> {
    try {
      logger.info('Initializing database tables...');

      // TypeORM handles table creation through migrations and synchronization
      const dataSource = this.typeormService.getDataSource();
      
      if (!dataSource.isInitialized) {
        throw new Error('DataSource not initialized');
      }

      // Check if tables exist using TypeORM metadata
      const metadata = dataSource.entityMetadatas;
      const hasOperationsTable = metadata.some(meta => meta.tableName === 'operations');

      if (!hasOperationsTable) {
        // Run synchronization to create tables
        await dataSource.synchronize();
      }

      logger.info('Database tables initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to initialize database tables', { error: errorMessage });
      throw new DatabaseError('Database initialization failed', {
        originalError: errorMessage
      });
    }
  }

  // Generic CRUD operations using TypeORM
  public async findById<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    id: string
  ): Promise<T | null> {
    try {
      const repository = await this.getRepository(entity);
      return await repository.findOne({ where: { id } as any });
    } catch (error) {
      logger.error('Failed to find by ID', { entity: entity.toString(), id, error });
      throw error;
    }
  }

  public async findMany<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    conditions: Record<string, any> = {},
    options: {
      orderBy?: Record<string, 'ASC' | 'DESC'>;
      limit?: number;
      offset?: number;
      relations?: string[];
    } = {}
  ): Promise<T[]> {
    try {
      const repository = await this.getRepository(entity);
      const queryBuilder = repository.createQueryBuilder();

      // Add WHERE conditions
      Object.keys(conditions).forEach((key, index) => {
        if (index === 0) {
          queryBuilder.where(`${key} = :${key}`, { [key]: conditions[key] });
        } else {
          queryBuilder.andWhere(`${key} = :${key}`, { [key]: conditions[key] });
        }
      });

      // Add ORDER BY
      if (options.orderBy) {
        Object.keys(options.orderBy).forEach(column => {
          queryBuilder.addOrderBy(column, options.orderBy![column]);
        });
      }

      // Add LIMIT and OFFSET
      if (options.limit) {
        queryBuilder.limit(options.limit);
      }
      if (options.offset) {
        queryBuilder.offset(options.offset);
      }

      // Add relations
      if (options.relations) {
        options.relations.forEach(relation => {
          queryBuilder.leftJoinAndSelect(relation, relation);
        });
      }

      return await queryBuilder.getMany();
    } catch (error) {
      logger.error('Failed to find many', { entity: entity.toString(), conditions, error });
      throw error;
    }
  }

  public async create<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    data: Partial<T>
  ): Promise<T> {
    try {
      const repository = await this.getRepository(entity);
      const newEntity = repository.create(data as any);
      return await repository.save(newEntity as any);
    } catch (error) {
      logger.error('Failed to create', { entity: entity.toString(), data, error });
      throw error;
    }
  }

  public async update<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    id: string,
    data: Partial<T>
  ): Promise<T | null> {
    try {
      const repository = await this.getRepository(entity);
      await repository.update(id, { ...data, updatedAt: new Date() } as any);
      return await repository.findOne({ where: { id } as any });
    } catch (error) {
      logger.error('Failed to update', { entity: entity.toString(), id, data, error });
      throw error;
    }
  }

  public async delete<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    id: string
  ): Promise<boolean> {
    try {
      const repository = await this.getRepository(entity);
      const result = await repository.delete(id);
      return (result.affected) > 0;
    } catch (error) {
      logger.error('Failed to delete', { entity: entity.toString(), id, error });
      throw error;
    }
  }

  public async count<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    conditions: Record<string, any> = {}
  ): Promise<number> {
    try {
      const repository = await this.getRepository(entity);
      return await repository.count({ where: conditions });
    } catch (error) {
      logger.error('Failed to count', { entity: entity.toString(), conditions, error });
      throw error;
    }
  }

  // Batch operations using TypeORM
  public async batchCreate<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    records: Partial<T>[]
  ): Promise<T[]> {
    if (records.length === 0) {
      return [];
    }

    try {
      const repository = await this.getRepository(entity);
      const entities = records.map(record => repository.create(record as any));
      return await repository.save(entities as any);
    } catch (error) {
      logger.error('Failed to batch create', { entity: entity.toString(), recordCount: records.length, error });
      throw error;
    }
  }

  public async batchUpdate<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    updates: Array<{ id: string; data: Partial<T> }>
  ): Promise<T[]> {
    if (updates.length === 0) {
      return [];
    }

    return await this.transaction(async (manager) => {
      const repository = manager.getRepository(entity);
      const results: T[] = [];
      
      for (const update of updates) {
        await repository.update(update.id, { ...update.data, updatedAt: new Date() } as any);
        const result = await repository.findOne({ where: { id: update.id } as any });
        if (result) {
          results.push(result);
        }
      }

      return results;
    });
  }

  // Database maintenance methods using TypeORM
  public async vacuum(tableName?: string): Promise<void> {
    const manager = await this.getEntityManager();
    const query = tableName ? `VACUUM ${tableName}` : 'VACUUM';
    await manager.query(query);
    logger.info('Database vacuum completed', { tableName });
  }

  public async analyze(tableName?: string): Promise<void> {
    const manager = await this.getEntityManager();
    const query = tableName ? `ANALYZE ${tableName}` : 'ANALYZE';
    await manager.query(query);
    logger.info('Database analyze completed', { tableName });
  }

  public async reindex(indexName?: string): Promise<void> {
    const manager = await this.getEntityManager();
    const query = indexName ? `REINDEX INDEX ${indexName}` : 'REINDEX DATABASE';
    await manager.query(query);
    logger.info('Database reindex completed', { indexName });
  }

  // ===== APPROVAL WORKFLOW METHODS =====
  
  /**
   * Create a new approval workflow
   */
  public async createApprovalWorkflow(workflowData: {
    id: string;
    operationId: string;
    requiredApprovers: string[];
    currentApprovers?: string[];
    status: string;
    expiresAt?: Date;
    metadata?: Record<string, any>;
  }): Promise<ApprovalWorkflow> {
    return await this.approvalWorkflowRepository.createApprovalWorkflow(workflowData);
  }

  /**
   * Get approval workflow by ID
   */
  public async getApprovalWorkflow(workflowId: string): Promise<ApprovalWorkflow | null> {
    return await this.approvalWorkflowRepository.findById(workflowId);
  }

  /**
   * Update approval workflow
   */
  public async updateApprovalWorkflow(workflowId: string, updates: Partial<ApprovalWorkflow>): Promise<ApprovalWorkflow | null> {
    return await this.approvalWorkflowRepository.update(workflowId, updates);
  }

  /**
   * Get workflows for a user (as approver)
   */
  public async getUserApprovalWorkflows(userId: string, status?: string): Promise<ApprovalWorkflow[]> {
    return await this.approvalWorkflowRepository.getUserApprovalWorkflows(userId, status);
  }

  /**
   * Get pending workflows for reminders
   */
  public async getPendingWorkflowsForReminders(reminderThreshold: Date): Promise<ApprovalWorkflow[]> {
    return await this.approvalWorkflowRepository.getPendingWorkflowsForReminders(reminderThreshold);
  }

  /**
   * Get expired workflows
   */
  public async getExpiredWorkflows(): Promise<ApprovalWorkflow[]> {
    try {
      await this.ensureInitialized();
      return await this.approvalWorkflowRepository.getExpiredWorkflows();
    } catch (error) {
      logger.error('DatabaseService: Failed to get expired workflows', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error
      });
      throw error;
    }
  }

  /**
   * Create approval decision
   */
  public async createApprovalDecision(decisionData: {
    id: string;
    workflowId: string;
    approverId: string;
    decision: 'approve' | 'reject';
    conditions?: string[];
    feedback?: string;
    decidedAt: Date;
  }): Promise<ApprovalDecision> {
    return await this.approvalDecisionRepository.createApprovalDecision(decisionData);
  }

  /**
   * Get approval decisions for a workflow
   */
  public async getApprovalDecisions(workflowId: string): Promise<ApprovalDecision[]> {
    return await this.approvalDecisionRepository.getApprovalDecisions(workflowId);
  }

  // ===== AUDIT EVENT METHODS =====

  /**
   * Create audit event
   */
  public async createAuditEvent(eventData: {
    eventType: AuditEventType;
    userId?: string;
    agentId?: string;
    resourceType?: string;
    resourceId?: string;
    details: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    riskLevel?: SecurityLevel;
    timestamp: Date;
  }): Promise<AuditEvent> {
    return await this.auditRepository.createAuditEvent(eventData);
  }

  /**
   * Query audit events with filters (excludes archived events by default)
   */
  public async queryAuditEvents(filters: {
    eventTypes?: AuditEventType[];
    userId?: string;
    agentId?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    riskLevel?: SecurityLevel;
    limit?: number;
    offset?: number;
    includeArchived?: boolean;
  }): Promise<AuditEvent[]> {
    return await this.auditRepository.queryAuditEvents(filters);
  }

  /**
   * Count recent events for security monitoring (excludes archived events)
   */
  public async countRecentAuditEvents(
    eventType: AuditEventType,
    userId?: string,
    minutesBack: number = 5,
    detailsFilter?: Record<string, any>
  ): Promise<number> {
    return await this.auditRepository.countRecentAuditEvents(eventType, userId, minutesBack, detailsFilter);
  }

  /**
   * Get audit events for date range (for reports, excludes archived events by default)
   */
  public async getAuditEventsInRange(startDate: Date, endDate: Date, includeArchived: boolean = false): Promise<AuditEvent[]> {
    return await this.auditRepository.getAuditEventsInRange(startDate, endDate, includeArchived);
  }

  /**
   * Archive old audit events (mark as archived instead of deleting)
   */
  public async archiveOldAuditEvents(compressionDate: Date): Promise<number> {
    return await this.auditRepository.archiveOldAuditEvents(compressionDate);
  }

  /**
   * Delete old archived audit events
   */
  public async deleteOldArchivedAuditEvents(cutoffDate: Date): Promise<number> {
    return await this.auditRepository.deleteOldArchivedAuditEvents(cutoffDate);
  }

  /**
   * Get audit events excluding archived ones (for normal queries)
   */
  public async getActiveAuditEvents(filters: {
    eventTypes?: AuditEventType[];
    userId?: string;
    agentId?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    riskLevel?: SecurityLevel;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]> {
    return await this.auditRepository.getActiveAuditEvents(filters);
  }

  /**
   * Search audit logs with complex filtering and pagination (for auditRoutes)
   */
  public async searchAuditLogs(filters: {
    eventType?: AuditEventType;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    ipAddress?: string;
    search?: string;
    sortBy?: 'timestamp' | 'eventType' | 'userId';
    sortOrder?: 'ASC' | 'DESC';
    limit?: number;
    offset?: number;
  }): Promise<{ logs: any[]; total: number }> {
    return await this.auditRepository.searchAuditLogs(filters);
  }

  /**
   * Get audit log by ID with user details
   */
  public async getAuditLogById(logId: string): Promise<any | null> {
    return await this.auditRepository.getAuditLogById(logId);
  }

  /**
   * Get distinct event types with counts
   */
  public async getAuditEventTypes(): Promise<Array<{ eventType: string; count: number }>> {
    return await this.auditRepository.getAuditEventTypes();
  }

  /**
   * Get audit statistics for a time period
   */
  public async getAuditStatistics(timeframe: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<{
    eventTypes: Array<{ eventType: string; count: number; uniqueUsers: number; uniqueIPs: number }>;
    hourlyDistribution: Array<{ hour: number; count: number }>;
    topUsers: Array<{ userId: string; email: string; eventCount: number }>;
    topIPAddresses: Array<{ ipAddress: string; eventCount: number; uniqueUsers: number }>;
    summary: { totalEvents: number; uniqueUsers: number; uniqueIPs: number };
  }> {
    return await this.auditRepository.getAuditStatistics(timeframe);
  }

  /**
   * Get user activity audit trail with pagination
   */
  public async getUserActivityAuditTrail(filters: {
    userId: string;
    startDate?: Date;
    endDate?: Date;
    eventType?: AuditEventType;
    limit?: number;
    offset?: number;
  }): Promise<{ activities: any[]; total: number }> {
    return await this.auditRepository.getUserActivityAuditTrail(filters);
  }

  // ===== SECURITY POLICY METHODS =====

  /**
   * Create security policy
   */
  public async createSecurityPolicy(policyData: {
    name: string;
    description: string;
    priority: number;
    isActive: boolean;
    conditions: any;
    actions: any;
    createdBy: string;
  }): Promise<SecurityPolicy> {
    return await this.securityPolicyRepository.createSecurityPolicy(policyData);
  }

  /**
   * Get security policy by ID
   */
  public async getSecurityPolicy(policyId: string): Promise<SecurityPolicy | null> {
    return await this.securityPolicyRepository.findById(policyId);
  }

  /**
   * Update security policy
   */
  public async updateSecurityPolicy(policyId: string, updates: Partial<SecurityPolicy>): Promise<SecurityPolicy | null> {
    return await this.securityPolicyRepository.update(policyId, updates);
  }

  /**
   * Delete security policy
   */
  public async deleteSecurityPolicy(policyId: string): Promise<boolean> {
    return await this.securityPolicyRepository.delete(policyId);
  }

  /**
   * Query security policies with filters and pagination
   */
  public async querySecurityPolicies(filters: {
    active?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ policies: SecurityPolicy[]; total: number }> {
    return await this.securityPolicyRepository.querySecurityPolicies(filters);
  }

  /**
   * Get security policy statistics
   */
  public async getSecurityPolicyStats(): Promise<{
    totalPolicies: number;
    activePolicies: number;
    inactivePolicies: number;
  }> {
    return await this.securityPolicyRepository.getSecurityPolicyStats();
  }

  // ===== USER MANAGEMENT METHODS =====

  /**
   * Create a new user
   */
  public async createUser(userData: {
    email: string;
    firstName?: string;
    lastName?: string;
    department?: string;
    role: string;
    passwordHash: string;
    securityClearance?: SecurityLevel;
    isActive?: boolean;
  }): Promise<UserEntity> {
    await this.ensureInitialized();
    return this.userRepository.createUser(userData);
  }

  /**
   * Get user by ID
   */
  public async getUserById(userId: string): Promise<UserEntity | null> {
    await this.ensureInitialized();
    return this.userRepository.findById(userId);
  }

  /**
   * Get user by email
   */
  public async getUserByEmail(email: string): Promise<UserEntity | null> {
    await this.ensureInitialized();
    return this.userRepository.getUserByEmail(email);
  }

  /**
   * Update user
   */
  public async updateUser(userId: string, updates: Partial<UserEntity>): Promise<UserEntity | null> {
    await this.ensureInitialized();
    return this.userRepository.update(userId, updates);
  }

  /**
   * Update user login attempts and lock status
   */
  public async updateUserLoginAttempts(userId: string, failedAttempts: number, lockedUntil?: Date): Promise<void> {
    return await this.userRepository.updateUserLoginAttempts(userId, failedAttempts, lockedUntil);
  }

  /**
   * Reset user login attempts and update last login
   */
  public async resetUserLoginAttempts(userId: string): Promise<void> {
    return await this.userRepository.resetUserLoginAttempts(userId);
  }

  /**
   * Soft delete user (deactivate)
   */
  public async deactivateUser(userId: string): Promise<void> {
    return await this.userRepository.deactivateUser(userId);
  }

  /**
   * Activate user
   */
  public async activateUser(userId: string): Promise<void> {
    return await this.userRepository.activateUser(userId);
  }

  /**
   * Query users with filters and pagination
   */
  public async queryUsers(filters: {
    search?: string;
    role?: string;
    isActive?: boolean;
    department?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: UserEntity[]; total: number }> {
    return await this.userRepository.queryUsers(filters);
  }

  // ===== REFRESH TOKEN METHODS =====

  /**
   * Create refresh token
   */
  public async createRefreshToken(tokenData: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<RefreshTokenEntity> {
    return await this.refreshTokenRepository.createRefreshToken(tokenData);
  }

  /**
   * Get refresh token with user data
   */
  public async getRefreshTokenWithUser(token: string): Promise<RefreshTokenEntity | null> {
    return await this.refreshTokenRepository.getRefreshTokenWithUser(token);
  }

  /**
   * Revoke refresh token
   */
  public async revokeRefreshToken(token: string): Promise<void> {
    return await this.refreshTokenRepository.revokeRefreshToken(token);
  }

  /**
   * Revoke all user refresh tokens
   */
  public async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    return await this.refreshTokenRepository.revokeAllUserRefreshTokens(userId);
  }

  /**
   * Clean up expired refresh tokens
   */
  public async cleanupExpiredRefreshTokens(): Promise<number> {
    return await this.refreshTokenRepository.cleanupExpiredRefreshTokens();
  }

  /**
   * Update user login tracking (failed attempts, last login, etc.)
   */
  public async updateUserLoginTracking(userId: string, updates: {
    failedLoginAttempts?: number;
    lockedUntil?: Date | null;
    lastLoginAt?: Date;
  }): Promise<void> {
    const repository = await this.getRepository(UserEntity);
    await repository.update(userId, {
      ...updates,
      updatedAt: new Date()
    });
  }

  /**
   * Update user password
   */
  public async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    const repository = await this.getRepository(UserEntity);
    await repository.update(userId, {
      passwordHash,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date()
    });
  }

  /**
   * Search users with filters
   */
  public async searchUsers(filters: {
    search?: string;
    role?: string;
    department?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ users: UserEntity[]; total: number }> {
    return await this.userRepository.searchUsers(filters);
  }

  /**
   * Update user profile
   */
  public async updateUserProfile(userId: string, updates: {
    firstName?: string;
    lastName?: string;
    department?: string;
    role?: string;
    securityClearance?: SecurityLevel;
    isActive?: boolean;
  }): Promise<UserEntity | null> {
    return await this.userRepository.updateUserProfile(userId, updates);
  }

  /**
   * Delete user (soft delete by setting inactive)
   */
  public async deleteUser(userId: string): Promise<boolean> {
    const repository = await this.getRepository(UserEntity);
    const result = await repository.update(userId, {
      isActive: false,
      updatedAt: new Date()
    });
    return (result.affected) > 0;
  }

  /**
   * Get user statistics
   */
  public async getUserStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    roleStats: Array<{ role: string; count: number }>;
    departmentStats: Array<{ department: string; count: number }>;
    recentActivity: Array<{ date: string; loginCount: number }>;
  }> {
    return await this.userRepository.getUserStats();
  }

  // ===== PASSWORD RESET TOKEN METHODS =====

  /**
   * Create password reset token
   */
  public async createPasswordResetToken(tokenData: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenEntity> {
    return await this.passwordResetTokenRepository.createPasswordResetToken(tokenData);
  }

  /**
   * Get password reset token with user data
   */
  public async getPasswordResetTokenWithUser(token: string): Promise<PasswordResetTokenEntity | null> {
    return await this.passwordResetTokenRepository.getPasswordResetTokenWithUser(token);
  }

  /**
   * Mark password reset token as used
   */
  public async markPasswordResetTokenAsUsed(token: string): Promise<void> {
    return await this.passwordResetTokenRepository.markPasswordResetTokenAsUsed(token);
  }

  /**
   * Clean up expired password reset tokens
   */
  public async cleanupExpiredPasswordResetTokens(): Promise<number> {
    return await this.passwordResetTokenRepository.cleanupExpiredPasswordResetTokens();
  }

  // Backward compatibility methods (DEPRECATED - use TypeORM methods instead)
  /**
   * @deprecated Use getRepository() and TypeORM methods instead
   */
  public async query<T = any>(
    text: string, 
    params?: any[]
  ): Promise<{ rows: T[]; rowCount: number | null; fields?: any[] }> {
    logger.warn('DEPRECATED: query() method used. Please migrate to TypeORM repository methods.');
    
    try {
      // Ensure initialization before executing query
      await this.ensureInitialized();
      
      const manager = await this.getEntityManager();
      const result = await manager.query(text, params);
      
      return {
        rows: Array.isArray(result) ? result : [result],
        rowCount: Array.isArray(result) ? result.length : 1,
        fields: []
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Deprecated query method failed', { error: errorMessage });
      throw new DatabaseError(`Query execution failed: ${errorMessage}`, {
        originalError: errorMessage
      });
    }
  }

  /**
   * Get user authentication details for security validation
   */
  public async getUserAuthDetails(userId: string): Promise<{
    id: string;
    isActive: boolean;
    role: string;
    securityClearance?: SecurityLevel;
  } | null> {
    return await this.userRepository.getUserAuthDetails(userId);
  }

  /**
   * Get user permissions for security validation
   */
  public async getUserPermissions(userId: string): Promise<{
    rolePermissions: Array<{ roleName: string; permissionType: string; operations: string[] }>;
    directPermissions: Array<{ permissionType: string; operations: string[] }>;
  }> {
    return await this.userRepository.getUserPermissions(userId);
  }

  /**
   * Get user risk assessment data
   */
  public async getUserRiskData(userId: string): Promise<{
    securityClearance?: SecurityLevel;
    role: string;
    lastLoginAt?: Date;
    createdAt: Date;
    recentActivityCount: number;
  } | null> {
    return await this.userRepository.getUserRiskData(userId);
  }

  /**
   * Get user's highest role for data access level determination
   */
  public async getUserHighestRole(userId: string): Promise<string | null> {
    return await this.userRepository.getUserHighestRole(userId);
  }

  /**
   * Search discussions with text query and filters
   */
  public async searchDiscussions(filters: {
    textQuery?: string;
    status?: string | string[];
    visibility?: string | string[];
    createdBy?: string | string[];
    organizationId?: string;
    teamId?: string;
    createdAfter?: Date;
    createdBefore?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ discussions: any[]; total: number }> {
    await this.ensureInitialized();
    return this.discussionRepository.searchDiscussions(filters);
  }

  /**
   * Search capabilities with complex filters
   */
  public async searchCapabilities(filters: {
    query?: string;
    type?: string;
    securityLevel?: string;
    limit?: number;
  }): Promise<any[]> {
    await this.ensureInitialized();
    return this.capabilityRepository.searchCapabilities(filters);
  }

  /**
   * Get capabilities by IDs
   */
  public async getCapabilitiesByIds(capabilityIds: string[]): Promise<any[]> {
    await this.ensureInitialized();
    return this.capabilityRepository.getCapabilitiesByIds(capabilityIds);
  }

  /**
   * Get single capability by ID
   */
  public async getCapabilityById(capabilityId: string): Promise<any | null> {
    await this.ensureInitialized();
    return this.capabilityRepository.getCapabilityById(capabilityId);
  }

  /**
   * Get capability dependencies
   */
  public async getCapabilityDependencies(dependencyIds: string[]): Promise<any[]> {
    await this.ensureInitialized();
    return this.capabilityRepository.getCapabilityDependencies(dependencyIds);
  }

  /**
   * Get capabilities that depend on a given capability (dependents)
   */
  public async getCapabilityDependents(capabilityId: string): Promise<any[]> {
    await this.ensureInitialized();
    return this.capabilityRepository.getCapabilityDependents(capabilityId);
  }

  /**
   * Advanced capability search with multiple filters
   */
  public async searchCapabilitiesAdvanced(searchParams: {
    query?: string;
    types?: string[];
    tags?: string[];
    securityLevel?: string;
    includeExperimental?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ capabilities: any[]; totalCount: number }> {
    await this.ensureInitialized();
    return this.capabilityRepository.searchCapabilitiesAdvanced(searchParams);
  }

  /**
   * Get agent configuration and capabilities
   */
  public async getAgentCapabilitiesConfig(agentId: string): Promise<{
    intelligenceConfig?: any;
    securityContext?: any;
  } | null> {
    return await this.agentRepository.getAgentCapabilitiesConfig(agentId);
  }

  // ===== AGENT INTELLIGENCE METHODS =====

  /**
   * Get all active agents with limit
   */
  public async getActiveAgents(limit?: number): Promise<any[]> {
    return await this.agentRepository.getActiveAgents(limit);
  }

  /**
   * Get agent by ID with active status check
   */
  public async getActiveAgentById(agentId: string): Promise<any | null> {
    return await this.agentRepository.getActiveAgentById(agentId);
  }

  /**
   * Create a new agent
   * COMPOSITION MODEL: Agent → Persona
   */
  public async createAgent(agentData: {
    id?: string;
    name: string;
    role: string;
    // COMPOSITION MODEL: personaId reference
    personaId?: string;
    // Legacy persona data for backwards compatibility
    legacyPersona?: any;
    // Deprecated: old persona field (for backwards compatibility)
    persona?: any;
    intelligenceConfig: any;
    securityContext: any;
    createdBy?: string;
    capabilities?: string[];
  }): Promise<any> {
    return await this.agentRepository.createAgent(agentData);
  }

  /**
   * Update an agent
   * COMPOSITION MODEL: Agent → Persona
   */
  public async updateAgent(agentId: string, updateData: {
    name?: string;
    role?: string;
    // COMPOSITION MODEL: personaId reference
    personaId?: string;
    // Legacy persona data for backwards compatibility
    legacyPersona?: any;
    // Deprecated: old persona field (for backwards compatibility)
    persona?: any;
    intelligenceConfig?: any;
    securityContext?: any;
    capabilities?: string[];
  }): Promise<any | null> {
    return await this.agentRepository.updateAgent(agentId, updateData);
  }

  /**
   * Store execution plan
   */
  public async storeExecutionPlan(planData: {
    id: string;
    type: string;
    agentId: string;
    plan?: any;
    steps?: any;
    dependencies?: any;
    estimatedDuration?: number;
    priority?: string;
    constraints?: any;
    metadata?: any;
    context?: any;
    createdAt: Date;
  }): Promise<void> {
    return await this.agentRepository.storeExecutionPlan(planData);
  }

  /**
   * Get operation by ID
   */
  public async getOperationById(operationId: string): Promise<any | null> {
    return await this.agentRepository.getOperationById(operationId);
  }

  /**
   * Store enhanced learning record
   */
  public async storeEnhancedLearningRecord(recordData: {
    agentId: string;
    operationId: string;
    learningData: any;
    confidenceAdjustments: any;
  }): Promise<void> {
    return await this.agentRepository.storeEnhancedLearningRecord(recordData);
  }

  /**
   * Deactivate an agent (set is_active to false)
   */
  public async deactivateAgent(agentId: string): Promise<boolean> {
    return await this.agentRepository.deactivateAgent(agentId);
  }

  // ===== TOOL MANAGEMENT METHODS =====
  // All tool management methods delegate to appropriate repositories

  public async createTool(toolData: Partial<ToolDefinition>): Promise<ToolDefinition> {
    return await this.toolRepository.createTool(toolData);
  }

  public async getTool(id: string): Promise<ToolDefinition | null> {
    return await this.toolRepository.findById(id);
  }

  public async getTools(filters: {
    category?: string;
    enabled?: boolean;
    securityLevel?: string;
    limit?: number; 
    offset?: number;
  } = {}): Promise<ToolDefinition[]> {
    return await this.toolRepository.getTools(filters);
  }

  public async updateTool(id: string, updates: Partial<ToolDefinition>): Promise<ToolDefinition | null> {
    return await this.toolRepository.update(id, updates);
  }

  public async deleteTool(id: string): Promise<boolean> {
    return await this.toolRepository.delete(id);
  }

  public async searchTools(searchQuery: string, filters: {
    category?: string;
    securityLevel?: string;
    limit?: number;
  } = {}): Promise<ToolDefinition[]> {
    return await this.toolRepository.searchTools(searchQuery, filters);
  }

  public async createToolExecution(executionData: Partial<ToolExecution>): Promise<ToolExecution> {
    return await this.toolExecutionRepository.createToolExecution(executionData);
  }

  public async updateToolExecution(id: string, updates: Partial<ToolExecution>): Promise<ToolExecution | null> {
    return await this.toolExecutionRepository.update(id, updates);
  }

  public async getToolExecution(id: string): Promise<ToolExecution | null> {
    return await this.toolExecutionRepository.getToolExecution(id);
  }

  public async getToolExecutions(filters: {
    toolId?: string;
    agentId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolExecution[]> {
    return await this.toolExecutionRepository.getToolExecutions(filters);
  }

  public async recordToolUsage(usageData: Partial<ToolUsageRecord>): Promise<ToolUsageRecord> {
    return await this.toolUsageRepository.recordToolUsage(usageData);
  }

  public async getToolUsageStats(filters: {
    toolId?: string;
    agentId?: string;
    days?: number;
  } = {}): Promise<any[]> {
    return await this.toolUsageRepository.getToolUsageStats(filters);
  }

  private async incrementToolUsageCount(toolId: string): Promise<void> {
    return await this.toolRepository.incrementToolUsageCount(toolId);
  }

  public async updateToolSuccessMetrics(toolId: string, wasSuccessful: boolean, executionTime?: number): Promise<void> {
    return await this.toolRepository.updateToolSuccessMetrics(toolId, wasSuccessful, executionTime);
  }

  public async getToolPerformanceAnalytics(toolId?: string): Promise<{
    tools: Array<{
      id: string;
      name: string;
      totalExecutions: number;
      successfulExecutions: number;
      successRate: number;
      averageExecutionTime: number;
      lastUsedAt: Date;
    }>;
  }> {
    return await this.toolRepository.getToolPerformanceAnalytics(toolId);
  }
} 