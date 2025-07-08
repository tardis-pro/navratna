import { Repository, DataSource } from 'typeorm';
import { UserToolPreferences } from '../entities/userToolPreferences.entity.js';
import { ToolDefinition } from '../entities/toolDefinition.entity.js';
import { UserEntity } from '../entities/user.entity.js';
import { logger } from '@uaip/utils';

export interface UserToolPreferencesData {
  userId: string;
  toolId: string;
  parameterDefaults?: Record<string, any>;
  customConfig?: Record<string, any>;
  isFavorite?: boolean;
  isEnabled?: boolean;
  autoApprove?: boolean;
  rateLimits?: Record<string, number>;
  budgetLimit?: number;
  notifyOnCompletion?: boolean;
  notifyOnError?: boolean;
}

export interface UserToolAccess {
  toolId: string;
  toolName: string;
  toolDescription: string;
  parameterDefaults: Record<string, any>;
  customConfig: Record<string, any>;
  isFavorite: boolean;
  isEnabled: boolean;
  autoApprove: boolean;
  usageCount: number;
  lastUsedAt?: Date;
  rateLimits: Record<string, number>;
  budgetLimit?: number;
  budgetUsed: number;
}

/**
 * Service for managing user tool preferences
 * Maintains proper 1-to-many relationship: 1 Tool -> Many UserToolPreferences
 */
export class UserToolPreferencesService {
  private repository: Repository<UserToolPreferences>;
  private toolRepository: Repository<ToolDefinition>;
  private userRepository: Repository<UserEntity>;

  constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(UserToolPreferences);
    this.toolRepository = this.dataSource.getRepository(ToolDefinition);
    this.userRepository = this.dataSource.getRepository(UserEntity);
  }

  /**
   * Get user's tool preferences with tool details
   */
  async getUserToolAccess(userId: string): Promise<UserToolAccess[]> {
    try {
      const preferences = await this.repository.find({
        where: { userId },
        relations: ['tool']
      });

      return preferences.map(pref => ({
        toolId: pref.toolId,
        toolName: pref.tool.name,
        toolDescription: pref.tool.description,
        parameterDefaults: pref.parameterDefaults || {},
        customConfig: pref.customConfig || {},
        isFavorite: pref.isFavorite,
        isEnabled: pref.isEnabled,
        autoApprove: pref.autoApprove,
        usageCount: pref.usageCount,
        lastUsedAt: pref.lastUsedAt,
        rateLimits: pref.rateLimits || pref.tool.rateLimits || {},
        budgetLimit: pref.budgetLimit,
        budgetUsed: pref.budgetUsed
      }));
    } catch (error) {
      logger.error('Failed to get user tool access:', error);
      throw error;
    }
  }

  /**
   * Get available tools for a user (tools they can access)
   */
  async getAvailableToolsForUser(userId: string): Promise<ToolDefinition[]> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      // Get all tools that match user's security clearance
      const availableTools = await this.toolRepository.find({
        where: {
          isEnabled: true,
          securityLevel: user.securityClearance // Only tools within security clearance
        }
      });

      return availableTools;
    } catch (error) {
      logger.error('Failed to get available tools for user:', error);
      throw error;
    }
  }

  /**
   * Set user preferences for a specific tool
   */
  async setUserToolPreferences(data: UserToolPreferencesData): Promise<UserToolPreferences> {
    try {
      // Verify tool exists
      const tool = await this.toolRepository.findOne({ where: { id: data.toolId } });
      if (!tool) {
        throw new Error('Tool not found');
      }

      // Verify user exists
      const user = await this.userRepository.findOne({ where: { id: data.userId } });
      if (!user) {
        throw new Error('User not found');
      }

      // Check if preference already exists
      let preference = await this.repository.findOne({
        where: { userId: data.userId, toolId: data.toolId }
      });

      if (preference) {
        // Update existing preference
        Object.assign(preference, data);
      } else {
        // Create new preference
        preference = this.repository.create(data);
      }

      return await this.repository.save(preference);
    } catch (error) {
      logger.error('Failed to set user tool preferences:', error);
      throw error;
    }
  }

  /**
   * Get user's specific tool preferences
   */
  async getUserToolPreferences(userId: string, toolId: string): Promise<UserToolPreferences | null> {
    try {
      return await this.repository.findOne({
        where: { userId, toolId },
        relations: ['tool']
      });
    } catch (error) {
      logger.error('Failed to get user tool preferences:', error);
      throw error;
    }
  }

  /**
   * Update tool usage tracking
   */
  async trackToolUsage(userId: string, toolId: string, costIncurred: number = 0): Promise<void> {
    try {
      let preference = await this.repository.findOne({
        where: { userId, toolId }
      });

      if (!preference) {
        // Create default preference if doesn't exist
        preference = this.repository.create({
          userId,
          toolId,
          usageCount: 0,
          budgetUsed: 0
        });
      }

      preference.usageCount += 1;
      preference.budgetUsed += costIncurred;
      preference.lastUsedAt = new Date();

      await this.repository.save(preference);
    } catch (error) {
      logger.error('Failed to track tool usage:', error);
      throw error;
    }
  }

  /**
   * Get user's favorite tools
   */
  async getUserFavoriteTools(userId: string): Promise<ToolDefinition[]> {
    try {
      const preferences = await this.repository.find({
        where: { userId, isFavorite: true },
        relations: ['tool']
      });

      return preferences.map(pref => pref.tool);
    } catch (error) {
      logger.error('Failed to get user favorite tools:', error);
      throw error;
    }
  }

  /**
   * Check if user can access a tool
   */
  async canUserAccessTool(userId: string, toolId: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      const tool = await this.toolRepository.findOne({ where: { id: toolId } });

      if (!user || !tool) {
        return false;
      }

      // Check security clearance
      if (tool.securityLevel > user.securityClearance) {
        return false;
      }

      // Check if tool is enabled
      if (!tool.isEnabled) {
        return false;
      }

      // Check user-specific preferences
      const preference = await this.repository.findOne({
        where: { userId, toolId }
      });

      if (preference && !preference.isEnabled) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to check user tool access:', error);
      return false;
    }
  }

  /**
   * Get tool usage statistics for a user
   */
  async getUserToolUsageStats(userId: string): Promise<{
    totalTools: number;
    enabledTools: number;
    favoriteTools: number;
    totalUsage: number;
    totalBudgetUsed: number;
    mostUsedTool?: string;
  }> {
    try {
      const preferences = await this.repository.find({
        where: { userId },
        relations: ['tool']
      });

      const stats = {
        totalTools: preferences.length,
        enabledTools: preferences.filter(p => p.isEnabled).length,
        favoriteTools: preferences.filter(p => p.isFavorite).length,
        totalUsage: preferences.reduce((sum, p) => sum + p.usageCount, 0),
        totalBudgetUsed: preferences.reduce((sum, p) => sum + Number(p.budgetUsed), 0),
        mostUsedTool: preferences.reduce((max, p) => 
          p.usageCount > (max?.usageCount || 0) ? p : max, null as UserToolPreferences | null
        )?.tool?.name
      };

      return stats;
    } catch (error) {
      logger.error('Failed to get user tool usage stats:', error);
      throw error;
    }
  }
}