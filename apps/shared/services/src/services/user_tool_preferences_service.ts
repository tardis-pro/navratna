import { getControlPool } from '../database/drizzle/clients/index';
import type { UserToolPreferencesData, UserToolAccess } from '@uaip/types';

function getStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function getNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}
function getRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? { ...v }
    : {};
}

export class UserToolPreferencesService {
  constructor() {}

  async getUserToolAccess(userId: string): Promise<UserToolAccess[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT up.*, td.name as tool_name, td.description as tool_description
       FROM user_tool_preferences up
       LEFT JOIN tool_definitions td ON up.user_id = td.id
       WHERE up.user_id = $1`,
      [userId]
    );

    return result.rows.map(
      (row: Record<string, unknown>): UserToolAccess => {
        const prefs = getRecord(row.preferences);
        return {
          toolId: getStr(row.user_id),
          toolName: getStr(row.tool_name),
          toolDescription: getStr(row.tool_description),
          parameterDefaults: getRecord(prefs.parameterDefaults),
          customConfig: getRecord(prefs.customConfig),
          isFavorite: false,
          isEnabled: true,
          autoApprove: false,
          usageCount: 0,
          lastUsedAt: undefined,
          rateLimits: getRecord(prefs.rateLimits) as Record<string, number>,
          budgetLimit: typeof prefs.budgetLimit === 'number' ? prefs.budgetLimit : undefined,
          budgetUsed: 0,
        };
      }
    );
  }

  async getAvailableToolsForUser(userId: string): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const userResult = await pool.query(
      `SELECT security_clearance FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const securityClearance = userResult.rows[0].security_clearance;
    const availableTools = await pool.query(
      `SELECT * FROM tool_definitions WHERE is_enabled = true AND security_level <= $1`,
      [securityClearance]
    );

    return availableTools.rows;
  }

  async setUserToolPreferences(data: UserToolPreferencesData): Promise<Record<string, unknown>> {
    const pool = getControlPool();

    const existingResult = await pool.query(
      `SELECT * FROM user_tool_preferences WHERE user_id = $1 LIMIT 1`,
      [data.userId]
    );

    const preferencesData = {
      parameterDefaults: data.parameterDefaults || {},
      customConfig: data.customConfig || {},
      isFavorite: data.isFavorite || false,
      isEnabled: data.isEnabled ?? true,
      autoApprove: data.autoApprove || false,
      rateLimits: data.rateLimits || {},
      budgetLimit: data.budgetLimit,
      notifyOnCompletion: data.notifyOnCompletion ?? true,
      notifyOnError: data.notifyOnError ?? true,
    };

    if (existingResult.rows.length > 0) {
      const existing: Record<string, unknown> = existingResult.rows[0];
      const existingPrefs = getRecord(existing.preferences);
      const mergedPrefs = { ...existingPrefs, ...preferencesData };

      await pool.query(
        `UPDATE user_tool_preferences SET preferences = $1, updated_at = NOW() WHERE user_id = $2`,
        [JSON.stringify(mergedPrefs), data.userId]
      );
      return { ...existing, preferences: mergedPrefs };
    }

    const result = await pool.query(
      `INSERT INTO user_tool_preferences (user_id, preferences) VALUES ($1, $2) RETURNING *`,
      [data.userId, JSON.stringify(preferencesData)]
    );
    return result.rows[0];
  }

  async getUserToolPreferences(
    userId: string,
    _toolId: string
  ): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM user_tool_preferences WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return result.rows[0] ?? null;
  }

  async trackToolUsage(userId: string, toolId: string, _costIncurred: number = 0): Promise<void> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM user_tool_preferences WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      await pool.query(`INSERT INTO user_tool_preferences (user_id, preferences) VALUES ($1, $2)`, [
        userId,
        JSON.stringify({ usageCount: 1, lastUsedToolId: toolId }),
      ]);
    }
  }

  async getUserFavoriteTools(userId: string): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT up.*, td.*
       FROM user_tool_preferences up
       LEFT JOIN tool_definitions td ON (up.preferences->>'favoriteTools')::jsonb @> to_jsonb(td.id)
       WHERE up.user_id = $1`,
      [userId]
    );
    return result.rows;
  }

  async canUserAccessTool(userId: string, toolId: string): Promise<boolean> {
    const pool = getControlPool();
    const userResult = await pool.query(
      `SELECT security_clearance FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const toolResult = await pool.query(
      `SELECT security_level, is_enabled FROM tool_definitions WHERE id = $1 LIMIT 1`,
      [toolId]
    );

    if (userResult.rows.length === 0 || toolResult.rows.length === 0) {
      return false;
    }

    const user = userResult.rows[0];
    const tool = toolResult.rows[0];

    if (!tool.is_enabled) {
      return false;
    }

    if (tool.security_level > user.security_clearance) {
      return false;
    }

    return true;
  }

  async getUserToolUsageStats(userId: string): Promise<{
    totalTools: number;
    enabledTools: number;
    favoriteTools: number;
    totalUsage: number;
    totalBudgetUsed: number;
    mostUsedTool?: string;
  }> {
    const pool = getControlPool();
    const result = await pool.query(`SELECT * FROM user_tool_preferences WHERE user_id = $1`, [
      userId,
    ]);

    const preferences: Array<Record<string, unknown>> = result.rows;
    type UsageStats = { totalTools: number; enabledTools: number; favoriteTools: number; totalUsage: number; totalBudgetUsed: number; mostUsedTool?: string };
    const stats: UsageStats = {
      totalTools: preferences.length,
      enabledTools: 0,
      favoriteTools: 0,
      totalUsage: 0,
      totalBudgetUsed: 0,
      mostUsedTool: undefined,
    };

    for (const pref of preferences) {
      const prefs = getRecord(pref.preferences);
      if (prefs.isEnabled) stats.enabledTools++;
      if (prefs.isFavorite) stats.favoriteTools++;
      if (prefs.usageCount) stats.totalUsage += getNum(prefs.usageCount);
      if (prefs.budgetUsed) stats.totalBudgetUsed += Number(prefs.budgetUsed);
    }

    return stats;
  }
}
