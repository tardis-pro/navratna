// TypeORM Configuration and DataSource
export {
  AppDataSource,
  createTypeOrmConfig,
  initializeDatabase,
  closeDatabase,
  getDataSource,
  checkDatabaseHealth,
  typeormConfig
} from './typeorm.config.js';

// Legacy DataSource exports for backward compatibility
export {
  initializeDataSource,
  closeDataSource,
  createDataSource
} from './dataSource.js';

// Database Services
export { ToolDatabase } from './toolDatabase.js';
export { ToolGraphDatabase } from './toolGraphDatabase.js';

// Types
export type { 
  ToolRelationship,
  ToolRecommendation,
  UsagePattern
} from './toolGraphDatabase.js'; 