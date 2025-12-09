import { BaseRepository } from '../base/BaseRepository.js';
import {
  UserPreferencesEntity,
  UserPreferencesData,
} from '../../entities/user-preferences.entity.js';

export class UserPreferencesRepository extends BaseRepository<UserPreferencesEntity> {
  constructor() {
    super(UserPreferencesEntity);
  }

  async findByUserId(userId: string): Promise<UserPreferencesEntity | null> {
    return await this.repository.findOne({
      where: { userId },
      relations: ['user'],
    });
  }

  async createOrUpdate(
    userId: string,
    preferences: UserPreferencesData
  ): Promise<UserPreferencesEntity> {
    let userPrefs = await this.findByUserId(userId);

    if (userPrefs) {
      // Merge preferences deeply
      userPrefs.preferences = this.mergePreferences(userPrefs.preferences, preferences);
      userPrefs.lastSyncedAt = new Date();
    } else {
      userPrefs = this.repository.create({
        userId,
        preferences,
        lastSyncedAt: new Date(),
      });
    }

    return await this.repository.save(userPrefs);
  }

  async updatePreferences(
    userId: string,
    preferences: Partial<UserPreferencesData>
  ): Promise<UserPreferencesEntity | null> {
    const userPrefs = await this.findByUserId(userId);
    if (!userPrefs) {
      return await this.createOrUpdate(userId, preferences as UserPreferencesData);
    }

    userPrefs.preferences = this.mergePreferences(userPrefs.preferences, preferences);
    userPrefs.lastSyncedAt = new Date();

    return await this.repository.save(userPrefs);
  }

  async getPreferences(userId: string): Promise<UserPreferencesData> {
    const userPrefs = await this.findByUserId(userId);
    return userPrefs?.preferences || this.getDefaultPreferences();
  }

  async delete(userId: string): Promise<boolean> {
    const result = await this.repository.delete({ userId });
    return result.affected !== undefined && result.affected > 0;
  }

  async updateLastSyncTime(userId: string): Promise<void> {
    await this.repository.update({ userId }, { lastSyncedAt: new Date() });
  }

  async findRecentlyUpdated(since: Date, limit: number = 100): Promise<UserPreferencesEntity[]> {
    return await this.repository.find({
      where: {
        lastSyncedAt: since,
      },
      relations: ['user'],
      order: { lastSyncedAt: 'DESC' },
      take: limit,
    });
  }

  private mergePreferences(
    existing: UserPreferencesData,
    updates: Partial<UserPreferencesData>
  ): UserPreferencesData {
    const merged = { ...existing };

    if (updates.theme !== undefined) {
      merged.theme = updates.theme;
    }

    if (updates.language !== undefined) {
      merged.language = updates.language;
    }

    if (updates.notifications) {
      merged.notifications = {
        ...merged.notifications,
        ...updates.notifications,
      };
    }

    if (updates.privacy) {
      merged.privacy = {
        ...merged.privacy,
        ...updates.privacy,
      };
    }

    if (updates.ui) {
      merged.ui = {
        ...merged.ui,
        ...updates.ui,
      };
    }

    if (updates.desktop) {
      merged.desktop = {
        ...merged.desktop,
        ...updates.desktop,
      };
    }

    return merged;
  }

  private getDefaultPreferences(): UserPreferencesData {
    return {
      theme: 'dark',
      language: 'en',
      notifications: {
        email: true,
        push: true,
        desktop: true,
        sound: true,
      },
      privacy: {
        showOnlineStatus: true,
        allowDirectMessages: true,
        showProfile: true,
      },
      ui: {
        compactMode: false,
        fontSize: 'medium',
        sidebarCollapsed: false,
      },
      desktop: {
        windowMode: 'hybrid',
        autoMinimize: false,
        showDesktopNotifications: true,
      },
    };
  }

  async resetToDefaults(userId: string): Promise<UserPreferencesEntity> {
    return await this.createOrUpdate(userId, this.getDefaultPreferences());
  }

  async exportPreferences(userId: string): Promise<UserPreferencesData | null> {
    const userPrefs = await this.findByUserId(userId);
    return userPrefs?.preferences || null;
  }

  async importPreferences(
    userId: string,
    preferences: UserPreferencesData
  ): Promise<UserPreferencesEntity> {
    return await this.createOrUpdate(userId, preferences);
  }
}
