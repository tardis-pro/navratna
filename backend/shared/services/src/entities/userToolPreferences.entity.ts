import { Entity, Column, ManyToOne, Index, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';
import { ToolDefinition } from './toolDefinition.entity.js';

/**
 * User Tool Preferences Entity
 * Stores per-user tool configuration and preferences
 * This maintains the 1-to-many relationship: 1 Tool -> Many UserToolPreferences
 */
@Entity('user_tool_preferences')
@Index(['userId', 'toolId'], { unique: true })
@Index(['userId'])
@Index(['toolId'])
export class UserToolPreferences extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'tool_id' })
  toolId!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => ToolDefinition)
  @JoinColumn({ name: 'tool_id' })
  tool!: ToolDefinition;

  // User-specific tool configuration
  @Column({ type: 'jsonb', name: 'parameter_defaults', nullable: true })
  parameterDefaults?: Record<string, any>;

  @Column({ type: 'jsonb', name: 'custom_config', nullable: true })
  customConfig?: Record<string, any>;

  // User preferences
  @Column({ type: 'boolean', name: 'is_favorite', default: false })
  isFavorite!: boolean;

  @Column({ type: 'boolean', name: 'is_enabled', default: true })
  isEnabled!: boolean;

  @Column({ type: 'boolean', name: 'auto_approve', default: false })
  autoApprove!: boolean;

  // Usage tracking
  @Column({ type: 'integer', name: 'usage_count', default: 0 })
  usageCount!: number;

  @Column({ type: 'timestamp', name: 'last_used_at', nullable: true })
  lastUsedAt?: Date;

  // User-specific rate limits (overrides tool defaults)
  @Column({ type: 'jsonb', name: 'rate_limits', nullable: true })
  rateLimits?: Record<string, number>;

  // User-specific budget limits
  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'budget_limit', nullable: true })
  budgetLimit?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'budget_used', default: 0 })
  budgetUsed!: number;

  // Notification preferences
  @Column({ type: 'boolean', name: 'notify_on_completion', default: true })
  notifyOnCompletion!: boolean;

  @Column({ type: 'boolean', name: 'notify_on_error', default: true })
  notifyOnError!: boolean;
}