// TypeORM Configuration and DataSource
export {
  AppDataSource,
  createTypeOrmConfig,
  initializeDatabase,
  closeDatabase,
  getDataSource,
  checkDatabaseHealth
} from './typeorm.config.js';

export { seedDatabase } from './seedDatabase.js';
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