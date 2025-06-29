import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@uaip/shared-services/entities/base.entity.js';
import { MarketplaceItem } from './marketplaceItem.entity.js';

@Entity('marketplace_ratings')
@Index(['itemId', 'userId'], { unique: true })
@Index(['rating'])
@Index(['isVerified'])
export class MarketplaceRating extends BaseEntity {
  @Column({ name: 'item_id', type: 'varchar' })
  itemId: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  @Column({ type: 'int', width: 1 })
  rating: number; // 1-5

  @Column({ type: 'text', nullable: true })
  review?: string;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ type: 'int', default: 0 })
  helpful: number;

  @Column({ default: false })
  reported: boolean;

  // Relationships
  @ManyToOne('MarketplaceItem', 'ratings', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  marketplaceItem: MarketplaceItem;
}