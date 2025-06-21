import { DataSource, Repository, QueryRunner, EntityTarget, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { dataSourceManager } from './database/typeorm.config.js';
import { createLogger } from '@uaip/utils';

/**
 * TypeORM Service
 * Simplified service that wraps the DataSourceManager for easy access
 */
export class TypeOrmService {
  private static instance: TypeOrmService;
  private logger = createLogger({
    serviceName: 'typeorm-service',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  });

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
  public async initialize(disableCache = false): Promise<void> {
    try {
      await dataSourceManager.initialize(3, disableCache);
      this.logger.info('TypeORM service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize TypeORM service', { error: error.message });
      throw error;
    }
  }

  /**
   * Close the TypeORM connection
   */
  public async close(): Promise<void> {
    await dataSourceManager.close();
  }

  /**
   * Get the DataSource instance
   */
  public getDataSource(): DataSource {
    return dataSourceManager.getDataSource();
  }

  /**
   * Get repository for an entity
   */
  public getRepository<Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>
  ): Repository<Entity> {
    return this.getDataSource().getRepository(entity);
  }

  /**
   * Get query runner
   */
  public getQueryRunner(): QueryRunner {
    return this.getDataSource().createQueryRunner();
  }

  /**
   * Create a query builder
   */
  public createQueryBuilder<Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>,
    alias: string
  ): SelectQueryBuilder<Entity> {
    return this.getDataSource().getRepository(entity).createQueryBuilder(alias);
  }

  /**
   * Execute raw SQL query
   */
  public async query(sql: string, parameters?: any[]): Promise<any> {
    try {
      return await this.getDataSource().query(sql, parameters);
    } catch (error) {
      this.logger.error('Raw query execution failed', { sql, error: error.message });
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
    return dataSourceManager.checkHealth();
  }

  // Utility methods for common operations

  /**
   * Find entity by ID with error handling
   */
  public async findById<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    id: string | number
  ): Promise<Entity | null> {
    try {
      const repository = this.getRepository(entityClass);
      return await repository.findOne({
        where: { id } as any,
      });
    } catch (error) {
      this.logger.error('Failed to find entity by ID', { entityClass, id, error: error.message });
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
      this.logger.error('Failed to create entity', { entityClass, error: error.message });
      throw error;
    }
  }

  /**
   * Update entity by ID
   */
  public async update<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    id: string | number,
    data: Partial<Entity>
  ): Promise<Entity | null> {
    try {
      const repository = this.getRepository(entityClass);
      await repository.update(id, data as any);
      return await this.findById(entityClass, id);
    } catch (error) {
      this.logger.error('Failed to update entity', { entityClass, id, error: error.message });
      throw error;
    }
  }

  /**
   * Delete entity by ID
   */
  public async delete<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    id: string | number
  ): Promise<boolean> {
    try {
      const repository = this.getRepository(entityClass);
      const result = await repository.delete(id);
      return result.affected > 0;
    } catch (error) {
      this.logger.error('Failed to delete entity', { entityClass, id, error: error.message });
      throw error;
    }
  }

  /**
   * Count entities with conditions
   */
  public async count<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    conditions: any = {}
  ): Promise<number> {
    try {
      const repository = this.getRepository(entityClass);
      return await repository.count({ where: conditions });
    } catch (error) {
      this.logger.error('Failed to count entities', { entityClass, error: error.message });
      throw error;
    }
  }

  /**
   * Find entities with pagination
   */
  public async findAndPaginate<Entity extends ObjectLiteral>(
    entityClass: EntityTarget<Entity>,
    options: {
      page?: number;
      limit?: number;
      where?: any;
      order?: any;
      relations?: string[];
    } = {}
  ): Promise<{ data: Entity[]; total: number; page: number; pageCount: number }> {
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

      return {
        data,
        total,
        page,
        pageCount: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('Failed to find and paginate entities', { entityClass, error: error.message });
      throw error;
    }
  }

  // Backward compatibility - Repository getters for commonly used entities
  public get agentCapabilityMetricRepository(): Repository<any> {
    return this.getRepository('AgentCapabilityMetric');
  }

  public get toolUsageRecordRepository(): Repository<any> {
    return this.getRepository('ToolUsageRecord');
  }

  public get integrationEventRepository(): Repository<any> {
    return this.getRepository('IntegrationEventEntity');
  }
}

// Export singleton instance
export const typeormService = TypeOrmService.getInstance(); 