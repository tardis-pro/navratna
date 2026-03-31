import { BaseDomainService } from './base_domain_service';
import { MFAMethod } from '@uaip/types';
import { getControlPool } from '../database/drizzle/clients/index';

export class MFAService extends BaseDomainService {
  protected constructor() {
    super();
  }

  public static getInstance(): MFAService {
    return BaseDomainService.resolve<MFAService>(MFAService);
  }

  // MFA operations
  public async createMFAChallenge(
    userId: string,
    method: MFAMethod,
    sessionId: string
  ): Promise<Record<string, unknown>> {
    const challenge = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 300000); // 5 minutes
    const pool = getControlPool();

    const result = await pool.query(
      `INSERT INTO mfa_challenges (user_id, session_id, challenge_type, challenge_data, expires_at, attempts)
       VALUES ($1, $2, $3, $4, $5, 0) RETURNING *`,
      [userId, sessionId, method, JSON.stringify({ challenge }), expiresAt]
    );

    return result.rows[0];
  }

  private async verifyChallengeByFilter(
    filterColumn: 'user_id' | 'session_id',
    filterValue: string,
    code: string
  ): Promise<boolean> {
    const pool = getControlPool();
    const challengeResult = await pool.query(
      `SELECT * FROM mfa_challenges WHERE ${filterColumn} = $1 AND challenge_data->>'challenge' = $2 AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [filterValue, code]
    );
    if (challengeResult.rows.length === 0) return false;
    const challenge = challengeResult.rows[0];
    if (new Date(challenge.expires_at) < new Date()) return false;
    await pool.query(`UPDATE mfa_challenges SET verified_at = $1 WHERE id = $2`, [new Date(), challenge.id]);
    return true;
  }

  public async verifyMFAChallenge(userId: string, code: string): Promise<boolean> {
    return this.verifyChallengeByFilter('user_id', userId, code);
  }

  public async findMFAChallenge(challengeId: string): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(`SELECT * FROM mfa_challenges WHERE id = $1 LIMIT 1`, [
      challengeId,
    ]);
    return result.rows[0] ?? null;
  }

  public async findUserMFAChallenges(userId: string): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM mfa_challenges WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  public async invalidateMFAChallenge(challengeId: string): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(`DELETE FROM mfa_challenges WHERE id = $1`, [challengeId]);
    return (result.rowCount ?? 0) > 0;
  }

  public async cleanupExpiredChallenges(): Promise<void> {
    const pool = getControlPool();
    await pool.query(`DELETE FROM mfa_challenges WHERE expires_at < $1`, [new Date()]);
  }

  public async incrementAttempts(challengeId: string): Promise<boolean> {
    const challenge = await this.findMFAChallenge(challengeId);
    if (!challenge) {
      return false;
    }

    const newAttempts = (challenge.attempts as number) + 1;
    const maxAttempts = 5; // Default max attempts

    // If max attempts reached, invalidate the challenge
    if (newAttempts >= maxAttempts) {
      await this.invalidateMFAChallenge(challengeId);
      return false;
    }

    const pool = getControlPool();
    const result = await pool.query(`UPDATE mfa_challenges SET attempts = $1 WHERE id = $2`, [
      newAttempts,
      challengeId,
    ]);

    return (result.rowCount ?? 0) > 0;
  }

  public async isChallengeValid(challengeId: string): Promise<boolean> {
    const challenge = await this.findMFAChallenge(challengeId);
    if (!challenge) {
      return false;
    }

    // Check if expired
    if (new Date(challenge.expires_at as string) < new Date()) {
      await this.invalidateMFAChallenge(challengeId);
      return false;
    }

    // Check if already verified
    if (challenge.verified_at) {
      return false;
    }

    // Check if max attempts reached
    const maxAttempts = 5;
    if ((challenge.attempts as number) >= maxAttempts) {
      await this.invalidateMFAChallenge(challengeId);
      return false;
    }

    return true;
  }

  public async verifyMFAChallengeBySession(sessionId: string, code: string): Promise<boolean> {
    return this.verifyChallengeByFilter('session_id', sessionId, code);
  }
}
