export {
  initializePlanes as initializeDatabase,
  closePlanes as closeDatabase,
  checkPlanesHealth as checkDatabaseHealth,
  getIntelligenceDb,
  getControlDb,
  getIntelligencePool,
  getControlPool,
  runInTenantTransaction,
  hasTenantContext,
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

export { DatabaseService, DatabaseError } from '../database_service';
export { RepositoryFactory, repositoryFactory } from './base/repository_factory';
export * from './repositories/index';
export * from './drizzle/schemas/intelligence_schema';
export * from './drizzle/schemas/control_schema';
export { ToolGraphDatabase } from './tool_graph_database';
export { ADMIN_ORG_ID, ADMIN_ORG_NAME, ADMIN_ORG_SLUG } from './drizzle/constants';
