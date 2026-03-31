import {
  getControlDb,
  getIntelligenceDb,
} from '../drizzle/clients/index';
import { sql, and } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { logger } from '@uaip/utils';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { IRepository, FindManyOptions } from '@uaip/types';

export abstract class BaseRepository<T extends Record<string, unknown>> implements IRepository<T> {
  protected abstract get tableName(): string;
  protected abstract get plane(): 'intelligence' | 'control';

  protected get db(): NodePgDatabase<Record<string, unknown>> {
    return (this.plane === 'intelligence' ? getIntelligenceDb() : getControlDb()) as NodePgDatabase<
      Record<string, unknown>
    >;
  }

  private buildWhere(conditions: Record<string, unknown>): SQL | undefined {
    const clauses: SQL[] = Object.entries(conditions).map(
      ([col, val]) => sql`${sql.identifier(col)} = ${val}`
    );
    if (clauses.length === 0) return undefined;
    if (clauses.length === 1) return clauses[0];
    return and(...(clauses as [SQL, ...SQL[]]));
  }

  async findById(id: string): Promise<T | null> {
    try {
      const result = await this.db.execute(
        sql`SELECT * FROM ${sql.identifier(this.tableName)} WHERE id = ${id} LIMIT 1`
      );
      return (result.rows[0] as T) ?? null;
    } catch (error) {
      logger.error(`BaseRepository.findById failed for ${this.tableName}`, {
        id,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async findMany(
    conditions: Record<string, unknown> = {},
    options: FindManyOptions = {}
  ): Promise<T[]> {
    try {
      const where = this.buildWhere(conditions);
      let query: SQL = sql`SELECT * FROM ${sql.identifier(this.tableName)}`;
      if (where) query = sql`${query} WHERE ${where}`;

      if (options.orderBy) {
        const orderParts = Object.entries(options.orderBy).map(
          ([col, dir]) => sql`${sql.identifier(col)} ${dir === 'DESC' ? sql`DESC` : sql`ASC`}`
        );
        query = sql`${query} ORDER BY ${sql.join(orderParts, sql`, `)}`;
      }
      if (options.limit != null) query = sql`${query} LIMIT ${options.limit}`;
      if (options.offset != null) query = sql`${query} OFFSET ${options.offset}`;

      const result = await this.db.execute(query);
      return result.rows as T[];
    } catch (error) {
      logger.error(`BaseRepository.findMany failed for ${this.tableName}`, {
        conditions,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async create(data: Record<string, unknown>): Promise<T> {
    try {
      const entries = Object.entries(data).filter(([, v]) => v !== undefined);
      const cols = sql.join(
        entries.map(([col]) => sql.identifier(col)),
        sql`, `
      );
      const vals = sql.join(
        entries.map(([, val]) => sql`${val}`),
        sql`, `
      );
      const result = await this.db.execute(
        sql`INSERT INTO ${sql.identifier(this.tableName)} (${cols}) VALUES (${vals}) RETURNING *`
      );
      return result.rows[0] as T;
    } catch (error) {
      logger.error(`BaseRepository.create failed for ${this.tableName}`, {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>): Promise<T | null> {
    try {
      const entries = Object.entries(data).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return this.findById(id);
      const setClauses = sql.join(
        entries.map(([col, val]) => sql`${sql.identifier(col)} = ${val}`),
        sql`, `
      );
      const result = await this.db.execute(
        sql`UPDATE ${sql.identifier(this.tableName)} SET ${setClauses}, updated_at = NOW() WHERE id = ${id} RETURNING *`
      );
      return (result.rows[0] as T) ?? null;
    } catch (error) {
      logger.error(`BaseRepository.update failed for ${this.tableName}`, {
        id,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.execute(
        sql`DELETE FROM ${sql.identifier(this.tableName)} WHERE id = ${id}`
      );
      return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
    } catch (error) {
      logger.error(`BaseRepository.delete failed for ${this.tableName}`, {
        id,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async count(conditions: Record<string, unknown> = {}): Promise<number> {
    try {
      const where = this.buildWhere(conditions);
      let query: SQL = sql`SELECT COUNT(*)::int AS cnt FROM ${sql.identifier(this.tableName)}`;
      if (where) query = sql`${query} WHERE ${where}`;
      const result = await this.db.execute(query);
      return (result.rows[0] as { cnt: number }).cnt ?? 0;
    } catch (error) {
      logger.error(`BaseRepository.count failed for ${this.tableName}`, {
        conditions,
        error: (error as Error).message,
      });
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

  async bulkInsert(
    records: Record<string, unknown>[],
    options?: { onConflict?: 'ignore' | 'update' }
  ): Promise<number> {
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
