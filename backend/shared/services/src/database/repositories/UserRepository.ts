import { LessThan } from 'typeorm';
import { logger } from '@uaip/utils';
import { SecurityLevel } from '@uaip/types';
import { BaseRepository } from '../base/BaseRepository.js';
import { UserEntity } from '../../entities/user.entity.js';
import { RefreshTokenEntity } from '../../entities/refreshToken.entity.js';
import { PasswordResetTokenEntity } from '../../entities/passwordResetToken.entity.js';

export class UserRepository extends BaseRepository<UserEntity> {
  constructor() {
    super(UserEntity);
  }

  /**
   * Create a new user
   */
  public async createUser(userData: {
    email: string;
    firstName?: string;
    lastName?: string;
    department?: string;
    role: string;
    passwordHash: string;
    securityClearance?: SecurityLevel;
    isActive?: boolean;
  }): Promise<UserEntity> {
    const user = this.repository.create(userData as Partial<UserEntity>);
    return await this.repository.save(user);
  }

  /**
   * Get user by email
   */
  public async getUserByEmail(email: string): Promise<UserEntity | null> {
    return await this.repository.findOne({ where: { email } });
  }

  /**
   * Update user with partial data
   */
  public async updateUser(userId: string, updates: Partial<UserEntity>): Promise<UserEntity | null> {
    await this.repository.update(userId, {
      ...updates,
      updatedAt: new Date()
    });
    return await this.repository.findOne({ where: { id: userId } });
  }

  /**
   * Update user login attempts and lock status
   */
  public async updateUserLoginAttempts(userId: string, failedAttempts: number, lockedUntil?: Date): Promise<void> {
    await this.repository.update(userId, {
      failedLoginAttempts: failedAttempts,
      lockedUntil: lockedUntil,
      updatedAt: new Date()
    });
  }

  /**
   * Reset user login attempts and update last login
   */
  public async resetUserLoginAttempts(userId: string): Promise<void> {
    await this.repository.update(userId, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date()
    });
  }

  /**
   * Soft delete user (deactivate)
   */
  public async deactivateUser(userId: string): Promise<void> {
    await this.repository.update(userId, {
      isActive: false,
      updatedAt: new Date()
    });
  }

  /**
   * Activate user
   */
  public async activateUser(userId: string): Promise<void> {
    await this.repository.update(userId, {
      isActive: true,
      updatedAt: new Date()
    });
  }

  /**
   * Query users with filters and pagination
   */
  public async queryUsers(filters: {
    search?: string;
    role?: string;
    isActive?: boolean;
    department?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: UserEntity[]; total: number }> {
    const queryBuilder = this.repository.createQueryBuilder('user');

    if (filters.search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.role) {
      queryBuilder.andWhere('user.role = :role', { role: filters.role });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive: filters.isActive });
    }

    if (filters.department) {
      queryBuilder.andWhere('user.department = :department', { department: filters.department });
    }

    queryBuilder.orderBy('user.createdAt', 'DESC');

    // Get total count for pagination
    const total = await queryBuilder.getCount();

    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }

    const users = await queryBuilder.getMany();

    return { users, total };
  }

  /**
   * Update user login tracking (failed attempts, last login, etc.)
   */
  public async updateUserLoginTracking(userId: string, updates: {
    failedLoginAttempts?: number;
    lockedUntil?: Date | null;
    lastLoginAt?: Date;
  }): Promise<void> {
    await this.repository.update(userId, {
      ...updates,
      updatedAt: new Date()
    });
  }

  /**
   * Update user password
   */
  public async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await this.repository.update(userId, {
      passwordHash,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date()
    });
  }

  /**
   * Search users with filters
   */
  public async searchUsers(filters: {
    search?: string;
    role?: string;
    department?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ users: UserEntity[]; total: number }> {
    const queryBuilder = this.repository.createQueryBuilder('user');

    if (filters.search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.role) {
      queryBuilder.andWhere('user.role = :role', { role: filters.role });
    }

    if (filters.department) {
      queryBuilder.andWhere('user.department = :department', { department: filters.department });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive: filters.isActive });
    }

    const total = await queryBuilder.getCount();

    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }

    queryBuilder.orderBy('user.createdAt', 'DESC');

    const users = await queryBuilder.getMany();

    return { users, total };
  }

  /**
   * Update user profile
   */
  public async updateUserProfile(userId: string, updates: {
    firstName?: string;
    lastName?: string;
    department?: string;
    role?: string;
    securityClearance?: SecurityLevel;
    isActive?: boolean;
  }): Promise<UserEntity | null> {
    await this.repository.update(userId, {
      ...updates,
      updatedAt: new Date()
    });
    return await this.repository.findOne({ where: { id: userId } });
  }

  /**
   * Get user statistics
   */
  public async getUserStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    roleStats: Array<{ role: string; count: number }>;
    departmentStats: Array<{ department: string; count: number }>;
    recentActivity: Array<{ date: string; loginCount: number }>;
  }> {
    const [totalUsers, activeUsers] = await Promise.all([
      this.repository.count(),
      this.repository.count({ where: { isActive: true } })
    ]);

    const inactiveUsers = totalUsers - activeUsers;

    // Get role statistics
    const roleStatsQuery = this.repository
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .where('user.isActive = :isActive', { isActive: true })
      .groupBy('user.role')
      .orderBy('count', 'DESC');

    const roleStats = await roleStatsQuery.getRawMany();

    // Get department statistics
    const departmentStatsQuery = this.repository
      .createQueryBuilder('user')
      .select('user.department', 'department')
      .addSelect('COUNT(*)', 'count')
      .where('user.isActive = :isActive AND user.department IS NOT NULL', { isActive: true })
      .groupBy('user.department')
      .orderBy('count', 'DESC');

    const departmentStats = await departmentStatsQuery.getRawMany();

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivityQuery = this.repository
      .createQueryBuilder('user')
      .select('DATE(user.lastLoginAt)', 'date')
      .addSelect('COUNT(*)', 'loginCount')
      .where('user.lastLoginAt >= :sevenDaysAgo', { sevenDaysAgo })
      .groupBy('DATE(user.lastLoginAt)')
      .orderBy('date', 'DESC');

    const recentActivity = await recentActivityQuery.getRawMany();

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      roleStats: roleStats.map(stat => ({
        role: stat.role,
        count: parseInt(stat.count)
      })),
      departmentStats: departmentStats.map(stat => ({
        department: stat.department,
        count: parseInt(stat.count)
      })),
      recentActivity: recentActivity.map(activity => ({
        date: activity.date,
        loginCount: parseInt(activity.loginCount)
      }))
    };
  }

  /**
   * Get user authentication details for security validation
   */
  public async getUserAuthDetails(userId: string): Promise<{
    id: string;
    isActive: boolean;
    role: string;
    securityClearance?: SecurityLevel;
  } | null> {
    try {
      const user = await this.repository.findOne({
        where: { id: userId },
        select: ['id', 'isActive', 'role', 'securityClearance']
      });

      return user ? {
        id: user.id,
        isActive: user.isActive,
        role: user.role,
        securityClearance: user.securityClearance
      } : null;
    } catch (error) {
      logger.error('Error getting user auth details', { userId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get user permissions for security validation
   */
  public async getUserPermissions(userId: string): Promise<{
    rolePermissions: Array<{ roleName: string; permissionType: string; operations: string[] }>;
    directPermissions: Array<{ permissionType: string; operations: string[] }>;
  }> {
    try {
      const manager = this.getEntityManager();
      
      // Get role-based permissions
      const rolePermissionsQuery = `
        SELECT r.name as role_name, p.type as permission_type, p.operations
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        LEFT JOIN roles r ON ur.role_id = r.id
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        WHERE u.id = $1 AND p.operations IS NOT NULL
      `;

      // Get direct user permissions
      const directPermissionsQuery = `
        SELECT p.type as permission_type, p.operations
        FROM users u
        LEFT JOIN user_permissions up ON u.id = up.user_id AND (up.expires_at IS NULL OR up.expires_at > NOW())
        LEFT JOIN permissions p ON up.permission_id = p.id
        WHERE u.id = $1 AND p.operations IS NOT NULL
      `;

      const [roleResults, directResults] = await Promise.all([
        manager.query(rolePermissionsQuery, [userId]),
        manager.query(directPermissionsQuery, [userId])
      ]);

      return {
        rolePermissions: roleResults.map((row: any) => ({
          roleName: row.role_name,
          permissionType: row.permission_type,
          operations: row.operations || []
        })),
        directPermissions: directResults.map((row: any) => ({
          permissionType: row.permission_type,
          operations: row.operations || []
        }))
      };
    } catch (error) {
      logger.error('Error getting user permissions', { userId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get user risk assessment data
   */
  public async getUserRiskData(userId: string): Promise<{
    securityClearance?: SecurityLevel;
    role: string;
    lastLoginAt?: Date;
    createdAt: Date;
    recentActivityCount: number;
  } | null> {
    try {
      const manager = this.getEntityManager();
      
      // Get user data with recent activity count
      const query = `
        SELECT 
          u.security_clearance,
          u.role,
          u.last_login_at,
          u.created_at,
          (SELECT COUNT(*) FROM audit_events WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '24 hours') as recent_activity_count
        FROM users u
        WHERE u.id = $1
      `;

      const result = await manager.query(query, [userId]);
      
      if (result.length === 0) {
        return null;
      }

      const user = result[0];
      return {
        securityClearance: user.security_clearance,
        role: user.role,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        recentActivityCount: parseInt(user.recent_activity_count) || 0
      };
    } catch (error) {
      logger.error('Error getting user risk data', { userId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get user's highest role for data access level determination
   */
  public async getUserHighestRole(userId: string): Promise<string | null> {
    try {
      const manager = this.getEntityManager();
      
      const query = `
        SELECT r.name 
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE u.id = $1
        ORDER BY 
          CASE r.name 
            WHEN 'admin' THEN 1
            WHEN 'operator' THEN 2
            WHEN 'viewer' THEN 3
            ELSE 4
          END
        LIMIT 1
      `;

      const result = await manager.query(query, [userId]);
      
      return result.length > 0 ? result[0].name : null;
    } catch (error) {
      logger.error('Error getting user highest role', { userId, error: (error as Error).message });
      throw error;
    }
  }
}

export class RefreshTokenRepository extends BaseRepository<RefreshTokenEntity> {
  constructor() {
    super(RefreshTokenEntity);
  }

  /**
   * Create refresh token
   */
  public async createRefreshToken(tokenData: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<RefreshTokenEntity> {
    const refreshToken = this.repository.create(tokenData);
    return await this.repository.save(refreshToken);
  }

  /**
   * Get refresh token with user data
   */
  public async getRefreshTokenWithUser(token: string): Promise<RefreshTokenEntity | null> {
    return await this.repository.findOne({
      where: { token },
      relations: ['user']
    });
  }

  /**
   * Revoke refresh token
   */
  public async revokeRefreshToken(token: string): Promise<void> {
    await this.repository.update(
      { token },
      { revokedAt: new Date(), updatedAt: new Date() }
    );
  }

  /**
   * Revoke all user refresh tokens
   */
  public async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.repository.update(
      { userId, revokedAt: null },
      { revokedAt: new Date(), updatedAt: new Date() }
    );
  }

  /**
   * Clean up expired refresh tokens
   */
  public async cleanupExpiredRefreshTokens(): Promise<number> {
    const result = await this.repository.delete({
      expiresAt: LessThan(new Date())
    });
    return result.affected || 0;
  }
}

export class PasswordResetTokenRepository extends BaseRepository<PasswordResetTokenEntity> {
  constructor() {
    super(PasswordResetTokenEntity);
  }

  /**
   * Create password reset token
   */
  public async createPasswordResetToken(tokenData: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenEntity> {
    const resetToken = this.repository.create(tokenData);
    return await this.repository.save(resetToken);
  }

  /**
   * Get password reset token with user data
   */
  public async getPasswordResetTokenWithUser(token: string): Promise<PasswordResetTokenEntity | null> {
    return await this.repository.findOne({
      where: { token, usedAt: null },
      relations: ['user']
    });
  }

  /**
   * Mark password reset token as used
   */
  public async markPasswordResetTokenAsUsed(token: string): Promise<void> {
    await this.repository.update(
      { token },
      { usedAt: new Date(), updatedAt: new Date() }
    );
  }

  /**
   * Clean up expired password reset tokens
   */
  public async cleanupExpiredPasswordResetTokens(): Promise<number> {
    const result = await this.repository.delete({
      expiresAt: LessThan(new Date())
    });
    return result.affected || 0;
  }
} 