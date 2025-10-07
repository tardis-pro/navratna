import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@uaip/shared-services';
import { MarketplaceItem } from './marketplaceItem.entity.js';

@Entity('marketplace_installations')
@Index(['itemId', 'userId'])
@Index(['userId'])
@Index(['installedAt'])
@Index(['isActive'])
export class MarketplaceInstallation extends BaseEntity {
  @Column({ name: 'item_id', type: 'varchar' })
  itemId: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  @Column({ default: '1.0.0' })
  version: string;

  @Column({ name: 'installed_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  installedAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // User feedback
  @Column({ name: 'feedback_rating', type: 'int', nullable: true })
  feedbackRating?: number;

  @Column({ name: 'feedback_review', type: 'text', nullable: true })
  feedbackReview?: string;

  @Column({ name: 'would_recommend', type: 'boolean', nullable: true })
  wouldRecommend?: boolean;

  // Relationships
  @ManyToOne('MarketplaceItem', 'installations', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  marketplaceItem: MarketplaceItem;
}
