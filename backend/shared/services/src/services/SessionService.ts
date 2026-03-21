import { Repository } from 'typeorm';
import { BaseDomainService } from './BaseDomainService';
import { SessionEntity } from '../entities/session.entity';
import { AuthenticationMethod } from '@uaip/types';

export class SessionService extends BaseDomainService {
  protected constructor() {
    super();
  }

  public static getInstance(): SessionService {
    return BaseDomainService.resolve<SessionService>(SessionService);
  }

  public getSessionRepository(): Repository<SessionEntity> {
    return this.getRepository('sessionRepo', () =>
      this.typeormService.getDataSource().getRepository(SessionEntity)
    );
  }

  // Session management operations
  public async createSession(
    userId: string,
    sessionToken: string,
    metadata?: Record<string, any>
  ): Promise<SessionEntity> {
    const sessionRepo = this.getSessionRepository();
    const session = sessionRepo.create({
      userId,
      sessionToken,
      metadata,
      expiresAt: new Date(Date.now() + 86400000), // 24 hours
      lastActivityAt: new Date(),
      authenticationMethod: AuthenticationMethod.PASSWORD,
    });

    return await sessionRepo.save(session);
  }

  public async findSession(sessionToken: string): Promise<SessionEntity | null> {
    return await this.getSessionRepository().findOne({
      where: { sessionToken },
    });
  }

  public async findSessionById(id: string): Promise<SessionEntity | null> {
    return await this.getSessionRepository().findOne({
      where: { id },
    });
  }

  public async updateSession(
    id: string,
    data: Partial<SessionEntity>
  ): Promise<SessionEntity | null> {
    const sessionRepo = this.getSessionRepository();
    const result = await sessionRepo.update(id, data);

    if (result.affected === 0) {
      return null;
    }

    return await this.findSessionById(id);
  }

  public async invalidateSession(sessionToken: string): Promise<boolean> {
    const result = await this.getSessionRepository().delete({ sessionToken });
    return result.affected !== 0;
  }

  public async invalidateUserSessions(userId: string): Promise<void> {
    await this.getSessionRepository().delete({ userId });
  }

  public async updateLastActivity(sessionToken: string): Promise<boolean> {
    const result = await this.getSessionRepository().update(
      { sessionToken },
      { lastActivityAt: new Date() }
    );
    return result.affected !== 0;
  }

  public async findUserSessions(userId: string): Promise<SessionEntity[]> {
    return await this.getSessionRepository().find({
      where: { userId },
      order: { lastActivityAt: 'DESC' },
    });
  }

  public async cleanupExpiredSessions(): Promise<void> {
    await this.getSessionRepository()
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :now', { now: new Date() })
      .execute();
  }

  public async isSessionValid(sessionToken: string): Promise<boolean> {
    const session = await this.findSession(sessionToken);
    if (!session) {
      return false;
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      await this.invalidateSession(sessionToken);
      return false;
    }

    return true;
  }

  public async extendSession(sessionToken: string, extensionHours: number = 24): Promise<boolean> {
    const newExpiryTime = new Date(Date.now() + extensionHours * 60 * 60 * 1000);
    const result = await this.getSessionRepository().update(
      { sessionToken },
      { expiresAt: newExpiryTime }
    );
    return result.affected !== 0;
  }
}
