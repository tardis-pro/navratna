import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '@uaip/config';
import { logger, DatabaseError } from '@uaip/utils';

export class DatabaseService {
  private pool: Pool;
  private static instance: DatabaseService;
  private isClosing: boolean = false;

  constructor() {
    // Debug: Log the actual config values being used
    console.log('[DB DEBUG] Database config:', {
      host: config.database.postgres.host,
      port: config.database.postgres.port,
      user: config.database.postgres.user,
      password: config.database.postgres.password ? '***' : 'undefined',
      database: config.database.postgres.database
    });

    this.pool = new Pool({
      host: config.database.postgres.host,
      port: config.database.postgres.port,
      user: config.database.postgres.user,
      password: config.database.postgres.password,
      database: config.database.postgres.database,
      ssl: config.database.postgres.ssl,
      max: config.database.postgres.maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: config.timeouts.database,
      statement_timeout: config.timeouts.database,
      query_timeout: config.timeouts.database,
    });

    // Handle pool events
    this.pool.on('connect', (client: PoolClient) => {
      logger.debug('New client connected to database', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      });
    });

    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected error on idle client', { error: err.message });
    });

    this.pool.on('acquire', () => {
      logger.debug('Client acquired from pool', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      });
    });

    this.pool.on('release', () => {
      logger.debug('Client released to pool', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      });
    });
  }

  // Singleton pattern for database connection
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // Execute a query with parameters
  public async query<T extends QueryResultRow = any>(
    text: string, 
    params?: any[], 
    options?: {
      timeout?: number;
      logQuery?: boolean;
    }
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      if (options?.logQuery || config.logging.enableDetailedLogging) {
        logger.debug('Executing database query', {
          queryId,
          query: text.replace(/\s+/g, ' ').trim(),
          paramCount: params?.length || 0
        });
      }

      const result = await this.pool.query<T>(text, params);
      
      const duration = Date.now() - startTime;
      
      logger.debug('Database query completed', {
        queryId,
        duration,
        rowCount: result.rowCount,
        fields: result.fields?.length || 0
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Database query failed', {
        queryId,
        duration,
        error: errorMessage,
        query: text.replace(/\s+/g, ' ').trim(),
        paramCount: params?.length || 0
      });

      throw new DatabaseError(`Query execution failed: ${errorMessage}`, {
        queryId,
        originalError: errorMessage,
        query: text.substring(0, 200) // Only log first 200 chars for security
      });
    }
  }

  // Execute a query with a specific client (for transactions)
  public async queryWithClient<T extends QueryResultRow = any>(
    client: PoolClient,
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const queryId = `tx_query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.debug('Executing transaction query', {
        queryId,
        query: text.replace(/\s+/g, ' ').trim(),
        paramCount: params?.length || 0
      });

      const result = await client.query<T>(text, params);
      
      const duration = Date.now() - startTime;
      logger.debug('Transaction query completed', {
        queryId,
        duration,
        rowCount: result.rowCount
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Transaction query failed', {
        queryId,
        duration,
        error: errorMessage
      });

      throw new DatabaseError(`Transaction query failed: ${errorMessage}`, {
        queryId,
        originalError: errorMessage
      });
    }
  }

  // Get a client for transaction handling
  public async getClient(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      logger.debug('Database client acquired for transaction');
      return client;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to acquire database client', { error: errorMessage });
      throw new DatabaseError('Failed to acquire database client', {
        originalError: errorMessage
      });
    }
  }

  // Release a client back to the pool
  public releaseClient(client: PoolClient): void {
    try {
      client.release();
      logger.debug('Database client released');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error releasing database client', { error: errorMessage });
    }
  }

  // Execute multiple queries in a transaction
  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.debug('Starting database transaction', { transactionId });
      
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      
      logger.debug('Database transaction committed', { transactionId });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('Database transaction failed, rolling back', {
        transactionId,
        error: errorMessage
      });
      
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        const rollbackErrorMessage = rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error';
        logger.error('Failed to rollback transaction', {
          transactionId,
          originalError: errorMessage,
          rollbackError: rollbackErrorMessage
        });
      }
      
      throw error;
    } finally {
      this.releaseClient(client);
    }
  }

  // Health check method
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      totalConnections: number;
      idleConnections: number;
      waitingConnections: number;
      responseTime?: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      await this.query('SELECT 1 as health_check');
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        details: {
          connected: true,
          totalConnections: this.pool.totalCount,
          idleConnections: this.pool.idleCount,
          waitingConnections: this.pool.waitingCount,
          responseTime
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Database health check failed', { error: errorMessage });
      
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          totalConnections: this.pool.totalCount,
          idleConnections: this.pool.idleCount,
          waitingConnections: this.pool.waitingCount
        }
      };
    }
  }

  // Get connection pool statistics
  public getPoolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }

  // Execute a prepared statement
  public async executePrepared<T extends QueryResultRow = any>(
    name: string,
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    
    try {
      // PostgreSQL doesn't require explicit preparation in this context
      // This method provides a consistent interface for prepared statements
      const result = await this.query<T>(text, params);
      
      const duration = Date.now() - startTime;
      logger.debug('Prepared statement executed', {
        name,
        duration,
        rowCount: result.rowCount
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Prepared statement failed', {
        name,
        error: errorMessage
      });
      throw error;
    }
  }

  // Bulk insert helper
  public async bulkInsert(
    tableName: string,
    columns: string[],
    rows: any[][],
    options?: {
      onConflict?: 'ignore' | 'update' | 'error';
      conflictColumns?: string[];
      updateColumns?: string[];
    }
  ): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }

    const startTime = Date.now();
    
    try {
      // Create parameterized query
      const placeholders = rows.map((_, rowIndex) => {
        const rowPlaceholders = columns.map((_, colIndex) => 
          `$${rowIndex * columns.length + colIndex + 1}`
        ).join(', ');
        return `(${rowPlaceholders})`;
      }).join(', ');

      let query = `
        INSERT INTO ${tableName} (${columns.join(', ')})
        VALUES ${placeholders}
      `;

      // Handle conflict resolution
      if (options?.onConflict === 'ignore') {
        query += ' ON CONFLICT DO NOTHING';
      } else if (options?.onConflict === 'update' && options.conflictColumns && options.updateColumns) {
        const updateClause = options.updateColumns
          .map(col => `${col} = EXCLUDED.${col}`)
          .join(', ');
        query += ` ON CONFLICT (${options.conflictColumns.join(', ')}) DO UPDATE SET ${updateClause}`;
      }

      // Flatten parameters
      const params = rows.flat();

      const result = await this.query(query, params);
      
      const duration = Date.now() - startTime;
      logger.info('Bulk insert completed', {
        tableName,
        rowCount: rows.length,
        insertedCount: result.rowCount,
        duration
      });

      return result.rowCount || 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Bulk insert failed', {
        tableName,
        rowCount: rows.length,
        error: errorMessage
      });
      throw error;
    }
  }

  // Close the pool (for graceful shutdown)
  public async close(): Promise<void> {
    if (this.isClosing) {
      logger.debug('Database pool close already in progress, skipping');
      return;
    }

    this.isClosing = true;
    
    try {
      await this.pool.end();
      logger.info('Database connection pool closed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error closing database pool', { error: errorMessage });
      throw error;
    }
  }

  // Stream query results (for large datasets)
  public async *streamQuery<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
    batchSize: number = 1000
  ): AsyncGenerator<T[], void, unknown> {
    const client = await this.getClient();
    
    try {
      logger.debug('Starting streaming query', {
        query: text.replace(/\s+/g, ' ').trim(),
        batchSize
      });

      // Add LIMIT and OFFSET for batching
      let offset = 0;
      let hasMoreRows = true;

      while (hasMoreRows) {
        const batchQuery = `${text} LIMIT ${batchSize} OFFSET ${offset}`;
        const result = await this.queryWithClient<T>(client, batchQuery, params);
        
        if (result.rows.length === 0) {
          hasMoreRows = false;
        } else {
          yield result.rows;
          offset += batchSize;
          hasMoreRows = result.rows.length === batchSize;
        }
      }
    } finally {
      this.releaseClient(client);
    }
  }

  // Methods for StateManagerService
  public async saveOperationState(operationId: string, state: any): Promise<void> {
    const query = `
      INSERT INTO operation_states (operation_id, state, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (operation_id) 
      DO UPDATE SET state = $2, updated_at = NOW()
    `;
    await this.query(query, [operationId, JSON.stringify(state)]);
  }

  public async getOperationState(operationId: string): Promise<any> {
    const query = 'SELECT state FROM operation_states WHERE operation_id = $1';
    const result = await this.query(query, [operationId]);
    return result.rows.length > 0 ? JSON.parse(result.rows[0].state) : null;
  }

  public async updateOperationState(operationId: string, state: any, updates: any): Promise<void> {
    const query = `
      UPDATE operation_states 
      SET state = $2, updated_at = NOW()
      WHERE operation_id = $1
    `;
    await this.query(query, [operationId, JSON.stringify(state)]);
  }

  public async saveCheckpoint(operationId: string, checkpoint: any): Promise<void> {
    const query = `
      INSERT INTO checkpoints (id, operation_id, checkpoint_data, created_at)
      VALUES ($1, $2, $3, NOW())
    `;
    await this.query(query, [checkpoint.id, operationId, JSON.stringify(checkpoint)]);
  }

  public async getCheckpoint(operationId: string, checkpointId: string): Promise<any> {
    const query = `
      SELECT checkpoint_data 
      FROM checkpoints 
      WHERE operation_id = $1 AND id = $2
    `;
    const result = await this.query(query, [operationId, checkpointId]);
    return result.rows.length > 0 ? JSON.parse(result.rows[0].checkpoint_data) : null;
  }

  public async listCheckpoints(operationId: string): Promise<any[]> {
    const query = `
      SELECT checkpoint_data 
      FROM checkpoints 
      WHERE operation_id = $1 
      ORDER BY created_at DESC
    `;
    const result = await this.query(query, [operationId]);
    return result.rows.map(row => JSON.parse(row.checkpoint_data));
  }

  public async deleteOldOperationStates(cutoffDate: Date): Promise<number> {
    const query = `
      DELETE FROM operation_states 
      WHERE updated_at < $1
    `;
    const result = await this.query(query, [cutoffDate]);
    return result.rowCount || 0;
  }

  public async getStateStatistics(): Promise<{
    totalOperations: number;
    activeOperations: number;
    totalCheckpoints: number;
    averageStateSize: number;
  }> {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_operations,
        COUNT(CASE WHEN state->>'status' IN ('running', 'paused') THEN 1 END) as active_operations,
        AVG(LENGTH(state::text)) as average_state_size
      FROM operation_states
    `;
    
    const checkpointQuery = 'SELECT COUNT(*) as total_checkpoints FROM checkpoints';
    
    const [statsResult, checkpointResult] = await Promise.all([
      this.query(statsQuery),
      this.query(checkpointQuery)
    ]);

    return {
      totalOperations: parseInt(statsResult.rows[0].total_operations) || 0,
      activeOperations: parseInt(statsResult.rows[0].active_operations) || 0,
      totalCheckpoints: parseInt(checkpointResult.rows[0].total_checkpoints) || 0,
      averageStateSize: parseFloat(statsResult.rows[0].average_state_size) || 0
    };
  }

  // Methods for OrchestrationEngine
  public async getOperation(operationId: string): Promise<any> {
    const query = 'SELECT * FROM operations WHERE id = $1';
    const result = await this.query(query, [operationId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  public async createWorkflowInstance(workflowInstance: any): Promise<void> {
    const query = `
      INSERT INTO workflow_instances (
        id, operation_id, status, current_step_index, 
        execution_context, state, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    
    await this.query(query, [
      workflowInstance.id,
      workflowInstance.operationId,
      workflowInstance.status,
      workflowInstance.currentStepIndex,
      JSON.stringify(workflowInstance.executionContext),
      JSON.stringify(workflowInstance.state),
      workflowInstance.createdAt,
      workflowInstance.updatedAt
    ]);
  }

  public async saveStepResult(operationId: string, result: any): Promise<void> {
    const query = `
      INSERT INTO step_results (operation_id, step_id, result_data, created_at)
      VALUES ($1, $2, $3, NOW())
    `;
    await this.query(query, [operationId, result.stepId, JSON.stringify(result)]);
  }

  public async updateOperationResult(operationId: string, result: any): Promise<void> {
    const query = `
      UPDATE operations 
      SET result = $2, status = 'completed', updated_at = NOW()
      WHERE id = $1
    `;
    await this.query(query, [operationId, JSON.stringify(result)]);
  }

  // Database schema initialization methods
  public async initializeTables(): Promise<void> {
    try {
      logger.info('Initializing database tables...');

      // Create operations table
      await this.query(`
        CREATE TABLE IF NOT EXISTS operations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type VARCHAR(100) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          priority INTEGER DEFAULT 1,
          parameters JSONB,
          result JSONB,
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          started_at TIMESTAMP WITH TIME ZONE,
          completed_at TIMESTAMP WITH TIME ZONE,
          retry_count INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 3
        )
      `);

      // Create operation_states table
      await this.query(`
        CREATE TABLE IF NOT EXISTS operation_states (
          operation_id UUID PRIMARY KEY REFERENCES operations(id) ON DELETE CASCADE,
          state JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create checkpoints table
      await this.query(`
        CREATE TABLE IF NOT EXISTS checkpoints (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
          checkpoint_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create workflow_instances table
      await this.query(`
        CREATE TABLE IF NOT EXISTS workflow_instances (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          current_step_index INTEGER DEFAULT 0,
          execution_context JSONB,
          state JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create step_results table
      await this.query(`
        CREATE TABLE IF NOT EXISTS step_results (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
          step_id VARCHAR(255) NOT NULL,
          result_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create indexes for better performance
      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
      `);

      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);
      `);

      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_operations_created_at ON operations(created_at);
      `);

      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_checkpoints_operation_id ON checkpoints(operation_id);
      `);

      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_step_results_operation_id ON step_results(operation_id);
      `);

      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_workflow_instances_operation_id ON workflow_instances(operation_id);
      `);

      logger.info('Database tables initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to initialize database tables', { error: errorMessage });
      throw new DatabaseError('Database initialization failed', {
        originalError: errorMessage
      });
    }
  }

  // Generic CRUD operations
  public async findById<T extends QueryResultRow = any>(
    tableName: string,
    id: string,
    columns: string[] = ['*']
  ): Promise<T | null> {
    const query = `SELECT ${columns.join(', ')} FROM ${tableName} WHERE id = $1`;
    const result = await this.query<T>(query, [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  public async findMany<T extends QueryResultRow = any>(
    tableName: string,
    conditions: Record<string, any> = {},
    options: {
      columns?: string[];
      orderBy?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<T[]> {
    const columns = options.columns || ['*'];
    let query = `SELECT ${columns.join(', ')} FROM ${tableName}`;
    const params: any[] = [];
    let paramIndex = 1;

    // Add WHERE conditions
    if (Object.keys(conditions).length > 0) {
      const whereConditions = Object.keys(conditions).map(key => {
        params.push(conditions[key]);
        return `${key} = $${paramIndex++}`;
      });
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    // Add ORDER BY
    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy}`;
    }

    // Add LIMIT
    if (options.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    // Add OFFSET
    if (options.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const result = await this.query<T>(query, params);
    return result.rows;
  }

  public async create<T extends QueryResultRow = any>(
    tableName: string,
    data: Record<string, any>,
    returning: string[] = ['*']
  ): Promise<T> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, index) => `$${index + 1}`);

    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING ${returning.join(', ')}
    `;

    const result = await this.query<T>(query, values);
    return result.rows[0];
  }

  public async update<T extends QueryResultRow = any>(
    tableName: string,
    id: string,
    data: Record<string, any>,
    returning: string[] = ['*']
  ): Promise<T | null> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map((col, index) => `${col} = $${index + 2}`);

    const query = `
      UPDATE ${tableName}
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING ${returning.join(', ')}
    `;

    const result = await this.query<T>(query, [id, ...values]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  public async delete(tableName: string, id: string): Promise<boolean> {
    const query = `DELETE FROM ${tableName} WHERE id = $1`;
    const result = await this.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  public async count(
    tableName: string,
    conditions: Record<string, any> = {}
  ): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${tableName}`;
    const params: any[] = [];
    let paramIndex = 1;

    if (Object.keys(conditions).length > 0) {
      const whereConditions = Object.keys(conditions).map(key => {
        params.push(conditions[key]);
        return `${key} = $${paramIndex++}`;
      });
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    const result = await this.query(query, params);
    return parseInt(result.rows[0].count);
  }

  // Batch operations
  public async batchCreate<T extends QueryResultRow = any>(
    tableName: string,
    records: Record<string, any>[],
    returning: string[] = ['*']
  ): Promise<T[]> {
    if (records.length === 0) {
      return [];
    }

    const columns = Object.keys(records[0]);
    const placeholders = records.map((_, recordIndex) => {
      const recordPlaceholders = columns.map((_, colIndex) => 
        `$${recordIndex * columns.length + colIndex + 1}`
      ).join(', ');
      return `(${recordPlaceholders})`;
    }).join(', ');

    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${placeholders}
      RETURNING ${returning.join(', ')}
    `;

    const params = records.flatMap(record => columns.map(col => record[col]));
    const result = await this.query<T>(query, params);
    return result.rows;
  }

  public async batchUpdate<T extends QueryResultRow = any>(
    tableName: string,
    updates: Array<{ id: string; data: Record<string, any> }>,
    returning: string[] = ['*']
  ): Promise<T[]> {
    if (updates.length === 0) {
      return [];
    }

    return await this.transaction(async (client) => {
      const results: T[] = [];
      
      for (const update of updates) {
        const columns = Object.keys(update.data);
        const values = Object.values(update.data);
        const setClause = columns.map((col, index) => `${col} = $${index + 2}`);

        const query = `
          UPDATE ${tableName}
          SET ${setClause.join(', ')}, updated_at = NOW()
          WHERE id = $1
          RETURNING ${returning.join(', ')}
        `;

        const result = await this.queryWithClient<T>(client, query, [update.id, ...values]);
        if (result.rows.length > 0) {
          results.push(result.rows[0]);
        }
      }

      return results;
    });
  }

  // Database maintenance methods
  public async vacuum(tableName?: string): Promise<void> {
    const query = tableName ? `VACUUM ${tableName}` : 'VACUUM';
    await this.query(query);
    logger.info('Database vacuum completed', { tableName });
  }

  public async analyze(tableName?: string): Promise<void> {
    const query = tableName ? `ANALYZE ${tableName}` : 'ANALYZE';
    await this.query(query);
    logger.info('Database analyze completed', { tableName });
  }

  public async reindex(indexName?: string): Promise<void> {
    const query = indexName ? `REINDEX INDEX ${indexName}` : 'REINDEX DATABASE';
    await this.query(query);
    logger.info('Database reindex completed', { indexName });
  }
} 