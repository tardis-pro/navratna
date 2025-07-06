import { Repository } from 'typeorm';
import { TypeOrmService } from '../typeormService';
import { MFAChallengeEntity } from '../entities/mfaChallenge.entity';
import { MFAMethod } from '@uaip/types';

export class MFAService {
  private static instance: MFAService;
  private typeormService: TypeOrmService;
  private mfaChallengeRepository: Repository<MFAChallengeEntity> | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

  public static getInstance(): MFAService {
    if (!MFAService.instance) {
      MFAService.instance = new MFAService();
    }
    return MFAService.instance;
  }

  public getMFAChallengeRepository(): Repository<MFAChallengeEntity> {
    if (!this.mfaChallengeRepository) {
      this.mfaChallengeRepository = this.typeormService.getDataSource().getRepository(MFAChallengeEntity);
    }
    return this.mfaChallengeRepository;
  }

  // MFA operations
  public async createMFAChallenge(userId: string, method: MFAMethod, sessionId: string): Promise<MFAChallengeEntity> {
    const challenge = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 300000); // 5 minutes

    const mfaRepo = this.getMFAChallengeRepository();
    const challengeEntity = mfaRepo.create({
      userId,
      sessionId,
      method,
      challenge,
      expiresAt
    });

    return await mfaRepo.save(challengeEntity);
  }

  public async verifyMFAChallenge(userId: string, code: string): Promise<boolean> {
    const mfaRepo = this.getMFAChallengeRepository();
    const challengeEntity = await mfaRepo.findOne({
      where: {
        userId,
        challenge: code,
        isVerified: false
      }
    });

    if (!challengeEntity || challengeEntity.expiresAt < new Date()) {
      return false;
    }

    await mfaRepo.update(challengeEntity.id, {
      isVerified: true,
      verifiedAt: new Date()
    });
    return true;
  }

  public async findMFAChallenge(challengeId: string): Promise<MFAChallengeEntity | null> {
    return await this.getMFAChallengeRepository().findOne({
      where: { id: challengeId }
    });
  }

  public async findUserMFAChallenges(userId: string): Promise<MFAChallengeEntity[]> {
    return await this.getMFAChallengeRepository().find({
      where: { userId },
      order: { createdAt: 'DESC' }
    });
  }

  public async invalidateMFAChallenge(challengeId: string): Promise<boolean> {
    const result = await this.getMFAChallengeRepository().delete({ id: challengeId });
    return result.affected !== 0;
  }

  public async cleanupExpiredChallenges(): Promise<void> {
    await this.getMFAChallengeRepository()
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :now', { now: new Date() })
      .execute();
  }

  public async incrementAttempts(challengeId: string): Promise<boolean> {
    const challenge = await this.findMFAChallenge(challengeId);
    if (!challenge) {
      return false;
    }

    const newAttempts = challenge.attempts + 1;

    // If max attempts reached, invalidate the challenge
    if (newAttempts >= challenge.maxAttempts) {
      await this.invalidateMFAChallenge(challengeId);
      return false;
    }

    const result = await this.getMFAChallengeRepository().update(challengeId, {
      attempts: newAttempts
    });

    return result.affected !== 0;
  }

  public async isChallengeValid(challengeId: string): Promise<boolean> {
    const challenge = await this.findMFAChallenge(challengeId);
    if (!challenge) {
      return false;
    }

    // Check if expired
    if (challenge.expiresAt < new Date()) {
      await this.invalidateMFAChallenge(challengeId);
      return false;
    }

    // Check if already verified
    if (challenge.isVerified) {
      return false;
    }

    // Check if max attempts reached
    if (challenge.attempts >= challenge.maxAttempts) {
      await this.invalidateMFAChallenge(challengeId);
      return false;
    }

    return true;
  }

  public async verifyMFAChallengeBySession(sessionId: string, code: string): Promise<boolean> {
    const mfaRepo = this.getMFAChallengeRepository();
    const challengeEntity = await mfaRepo.findOne({
      where: {
        sessionId,
        challenge: code,
        isVerified: false
      }
    });

    if (!challengeEntity || challengeEntity.expiresAt < new Date()) {
      return false;
    }

    await mfaRepo.update(challengeEntity.id, {
      isVerified: true,
      verifiedAt: new Date()
    });
    return true;
  }
}
