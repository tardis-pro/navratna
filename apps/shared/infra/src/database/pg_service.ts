import { Pool } from 'pg';
import { config } from '@uaip/config';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'pg-service',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export class PgService {
  private static instance: PgService;
  private pool: Pool | null = null;

  private constructor() {}

  public static getInstance(): PgService {
    if (!PgService.instance) {
      PgService.instance = new PgService();
    }
    return PgService.instance;
  }

  public async initialize(): Promise<void> {
    try {
      const pgConfig = config.database.postgres;
      this.pool = new Pool({
        host: pgConfig.host,
        port: pgConfig.port,
        user: pgConfig.user,
        password: pgConfig.password,
        database: pgConfig.database,
        ssl: pgConfig.ssl ? { rejectUnauthorized: false } : false,
        max: pgConfig.maxConnections,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      const client = await this.pool.connect();
      client.release();

      logger.info('PgService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PgService', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('PgService closed');
    }
  }

  public getDataSource(): never {
    throw new Error(
      'getDataSource() is not supported. Use getEntityManager().query() for raw SQL operations.'
    );
  }

  public getRepository(): never {
    throw new Error(
      'getRepository() is not supported. Use executeQuery() or getEntityManager().query() instead.'
    );
  }

  public getEntityManager(): { query: (sql: string, params?: unknown[]) => Promise<unknown[]> } {
    if (!this.pool) {
      throw new Error('PgService not initialized. Call initialize() first.');
    }

    return {
      query: async (sql: string, params?: unknown[]): Promise<unknown[]> => {
        const client = await this.pool!.connect();
        try {
          const result = await client.query(sql, params);
          return result.rows;
        } finally {
          client.release();
        }
      },
    };
  }

  public async transaction<T>(
    runInTransaction: (manager: {
      query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
    }) => Promise<T>
  ): Promise<T> {
    if (!this.pool) {
      throw new Error('PgService not initialized. Call initialize() first.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const manager = {
        query: async (sql: string, params?: unknown[]): Promise<unknown[]> => {
          const result = await client.query(sql, params);
          return result.rows;
        },
      };
      const result = await runInTransaction(manager);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async query(sql: string, parameters?: unknown[]): Promise<unknown> {
    try {
      const manager = this.getEntityManager();
      return await manager.query(sql, parameters);
    } catch (error) {
      logger.error('Raw query execution failed', {
        sql,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  public async isHealthy(): Promise<boolean> {
    try {
      if (!this.pool) {
        return false;
      }
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return false;
    }
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    database: string;
    connected: boolean;
  }> {
    try {
      if (!this.pool) {
        return {
          status: 'unhealthy',
          database: 'unknown',
          connected: false,
        };
      }

      const pgConfig = config.database.postgres;
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        return {
          status: 'healthy',
          database: pgConfig.database,
          connected: true,
        };
      } finally {
        client.release();
      }
    } catch {
      return {
        status: 'unhealthy',
        database: 'unknown',
        connected: false,
      };
    }
  }

  public getDatabase(): string | undefined {
    return config.database.postgres.database;
  }

  public getPool(): Pool | null {
    return this.pool;
  }
}

export const pgService = PgService.getInstance();
