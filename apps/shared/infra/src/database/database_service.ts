import { logger } from '@uaip/utils';
import { PgService, pgService } from './pg_service.js';

// DB columns are snake_case; callers pass camelCase entity keys. Without this,
// INSERT/UPDATE/WHERE emit `"documentId"`/`"turnStrategy"` etc. and Postgres
// throws `column "..." does not exist`.
const camelToSnake = (key: string): string =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();

const snakeToCamel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

// Row keys come back snake_case from `SELECT *`/`RETURNING *`; every domain
// consumer reads camelCase (createdBy, userId, agentId, isActive). Convert
// top-level keys only — never recurse into JSONB values (e.g. metadata).
function rowToCamel<T>(row: T): T {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return row;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    out[snakeToCamel(key)] = value;
  }
  return out as T;
}

export class DatabaseError extends Error {
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: { code?: string; details?: Record<string, unknown>; originalError?: string }
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.code = options?.code;
    this.details = options?.details;

    if (options?.originalError) {
      this.stack = `${this.stack}\nCaused by: ${options?.originalError}`;
    }
  }
}

export class DatabaseService {
  private static instance: DatabaseService;
  private pgService: PgService;
  private isClosing: boolean = false;
  private isInitialized: boolean = false;

  private constructor() {
    this.pgService = pgService;
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  public async initialize(): Promise<void> {
    try {
      await this.pgService.initialize();
      this.isInitialized = true;
      logger.info('Database connection initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database connection:', error);
      throw error;
    }
  }

  public registerEntities(): void {
    logger.warn('registerEntities() is no-op in Drizzle-based implementation');
  }

  public async getPool(): Promise<import('pg').Pool | null> {
    await this.ensureInitialized();
    return this.pgService.getPool();
  }

  public async isHealthy(): Promise<boolean> {
    try {
      return await this.pgService.isHealthy();
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    responseTime?: number;
    details?: Record<string, unknown>;
  }> {
    try {
      const start = Date.now();
      const isConnected = await this.pgService.isHealthy();
      const responseTime = Date.now() - start;

      return {
        status: isConnected ? 'healthy' : 'unhealthy',
        responseTime,
        details: {
          database: this.pgService.getDatabase() || 'unknown',
          driver: 'pg',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isClosing) {
      logger.warn('Database is already closing');
      return;
    }

    this.isClosing = true;

    try {
      await this.pgService.close();
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect database:', error);
      throw error;
    } finally {
      this.isClosing = false;
      this.isInitialized = false;
    }
  }

  public getEntityManager(): { query: <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]> } {
    return this.pgService.getEntityManager();
  }

  public async executeQuery<T = unknown>(query: string, parameters?: unknown[]): Promise<T[]> {
    await this.ensureInitialized();
    try {
      const result = await this.pgService.getEntityManager().query<T>(query, parameters);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Query execution failed', { query, error: errorMessage });
      throw new DatabaseError('Query execution failed', {
        code: 'QUERY_ERROR',
        details: { query },
        originalError: errorMessage,
      });
    }
  }

  private resolveTableName(tableOrEntity: unknown): string {
    if (typeof tableOrEntity === 'string') return tableOrEntity;
    if (typeof tableOrEntity === 'function') {
      const raw = tableOrEntity.name
        .replace(/Entity$/, '')
        .replace(
          /([A-Z])/g,
          (_m: string, c: string, i: number) => (i > 0 ? '_' : '') + c.toLowerCase()
        )
        .replace(/^_/, '');
      return raw.endsWith('s') ? raw : raw + 's';
    }
    return String(tableOrEntity);
  }

  async create<T = Record<string, unknown>>(
    tableOrEntity: unknown,
    data: Record<string, unknown>
  ): Promise<T> {
    await this.ensureInitialized();
    const table = this.resolveTableName(tableOrEntity);
    const keys = Object.keys(data);
    const values = Object.values(data);
    if (keys.length === 0) {
      const rows = await this.executeQuery<T>(`INSERT INTO "${table}" DEFAULT VALUES RETURNING *`);
      return rowToCamel(rows[0]);
    }
    const cols = keys.map((k) => `"${camelToSnake(k)}"`).join(', ');
    const placeholders = keys.map((_k, i) => `$${i + 1}`).join(', ');
    const rows = await this.executeQuery<T>(
      `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return rowToCamel(rows[0]);
  }

  async findById<T = Record<string, unknown>>(
    tableOrEntity: unknown,
    id: string
  ): Promise<T | null> {
    await this.ensureInitialized();
    const table = this.resolveTableName(tableOrEntity);
    const rows = await this.executeQuery<T>(`SELECT * FROM "${table}" WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? rowToCamel(rows[0]) : null;
  }

  async update<T = Record<string, unknown>>(
    tableOrEntity: unknown,
    id: string,
    data: Record<string, unknown>
  ): Promise<T | null> {
    await this.ensureInitialized();
    const table = this.resolveTableName(tableOrEntity);
    // updated_at is always set to NOW() below; drop any caller-supplied updatedAt/
    // updated_at so it doesn't collide into a duplicate SET column (Postgres rejects
    // `SET "updated_at" = $2, updated_at = NOW()`).
    const keys = Object.keys(data).filter((k) => camelToSnake(k) !== 'updated_at');
    if (keys.length === 0) {
      const rows = await this.executeQuery<T>(
        `UPDATE "${table}" SET updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      return rows[0] ? rowToCamel(rows[0]) : null;
    }
    const setClauses = keys.map((k, i) => `"${camelToSnake(k)}" = $${i + 2}`).join(', ');
    const vals: unknown[] = [id, ...keys.map((k) => data[k])];
    const rows = await this.executeQuery<T>(
      `UPDATE "${table}" SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      vals
    );
    return rows[0] ? rowToCamel(rows[0]) : null;
  }

  private buildConditionClause(conditions: Record<string, unknown>): { clause: string; values: unknown[] } {
    const keys = Object.keys(conditions);
    if (keys.length === 0) return { clause: '', values: [] };
    const clause = ' WHERE ' + keys.map((k, i) => `"${camelToSnake(k)}" = $${i + 1}`).join(' AND ');
    return { clause, values: Object.values(conditions) };
  }

  async findMany<T = Record<string, unknown>>(
    tableOrEntity: unknown,
    conditions: Record<string, unknown> = {},
    options: { take?: number; skip?: number; order?: Record<string, 'ASC' | 'DESC'> } = {}
  ): Promise<T[]> {
    await this.ensureInitialized();
    const table = this.resolveTableName(tableOrEntity);
    const { clause, values } = this.buildConditionClause(conditions);
    let query = `SELECT * FROM "${table}"${clause}`;
    if (options.order) {
      query += ' ORDER BY ' + Object.entries(options.order).map(([col, dir]) => `"${camelToSnake(col)}" ${dir}`).join(', ');
    }
    if (options.take) query += ` LIMIT ${options.take}`;
    if (options.skip) query += ` OFFSET ${options.skip}`;
    const rows = await this.executeQuery<T>(query, values);
    return rows.map((row) => rowToCamel(row));
  }

  async count(tableOrEntity: unknown, conditions: Record<string, unknown> = {}): Promise<number> {
    await this.ensureInitialized();
    const table = this.resolveTableName(tableOrEntity);
    const { clause, values } = this.buildConditionClause(conditions);
    const rows = await this.executeQuery<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM "${table}"${clause}`,
      values
    );
    return rows[0]?.cnt ?? 0;
  }

  async delete(tableOrEntity: unknown, id: string): Promise<boolean> {
    await this.ensureInitialized();
    const table = this.resolveTableName(tableOrEntity);
    const rows = await this.executeQuery<{ id: string }>(
      `DELETE FROM "${table}" WHERE id = $1 RETURNING id`,
      [id]
    );
    return rows.length > 0;
  }
}
