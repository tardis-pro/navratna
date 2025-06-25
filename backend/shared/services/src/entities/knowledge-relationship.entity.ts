import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { KnowledgeItemEntity } from './knowledge-item.entity.js';
import { BaseEntity } from './base.entity.js';

@Entity('knowledge_relationships')
@Index(['sourceItemId'])
@Index(['targetItemId'])
@Index(['relationshipType'])
@Index(['userId', 'relationshipType'])
@Index(['agentId', 'relationshipType'])
export class KnowledgeRelationshipEntity extends BaseEntity {

  @Column('varchar')
  sourceItemId: string;

  @Column('varchar')
  targetItemId: string;

  @Column({ length: 50 })
  relationshipType: string;

  @Column('decimal', { precision: 3, scale: 2, default: 0.8 })
  confidence: number;

  // Three-layered knowledge architecture
  @Column('varchar', { length: 36, nullable: true })
  userId?: string;

  @Column('varchar', { length: 36, nullable: true })
  agentId?: string;

  @Column('text', { nullable: true })
  summary?: string;

  @ManyToOne(() => KnowledgeItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceItemId' })
  sourceItem: KnowledgeItemEntity;

  @ManyToOne(() => KnowledgeItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetItemId' })
  targetItem: KnowledgeItemEntity;
} 