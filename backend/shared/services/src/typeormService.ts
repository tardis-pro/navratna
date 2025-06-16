import { DataSource, Repository, EntityTarget, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { createTypeOrmConfig, checkDatabaseHealth } from './database/typeorm.config.js';
import { logger } from '@uaip/utils';

/**
 * TypeORM Service
 * Provides centralized access to TypeORM repositories and database operations
 */
export class TypeOrmService {
  private static instance: TypeOrmService;
  private dataSource: DataSource | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): TypeOrmService {
    if (!TypeOrmService.instance) {
      TypeOrmService.instance = new TypeOrmService();
    }
    return TypeOrmService.instance;
  }

  /**
   * Initialize the TypeORM connection
   */
  public async initialize(): Promise<void> {
    try {
      if (!this.dataSource) {
        const config = createTypeOrmConfig();
        this.dataSource = new DataSource(config);
        
        // Add timeout wrapper to prevent hanging in Docker
        const initPromise = this.dataSource.initialize();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('TypeORM initialization timeout after 30 seconds')), 30000);
        });
        
        await Promise.race([initPromise, timeoutPromise]);
      }
      logger.info('TypeORM service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize TypeORM service', { error });
      // If initialization fails, try without cache
      if (error.message.includes('timeout') || error.message.includes('Redis')) {
        logger.warn('Retrying TypeORM initialization without cache...');
        try {
          const configWithoutCache = createTypeOrmConfig(undefined, true);
          this.dataSource = new DataSource(configWithoutCache);
          await this.dataSource.initialize();
          logger.info('TypeORM service initialized successfully without cache');
          return;
        } catch (retryError) {
          logger.error('Failed to initialize TypeORM service even without cache', { error: retryError });
          throw retryError;
        }
      }
      throw error;
    }
  }

  /**
   * Close the TypeORM connection
   */
  public async close(): Promise<void> {
    try {
      if (this.dataSource && this.dataSource.isInitialized) {
        await this.dataSource.destroy();
      }
      this.dataSource = null;
      logger.info('TypeORM service closed successfully');
    } catch (error) {
      logger.error('Failed to close TypeORM service', { error });
      throw error;
    }
  }

  /**
   * Get the DataSource instance
   */
  public getDataSource(): DataSource {
    if (!this.dataSource) {
      throw new Error('TypeORM service not initialized. Call initialize() first.');
    }
    return this.dataSource;
  }

  /**
   * Get repository for an entity
   */
  public getRepository<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>
  ): Repository<Entity> {
    return this.getDataSource().getRepository(entityClass);
  }

  /**
   * Create a query builder
   */
  public createQueryBuilder<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    alias: string
  ): SelectQueryBuilder<Entity> {
    return this.getDataSource().createQueryBuilder(entityClass, alias);
  }

  /**
   * Execute raw SQL query
   */
  public async query(sql: string, parameters?: any[]): Promise<any> {
    try {
      return await this.getDataSource().query(sql, parameters);
    } catch (error) {
      logger.error('Raw query execution failed', { sql, error });
      throw error;
    }
  }

  /**
   * Run database transaction
   */
  public async transaction<T>(
    runInTransaction: (manager: any) => Promise<T>
  ): Promise<T> {
    return this.getDataSource().transaction(runInTransaction);
  }

  /**
   * Health check
   */
  public async healthCheck() {
    return checkDatabaseHealth();
  }

  // Repository getters for all entities using string-based entity names
  public get agentRepository(): Repository<any> {
    return this.getRepository('Agent');
  }

  public get operationRepository(): Repository<any> {
    return this.getRepository('Operation');
  }

  public get personaRepository(): Repository<any> {
    return this.getRepository('Persona');
  }

  public get agentCapabilityMetricRepository(): Repository<any> {
    return this.getRepository('AgentCapabilityMetric');
  }

  public get toolUsageRecordRepository(): Repository<any> {
    return this.getRepository('ToolUsageRecord');
  }

  public get conversationContextRepository(): Repository<any> {
    return this.getRepository('ConversationContext');
  }

  public get operationStateRepository(): Repository<any> {
    return this.getRepository('OperationState');
  }

  public get operationCheckpointRepository(): Repository<any> {
    return this.getRepository('OperationCheckpoint');
  }

  public get stepResultRepository(): Repository<any> {
    return this.getRepository('StepResult');
  }

  public get approvalWorkflowRepository(): Repository<any> {
    return this.getRepository('ApprovalWorkflow');
  }

  public get toolDefinitionRepository(): Repository<any> {
    return this.getRepository('ToolDefinition');
  }

  public get toolExecutionRepository(): Repository<any> {
    return this.getRepository('ToolExecution');
  }

  public get artifactRepository(): Repository<any> {
    return this.getRepository('Artifact');
  }

  public get artifactReviewRepository(): Repository<any> {
    return this.getRepository('ArtifactReview');
  }

  public get artifactDeploymentRepository(): Repository<any> {
    return this.getRepository('ArtifactDeployment');
  }

  public get discussionParticipantRepository(): Repository<any> {
    return this.getRepository('DiscussionParticipant');
  }

  public get personaAnalyticsRepository(): Repository<any> {
    return this.getRepository('PersonaAnalytics');
  }

  public get mcpServerRepository(): Repository<any> {
    return this.getRepository('MCPServer');
  }

  public get mcpToolCallRepository(): Repository<any> {
    return this.getRepository('MCPToolCall');
  }

  // Utility methods for common operations

  /**
   * Find entity by ID with error handling
   */
  public async findById<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    id: number,
    relations?: string[]
  ): Promise<Entity | null> {
    try {
      const repository = this.getRepository(entityClass);
      return await repository.findOne({
        where: { id } as any,
        relations,
      });
    } catch (error) {
      logger.error('Find by ID failed', { entityClass, id, error });
      throw error;
    }
  }

  /**
   * Create and save entity
   */
  public async create<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    data: Partial<Entity>
  ): Promise<Entity> {
    try {
      const repository = this.getRepository(entityClass);
      const entity = repository.create(data as any);
      return await repository.save(entity as any);
    } catch (error) {
      logger.error('Create entity failed', { entityClass, error });
      throw error;
    }
  }

  /**
   * Update entity by ID
   */
  public async update<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    id: number,
    data: Partial<Entity>
  ): Promise<Entity | null> {
    try {
      const repository = this.getRepository(entityClass);
      await repository.update(id, data as any);
      return await this.findById(entityClass, id);
    } catch (error) {
      logger.error('Update entity failed', { entityClass, id, error });
      throw error;
    }
  }

  /**
   * Delete entity by ID
   */
  public async delete<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    id: number
  ): Promise<boolean> {
    try {
      const repository = this.getRepository(entityClass);
      const result = await repository.delete(id);
      return (result.affected || 0) > 0;
    } catch (error) {
      logger.error('Delete entity failed', { entityClass, id, error });
      throw error;
    }
  }

  /**
   * Count entities with conditions
   */
  public async count<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    conditions?: any
  ): Promise<number> {
    try {
      const repository = this.getRepository(entityClass);
      return await repository.count({ where: conditions });
    } catch (error) {
      logger.error('Count entities failed', { entityClass, error });
      throw error;
    }
  }

  /**
   * Find entities with pagination
   */
  public async findWithPagination<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    options: {
      page?: number;
      limit?: number;
      where?: any;
      order?: any;
      relations?: string[];
    } = {}
  ): Promise<{ data: Entity[]; total: number; page: number; limit: number }> {
    try {
      const { page = 1, limit = 10, where, order, relations } = options;
      const repository = this.getRepository(entityClass);
      
      const [data, total] = await repository.findAndCount({
        where,
        order,
        relations,
        skip: (page - 1) * limit,
        take: limit,
      });

      return { data, total, page, limit };
    } catch (error) {
      logger.error('Find with pagination failed', { entityClass, error });
      throw error;
    }
  }
}

// Export singleton instance
export const typeormService = TypeOrmService.getInstance(); 