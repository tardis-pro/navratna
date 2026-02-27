import { DataSource } from 'typeorm';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';
import { MCPServer } from './entities/mcp-server.entity.js';
import { MCPToolCall } from './entities/mcp-tool-call.entity.js';

/**
 * Execution Plane DataSource.
 *
 * The capability-registry owns its own TypeORM connection so it is fully
 * independent of the shared-services monolith.  It connects to the same
 * PostgreSQL instance but manages only the entities that belong to the
 * Execution Plane (mcp_servers, mcp_tool_calls).
 *
 * No other plane may import this file.
 */
export const EXECUTION_PLANE_ENTITIES = [MCPServer, MCPToolCall] as const;

export class ExecutionDataSource {
  private static instance: ExecutionDataSource;
  private _ds: DataSource | null = null;

  private constructor() {}

  public static getInstance(): ExecutionDataSource {
    if (!ExecutionDataSource.instance) {
      ExecutionDataSource.instance = new ExecutionDataSource();
    }
    return ExecutionDataSource.instance;
  }

  public async initialize(): Promise<DataSource> {
    if (this._ds?.isInitialized) {
      return this._ds;
    }

    const pg = config.database.postgres;

    this._ds = new DataSource({
      type: 'postgres',
      host: pg.host,
      port: pg.port,
      username: pg.user,
      password: pg.password,
      database: pg.database,
      synchronize: false, // schema managed by migrations
      logging: false,
      entities: [...EXECUTION_PLANE_ENTITIES],
      migrations: [],
      ssl: pg.ssl ? { rejectUnauthorized: false } : false,
      extra: {
        max: 5, // dedicated small pool — this is an edge-plane service
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        application_name: 'uaip-capability-registry',
      },
    });

    let attempts = 0;
    while (attempts < 3) {
      try {
        await this._ds.initialize();
        logger.info('ExecutionDataSource initialized', {
          host: pg.host,
          database: pg.database,
          entities: EXECUTION_PLANE_ENTITIES.map((e) => e.name),
        });
        return this._ds;
      } catch (err) {
        attempts++;
        logger.warn(`ExecutionDataSource init attempt ${attempts}/3 failed`, {
          error: String(err),
        });
        if (attempts >= 3) throw err;
        await new Promise((r) => setTimeout(r, 2000 * attempts));
      }
    }

    throw new Error('ExecutionDataSource: failed to initialize after 3 attempts');
  }

  public get(): DataSource {
    if (!this._ds?.isInitialized) {
      throw new Error('ExecutionDataSource not initialized — call initialize() first');
    }
    return this._ds;
  }

  public async close(): Promise<void> {
    if (this._ds?.isInitialized) {
      await this._ds.destroy();
      logger.info('ExecutionDataSource closed');
    }
  }
}
