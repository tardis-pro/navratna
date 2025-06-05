import { DataSource } from 'typeorm';
import { createTypeOrmConfig } from './src/database/typeorm.config.js';

/**
 * TypeORM CLI Configuration for shared-services package
 * Used by TypeORM CLI for migrations, schema generation, etc.
 */

// Create DataSource for CLI operations with TypeScript paths for development
const CLIDataSource = new DataSource({
  ...createTypeOrmConfig(undefined, true), // Disable cache for CLI operations
  
  // Override paths for CLI operations (use TypeScript source files)
  entities: ['src/entities/**/*.ts'],
  migrations: ['src/migrations/**/*.ts'],
  subscribers: ['src/subscribers/**/*.ts'],
  
  // CLI-specific logging
  logging: ['query', 'error', 'warn', 'migration'],
  logger: 'advanced-console',
});

export default CLIDataSource; 