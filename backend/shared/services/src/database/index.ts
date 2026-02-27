// TypeORM Configuration and DataSource
export {
  AppDataSource,
  getAppDataSource,
  createTypeOrmConfig,
  initializeDatabase,
  closeDatabase,
  getDataSource,
  checkDatabaseHealth,
} from './typeorm.config';

// TypeORM Types
export { Repository } from 'typeorm';

export { seedDatabase } from './seedDatabase';
export { DefaultUserLLMProviderSeed } from './seeders/DefaultUserLLMProviderSeed';
// Legacy DataSource exports for backward compatibility
export { initializeDataSource, closeDataSource, createDataSource } from './dataSource';

// Database Services
export { DatabaseService, DatabaseError } from '../databaseService';
export { ToolDatabase } from './toolDatabase';
export { ToolGraphDatabase } from './toolGraphDatabase';
export { BaseRepository, IRepository } from './base/BaseRepository';
export { RepositoryFactory, repositoryFactory } from './base/RepositoryFactory';

// Repositories
export { LLMProviderRepository } from './repositories/LLMProviderRepository';
export { LLMModelRepository } from '../repositories/llmModelRepository';
export { UserLLMProviderRepository } from './repositories/UserLLMProviderRepository';
export { UserLLMPreferenceRepository } from './repositories/UserLLMPreferenceRepository';
export { AgentLLMPreferenceRepository } from './repositories/AgentLLMPreferenceRepository';
export * from './repositories/index';

// Entities
export { LLMProvider } from '../entities/llmProvider.entity';
export { LLMModel } from '../entities/llmModel.entity';
export {
  UserLLMProvider,
  UserLLMProviderType,
  UserLLMProviderStatus,
} from '../entities/userLLMProvider.entity';

// Types
export type { ToolRelationship, ToolRecommendation, UsagePattern } from './toolGraphDatabase';
