import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../entities/base.entity.js';
import { UserEntity } from '../../entities/user.entity.js';

@Entity('generated_qa_pairs')
@Index(['domain'])
@Index(['confidence'])
@Index(['createdBy'])
@Index(['sourceType'])
export class GeneratedQAPairEntity extends BaseEntity {
  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'text' })
  answer!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  domain?: string;

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence!: number;

  @Column({ type: 'varchar', length: 50, name: 'source_type', default: 'knowledge-extraction' })
  sourceType!: string;

  @Column({ type: 'uuid', name: 'source_id', nullable: true })
  sourceId?: string;

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  creator!: UserEntity;

  @Column({ type: 'json', nullable: true })
  metadata?: {
    extractionMethod?: string;
    validationScore?: number;
    qualityMetrics?: {
      clarity?: number;
      relevance?: number;
      completeness?: number;
    };
    sourceConversationId?: string;
    participants?: string[];
  };

  @Column({ type: 'boolean', name: 'is_validated', default: false })
  isValidated!: boolean;

  @Column({ type: 'decimal', precision: 3, scale: 2, name: 'validation_score', nullable: true })
  validationScore?: number;
}
