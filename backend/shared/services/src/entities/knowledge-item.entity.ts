import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { KnowledgeType, SourceType } from '@uaip/types';
import { BaseEntity } from './base.entity.js';

@Entity('knowledge_items')
@Index(['sourceType', 'sourceIdentifier'])
@Index('IDX_KNOWLEDGE_ITEM_TAGS', ['tags'])
@Index(['type'])
@Index(['confidence'])
@Index(['createdAt'])
@Index(['userId', 'type'])
@Index(['agentId', 'type'])
export class KnowledgeItemEntity extends BaseEntity {
  @Column('text')
  content: string;

  @Column({
    type: 'enum',
    enum: KnowledgeType,
    default: KnowledgeType.FACTUAL,
  })
  type: KnowledgeType;

  @Column({
    type: 'enum',
    enum: SourceType,
  })
  sourceType: SourceType;

  @Column({ length: 255 })
  sourceIdentifier: string;

  @Column({ type: 'text', nullable: true })
  sourceUrl?: string;

  @Column('text', { array: true, default: '{}' })
  tags: string[];

  @Column('decimal', { precision: 3, scale: 2, default: 0.8 })
  confidence: number;

  @Column('jsonb', { default: '{}' })
  metadata: Record<string, any>;

  @Column('varchar', { length: 36, nullable: true })
  createdBy?: string;

  @Column('varchar', { length: 36, nullable: true })
  organizationId?: string;

  @Column({ length: 50, default: 'public' })
  accessLevel: string;

  // Three-layered knowledge architecture
  @Column('varchar', { length: 36, nullable: true })
  userId?: string;

  @Column('varchar', { length: 36, nullable: true })
  agentId?: string;

  @Column('text', { nullable: true })
  summary?: string;
}
