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
export { DatabaseService } from './DatabaseService.js';
export { ToolDatabase } from './toolDatabase.js';
export { ToolGraphDatabase } from './toolGraphDatabase.js';

// Repositories
export { LLMProviderRepository } from './repositories/LLMProviderRepository.js';
export { UserLLMProviderRepository } from './repositories/UserLLMProviderRepository.js';

// Entities
export { LLMProvider } from '../entities/llmProvider.entity.js';
export { UserLLMProvider, UserLLMProviderType, UserLLMProviderStatus } from '../entities/userLLMProvider.entity.js';

// Types
export type { 
  ToolRelationship,
  ToolRecommendation,
  UsagePattern
} from './toolGraphDatabase.js'; 