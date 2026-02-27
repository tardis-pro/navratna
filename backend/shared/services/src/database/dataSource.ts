// Re-export TypeORM configuration from the main config file
export {
  AppDataSource,
  createTypeOrmConfig,
  initializeDatabase,
  closeDatabase,
  getDataSource,
  checkDatabaseHealth,
} from './typeorm.config';

// Legacy aliases for backward compatibility
export { initializeDatabase as initializeDataSource } from './typeorm.config';
export { closeDatabase as closeDataSource } from './typeorm.config';
export { AppDataSource as createDataSource } from './typeorm.config';
