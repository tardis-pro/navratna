import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { KnowledgeItemEntity } from './knowledge-item.entity.js';

@Entity('knowledge_relationships')
@Index(['sourceItemId'])
@Index(['targetItemId'])
@Index(['relationshipType'])
export class KnowledgeRelationshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  sourceItemId: string;

  @Column('uuid')
  targetItemId: string;

  @Column({ length: 50 })
  relationshipType: string;

  @Column('decimal', { precision: 3, scale: 2, default: 0.8 })
  confidence: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => KnowledgeItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceItemId' })
  sourceItem: KnowledgeItemEntity;

  @ManyToOne(() => KnowledgeItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetItemId' })
  targetItem: KnowledgeItemEntity;
} 