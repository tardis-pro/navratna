import { BaseDomainService } from './base_domain_service';
import { AuthenticationMethod } from '@uaip/types';
import { getControlDb } from '../database/drizzle/clients/index';
import { sessions } from '../database/drizzle/schemas/control_schema';
import { eq, lt } from 'drizzle-orm';
import { desc } from 'drizzle-orm';
import type { Session } from '../database/drizzle/schemas/control_schema';

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
  ): Promise<Session> {
    const db = getControlDb();
    const [result] = await db
      .insert(sessions)
      .values({
        userId,
        sessionToken,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date(),
        authenticationMethod: AuthenticationMethod.PASSWORD,
        metadata: metadata ?? null,
      })
      .returning();
    return result;
  }

  public async findSession(sessionToken: string): Promise<Session | null> {
    const db = getControlDb();
    const result = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionToken, sessionToken))
      .limit(1);
    return result[0] ?? null;
  }

  public async findSessionById(id: string): Promise<Session | null> {
    const db = getControlDb();
    const result = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return result[0] ?? null;
  }

  public async updateSession(
    id: string,
    data: Partial<Session>
  ): Promise<Session | null> {
    const db = getControlDb();
    const existing = await this.findSessionById(id);
    if (!existing) return null;
    await db
      .update(sessions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sessions.id, id));
    return this.findSessionById(id);
  }

  public async invalidateSession(sessionToken: string): Promise<boolean> {
    const db = getControlDb();
    const result = await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken));
    return (result.rowCount ?? 0) > 0;
  }

  public async invalidateUserSessions(userId: string): Promise<void> {
    const db = getControlDb();
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }

  public async updateLastActivity(sessionToken: string): Promise<boolean> {
    const db = getControlDb();
    const result = await db
      .update(sessions)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.sessionToken, sessionToken));
    return (result.rowCount ?? 0) > 0;
  }

  public async findUserSessions(userId: string): Promise<Session[]> {
    const db = getControlDb();
    return db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.lastActivityAt));
  }

  public async cleanupExpiredSessions(): Promise<void> {
    const db = getControlDb();
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  }

  public async isSessionValid(sessionToken: string): Promise<boolean> {
    const session = await this.findSession(sessionToken);
    if (!session) {
      return false;
    }

    if (session.expiresAt < new Date()) {
      await this.invalidateSession(sessionToken);
      return false;
    }

    return true;
  }

  public async extendSession(sessionToken: string, extensionHours: number = 24): Promise<boolean> {
    const newExpiryTime = new Date(Date.now() + extensionHours * 60 * 60 * 1000);
    const db = getControlDb();
    const result = await db
      .update(sessions)
      .set({ expiresAt: newExpiryTime, updatedAt: new Date() })
      .where(eq(sessions.sessionToken, sessionToken));
    return (result.rowCount ?? 0) > 0;
  }
}
