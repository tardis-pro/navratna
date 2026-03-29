import { BaseDomainService } from './base_domain_service';
import { AuthenticationMethod } from '@uaip/types';
import { getControlPool } from '../database/drizzle/clients/index';
import { updateTableRow } from './sql_helpers';

export class SessionService extends BaseDomainService {
  protected constructor() {
    super();
  }

  public static getInstance(): SessionService {
    return BaseDomainService.resolve<SessionService>(SessionService);
  }

  public async createSession(
    userId: string,
    sessionToken: string,
    metadata?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const pool = getControlPool();
    const result = await pool.query(
      `INSERT INTO sessions (user_id, session_token, expires_at, last_activity_at, authentication_method, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        userId,
        sessionToken,
        new Date(Date.now() + 86400000),
        new Date(),
        AuthenticationMethod.PASSWORD,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    return result.rows[0];
  }

  public async findSession(sessionToken: string): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(`SELECT * FROM sessions WHERE session_token = $1 LIMIT 1`, [
      sessionToken,
    ]);
    return result.rows[0] ?? null;
  }

  public async findSessionById(id: string): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(`SELECT * FROM sessions WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0] ?? null;
  }

  public async updateSession(
    id: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    return updateTableRow('sessions', id, data, (i) => this.findSessionById(i));
  }

  public async invalidateSession(sessionToken: string): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(`DELETE FROM sessions WHERE session_token = $1`, [
      sessionToken,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  public async invalidateUserSessions(userId: string): Promise<void> {
    const pool = getControlPool();
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  }

  public async updateLastActivity(sessionToken: string): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(
      `UPDATE sessions SET last_activity_at = $1 WHERE session_token = $2`,
      [new Date(), sessionToken]
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async findUserSessions(userId: string): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM sessions WHERE user_id = $1 ORDER BY last_activity_at DESC`,
      [userId]
    );
    return result.rows;
  }

  public async cleanupExpiredSessions(): Promise<void> {
    const pool = getControlPool();
    await pool.query(`DELETE FROM sessions WHERE expires_at < $1`, [new Date()]);
  }

  public async isSessionValid(sessionToken: string): Promise<boolean> {
    const session = await this.findSession(sessionToken);
    if (!session) {
      return false;
    }

    if (new Date(session.expires_at as string) < new Date()) {
      await this.invalidateSession(sessionToken);
      return false;
    }

    return true;
  }

  public async extendSession(sessionToken: string, extensionHours: number = 24): Promise<boolean> {
    const newExpiryTime = new Date(Date.now() + extensionHours * 60 * 60 * 1000);
    const pool = getControlPool();
    const result = await pool.query(
      `UPDATE sessions SET expires_at = $1 WHERE session_token = $2`,
      [newExpiryTime, sessionToken]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
