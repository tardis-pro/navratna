import { Repository, QueryRunner, EntityTarget, ObjectLiteral, EntityManager } from 'typeorm';
import { config } from '@uaip/config';
import { logger, DatabaseError } from '@uaip/utils';
import { TypeOrmService } from './typeormService.js';

// Import entities
import { Operation } from './entities/operation.entity.js';
import { OperationState } from './entities/operationState.entity.js';
import { OperationCheckpoint } from './entities/operationCheckpoint.entity.js';
import { StepResult } from './entities/stepResult.entity.js';
import { Agent } from './entities/agent.entity.js';
import { Persona } from './entities/persona.entity.js';
import { Artifact } from './entities/artifact.entity.js';
import { ArtifactDeployment } from './entities/artifactDeployment.entity.js';
import { ToolDefinition } from './entities/toolDefinition.entity.js';
import { ToolUsageRecord } from './entities/toolUsageRecord.entity.js';
import { ConversationContext } from './entities/conversationContext.entity.js';
import { ApprovalWorkflow } from './entities/approvalWorkflow.entity.js';
import { ApprovalDecision } from './entities/approvalDecision.entity.js';
import { AuditEvent } from './entities/auditEvent.entity.js';
import { SecurityPolicy } from './entities/securityPolicy.entity.js';
import { AgentCapabilityMetric } from './entities/agentCapabilityMetric.entity.js';
import { PersonaAnalytics } from './entities/personaAnalytics.entity.js';

export class DatabaseService {
  private static instance: DatabaseService;
  private typeormService: TypeOrmService;
  private isClosing: boolean = false;

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
    
    // Initialize TypeORM connection
    this.initializeConnection();
  }

  private async initializeConnection(): Promise<void> {
    try {
      await this.typeormService.initialize();
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

  // Get repository for any entity
  public getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
    return this.typeormService.getRepository(entity);
  }

  // Get entity manager for complex operations
  public getEntityManager(): EntityManager {
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
      // Use TypeORM to test connection
      const manager = this.getEntityManager();
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
      const repository = this.getRepository(entity);
      
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
      const repository = this.getRepository(entity);
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

  // Methods for StateManagerService using TypeORM
  public async saveOperationState(operationId: string, state: any): Promise<void> {
    try {
      const operationStateRepo = this.getRepository(OperationState);
      
      // Check if state already exists
      const existingState = await operationStateRepo.findOne({
        where: { operationId }
      });

      if (existingState) {
        // Update existing state
        await operationStateRepo.update(
          { operationId },
          { 
            toStatus: state.status || existingState.toStatus,
            context: state,
            transitionedAt: new Date(),
            updatedAt: new Date()
          }
        );
      } else {
        // Create new state
        const newState = operationStateRepo.create({
          operationId,
          toStatus: state.status || 'pending',
          context: state,
          transitionedAt: new Date(),
          isAutomatic: true
        });
        await operationStateRepo.save(newState);
      }
    } catch (error) {
      logger.error('Failed to save operation state', { operationId, error });
      throw error;
    }
  }

  public async getOperationState(operationId: string): Promise<any> {
    try {
      const operationStateRepo = this.getRepository(OperationState);
      const state = await operationStateRepo.findOne({
        where: { operationId },
        order: { transitionedAt: 'DESC' }
      });
      return state?.context || null;
    } catch (error) {
      logger.error('Failed to get operation state', { operationId, error });
      throw error;
    }
  }

  public async updateOperationState(operationId: string, state: any, updates: any): Promise<void> {
    try {
      const operationStateRepo = this.getRepository(OperationState);
      await operationStateRepo.update(
        { operationId },
        { 
          context: { ...state, ...updates },
          transitionedAt: new Date(),
          updatedAt: new Date()
        }
      );
    } catch (error) {
      logger.error('Failed to update operation state', { operationId, error });
      throw error;
    }
  }

  public async saveCheckpoint(operationId: string, checkpoint: any): Promise<void> {
    try {
      const checkpointRepo = this.getRepository(OperationCheckpoint);
      const newCheckpoint = checkpointRepo.create({
        id: checkpoint.id,
        operationId,
        name: checkpoint.name || `Checkpoint ${checkpoint.id}`,
        checkpointType: checkpoint.type || 'automatic',
        state: checkpoint,
        createdAt: new Date()
      });
      await checkpointRepo.save(newCheckpoint);
    } catch (error) {
      logger.error('Failed to save checkpoint', { operationId, checkpointId: checkpoint.id, error });
      throw error;
    }
  }

  public async getCheckpoint(operationId: string, checkpointId: string): Promise<any> {
    try {
      const checkpointRepo = this.getRepository(OperationCheckpoint);
      const checkpoint = await checkpointRepo.findOne({
        where: { operationId, id: checkpointId }
      });
      return checkpoint?.state || null;
    } catch (error) {
      logger.error('Failed to get checkpoint', { operationId, checkpointId, error });
      throw error;
    }
  }

  public async listCheckpoints(operationId: string): Promise<any[]> {
    try {
      const checkpointRepo = this.getRepository(OperationCheckpoint);
      const checkpoints = await checkpointRepo.find({
        where: { operationId },
        order: { createdAt: 'DESC' }
      });
      return checkpoints.map(cp => cp.state);
    } catch (error) {
      logger.error('Failed to list checkpoints', { operationId, error });
      throw error;
    }
  }

  public async deleteOldOperationStates(cutoffDate: Date): Promise<number> {
    try {
      const operationStateRepo = this.getRepository(OperationState);
      const result = await operationStateRepo
        .createQueryBuilder()
        .delete()
        .where('transitionedAt < :cutoffDate', { cutoffDate })
        .execute();
      return result.affected || 0;
    } catch (error) {
      logger.error('Failed to delete old operation states', { cutoffDate, error });
      throw error;
    }
  }

  public async getStateStatistics(): Promise<{
    totalOperations: number;
    activeOperations: number;
    totalCheckpoints: number;
    averageStateSize: number;
  }> {
    try {
      const operationStateRepo = this.getRepository(OperationState);
      const checkpointRepo = this.getRepository(OperationCheckpoint);

      const [totalOperations, activeOperations, totalCheckpoints] = await Promise.all([
        operationStateRepo.count(),
        operationStateRepo.count({
          where: { toStatus: 'running' as any }
        }),
        checkpointRepo.count()
      ]);

      return {
        totalOperations,
        activeOperations,
        totalCheckpoints,
        averageStateSize: 0 // Would need complex query to calculate
      };
    } catch (error) {
      logger.error('Failed to get state statistics', { error });
      throw error;
    }
  }

  // Methods for OrchestrationEngine using TypeORM
  public async getOperation(operationId: string): Promise<Operation | null> {
    try {
      const operationRepo = this.getRepository(Operation);
      return await operationRepo.findOne({ where: { id: operationId } });
    } catch (error) {
      logger.error('Failed to get operation', { operationId, error });
      throw error;
    }
  }

  public async createOperation(operationData: Partial<Operation>): Promise<Operation> {
    try {
      const operationRepo = this.getRepository(Operation);
      const operation = operationRepo.create(operationData);
      return await operationRepo.save(operation);
    } catch (error) {
      logger.error('Failed to create operation', { operationData, error });
      throw error;
    }
  }

  public async saveStepResult(operationId: string, result: any): Promise<void> {
    try {
      const stepResultRepo = this.getRepository(StepResult);
      const stepResult = stepResultRepo.create({
        operationId,
        stepNumber: result.stepNumber || 0,
        stepName: result.stepName || result.stepId || 'Unknown Step',
        stepType: result.stepType || 'generic',
        status: result.status || 'completed',
        output: result,
        completedAt: new Date(),
        createdAt: new Date()
      });
      await stepResultRepo.save(stepResult);
    } catch (error) {
      logger.error('Failed to save step result', { operationId, stepId: result.stepId, error });
      throw error;
    }
  }

  public async updateOperationResult(operationId: string, result: any): Promise<void> {
    try {
      const operationRepo = this.getRepository(Operation);
      await operationRepo.update(operationId, {
        result,
        status: 'completed' as any,
        completedAt: new Date(),
        updatedAt: new Date()
      });
    } catch (error) {
      logger.error('Failed to update operation result', { operationId, error });
      throw error;
    }
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
      const repository = this.getRepository(entity);
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
      const repository = this.getRepository(entity);
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
      const repository = this.getRepository(entity);
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
      const repository = this.getRepository(entity);
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
      const repository = this.getRepository(entity);
      const result = await repository.delete(id);
      return (result.affected || 0) > 0;
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
      const repository = this.getRepository(entity);
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
      const repository = this.getRepository(entity);
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
    const manager = this.getEntityManager();
    const query = tableName ? `VACUUM ${tableName}` : 'VACUUM';
    await manager.query(query);
    logger.info('Database vacuum completed', { tableName });
  }

  public async analyze(tableName?: string): Promise<void> {
    const manager = this.getEntityManager();
    const query = tableName ? `ANALYZE ${tableName}` : 'ANALYZE';
    await manager.query(query);
    logger.info('Database analyze completed', { tableName });
  }

  public async reindex(indexName?: string): Promise<void> {
    const manager = this.getEntityManager();
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
    const repository = this.getRepository(ApprovalWorkflow);
    const workflow = repository.create({
      id: workflowData.id,
      operationId: workflowData.operationId,
      requiredApprovers: workflowData.requiredApprovers,
      currentApprovers: workflowData.currentApprovers || [],
      status: workflowData.status as any,
      expiresAt: workflowData.expiresAt,
      metadata: workflowData.metadata
    });
    return await repository.save(workflow);
  }

  /**
   * Get approval workflow by ID
   */
  public async getApprovalWorkflow(workflowId: string): Promise<ApprovalWorkflow | null> {
    const repository = this.getRepository(ApprovalWorkflow);
    return await repository.findOne({ where: { id: workflowId } });
  }

  /**
   * Update approval workflow
   */
  public async updateApprovalWorkflow(workflowId: string, updates: Partial<ApprovalWorkflow>): Promise<ApprovalWorkflow | null> {
    const repository = this.getRepository(ApprovalWorkflow);
    await repository.update(workflowId, { ...updates, updatedAt: new Date() });
    return await repository.findOne({ where: { id: workflowId } });
  }

  /**
   * Get workflows for a user (as approver)
   */
  public async getUserApprovalWorkflows(userId: string, status?: string): Promise<ApprovalWorkflow[]> {
    const repository = this.getRepository(ApprovalWorkflow);
    const queryBuilder = repository.createQueryBuilder('workflow')
      .where('workflow.requiredApprovers @> :userId', { 
        userId: JSON.stringify([userId]) 
      });

    if (status) {
      queryBuilder.andWhere('workflow.status = :status', { status });
    }

    return await queryBuilder
      .orderBy('workflow.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Get pending workflows for reminders
   */
  public async getPendingWorkflowsForReminders(reminderThreshold: Date): Promise<ApprovalWorkflow[]> {
    const repository = this.getRepository(ApprovalWorkflow);
    return await repository
      .createQueryBuilder('workflow')
      .where('workflow.status = :status', { status: 'pending' })
      .andWhere('workflow.createdAt <= :threshold', { threshold: reminderThreshold })
      .andWhere('(workflow.lastReminderAt IS NULL OR workflow.lastReminderAt <= :threshold)', { threshold: reminderThreshold })
      .getMany();
  }

  /**
   * Get expired workflows
   */
  public async getExpiredWorkflows(): Promise<ApprovalWorkflow[]> {
    const repository = this.getRepository(ApprovalWorkflow);
    return await repository
      .createQueryBuilder('workflow')
      .where('workflow.status = :status', { status: 'pending' })
      .andWhere('workflow.expiresAt <= :now', { now: new Date() })
      .getMany();
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
    const repository = this.getRepository(ApprovalDecision);
    const decision = repository.create(decisionData);
    return await repository.save(decision);
  }

  /**
   * Get approval decisions for a workflow
   */
  public async getApprovalDecisions(workflowId: string): Promise<ApprovalDecision[]> {
    const repository = this.getRepository(ApprovalDecision);
    return await repository.find({
      where: { workflowId },
      order: { decidedAt: 'ASC' }
    });
  }

  // ===== AUDIT EVENT METHODS =====

  /**
   * Create audit event
   */
  public async createAuditEvent(eventData: {
    id: string;
    eventType: string;
    userId?: string;
    agentId?: string;
    resourceType?: string;
    resourceId?: string;
    details: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    riskLevel?: string;
    timestamp: Date;
  }): Promise<AuditEvent> {
    const repository = this.getRepository(AuditEvent);
    const event = repository.create(eventData);
    return await repository.save(event);
  }

  /**
   * Query audit events with filters
   */
  public async queryAuditEvents(filters: {
    eventTypes?: string[];
    userId?: string;
    agentId?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    riskLevel?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]> {
    const repository = this.getRepository(AuditEvent);
    const queryBuilder = repository.createQueryBuilder('event');

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      queryBuilder.andWhere('event.eventType = ANY(:eventTypes)', { eventTypes: filters.eventTypes });
    }

    if (filters.userId) {
      queryBuilder.andWhere('event.userId = :userId', { userId: filters.userId });
    }

    if (filters.agentId) {
      queryBuilder.andWhere('event.agentId = :agentId', { agentId: filters.agentId });
    }

    if (filters.resourceType) {
      queryBuilder.andWhere('event.resourceType = :resourceType', { resourceType: filters.resourceType });
    }

    if (filters.resourceId) {
      queryBuilder.andWhere('event.resourceId = :resourceId', { resourceId: filters.resourceId });
    }

    if (filters.startDate) {
      queryBuilder.andWhere('event.timestamp >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('event.timestamp <= :endDate', { endDate: filters.endDate });
    }

    if (filters.riskLevel) {
      queryBuilder.andWhere('event.riskLevel = :riskLevel', { riskLevel: filters.riskLevel });
    }

    queryBuilder.orderBy('event.timestamp', 'DESC');

    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }

    return await queryBuilder.getMany();
  }

  /**
   * Count recent events for security monitoring
   */
  public async countRecentAuditEvents(
    eventType: string,
    userId?: string,
    minutesBack: number = 5,
    detailsFilter?: Record<string, any>
  ): Promise<number> {
    const repository = this.getRepository(AuditEvent);
    const queryBuilder = repository.createQueryBuilder('event');

    const timeThreshold = new Date();
    timeThreshold.setMinutes(timeThreshold.getMinutes() - minutesBack);

    queryBuilder
      .where('event.eventType = :eventType', { eventType })
      .andWhere('event.timestamp >= :timeThreshold', { timeThreshold });

    if (userId) {
      queryBuilder.andWhere('event.userId = :userId', { userId });
    }

    if (detailsFilter) {
      Object.keys(detailsFilter).forEach(key => {
        queryBuilder.andWhere(`event.details ->> :key = :value`, {
          key,
          value: detailsFilter[key]
        });
      });
    }

    return await queryBuilder.getCount();
  }

  /**
   * Get audit events for date range (for reports)
   */
  public async getAuditEventsInRange(startDate: Date, endDate: Date): Promise<AuditEvent[]> {
    const repository = this.getRepository(AuditEvent);
    return await repository
      .createQueryBuilder('event')
      .where('event.timestamp >= :startDate', { startDate })
      .andWhere('event.timestamp <= :endDate', { endDate })
      .orderBy('event.timestamp', 'DESC')
      .getMany();
  }

  /**
   * Archive old audit events
   */
  public async archiveOldAuditEvents(cutoffDate: Date): Promise<number> {
    const repository = this.getRepository(AuditEvent);
    const result = await repository
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoffDate', { cutoffDate })
      .execute();
    return result.affected || 0;
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
    const repository = this.getRepository(SecurityPolicy);
    const policy = repository.create(policyData);
    return await repository.save(policy);
  }

  /**
   * Get security policy by ID
   */
  public async getSecurityPolicy(policyId: string): Promise<SecurityPolicy | null> {
    const repository = this.getRepository(SecurityPolicy);
    return await repository.findOne({ where: { id: policyId } });
  }

  /**
   * Update security policy
   */
  public async updateSecurityPolicy(policyId: string, updates: Partial<SecurityPolicy>): Promise<SecurityPolicy | null> {
    const repository = this.getRepository(SecurityPolicy);
    await repository.update(policyId, updates);
    return await repository.findOne({ where: { id: policyId } });
  }

  /**
   * Delete security policy
   */
  public async deleteSecurityPolicy(policyId: string): Promise<boolean> {
    const repository = this.getRepository(SecurityPolicy);
    const result = await repository.delete(policyId);
    return (result.affected || 0) > 0;
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
    const repository = this.getRepository(SecurityPolicy);
    const queryBuilder = repository.createQueryBuilder('policy');

    if (filters.active !== undefined) {
      queryBuilder.andWhere('policy.isActive = :active', { active: filters.active });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(policy.name ILIKE :search OR policy.description ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    queryBuilder.orderBy('policy.priority', 'DESC').addOrderBy('policy.createdAt', 'DESC');

    // Get total count for pagination
    const total = await queryBuilder.getCount();

    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }

    const policies = await queryBuilder.getMany();

    return { policies, total };
  }

  /**
   * Get security policy statistics
   */
  public async getSecurityPolicyStats(): Promise<{
    totalPolicies: number;
    activePolicies: number;
    inactivePolicies: number;
  }> {
    const repository = this.getRepository(SecurityPolicy);
    
    const [totalPolicies, activePolicies] = await Promise.all([
      repository.count(),
      repository.count({ where: { isActive: true } })
    ]);

    return {
      totalPolicies,
      activePolicies,
      inactivePolicies: totalPolicies - activePolicies
    };
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
      const manager = this.getEntityManager();
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
} 