import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../entities/base.entity.js';
import { UserEntity } from '../../entities/user.entity.js';

export enum ChatIngestionJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

@Entity('chat_ingestion_jobs')
@Index(['userId'])
@Index(['status'])
@Index(['createdAt'])
export class ChatIngestionJobEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({
    type: 'enum',
    enum: ChatIngestionJobStatus,
    default: ChatIngestionJobStatus.PENDING
  })
  status!: ChatIngestionJobStatus;

  @Column({ type: 'integer', default: 0 })
  progress!: number;

  @Column({ type: 'integer', name: 'files_processed', default: 0 })
  filesProcessed!: number;

  @Column({ type: 'integer', name: 'total_files', default: 0 })
  totalFiles!: number;

  @Column({ type: 'integer', name: 'extracted_items', default: 0 })
  extractedItems!: number;

  @Column({ type: 'integer', name: 'processing_time_ms', nullable: true })
  processingTimeMs?: number;

  @Column({ type: 'timestamp', name: 'started_at', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completedAt?: Date;

  @Column({ type: 'json', nullable: true })
  errors?: string[];

  @Column({ type: 'json', nullable: true })
  metadata?: {
    fileNames?: string[];
    totalFileSize?: number;
    platforms?: string[];
    options?: Record<string, any>;
  };
}