import {
  initializePlanes,
  getIntelligenceDb,
  getControlDb,
  getIntelligencePool,
  getControlPool,
  closePlanes,
  checkPlanesHealth,
} from './database/drizzle/clients/index';
import { sql } from 'drizzle-orm';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'typeorm-shim',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

const TABLE_TO_PLANE: Record<string, 'intelligence' | 'control'> = {
  agents: 'intelligence',
  personas: 'intelligence',
  discussions: 'intelligence',
  discussion_participants: 'intelligence',
  discussion_messages: 'intelligence',
  artifacts: 'intelligence',
  artifact_reviews: 'intelligence',
  artifact_deployments: 'intelligence',
  knowledge_items: 'intelligence',
  knowledge_relationships: 'intelligence',
  llm_providers: 'intelligence',
  llm_models: 'intelligence',
  short_links: 'intelligence',
  mcp_servers: 'intelligence',
  mcp_tool_calls: 'intelligence',
  users: 'control',
  sessions: 'control',
  refresh_tokens: 'control',
  password_reset_tokens: 'control',
  mfa_challenges: 'control',
  oauth_providers: 'control',
  oauth_states: 'control',
  agent_oauth_connections: 'control',
  user_preferences: 'control',
  user_contacts: 'control',
  user_messages: 'control',
  user_presence: 'control',
  user_tool_preferences: 'control',
  user_llm_providers: 'control',
  user_llm_preferences: 'control',
  operations: 'control',
  operation_states: 'control',
  operation_checkpoints: 'control',
  step_results: 'control',
  approval_workflows: 'control',
  approval_decisions: 'control',
  tool_definitions: 'control',
  tool_executions: 'control',
  tool_assignments: 'control',
  tool_usage_records: 'control',
  security_policies: 'control',
  audit_events: 'control',
  projects: 'control',
  project_members: 'control',
  project_files: 'control',
  tasks: 'control',
  capabilities: 'control',
  integration_events: 'control',
};

function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

function resolveTableName(entityOrTable: unknown): string {
  if (typeof entityOrTable === 'string') {
    return toSnakeCase(entityOrTable);
  }
  if (typeof entityOrTable === 'function') {
    return toSnakeCase(entityOrTable.name);
  }
  return String(entityOrTable);
}

function getDb(tableName: string) {
  const plane = TABLE_TO_PLANE[tableName];
  if (plane === 'intelligence') return getIntelligenceDb();
  return getControlDb();
}

export class TypeOrmService {
  private static _instance: TypeOrmService;
  private _initialized = false;

  private constructor() {}

  static getInstance(): TypeOrmService {
    if (!TypeOrmService._instance) {
      TypeOrmService._instance = new TypeOrmService();
    }
    return TypeOrmService._instance;
  }

  async initialize(_entities?: unknown[]): Promise<void> {
    if (this._initialized) return;
    await initializePlanes();
    this._initialized = true;
    logger.info('TypeOrmService shim initialized via Drizzle');
  }

  async isHealthy(): Promise<boolean> {
    try {
      const health = await checkPlanesHealth();
      return health.intelligence === 'healthy' && health.control === 'healthy';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await closePlanes();
    this._initialized = false;
  }

  async healthCheck(): Promise<{ status: string; latency?: number }> {
    const start = Date.now();
    const healthy = await this.isHealthy();
    return { status: healthy ? 'healthy' : 'unhealthy', latency: Date.now() - start };
  }

  getDataSource(): never {
    throw new Error(
      'TypeORM DataSource is no longer available. Use getIntelligenceDb() or getControlDb() from @uaip/shared-services/drizzle/clients directly.'
    );
  }

  getRepository(_entity: unknown): never {
    throw new Error(
      'TypeORM getRepository() is no longer available. Use Drizzle table schemas and db clients directly.'
    );
  }

  getEntityManager(): never {
    throw new Error(
      'TypeORM EntityManager is no longer available. Use raw sql`` from drizzle-orm for complex queries.'
    );
  }

  async transaction<T>(callback: (db: unknown) => Promise<T>): Promise<T> {
    return await getControlDb().transaction(callback as (tx: unknown) => Promise<T>);
  }

  async create(entityOrTable: unknown, data: Record<string, unknown>): Promise<unknown> {
    const table = resolveTableName(entityOrTable);
    const pool = TABLE_TO_PLANE[table] === 'intelligence' ? getIntelligencePool() : getControlPool();
    try {
      const keys = Object.keys(data);
      const values = Object.values(data);
      let queryStr: string;
      if (keys.length > 0) {
        const cols = keys.map(k => `"${k}"`).join(', ');
        const placeholders = keys.map((_k, i) => `$${i + 1}`).join(', ');
        queryStr = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) RETURNING *`;
      } else {
        queryStr = `INSERT INTO "${table}" DEFAULT VALUES RETURNING *`;
      }
      const result = await pool.query(queryStr, values);
      return result.rows[0];
    } catch (error) {
      logger.error(`TypeOrmService.create failed for ${table}`, { error: (error as Error).message });
      throw error;
    }
  }

  async findById(entityOrTable: unknown, id: string): Promise<unknown | null> {
    const table = resolveTableName(entityOrTable);
    const db = getDb(table);
    try {
      const rows = await db.execute(
        sql`SELECT * FROM ${sql.identifier(table)} WHERE id = ${id} LIMIT 1`
      );
      return (rows as { rows: unknown[] }).rows[0] ?? null;
    } catch (error) {
      logger.error(`TypeOrmService.findById failed for ${table}`, { error: (error as Error).message });
      throw error;
    }
  }

  async update(
    entityOrTable: unknown,
    id: string,
    data: Record<string, unknown>
  ): Promise<unknown | null> {
    const table = resolveTableName(entityOrTable);
    const pool = TABLE_TO_PLANE[table] === 'intelligence' ? getIntelligencePool() : getControlPool();
    try {
      const keys = Object.keys(data);
      if (keys.length === 0) return this.findById(entityOrTable, id);
      const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
      const values: unknown[] = [id, ...Object.values(data)];
      const result = await pool.query(
        `UPDATE "${table}" SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        values
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`TypeOrmService.update failed for ${table}`, { error: (error as Error).message });
      throw error;
    }
  }

  async delete(entityOrTable: unknown, id: string): Promise<boolean> {
    const table = resolveTableName(entityOrTable);
    const db = getDb(table);
    try {
      const result = await db.execute(
        sql`DELETE FROM ${sql.identifier(table)} WHERE id = ${id}`
      );
      return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
    } catch (error) {
      logger.error(`TypeOrmService.delete failed for ${table}`, { error: (error as Error).message });
      throw error;
    }
  }
}

export const typeormService = TypeOrmService.getInstance();
