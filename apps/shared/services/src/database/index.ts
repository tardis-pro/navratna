export {
  initializePlanes as initializeDatabase,
  closePlanes as closeDatabase,
  checkPlanesHealth as checkDatabaseHealth,
  getIntelligenceDb,
  getControlDb,
  getIntelligencePool,
  getControlPool,
  CrossPlaneGuard,
  type IntelligenceDB,
  type ControlDB,
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  and,
  or,
  not,
  isNull,
  isNotNull,
  inArray,
  notInArray,
  like,
  ilike,
  between,
  desc,
  asc,
  sql,
  count,
  sum,
  avg,
  max,
  min,
} from './drizzle/clients/index';

export { DatabaseService, DatabaseError } from '../databaseService';
export { BaseRepository } from './base/BaseRepository';
export { RepositoryFactory, repositoryFactory } from './base/RepositoryFactory';
export * from './repositories/index';
export * from './drizzle/schemas/intelligence.schema';
export * from './drizzle/schemas/control.schema';
export { ToolGraphDatabase } from './toolGraphDatabase';
