// TypeORM Configuration and DataSource
export {
  AppDataSource,
  getAppDataSource,
  createTypeOrmConfig,
  initializeDatabase,
  closeDatabase,
  getDataSource,
  checkDatabaseHealth
} from './typeorm.config.js';

// TypeORM Types
export { Repository } from 'typeorm';

export { seedDatabase } from './seedDatabase.js';
export { DefaultUserLLMProviderSeed } from './seeders/DefaultUserLLMProviderSeed.js';
// Legacy DataSource exports for backward compatibility
export {
  initializeDataSource,
  closeDataSource,
  createDataSource
} from './dataSource.js';

// Database Services
export { DatabaseService, DatabaseError } from '../databaseService.js';
export { ToolDatabase } from './toolDatabase.js';
export { ToolGraphDatabase } from './toolGraphDatabase.js';
export { BaseRepository, IRepository } from './base/BaseRepository.js';
export { RepositoryFactory, repositoryFactory } from './base/RepositoryFactory.js';

// Repositories
export { LLMProviderRepository } from './repositories/LLMProviderRepository.js';
export { LLMModelRepository } from '../repositories/llmModelRepository.js';
export { UserLLMProviderRepository } from './repositories/UserLLMProviderRepository.js';
export { UserLLMPreferenceRepository } from './repositories/UserLLMPreferenceRepository.js';
export { AgentLLMPreferenceRepository } from './repositories/AgentLLMPreferenceRepository.js';
export * from './repositories/index.js';

// Entities
export { LLMProvider } from '../entities/llmProvider.entity.js';
export { LLMModel } from '../entities/llmModel.entity.js';
export { UserLLMProvider, UserLLMProviderType, UserLLMProviderStatus } from '../entities/userLLMProvider.entity.js';

// Types
export type {
  ToolRelationship,
  ToolRecommendation,
  UsagePattern
} from './toolGraphDatabase.js'; 