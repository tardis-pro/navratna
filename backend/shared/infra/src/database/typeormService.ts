import {
  DataSource,
  EntityManager,
  Repository,
  QueryRunner,
  EntityTarget,
  ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';
import { config } from '@uaip/config';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'typeorm-service',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export class TypeOrmService {
  private static instance: TypeOrmService;
  private _dataSource: DataSource | null = null;

  private constructor() {}

  public static getInstance(): TypeOrmService {
    if (!TypeOrmService.instance) {
      TypeOrmService.instance = new TypeOrmService();
    }
    return TypeOrmService.instance;
  }

  public async initialize(entities: unknown[] = []): Promise<void> {
    try {
      const pg = config.database.postgres;
      this._dataSource = new DataSource({
        type: 'postgres',
        host: pg.host,
        port: pg.port,
        username: pg.user,
        password: pg.password,
        database: pg.database,
        synchronize: false,
        logging: false,
        entities: entities,
        migrations: [],
        subscribers: [],
        ssl: pg.ssl ? { rejectUnauthorized: false } : false,
        extra: {
          max: pg.maxConnections,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
      });

      await this._dataSource.initialize();
      logger.info('TypeORM service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize TypeORM service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (this._dataSource && this._dataSource.isInitialized) {
      await this._dataSource.destroy();
      this._dataSource = null;
      logger.info('TypeORM service closed');
    }
  }

  public getDataSource(): DataSource {
    if (!this._dataSource) {
      throw new Error('TypeORM service not initialized. Call initialize() first.');
    }
    return this._dataSource;
  }

  public get dataSource(): DataSource {
    return this.getDataSource();
  }

  public getRepository<Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>
  ): Repository<Entity> {
    return this.getDataSource().getRepository(entity);
  }

  public getQueryRunner(): QueryRunner {
    return this.getDataSource().createQueryRunner();
  }

  public createQueryBuilder<Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>,
    alias: string
  ): SelectQueryBuilder<Entity> {
    return this.getDataSource().getRepository(entity).createQueryBuilder(alias);
  }

  public async query(sql: string, parameters?: unknown[]): Promise<unknown> {
    try {
      return await this.getDataSource().query(sql, parameters);
    } catch (error) {
      logger.error('Raw query execution failed', {
        sql,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  public async transaction<T>(
    runInTransaction: (manager: EntityManager) => Promise<T>
  ): Promise<T> {
    return this.getDataSource().transaction(runInTransaction);
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const ds = this.getDataSource();
      if (!ds.isInitialized) {
        return false;
      }
      await ds.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return false;
    }
  }

  public getEntityManager() {
    return this.getDataSource().manager;
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    database: string;
    connected: boolean;
  }> {
    try {
      const ds = this.getDataSource();
      return {
        status: ds.isInitialized ? 'healthy' : 'unhealthy',
        database: ds.options.database as string,
        connected: ds.isInitialized,
      };
    } catch {
      return {
        status: 'unhealthy',
        database: 'unknown',
        connected: false,
      };
    }
  }

  public getDatabase(): string | undefined {
    return this._dataSource?.options.database as string | undefined;
  }
}

export const typeormService = TypeOrmService.getInstance();
