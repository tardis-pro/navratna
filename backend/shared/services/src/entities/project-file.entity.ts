import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';
import { ProjectEntity } from './project.entity.js';

export enum FileType {
  DOCUMENT = 'document',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  ARCHIVE = 'archive',
  CODE = 'code',
  DATA = 'data',
  OTHER = 'other',
}

export enum FileStatus {
  UPLOADING = 'uploading',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
  PROCESSING = 'processing',
  ERROR = 'error',
}

export interface FileMetadata {
  originalName?: string;
  mimeType?: string;
  size?: number;
  checksum?: string;
  width?: number;
  height?: number;
  duration?: number;
  encoding?: string;
  thumbnail?: string;
  preview?: string;
  extractedText?: string;
  aiDescription?: string;
  processingStatus?: string;
  processingError?: string;
}

@Entity('project_files')
@Index(['projectId'])
@Index(['uploadedById'])
@Index(['type'])
@Index(['status'])
@Index(['createdAt'])
@Index(['name'])
@Index(['path'])
export class ProjectFileEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 500 })
  path!: string; // Path in MinIO/S3

  @Column({ type: 'varchar', length: 500, nullable: true })
  url?: string; // Public URL if available

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => ProjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ type: 'uuid', name: 'uploaded_by_id' })
  uploadedById!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy!: UserEntity;

  @Column({
    type: 'enum',
    enum: FileType,
    default: FileType.OTHER,
  })
  type!: FileType;

  @Column({
    type: 'enum',
    enum: FileStatus,
    default: FileStatus.UPLOADING,
  })
  status!: FileStatus;

  @Column({ type: 'bigint', default: 0 })
  size!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mimeType?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  checksum?: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: FileMetadata;

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'varchar', length: 50, nullable: true })
  folder?: string;

  @Column({ type: 'integer', name: 'version', default: 1 })
  version!: number;

  @Column({ type: 'uuid', name: 'parent_file_id', nullable: true })
  parentFileId?: string;

  @ManyToOne(() => ProjectFileEntity, { nullable: true })
  @JoinColumn({ name: 'parent_file_id' })
  parentFile?: ProjectFileEntity;

  @Column({ type: 'timestamp', name: 'last_accessed_at', nullable: true })
  lastAccessedAt?: Date;

  @Column({ type: 'integer', name: 'access_count', default: 0 })
  accessCount!: number;

  @Column({ type: 'timestamp', name: 'archived_at', nullable: true })
  archivedAt?: Date;

  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
