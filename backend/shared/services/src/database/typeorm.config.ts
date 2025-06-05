import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from '@uaip/config';

/**
 * TypeORM Configuration for UAIP Backend
 * Centralized database configuration for all services
 */

export const createTypeOrmConfig = (entities?: any[], disableCache = false): DataSourceOptions => {
  const dbConfig = config.database.postgres;
  
  // Prepare cache configuration conditionally
  let cacheConfig: any = false;
  if (!disableCache && process.env.NODE_ENV !== 'migration') {
    try {
      cacheConfig = {
        type: 'redis',
        options: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db + 1, // Use different DB for cache
        },
        duration: 30000, // 30 seconds
      };
    } catch (error) {
      console.warn('Redis cache configuration failed, proceeding without cache:', error);
      cacheConfig = false;
    }
  }

  const baseConfig: DataSourceOptions = {
    type: 'postgres',
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
    
    // Entity configuration - use built entities from dist folder
    entities: entities || ['dist/entities/*.js'],
    
    // Migration configuration
    migrations: ['dist/migrations/*.js'],
    migrationsTableName: 'typeorm_migrations',
    migrationsRun: false, // Set to true for auto-migration in development
    
    // Synchronization (NEVER use in production)
    synchronize: false,
    
    // Logging configuration
    logging: config.logging.enableDetailedLogging ? ['query', 'error', 'warn'] : ['error'],
    logger: 'advanced-console',
    
    // Connection pool configuration
    extra: {
      max: dbConfig.maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: config.timeouts.database,
      statement_timeout: config.timeouts.database,
      query_timeout: config.timeouts.database,
    },
    
    // Cache configuration (conditionally set)
    cache: cacheConfig,
    
    // Development features
    dropSchema: false,
    
        // Use default naming strategy for now
    // namingStrategy: 'snake_case',
  };

  return baseConfig;
};

// Create the main DataSource instance
export const AppDataSource = new DataSource(createTypeOrmConfig());

/**
 * Initialize TypeORM connection
 */
export const initializeDatabase = async (): Promise<DataSource> => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ TypeORM DataSource initialized successfully');
    }
    return AppDataSource;
  } catch (error) {
    console.error('❌ Error initializing TypeORM DataSource:', error);
    throw error;
  }
};

/**
 * Close TypeORM connection
 */
export const closeDatabase = async (): Promise<void> => {
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('✅ TypeORM DataSource closed successfully');
    }
  } catch (error) {
    console.error('❌ Error closing TypeORM DataSource:', error);
    throw error;
  }
};

/**
 * Get TypeORM DataSource instance
 */
export const getDataSource = (): DataSource => {
  if (!AppDataSource.isInitialized) {
    throw new Error('DataSource is not initialized. Call initializeDatabase() first.');
  }
  return AppDataSource;
};

/**
 * Health check for TypeORM connection
 */
export const checkDatabaseHealth = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  details: {
    connected: boolean;
    driver: string;
    database: string;
    responseTime?: number;
  };
}> => {
  const startTime = Date.now();
  
  try {
    if (!AppDataSource.isInitialized) {
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          driver: 'postgres',
          database: config.database.postgres.database,
        },
      };
    }

    // Simple query to test connection
    await AppDataSource.query('SELECT 1');
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'healthy',
      details: {
        connected: true,
        driver: 'postgres',
        database: config.database.postgres.database,
        responseTime,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        connected: false,
        driver: 'postgres',
        database: config.database.postgres.database,
        responseTime: Date.now() - startTime,
      },
    };
  }
};

// Export configuration for external use
export { createTypeOrmConfig as typeormConfig };
export default AppDataSource; 