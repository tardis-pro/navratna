import { Repository } from 'typeorm';
import { logger } from '@uaip/utils/logger';
import { TypeOrmService } from '../typeormService';
import { 
  UserRepository, 
  RefreshTokenRepository, 
  PasswordResetTokenRepository 
} from '../database/repositories/UserRepository';
import { UserEntity } from '../entities/user.entity';
import { RefreshTokenEntity } from '../entities/refreshToken.entity';
import { PasswordResetTokenEntity } from '../entities/passwordResetToken.entity';
import { OAuthProviderEntity } from '../entities/oauthProvider.entity';
import { OAuthStateEntity } from '../entities/oauthState.entity';
import { MFAChallengeEntity } from '../entities/mfaChallenge.entity';
import { SessionEntity } from '../entities/session.entity';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export class UserService {
  private static instance: UserService;
  private typeormService: TypeOrmService;
  
  // Repositories
  private userRepository: UserRepository | null = null;
  private refreshTokenRepository: RefreshTokenRepository | null = null;
  private passwordResetTokenRepository: PasswordResetTokenRepository | null = null;
  private oauthProviderRepository: Repository<OAuthProviderEntity> | null = null;
  private oauthStateRepository: Repository<OAuthStateEntity> | null = null;
  private mfaChallengeRepository: Repository<MFAChallengeEntity> | null = null;
  private sessionRepository: Repository<SessionEntity> | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

  public static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  // Repository getters with lazy initialization
  public getUserRepository(): UserRepository {
    if (!this.userRepository) {
      this.userRepository = new UserRepository(this.typeormService.dataSource, UserEntity);
    }
    return this.userRepository;
  }

  public getRefreshTokenRepository(): RefreshTokenRepository {
    if (!this.refreshTokenRepository) {
      this.refreshTokenRepository = new RefreshTokenRepository(this.typeormService.dataSource, RefreshTokenEntity);
    }
    return this.refreshTokenRepository;
  }

  public getPasswordResetTokenRepository(): PasswordResetTokenRepository {
    if (!this.passwordResetTokenRepository) {
      this.passwordResetTokenRepository = new PasswordResetTokenRepository(this.typeormService.dataSource, PasswordResetTokenEntity);
    }
    return this.passwordResetTokenRepository;
  }

  public getOAuthProviderRepository(): Repository<OAuthProviderEntity> {
    if (!this.oauthProviderRepository) {
      this.oauthProviderRepository = this.typeormService.dataSource.getRepository(OAuthProviderEntity);
    }
    return this.oauthProviderRepository;
  }

  public getOAuthStateRepository(): Repository<OAuthStateEntity> {
    if (!this.oauthStateRepository) {
      this.oauthStateRepository = this.typeormService.dataSource.getRepository(OAuthStateEntity);
    }
    return this.oauthStateRepository;
  }

  public getMFAChallengeRepository(): Repository<MFAChallengeEntity> {
    if (!this.mfaChallengeRepository) {
      this.mfaChallengeRepository = this.typeormService.dataSource.getRepository(MFAChallengeEntity);
    }
    return this.mfaChallengeRepository;
  }

  public getSessionRepository(): Repository<SessionEntity> {
    if (!this.sessionRepository) {
      this.sessionRepository = this.typeormService.dataSource.getRepository(SessionEntity);
    }
    return this.sessionRepository;
  }

  // User operations
  public async createUser(data: {
    email: string;
    password?: string;
    name?: string;
    role?: string;
    isOAuthUser?: boolean;
  }): Promise<UserEntity> {
    const userRepo = this.getUserRepository();
    
    const user = userRepo.create({
      email: data.email,
      name: data.name,
      role: data.role || 'user',
      isOAuthUser: data.isOAuthUser || false
    });

    if (data.password) {
      user.password = await bcrypt.hash(data.password, 10);
    }

    return await userRepo.save(user);
  }

  public async findUserByEmail(email: string): Promise<UserEntity | null> {
    return await this.getUserRepository().findOne({ where: { email } });
  }

  public async findUserById(id: string): Promise<UserEntity | null> {
    return await this.getUserRepository().findOne({ where: { id } });
  }

  public async updateUser(id: string, data: Partial<UserEntity>): Promise<UserEntity | null> {
    await this.getUserRepository().update(id, data);
    return await this.findUserById(id);
  }

  public async deleteUser(id: string): Promise<boolean> {
    const result = await this.getUserRepository().delete(id);
    return result.affected !== 0;
  }

  public async verifyPassword(user: UserEntity, password: string): Promise<boolean> {
    if (!user.password) return false;
    return await bcrypt.compare(password, user.password);
  }

  // Refresh token operations
  public async createRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshTokenEntity> {
    const refreshTokenRepo = this.getRefreshTokenRepository();
    const refreshToken = refreshTokenRepo.create({
      user: { id: userId },
      token,
      expiresAt
    });
    return await refreshTokenRepo.save(refreshToken);
  }

  public async findRefreshToken(token: string): Promise<RefreshTokenEntity | null> {
    return await this.getRefreshTokenRepository().findOne({
      where: { token },
      relations: ['user']
    });
  }

  public async revokeRefreshToken(token: string): Promise<boolean> {
    const result = await this.getRefreshTokenRepository().update(
      { token },
      { revoked: true }
    );
    return result.affected !== 0;
  }

  public async cleanupExpiredTokens(): Promise<void> {
    await this.getRefreshTokenRepository().delete({
      expiresAt: LessThan(new Date())
    });
  }

  // Password reset operations
  public async createPasswordResetToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    const resetTokenRepo = this.getPasswordResetTokenRepository();
    await resetTokenRepo.save({
      user: { id: userId },
      token,
      expiresAt
    });

    return token;
  }

  public async findPasswordResetToken(token: string): Promise<PasswordResetTokenEntity | null> {
    return await this.getPasswordResetTokenRepository().findOne({
      where: { token, used: false },
      relations: ['user']
    });
  }

  public async usePasswordResetToken(token: string): Promise<boolean> {
    const result = await this.getPasswordResetTokenRepository().update(
      { token },
      { used: true }
    );
    return result.affected !== 0;
  }

  // MFA operations
  public async createMFAChallenge(userId: string, method: string): Promise<MFAChallengeEntity> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 300000); // 5 minutes

    const mfaRepo = this.getMFAChallengeRepository();
    const challenge = mfaRepo.create({
      user: { id: userId },
      method,
      code,
      expiresAt
    });

    return await mfaRepo.save(challenge);
  }

  public async verifyMFAChallenge(userId: string, code: string): Promise<boolean> {
    const mfaRepo = this.getMFAChallengeRepository();
    const challenge = await mfaRepo.findOne({
      where: {
        user: { id: userId },
        code,
        verified: false
      }
    });

    if (!challenge || challenge.expiresAt < new Date()) {
      return false;
    }

    await mfaRepo.update(challenge.id, { verified: true });
    return true;
  }

  // Session management
  public async createSession(userId: string, token: string, metadata?: any): Promise<SessionEntity> {
    const sessionRepo = this.getSessionRepository();
    const session = sessionRepo.create({
      user: { id: userId },
      token,
      metadata,
      expiresAt: new Date(Date.now() + 86400000) // 24 hours
    });

    return await sessionRepo.save(session);
  }

  public async findSession(token: string): Promise<SessionEntity | null> {
    return await this.getSessionRepository().findOne({
      where: { token },
      relations: ['user']
    });
  }

  public async invalidateSession(token: string): Promise<boolean> {
    const result = await this.getSessionRepository().delete({ token });
    return result.affected !== 0;
  }

  public async invalidateUserSessions(userId: string): Promise<void> {
    await this.getSessionRepository().delete({ user: { id: userId } });
  }
}