import { DataSource } from 'typeorm';
import { createTypeOrmConfig } from './src/database/typeorm.config.js';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';

/**
 * TypeORM CLI Configuration for shared-services package
 * Used by TypeORM CLI for migrations, schema generation, etc.
 */

// Create DataSource for CLI operations with TypeScript paths for development
const CLIDataSource = new DataSource({
  ...createTypeOrmConfig(undefined, true), // Disable cache for CLI operations
  
  // Override paths for CLI operations (use TypeScript source files)
  entities: ['src/entities/**/*.ts', 'src/knowledge-graph/entities/**/*.ts'],
  migrations: ['src/migrations/**/*.ts'],
  subscribers: ['src/subscribers/**/*.ts'],
  synchronize: false, // Never synchronize in CLI operations
  dropSchema: false, // Never drop schema in CLI operations
  
  // CLI-specific logging
  logging: ['query', 'error', 'warn', 'migration'],
  logger: 'advanced-console',
});

// Log CLI configuration status
logger.info('TypeORM CLI configuration initialized', {
  entities: CLIDataSource.options.entities,
  migrations: CLIDataSource.options.migrations,
  subscribers: CLIDataSource.options.subscribers,
  cache: CLIDataSource.options.cache ? 'enabled' : 'disabled'
});

export default CLIDataSource; 