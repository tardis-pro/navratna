import { eq, and, ilike, desc, sql, lt, or, isNull } from 'drizzle-orm';
import { users, refreshTokens, passwordResetTokens } from '../drizzle/schemas/control.schema';
import { getControlDb, getControlPool } from '../drizzle/clients/index';
import { BaseRepository } from '../base/BaseRepository';
import { logger } from '@uaip/utils';
import type { SecurityLevel } from '@uaip/types';
import type { User, RefreshToken } from '../drizzle/schemas/control.schema';
import type { passwordResetTokens as PasswordResetTokensTable } from '../drizzle/schemas/control.schema';
type PasswordResetToken = Omit<
  typeof PasswordResetTokensTable.$inferSelect,
  'userId' | 'token' | 'expiresAt' | 'createdAt' | 'updatedAt'
> & {
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export class UserRepository extends BaseRepository<Record<string, unknown>> {
  protected get tableName(): string {
    return 'users';
  }

  protected get plane(): 'control' {
    return 'control';
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
  }): Promise<User> {
    const db = getControlDb();
    const [result] = await db.insert(users).values(userData).returning();
    return result;
  }

  /**
   * Get user by email
   */
  public async getUserByEmail(email: string): Promise<User | null> {
    const db = getControlDb();
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Find user by ID
   */
  public async findUserById(id: string): Promise<User | null> {
    const db = getControlDb();
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Update user with partial data
   */
  public async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const db = getControlDb();
    await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return this.findUserById(userId);
  }

  /**
   * Update user login attempts and lock status
   */
  public async updateUserLoginAttempts(
    userId: string,
    failedAttempts: number,
    lockedUntil?: Date
  ): Promise<void> {
    const db = getControlDb();
    await db
      .update(users)
      .set({
        failedLoginAttempts: failedAttempts,
        lockedUntil: lockedUntil ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  /**
   * Reset user login attempts and update last login
   */
  public async resetUserLoginAttempts(userId: string): Promise<void> {
    const db = getControlDb();
    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  /**
   * Soft delete user (deactivate)
   */
  public async deactivateUser(userId: string): Promise<void> {
    const db = getControlDb();
    await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Activate user
   */
  public async activateUser(userId: string): Promise<void> {
    const db = getControlDb();
    await db
      .update(users)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
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
  }): Promise<{ users: User[]; total: number }> {
    const pool = getControlPool();
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.search) {
      conditions.push(
        `(email ILIKE $${paramIndex} OR first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex})`
      );
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.role) {
      conditions.push(`role = $${paramIndex}`);
      params.push(filters.role);
      paramIndex++;
    }

    if (filters.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex}`);
      params.push(filters.isActive);
      paramIndex++;
    }

    if (filters.department) {
      conditions.push(`department = $${paramIndex}`);
      params.push(filters.department);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int as cnt FROM users ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.cnt ?? 0;

    // Get paginated results
    let query = `SELECT * FROM users ${whereClause} ORDER BY created_at DESC`;
    if (filters.limit) {
      query += ` LIMIT ${filters.limit}`;
    }
    if (filters.offset) {
      query += ` OFFSET ${filters.offset}`;
    }

    const result = await pool.query<User>(query, params);
    return { users: result.rows, total };
  }

  /**
   * Update user login tracking (failed attempts, last login, etc.)
   */
  public async updateUserLoginTracking(
    userId: string,
    updates: {
      failedLoginAttempts?: number;
      lockedUntil?: Date | null;
      lastLoginAt?: Date;
    }
  ): Promise<void> {
    const db = getControlDb();
    await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Update user password
   */
  public async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    const db = getControlDb();
    await db
      .update(users)
      .set({
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
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
  }): Promise<{ users: User[]; total: number }> {
    return this.queryUsers(filters);
  }

  /**
   * Update user profile
   */
  public async updateUserProfile(
    userId: string,
    updates: {
      firstName?: string;
      lastName?: string;
      department?: string;
      role?: string;
      securityClearance?: SecurityLevel;
      isActive?: boolean;
    }
  ): Promise<User | null> {
    return this.updateUser(userId, updates);
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
    const pool = getControlPool();

    // Get total and active counts
    const [totalResult, activeResult] = await Promise.all([
      pool.query<{ cnt: number }>('SELECT COUNT(*)::int as cnt FROM users'),
      pool.query<{ cnt: number }>('SELECT COUNT(*)::int as cnt FROM users WHERE is_active = true'),
    ]);

    const totalUsers = totalResult.rows[0]?.cnt ?? 0;
    const activeUsers = activeResult.rows[0]?.cnt ?? 0;
    const inactiveUsers = totalUsers - activeUsers;

    // Get role statistics
    const roleStatsResult = await pool.query<{ role: string; count: string }>(
      `SELECT role, COUNT(*)::int as count FROM users WHERE is_active = true GROUP BY role ORDER BY count DESC`
    );
    const roleStats = roleStatsResult.rows.map((stat) => ({
      role: stat.role,
      count: parseInt(stat.count),
    }));

    // Get department statistics
    const departmentStatsResult = await pool.query<{ department: string; count: string }>(
      `SELECT department, COUNT(*)::int as count FROM users WHERE is_active = true AND department IS NOT NULL GROUP BY department ORDER BY count DESC`
    );
    const departmentStats = departmentStatsResult.rows.map((stat) => ({
      department: stat.department,
      count: parseInt(stat.count),
    }));

    // Get recent activity (last 7 days)
    const recentActivityResult = await pool.query<{ date: Date; loginCount: string }>(
      `SELECT DATE(last_login_at) as date, COUNT(*)::int as loginCount 
       FROM users 
       WHERE last_login_at >= NOW() - INTERVAL '7 days' 
       GROUP BY DATE(last_login_at) 
       ORDER BY date DESC`
    );
    const recentActivity = recentActivityResult.rows.map((activity) => ({
      date: activity.date.toISOString().split('T')[0],
      loginCount: parseInt(activity.loginCount),
    }));

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      roleStats,
      departmentStats,
      recentActivity,
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
      const db = getControlDb();
      const result = await db
        .select({
          id: users.id,
          isActive: users.isActive,
          role: users.role,
          securityClearance: users.securityClearance,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (result.length === 0) return null;

      const user = result[0];
      return {
        id: user.id,
        isActive: user.isActive,
        role: user.role,
        securityClearance: user.securityClearance ?? undefined,
      };
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
      const pool = getControlPool();

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
        pool.query<{ role_name: string; permission_type: string; operations: unknown }>(
          rolePermissionsQuery,
          [userId]
        ),
        pool.query<{ permission_type: string; operations: unknown }>(directPermissionsQuery, [
          userId,
        ]),
      ]);

      return {
        rolePermissions: roleResults.rows.map((row) => ({
          roleName: row.role_name,
          permissionType: row.permission_type,
          operations: (row.operations as string[]) || [],
        })),
        directPermissions: directResults.rows.map((row) => ({
          permissionType: row.permission_type,
          operations: (row.operations as string[]) || [],
        })),
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
      const pool = getControlPool();

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

      const result = await pool.query<{
        security_clearance: SecurityLevel | null;
        role: string;
        last_login_at: Date | null;
        created_at: Date;
        recent_activity_count: string;
      }>(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        securityClearance: row.security_clearance ?? undefined,
        role: row.role,
        lastLoginAt: row.last_login_at ?? undefined,
        createdAt: row.created_at,
        recentActivityCount: parseInt(row.recent_activity_count),
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
      const pool = getControlPool();

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

      const result = await pool.query<{ name: string }>(query, [userId]);
      return result.rows[0]?.name ?? null;
    } catch (error) {
      logger.error('Error getting user highest role', { userId, error: (error as Error).message });
      throw error;
    }
  }
}

export class RefreshTokenRepository extends BaseRepository<Record<string, unknown>> {
  protected get tableName(): string {
    return 'refresh_tokens';
  }

  protected get plane(): 'control' {
    return 'control';
  }

  /**
   * Create refresh token
   */
  public async createRefreshToken(tokenData: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    const db = getControlDb();
    const [result] = await db.insert(refreshTokens).values(tokenData).returning();
    return result;
  }

  /**
   * Get refresh token with user data
   */
  public async getRefreshTokenWithUser(
    token: string
  ): Promise<(RefreshToken & { user?: User }) | null> {
    const db = getControlDb();
    const result = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, token))
      .limit(1);

    if (result.length === 0) return null;

    const refreshToken = result[0];

    // Fetch associated user
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, refreshToken.userId))
      .limit(1);

    return {
      ...refreshToken,
      user: userResult[0] ?? undefined,
    };
  }

  /**
   * Revoke refresh token
   */
  public async revokeRefreshToken(token: string): Promise<void> {
    const db = getControlDb();
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(refreshTokens.token, token));
  }

  /**
   * Revoke all user refresh tokens
   */
  public async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    const db = getControlDb();
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.revokedAt, null)));
  }

  /**
   * Clean up expired refresh tokens
   */
  public async cleanupExpiredRefreshTokens(): Promise<number> {
    const db = getControlDb();
    const result = await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));
    return result.rowCount ?? 0;
  }
}

export class PasswordResetTokenRepository extends BaseRepository<Record<string, unknown>> {
  protected get tableName(): string {
    return 'password_reset_tokens';
  }

  protected get plane(): 'control' {
    return 'control';
  }

  /**
   * Create password reset token
   */
  public async createPasswordResetToken(tokenData: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<PasswordResetToken> {
    const db = getControlDb();
    const [result] = await db.insert(passwordResetTokens).values(tokenData).returning();
    return result;
  }

  /**
   * Get password reset token with user data
   */
  public async getPasswordResetTokenWithUser(
    token: string
  ): Promise<(PasswordResetToken & { user?: User }) | null> {
    const db = getControlDb();
    const result = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.token, token), isNull(passwordResetTokens.usedAt)))
      .limit(1);

    if (result.length === 0) return null;

    const resetToken = result[0];

    // Fetch associated user
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, resetToken.userId))
      .limit(1);

    return {
      ...resetToken,
      user: userResult[0] ?? undefined,
    };
  }

  /**
   * Mark password reset token as used
   */
  public async markPasswordResetTokenAsUsed(token: string): Promise<void> {
    const db = getControlDb();
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date(), updatedAt: new Date() })
      .where(eq(passwordResetTokens.token, token));
  }

  /**
   * Clean up expired password reset tokens
   */
  public async cleanupExpiredPasswordResetTokens(): Promise<number> {
    const db = getControlDb();
    const result = await db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()));
    return result.rowCount ?? 0;
  }

  /**
   * Get user by OAuth provider
   */
  public async getUserByOAuthProvider(
    providerId: string,
    providerUserId: string
  ): Promise<User | null> {
    try {
      const pool = getControlPool();

      const query = `
        SELECT u.*
        FROM users u
        INNER JOIN agent_oauth_connections aoc ON u.id = aoc.agent_id
        WHERE aoc.provider_id = $1
        AND aoc.metadata->>'providerUserId' = $2
        AND aoc.is_active = true
      `;

      const result = await pool.query<User>(query, [providerId, providerUserId]);
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error('Error getting user by OAuth provider', {
        providerId,
        providerUserId,
        error: (error as Error).message,
      });
      return null;
    }
  }
}
