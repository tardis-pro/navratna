import { BaseDomainService } from './base_domain_service';
import { MFAMethod } from '@uaip/types';
import { getControlDb } from '../database/drizzle/clients/index';
import { mfaChallenges } from '../database/drizzle/schemas/control_schema';
import { eq, lt, desc, sql } from 'drizzle-orm';
import type { MfaChallenge } from '../database/drizzle/schemas/control_schema';

export class MFAService extends BaseDomainService {
  protected constructor() {
    super();
  }

  public static getInstance(): MFAService {
    return BaseDomainService.resolve<MFAService>(MFAService);
  }

  public async createMFAChallenge(
    userId: string,
    method: MFAMethod,
    sessionId: string
  ): Promise<MfaChallenge> {
    const challenge = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 300000);
    const db = getControlDb();

    const [result] = await db
      .insert(mfaChallenges)
      .values({
        userId,
        challengeType: method,
        challengeData: { challenge, sessionId },
        expiresAt,
        attempts: 0,
      })
      .returning();

    return result;
  }

  private async verifyChallengeByFilter(
    filterColumn: 'userId' | 'sessionId',
    filterValue: string,
    code: string
  ): Promise<boolean> {
    const db = getControlDb();

    const result = await db
      .select()
      .from(mfaChallenges)
      .where(
        sql`${filterColumn === 'userId' ? mfaChallenges.userId : sql`${mfaChallenges.challengeData}->>'sessionId'`} = ${filterValue} AND ${mfaChallenges.challengeData}->>'challenge' = ${code} AND ${mfaChallenges.verifiedAt} IS NULL`
      )
      .orderBy(desc(mfaChallenges.createdAt))
      .limit(1);

    if (result.length === 0) return false;
    const challengeRow = result[0];
    if (challengeRow.expiresAt < new Date()) return false;

    await db
      .update(mfaChallenges)
      .set({ verifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(mfaChallenges.id, challengeRow.id));

    return true;
  }

  public async verifyMFAChallenge(userId: string, code: string): Promise<boolean> {
    return this.verifyChallengeByFilter('userId', userId, code);
  }

  public async findMFAChallenge(challengeId: string): Promise<MfaChallenge | null> {
    const db = getControlDb();
    const result = await db
      .select()
      .from(mfaChallenges)
      .where(eq(mfaChallenges.id, challengeId))
      .limit(1);
    return result[0] ?? null;
  }

  public async findUserMFAChallenges(userId: string): Promise<MfaChallenge[]> {
    const db = getControlDb();
    return db
      .select()
      .from(mfaChallenges)
      .where(eq(mfaChallenges.userId, userId))
      .orderBy(desc(mfaChallenges.createdAt));
  }

  public async invalidateMFAChallenge(challengeId: string): Promise<boolean> {
    const db = getControlDb();
    const result = await db.delete(mfaChallenges).where(eq(mfaChallenges.id, challengeId));
    return (result.rowCount ?? 0) > 0;
  }

  public async cleanupExpiredChallenges(): Promise<void> {
    const db = getControlDb();
    await db.delete(mfaChallenges).where(lt(mfaChallenges.expiresAt, new Date()));
  }

  public async incrementAttempts(challengeId: string): Promise<boolean> {
    const challenge = await this.findMFAChallenge(challengeId);
    if (!challenge) {
      return false;
    }

    const newAttempts = challenge.attempts + 1;
    const maxAttempts = 5;

    if (newAttempts >= maxAttempts) {
      await this.invalidateMFAChallenge(challengeId);
      return false;
    }

    const db = getControlDb();
    const result = await db
      .update(mfaChallenges)
      .set({ attempts: newAttempts, updatedAt: new Date() })
      .where(eq(mfaChallenges.id, challengeId));

    return (result.rowCount ?? 0) > 0;
  }

  public async isChallengeValid(challengeId: string): Promise<boolean> {
    const challenge = await this.findMFAChallenge(challengeId);
    if (!challenge) {
      return false;
    }

    if (challenge.expiresAt < new Date()) {
      await this.invalidateMFAChallenge(challengeId);
      return false;
    }

    if (challenge.verifiedAt) {
      return false;
    }

    const maxAttempts = 5;
    if (challenge.attempts >= maxAttempts) {
      await this.invalidateMFAChallenge(challengeId);
      return false;
    }

    return true;
  }

  public async verifyMFAChallengeBySession(sessionId: string, code: string): Promise<boolean> {
    return this.verifyChallengeByFilter('sessionId', sessionId, code);
  }
}
