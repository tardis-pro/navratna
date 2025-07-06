import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';

export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  COMPLETED = 'completed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled'
}

export enum ProjectVisibility {
  PRIVATE = 'private',
  TEAM = 'team',
  PUBLIC = 'public',
  ORGANIZATION = 'organization'
}

export interface ProjectSettings {
  allowFileUploads?: boolean;
  allowArtifactGeneration?: boolean;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  autoArchiveAfterDays?: number;
  requireApprovalForArtifacts?: boolean;
}

@Entity('projects')
@Index(['ownerId'])
@Index(['status'])
@Index(['visibility'])
@Index(['createdAt'])
@Index(['name'])
export class ProjectEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: UserEntity;

  @Column({ 
    type: 'enum', 
    enum: ProjectStatus, 
    default: ProjectStatus.ACTIVE 
  })
  status!: ProjectStatus;

  @Column({ 
    type: 'enum', 
    enum: ProjectVisibility, 
    default: ProjectVisibility.PRIVATE 
  })
  visibility!: ProjectVisibility;

  @Column({ type: 'varchar', length: 10, unique: true })
  slug!: string; // Short unique identifier like "ABC123"

  @Column({ type: 'varchar', length: 50, nullable: true })
  color?: string; // Hex color for UI

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'jsonb', default: {} })
  settings!: ProjectSettings;

  @Column({ type: 'timestamp', name: 'last_activity_at', nullable: true })
  lastActivityAt?: Date;

  @Column({ type: 'timestamp', name: 'archived_at', nullable: true })
  archivedAt?: Date;

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completedAt?: Date;

  @Column({ type: 'integer', name: 'file_count', default: 0 })
  fileCount!: number;

  @Column({ type: 'integer', name: 'artifact_count', default: 0 })
  artifactCount!: number;

  @Column({ type: 'bigint', name: 'total_size_bytes', default: 0 })
  totalSizeBytes!: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relations will be added when we create ProjectMember and ProjectFile entities
}