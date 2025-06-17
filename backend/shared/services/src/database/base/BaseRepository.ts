import { Repository, EntityTarget, ObjectLiteral, EntityManager, QueryRunner } from 'typeorm';
import { logger, DatabaseError } from '@uaip/utils';
import { TypeOrmService } from '../../typeormService.js';

export abstract class BaseRepository<T extends ObjectLiteral> {
  protected repository: Repository<T>;
  protected typeormService: TypeOrmService;

  constructor(
    protected entity: EntityTarget<T>,
    typeormService?: TypeOrmService
  ) {
    this.typeormService = typeormService || TypeOrmService.getInstance();
    this.repository = this.typeormService.getRepository(entity);
  }

  // Get entity manager for complex operations
  protected getEntityManager(): EntityManager {
    return this.typeormService.getDataSource().manager;
  }

  // Get a query runner for transaction handling
  protected async getQueryRunner(): Promise<QueryRunner> {
    try {
      const queryRunner = this.typeormService.getDataSource().createQueryRunner();
      await queryRunner.connect();
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
  protected releaseQueryRunner(queryRunner: QueryRunner): void {
    try {
      queryRunner.release();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error releasing database client', { error: errorMessage });
    }
  }

  // Execute multiple operations in a transaction
  protected async transaction<R>(
    callback: (manager: EntityManager) => Promise<R>
  ): Promise<R> {
    return await this.typeormService.transaction(callback);
  }

  // Generic CRUD operations
  public async findById(id: string): Promise<T | null> {
    try {
      return await this.repository.findOne({ where: { id } as any });
    } catch (error) {
      logger.error('Failed to find by ID', { 
        entity: this.entity.toString(), 
        id, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  public async findMany(
    conditions: Record<string, any> = {},
    options: {
      orderBy?: Record<string, 'ASC' | 'DESC'>;
      limit?: number;
      offset?: number;
      relations?: string[];
    } = {}
  ): Promise<T[]> {
    try {
      const queryBuilder = this.repository.createQueryBuilder();

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
      logger.error('Failed to find many', { 
        entity: this.entity.toString(), 
        conditions, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  public async create(data: Partial<T>): Promise<T> {
    try {
      const newEntity = this.repository.create(data as any);
      return await this.repository.save(newEntity as any);
    } catch (error) {
      logger.error('Failed to create', { 
        entity: this.entity.toString(), 
        data, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  public async update(id: string, data: Partial<T>): Promise<T | null> {
    try {
      await this.repository.update(id, { ...data, updatedAt: new Date() } as any);
      return await this.repository.findOne({ where: { id } as any });
    } catch (error) {
      logger.error('Failed to update', { 
        entity: this.entity.toString(), 
        id, 
        data, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  public async delete(id: string): Promise<boolean> {
    try {
      const result = await this.repository.delete(id);
      return (result.affected) > 0;
    } catch (error) {
      logger.error('Failed to delete', { 
        entity: this.entity.toString(), 
        id, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  public async count(conditions: Record<string, any> = {}): Promise<number> {
    try {
      return await this.repository.count({ where: conditions });
    } catch (error) {
      logger.error('Failed to count', { 
        entity: this.entity.toString(), 
        conditions, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  public async batchCreate(records: Partial<T>[]): Promise<T[]> {
    if (records.length === 0) {
      return [];
    }

    try {
      const entities = records.map(record => this.repository.create(record as any));
      return await this.repository.save(entities as any);
    } catch (error) {
      logger.error('Failed to batch create', { 
        entity: this.entity.toString(), 
        recordCount: records.length, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  public async batchUpdate(updates: Array<{ id: string; data: Partial<T> }>): Promise<T[]> {
    if (updates.length === 0) {
      return [];
    }

    return await this.transaction(async (manager) => {
      const repository = manager.getRepository(this.entity);
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

  // Bulk insert helper
  public async bulkInsert(
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
      if (options?.onConflict === 'ignore') {
        await this.repository
          .createQueryBuilder()
          .insert()
          .into(this.entity)
          .values(records)
          .orIgnore()
          .execute();
      } else if (options?.onConflict === 'update' && options.conflictColumns && options.updateColumns) {
        const queryBuilder = this.repository
          .createQueryBuilder()
          .insert()
          .into(this.entity)
          .values(records);
          
        await queryBuilder
          .orUpdate(options.updateColumns, options.conflictColumns)
          .execute();
      } else {
        await this.repository.save(records as any[]);
      }
      
      const duration = Date.now() - startTime;
      logger.info('Bulk insert completed', {
        entity: this.entity.toString(),
        rowCount: records.length,
        insertedCount: records.length,
        duration
      });

      return records.length;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Bulk insert failed', {
        entity: this.entity.toString(),
        rowCount: records.length,
        error: errorMessage
      });
      throw error;
    }
  }

  // Stream query results
  public async *streamQuery(
    conditions?: Record<string, any>,
    batchSize: number = 1000
  ): AsyncGenerator<T[], void, unknown> {
    try {
      logger.debug('Starting streaming query', {
        entity: this.entity.toString(),
        batchSize
      });

      let offset = 0;
      let hasMoreRows = true;

      while (hasMoreRows) {
        const queryBuilder = this.repository.createQueryBuilder();
        
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
      logger.error('Streaming query failed', { 
        entity: this.entity.toString(), 
        error: (error as Error).message 
      });
      throw error;
    }
  }
} 