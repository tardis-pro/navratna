import { logger } from '@uaip/utils';
import { TypeOrmService } from './typeormService.js';
import {
  EntityTarget,
  ObjectLiteral,
  Repository,
  DeepPartial,
  FindOptionsWhere,
  FindOptionsOrder,
} from 'typeorm';

/**
 * Database error handling
 */
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
      this.stack = `${this.stack}\nCaused by: ${options?.originalError}`;
    }
  }
}

/**
 * Pure DatabaseService - Infrastructure layer only
 * Contains TypeORM wrapper, connection pooling, health checks, bulk operations
 * NO domain service delegation
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private typeormService: TypeOrmService;
  private isClosing: boolean = false;
  private isInitialized: boolean = false;
  private readonly logger = logger;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
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

  public async getDataSource() {
    await this.ensureInitialized();
    return this.typeormService.getDataSource();
  }

  /**
   * Health check - returns true if database is healthy
   */
  public async isHealthy(): Promise<boolean> {
    try {
      return await this.typeormService.isHealthy();
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * Detailed health check with metadata
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    responseTime?: number;
    details?: Record<string, unknown>;
  }> {
    try {
      const start = Date.now();
      const isConnected = await this.typeormService.isHealthy();
      const responseTime = Date.now() - start;

      return {
        status: isConnected ? 'healthy' : 'unhealthy',
        responseTime,
        details: {
          database: this.typeormService.getDatabase?.() || 'unknown',
          driver: 'typeorm',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  /**
   * Gracefully disconnect from database
   */
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

  /**
   * Get entity manager for advanced operations
   */
  public getEntityManager() {
    return this.typeormService.getEntityManager();
  }

  /**
   * Get a repository for an entity class
   */
  public async getRepository<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>
  ): Promise<Repository<T>> {
    await this.ensureInitialized();
    return this.typeormService.getRepository(entityClass);
  }

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
        const queryBuilder = repository.createQueryBuilder().insert().into(entity).values(records);
        await queryBuilder.orUpdate(options.updateColumns, options.conflictColumns).execute();
      } else {
        await repository.save(records as T[]);
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
   * Create a new entity record
   */
  public async create<T>(entityClass: EntityTarget<T>, data: DeepPartial<T>): Promise<T> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    const entity = repository.create(data);
    return (await repository.save(entity)) as T;
  }

  /**
   * Find entity by ID
   */
  public async findById<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    id: string,
    relations?: string[]
  ): Promise<T | null> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    return (await repository.findOne({
      where: { id } as unknown as FindOptionsWhere<T>,
      relations,
    })) as T | null;
  }

  /**
   * Update entity by ID
   */
  public async update<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    id: string,
    data: DeepPartial<T>
  ): Promise<T | null> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    await repository.update(id, data as unknown as T);
    return (await repository.findOne({
      where: { id } as unknown as FindOptionsWhere<T>,
    })) as T | null;
  }

  /**
   * Find multiple entities matching conditions
   */
  public async findMany<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    conditions: FindOptionsWhere<T>,
    options?: {
      take?: number;
      skip?: number;
      order?: FindOptionsOrder<T>;
      relations?: string[];
    }
  ): Promise<T[]> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    return (await repository.find({
      where: conditions,
      take: options?.take,
      skip: options?.skip,
      order: options?.order,
      relations: options?.relations,
    })) as T[];
  }

  /**
   * Count entities matching conditions
   */
  public async count<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    conditions?: FindOptionsWhere<T>
  ): Promise<number> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    return await repository.count({ where: conditions });
  }

  /**
   * Delete entity by ID
   */
  public async delete<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    id: string
  ): Promise<boolean> {
    await this.ensureInitialized();
    const repository = this.typeormService.getRepository(entityClass);
    const result = await repository.delete(id);
    return (result.affected ?? 0) > 0;
  }

  /**
   * Execute raw SQL query (use with caution)
   */
  public async executeQuery<T = any>(query: string, parameters?: any[]): Promise<T[]> {
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
}
