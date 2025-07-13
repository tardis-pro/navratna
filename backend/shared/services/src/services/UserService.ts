import {
  UserRepository,
  RefreshTokenRepository,
  PasswordResetTokenRepository
} from '../database/repositories/UserRepository';
import { LLMProviderRepository } from '../database/repositories/LLMProviderRepository';
import { UserLLMProviderRepository } from '../database/repositories/UserLLMProviderRepository';
import { UserLLMPreferenceRepository } from '../database/repositories/UserLLMPreferenceRepository';
import { UserContactRepository } from '../database/repositories/UserContactRepository';
import { TypeOrmService } from '../typeormService';
import { UserEntity } from '../entities/user.entity';
import { RefreshTokenEntity } from '../entities/refreshToken.entity';
import { PasswordResetTokenEntity } from '../entities/passwordResetToken.entity';
import { UserLLMPreference } from '../entities/userLLMPreference.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export class UserService {
  private static instance: UserService;
  private typeormService: TypeOrmService;

  // Repositories
  private userRepository: UserRepository | null = null;
  private refreshTokenRepository: RefreshTokenRepository | null = null;
  private passwordResetTokenRepository: PasswordResetTokenRepository | null = null;
  private llmProviderRepository: LLMProviderRepository | null = null;
  private userLLMProviderRepository: UserLLMProviderRepository | null = null;
  private userLLMPreferenceRepository: UserLLMPreferenceRepository | null = null;
  private userContactRepository: UserContactRepository | null = null;

  protected constructor() {
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
      this.userRepository = new UserRepository();
    }
    return this.userRepository;
  }

  public getRefreshTokenRepository(): RefreshTokenRepository {
    if (!this.refreshTokenRepository) {
      this.refreshTokenRepository = new RefreshTokenRepository();
    }
    return this.refreshTokenRepository;
  }

  public getPasswordResetTokenRepository(): PasswordResetTokenRepository {
    if (!this.passwordResetTokenRepository) {
      this.passwordResetTokenRepository = new PasswordResetTokenRepository();
    }
    return this.passwordResetTokenRepository;
  }

  public getLLMProviderRepository(): LLMProviderRepository {
    if (!this.llmProviderRepository) {
      this.llmProviderRepository = new LLMProviderRepository();
    }
    return this.llmProviderRepository;
  }

  public getUserLLMProviderRepository(): UserLLMProviderRepository {
    if (!this.userLLMProviderRepository) {
      this.userLLMProviderRepository = new UserLLMProviderRepository();
    }
    return this.userLLMProviderRepository;
  }

  public getUserLLMPreferenceRepository(): UserLLMPreferenceRepository {
    if (!this.userLLMPreferenceRepository) {
      const typeormService = this.typeormService || TypeOrmService.getInstance();
      const repository = typeormService.getRepository(UserLLMPreference);
      this.userLLMPreferenceRepository = new UserLLMPreferenceRepository(repository);
    }
    return this.userLLMPreferenceRepository;
  }

  public getUserContactRepository(): UserContactRepository {
    if (!this.userContactRepository) {
      this.userContactRepository = new UserContactRepository();
    }
    return this.userContactRepository;
  }

  // Note: OAuth, MFA, and Session operations should be handled by dedicated services
  // These methods are kept for backward compatibility but should be migrated

  // User operations
  public async createUser(data: {
    email: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    department?: string;
    isOAuthUser?: boolean;
  }): Promise<UserEntity> {
    const userRepo = this.getUserRepository();

    const userData = {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      department: data.department,
      role: data.role || 'user',
      passwordHash: data.password ? await bcrypt.hash(data.password, 10) : '',
      isActive: true
    };

    return await userRepo.createUser(userData);
  }

  public async findUserByEmail(email: string): Promise<UserEntity | null> {
    return await this.getUserRepository().getUserByEmail(email);
  }

  public async findUserById(id: string): Promise<UserEntity | null> {
    return await this.getUserRepository().findById(id);
  }

  public async updateUser(id: string, data: Partial<UserEntity>): Promise<UserEntity | null> {
    return await this.getUserRepository().updateUser(id, data);
  }

  public async deleteUser(id: string): Promise<boolean> {
    return await this.getUserRepository().delete(id);
  }

  public async verifyPassword(user: UserEntity, password: string): Promise<boolean> {
    if (!user.passwordHash) return false;
    return await bcrypt.compare(password, user.passwordHash);
  }

  // Refresh token operations
  public async createRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshTokenEntity> {
    const refreshTokenRepo = this.getRefreshTokenRepository();
    return await refreshTokenRepo.createRefreshToken({
      userId,
      token,
      expiresAt
    });
  }

  public async findRefreshToken(token: string): Promise<RefreshTokenEntity | null> {
    return await this.getRefreshTokenRepository().getRefreshTokenWithUser(token);
  }

  public async revokeRefreshToken(token: string): Promise<boolean> {
    try {
      await this.getRefreshTokenRepository().revokeRefreshToken(token);
      return true;
    } catch {
      return false;
    }
  }

  public async cleanupExpiredTokens(): Promise<void> {
    await this.getRefreshTokenRepository().cleanupExpiredRefreshTokens();
  }

  // Password reset operations
  public async createPasswordResetToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    const resetTokenRepo = this.getPasswordResetTokenRepository();
    await resetTokenRepo.createPasswordResetToken({
      userId,
      token,
      expiresAt
    });

    return token;
  }

  public async findPasswordResetToken(token: string): Promise<PasswordResetTokenEntity | null> {
    return await this.getPasswordResetTokenRepository().getPasswordResetTokenWithUser(token);
  }

  public async usePasswordResetToken(token: string): Promise<boolean> {
    try {
      await this.getPasswordResetTokenRepository().markPasswordResetTokenAsUsed(token);
      return true;
    } catch {
      return false;
    }
  }

  // User management methods
  public async updateLoginTracking(userId: string, data: {
    failedLoginAttempts?: number;
    lockedUntil?: Date;
    lastLoginAt?: Date;
  }): Promise<void> {
    const userRepo = this.getUserRepository();
    await userRepo.updateUserLoginTracking(userId, data);
  }

  public async resetLoginAttempts(userId: string): Promise<void> {
    const userRepo = this.getUserRepository();
    await userRepo.resetUserLoginAttempts(userId);
  }

  public async getRefreshTokenWithUser(token: string): Promise<any | null> {
    const refreshTokenRepo = this.getRefreshTokenRepository();
    return await refreshTokenRepo.getRefreshTokenWithUser(token);
  }

  public async revokeAllRefreshTokens(userId: string): Promise<void> {
    const refreshTokenRepo = this.getRefreshTokenRepository();
    await refreshTokenRepo.revokeAllUserRefreshTokens(userId);
  }

  public async updatePassword(userId: string, newPassword: string): Promise<void> {
    const userRepo = this.getUserRepository();
    await userRepo.updateUserPassword(userId, await bcrypt.hash(newPassword, 12));
  }

  public async getPasswordResetTokenWithUser(token: string): Promise<any | null> {
    const resetTokenRepo = this.getPasswordResetTokenRepository();
    return await resetTokenRepo.getPasswordResetTokenWithUser(token);
  }

  public async markPasswordResetTokenAsUsed(token: string): Promise<void> {
    const resetTokenRepo = this.getPasswordResetTokenRepository();
    await resetTokenRepo.markPasswordResetTokenAsUsed(token);
  }

  // Note: MFA and Session operations have been moved to dedicated services
  // These should be handled by SecurityService and SessionService respectively
}