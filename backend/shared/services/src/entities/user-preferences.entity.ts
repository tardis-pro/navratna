import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';

export interface UserPreferencesData {
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  notifications?: {
    email?: boolean;
    push?: boolean;
    desktop?: boolean;
    sound?: boolean;
  };
  privacy?: {
    showOnlineStatus?: boolean;
    allowDirectMessages?: boolean;
    showProfile?: boolean;
  };
  ui?: {
    compactMode?: boolean;
    fontSize?: 'small' | 'medium' | 'large';
    sidebarCollapsed?: boolean;
  };
  desktop?: {
    windowMode?: 'floating' | 'portal' | 'hybrid';
    autoMinimize?: boolean;
    showDesktopNotifications?: boolean;
  };
  intelligence?: {
    autocomplete?: {
      enabled?: boolean;
      minChars?: number;
      maxSuggestions?: number;
      debounceMs?: number;
      sources?: ('history' | 'tools' | 'common' | 'context')[];
      aiEnhancement?: boolean;
    };
    topicGeneration?: {
      enabled?: boolean;
      autoSuggest?: boolean;
      confidenceThreshold?: number;
    };
    writingEnhancement?: {
      enabled?: boolean;
      autoCheck?: boolean;
      suggestionTypes?: ('clarity' | 'tone' | 'grammar' | 'style')[];
    };
    contextAnalysis?: {
      enabled?: boolean;
      depthLevel?: 'basic' | 'detailed' | 'comprehensive';
    };
  };
}

@Entity('user_preferences')
@Index(['userId'], { unique: true })
export class UserPreferencesEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'jsonb', default: {} })
  preferences!: UserPreferencesData;

  @Column({ type: 'timestamp', name: 'last_synced_at', nullable: true })
  lastSyncedAt?: Date;
}
