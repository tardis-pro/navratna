import { eq, and, lt, isNull, isNotNull, ilike, or, count, sql, gte, desc } from 'drizzle-orm';
import {
    users,
    refreshTokens,
    passwordResetTokens,
    auditEvents,
} from '../drizzle/schemas/control.schema';
import { getControlDb, getControlPool } from '../drizzle/clients/index';
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

export class UserRepository {

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

    public async findById(id: string): Promise<User | null> {
        return this.findUserById(id);
    }

    public async delete(id: string): Promise<boolean> {
        const db = getControlDb();
        const result = await db.delete(users).where(eq(users.id, id));
        return (result.rowCount ?? 0) > 0;
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
        const db = getControlDb();
        const conditions = [];

        if (filters.search) {
            const searchTerm = `%${filters.search}%`;
            conditions.push(
                or(
                    ilike(users.email, searchTerm),
                    ilike(users.firstName, searchTerm),
                    ilike(users.lastName, searchTerm)
                )
            );
        }

        if (filters.role) {
            conditions.push(eq(users.role, filters.role));
        }

        if (filters.isActive !== undefined) {
            conditions.push(eq(users.isActive, filters.isActive));
        }

        if (filters.department) {
            conditions.push(eq(users.department, filters.department));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const countQuery = db.select({ total: count() }).from(users);
        const [{ total }] = whereClause ? await countQuery.where(whereClause) : await countQuery;

        const userQuery = db.select().from(users);
        const usersResult = whereClause
            ? await userQuery
                .where(whereClause)
                .orderBy(desc(users.createdAt))
                .limit(filters.limit ?? 100)
                .offset(filters.offset ?? 0)
            : await userQuery
                .orderBy(desc(users.createdAt))
                .limit(filters.limit ?? 100)
                .offset(filters.offset ?? 0);

        return { users: usersResult, total: Number(total) };
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
        const db = getControlDb();

        // Get total and active counts
        const [totalResult, activeResult] = await Promise.all([
            db.select({ cnt: count() }).from(users),
            db.select({ cnt: count() }).from(users).where(eq(users.isActive, true)),
        ]);

        const totalUsers = Number(totalResult[0]?.cnt ?? 0);
        const activeUsers = Number(activeResult[0]?.cnt ?? 0);
        const inactiveUsers = totalUsers - activeUsers;

        // Get role statistics
        const roleStatsResult = await db
            .select({
                role: users.role,
                count: sql<number>`count(*)::int`,
            })
            .from(users)
            .where(eq(users.isActive, true))
            .groupBy(users.role)
            .orderBy(desc(sql`count(*)`));
        const roleStats = roleStatsResult.map((stat) => ({
            role: stat.role,
            count: stat.count,
        }));

        // Get department statistics
        const departmentStatsResult = await db
            .select({
                department: users.department,
                count: sql<number>`count(*)::int`,
            })
            .from(users)
            .where(and(eq(users.isActive, true), isNotNull(users.department)))
            .groupBy(users.department)
            .orderBy(desc(sql`count(*)`));
        const departmentStats = departmentStatsResult.map((stat) => ({
            department: stat.department,
            count: stat.count,
        }));

        // Get recent activity (last 7 days)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentActivityResult = await db
            .select({
                date: sql<string>`to_char(date(${users.lastLoginAt}), 'YYYY-MM-DD')`,
                loginCount: sql<number>`count(*)::int`,
            })
            .from(users)
            .where(and(isNotNull(users.lastLoginAt), gte(users.lastLoginAt, weekAgo)))
            .groupBy(sql`date(${users.lastLoginAt})`)
            .orderBy(desc(sql`date(${users.lastLoginAt})`));
        const recentActivity = recentActivityResult.map((activity) => ({
            date: activity.date,
            loginCount: activity.loginCount,
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
                pool.query<{ role_name: string; permission_type: string; operations: string[] | null }>(
                    rolePermissionsQuery,
                    [userId]
                ),
                pool.query<{ permission_type: string; operations: string[] | null }>(
                    directPermissionsQuery,
                    [userId]
                ),
            ]);

            return {
                rolePermissions: roleResults.rows.map((row) => ({
                    roleName: row.role_name,
                    permissionType: row.permission_type,
                    operations: row.operations ?? [],
                })),
                directPermissions: directResults.rows.map((row) => ({
                    permissionType: row.permission_type,
                    operations: row.operations ?? [],
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
            const db = getControlDb();
            const recentActivityCountSubquery = sql<number>`(
        select count(*)::int
        from ${auditEvents}
        where ${auditEvents.actorId} = ${userId}
          and ${auditEvents.createdAt} > now() - interval '24 hours'
      )`;

            const result = await db
                .select({
                    securityClearance: users.securityClearance,
                    role: users.role,
                    lastLoginAt: users.lastLoginAt,
                    createdAt: users.createdAt,
                    recentActivityCount: recentActivityCountSubquery,
                })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

            if (result.length === 0) {
                return null;
            }

            const row = result[0];
            return {
                securityClearance: row.securityClearance ?? undefined,
                role: row.role,
                lastLoginAt: row.lastLoginAt ?? undefined,
                createdAt: row.createdAt,
                recentActivityCount: row.recentActivityCount,
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

export class RefreshTokenRepository {

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

export class PasswordResetTokenRepository {

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
