import { getControlDb, getIntelligenceDb, getControlPool, getIntelligencePool } from '../drizzle/clients/index';
import { sql } from 'drizzle-orm';
import { logger } from '@uaip/utils';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';


export interface IRepository<T> {
  findById(id: string): Promise<T | null>;
  findMany(conditions?: Record<string, unknown>, options?: FindManyOptions): Promise<T[]>;
  create(data: Record<string, unknown>): Promise<T>;
  update(id: string, data: Record<string, unknown>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  count(conditions?: Record<string, unknown>): Promise<number>;
  batchCreate(records: Record<string, unknown>[]): Promise<T[]>;
}

export interface FindManyOptions {
  orderBy?: Record<string, 'ASC' | 'DESC'>;
  limit?: number;
  offset?: number;
  relations?: string[];
}

export abstract class BaseRepository<T extends Record<string, unknown>> implements IRepository<T> {
  protected abstract get tableName(): string;
  protected abstract get plane(): 'intelligence' | 'control';

  protected get db(): NodePgDatabase<Record<string, unknown>> {
    return (this.plane === 'intelligence' ? getIntelligenceDb() : getControlDb()) as NodePgDatabase<Record<string, unknown>>;
  }

  protected async rawQuery<R = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<R[]> {
    const pool = this.plane === 'intelligence' ? getIntelligencePool() : getControlPool();
    const result = await pool.query<R>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<T | null> {
    try {
      const rows = await this.rawQuery<T>(`SELECT * FROM "${this.tableName}" WHERE id = $1 LIMIT 1`, [id]);
      return rows[0] ?? null;
    } catch (error) {
      logger.error(`BaseRepository.findById failed for ${this.tableName}`, { id, error: (error as Error).message });
      throw error;
    }
  }

  async findMany(conditions: Record<string, unknown> = {}, options: FindManyOptions = {}): Promise<T[]> {
    try {
      const keys = Object.keys(conditions);
      const whereClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ');
      const values = Object.values(conditions);
      let query = `SELECT * FROM "${this.tableName}"`;
      if (whereClauses) query += ` WHERE ${whereClauses}`;
      if (options.orderBy) {
        const orderClauses = Object.entries(options.orderBy).map(([col, dir]) => `"${col}" ${dir}`).join(', ');
        query += ` ORDER BY ${orderClauses}`;
      }
      if (options.limit) query += ` LIMIT ${options.limit}`;
      if (options.offset) query += ` OFFSET ${options.offset}`;
      return this.rawQuery<T>(query, values);
    } catch (error) {
      logger.error(`BaseRepository.findMany failed for ${this.tableName}`, { conditions, error: (error as Error).message });
      throw error;
    }
  }

  async create(data: Record<string, unknown>): Promise<T> {
    try {
      const keys = Object.keys(data);
      const cols = keys.map(k => `"${k}"`).join(', ');
      const params = keys.map((_, i) => `$${i + 1}`).join(', ');
      const rows = await this.rawQuery<T>(
        `INSERT INTO "${this.tableName}" (${cols}) VALUES (${params}) RETURNING *`,
        Object.values(data)
      );
      return rows[0];
    } catch (error) {
      logger.error(`BaseRepository.create failed for ${this.tableName}`, { error: (error as Error).message });
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>): Promise<T | null> {
    try {
      const keys = Object.keys(data);
      const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
      const rows = await this.rawQuery<T>(
        `UPDATE "${this.tableName}" SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, ...Object.values(data)]
      );
      return rows[0] ?? null;
    } catch (error) {
      logger.error(`BaseRepository.update failed for ${this.tableName}`, { id, error: (error as Error).message });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.execute(sql`DELETE FROM ${sql.identifier(this.tableName)} WHERE id = ${id}`);
      return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
    } catch (error) {
      logger.error(`BaseRepository.delete failed for ${this.tableName}`, { id, error: (error as Error).message });
      throw error;
    }
  }

  async count(conditions: Record<string, unknown> = {}): Promise<number> {
    try {
      const keys = Object.keys(conditions);
      const whereClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ');
      const values = Object.values(conditions);
      let query = `SELECT COUNT(*)::int as cnt FROM "${this.tableName}"`;
      if (whereClauses) query += ` WHERE ${whereClauses}`;
      const rows = await this.rawQuery<{ cnt: number }>(query, values);
      return rows[0]?.cnt ?? 0;
    } catch (error) {
      logger.error(`BaseRepository.count failed for ${this.tableName}`, { conditions, error: (error as Error).message });
      throw error;
    }
  }

  async batchCreate(records: Record<string, unknown>[]): Promise<T[]> {
    if (records.length === 0) return [];
    const results: T[] = [];
    for (const record of records) {
      results.push(await this.create(record));
    }
    return results;
  }

  async batchUpdate(updates: Array<{ id: string; data: Record<string, unknown> }>): Promise<T[]> {
    if (updates.length === 0) return [];
    const results: T[] = [];
    for (const { id, data } of updates) {
      const result = await this.update(id, data);
      if (result) results.push(result);
    }
    return results;
  }

  async bulkInsert(records: Record<string, unknown>[], options?: { onConflict?: 'ignore' | 'update' }): Promise<number> {
    if (records.length === 0) return 0;
    for (const record of records) {
      try {
        await this.create(record);
      } catch {
        if (options?.onConflict === 'ignore') continue;
        throw new Error(`Bulk insert failed for ${this.tableName}`);
      }
    }
    return records.length;
  }

  async transaction<R>(callback: (db: unknown) => Promise<R>): Promise<R> {
    return this.db.transaction(callback as (tx: unknown) => Promise<R>);
  }
}
