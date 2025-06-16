import { DataSource } from 'typeorm';
import { createTypeOrmConfig } from './typeorm.config.js';

// Create DataSource specifically for migrations
const migrationDataSource = new DataSource({
  ...createTypeOrmConfig(),
  // Override for migration-specific settings
  migrationsRun: false,
  synchronize: false,
  logging: ['error', 'migration'],
});

export default migrationDataSource; 