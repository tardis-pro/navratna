import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '@uaip/shared-services';
import {
  MarketplaceItemType,
  MarketplaceCategory,
  MarketplaceItemStatus,
  PricingModel,
  MarketplaceUsageStats,
  MarketplaceShowcase,
} from '@uaip/types';

@Entity('marketplace_items')
@Index(['status', 'visibility'])
@Index(['authorId', 'organizationId'])
@Index(['type', 'category'])
@Index(['isFeatured', 'isTrending'])
@Index(['trendingScore'])
@Index(['tags'], { where: 'tags IS NOT NULL' })
export class MarketplaceItem extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'long_description', type: 'text', nullable: true })
  longDescription?: string;

  @Column({ type: 'enum', enum: MarketplaceItemType })
  type: MarketplaceItemType;

  @Column({ type: 'enum', enum: MarketplaceCategory })
  category: MarketplaceCategory;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'enum', enum: MarketplaceItemStatus, default: MarketplaceItemStatus.DRAFT })
  status: MarketplaceItemStatus;

  @Column({ type: 'enum', enum: ['public', 'unlisted', 'private'], default: 'public' })
  visibility: string;

  // Author information
  @Column({ name: 'author_id', type: 'varchar' })
  authorId: string;

  @Column({ name: 'author_name', length: 255 })
  authorName: string;

  @Column({ name: 'author_avatar', type: 'text', nullable: true })
  authorAvatar?: string;

  @Column({ name: 'organization_id', type: 'varchar', nullable: true })
  organizationId?: string;

  // Content references
  @Column({ name: 'persona_id', type: 'varchar', nullable: true })
  personaId?: string;

  @Column({ name: 'agent_id', type: 'varchar', nullable: true })
  agentId?: string;

  @Column({ name: 'tool_id', type: 'varchar', nullable: true })
  toolId?: string;

  // Marketplace specific fields
  @Column({ default: '1.0.0' })
  version: string;

  // Pricing information
  @Column({ name: 'pricing_model', type: 'enum', enum: PricingModel })
  pricingModel: PricingModel;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({
    name: 'billing_period',
    type: 'enum',
    enum: ['one_time', 'monthly', 'yearly'],
    nullable: true,
  })
  billingPeriod?: string;

  @Column({ name: 'trial_days', type: 'int', nullable: true })
  trialDays?: number;

  // Usage and performance stats
  @Column({ type: 'jsonb', default: '{}' })
  stats: MarketplaceUsageStats;

  @Column({ type: 'jsonb', default: '{}' })
  showcase: MarketplaceShowcase;

  // Requirements
  @Column({ name: 'min_version', nullable: true })
  minVersion?: string;

  @Column({ type: 'jsonb', default: '[]' })
  dependencies: string[];

  @Column({ type: 'jsonb', default: '[]' })
  capabilities: string[];

  @Column({ name: 'min_memory', type: 'int', nullable: true })
  minMemory?: number;

  @Column({ name: 'min_cpu', type: 'int', nullable: true })
  minCpu?: number;

  @Column({ name: 'max_execution_time', type: 'int', nullable: true })
  maxExecutionTime?: number;

  // Social features
  @Column({ name: 'is_forkable', default: true })
  isForkable: boolean;

  @Column({ name: 'is_remixable', default: true })
  isRemixable: boolean;

  @Column({ name: 'original_item_id', type: 'varchar', nullable: true })
  originalItemId?: string;

  @Column({ name: 'forked_from', type: 'varchar', nullable: true })
  forkedFrom?: string;

  // Featured and trending
  @Column({ name: 'is_featured', default: false })
  isFeatured: boolean;

  @Column({ name: 'is_trending', default: false })
  isTrending: boolean;

  @Column({ name: 'featured_until', type: 'timestamp', nullable: true })
  featuredUntil?: Date;

  @Column({ name: 'trending_score', type: 'decimal', precision: 10, scale: 2, default: 0 })
  trendingScore: number;

  // Quality and safety
  @Column({ name: 'quality_score', type: 'int', nullable: true })
  qualityScore?: number;

  @Column({ name: 'safety_score', type: 'int', nullable: true })
  safetyScore?: number;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ name: 'verified_by', type: 'varchar', nullable: true })
  verifiedBy?: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @OneToMany('MarketplaceRating', 'marketplaceItem')
  ratings: any[];

  @OneToMany('MarketplaceInstallation', 'marketplaceItem')
  installations: any[];
}
