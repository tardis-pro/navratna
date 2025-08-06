import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';
import { Artifact } from './artifact.entity.js';

export enum LinkType {
  ARTIFACT = 'artifact',
  PROJECT_FILE = 'project_file',
  DOCUMENT = 'document',
  EXTERNAL = 'external'
}

export enum LinkStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  DISABLED = 'disabled',
  DELETED = 'deleted'
}

export interface LinkAccessRestrictions {
  requiresAuth?: boolean;
  allowedDomains?: string[];
  allowedUserIds?: string[];
  allowedRoles?: string[];
  maxClicks?: number;
  password?: string;
  ipWhitelist?: string[];
}

export interface LinkAnalytics {
  totalClicks?: number;
  uniqueClicks?: number;
  lastClickedAt?: Date;
  referrers?: Record<string, number>;
  countries?: Record<string, number>;
  devices?: Record<string, number>;
  browsers?: Record<string, number>;
  clickHistory?: Array<{
    timestamp: Date;
    userAgent?: string;
    ip?: string;
    referer?: string;
    userId?: string;
  }>;
}

@Entity('short_links')
@Index(['shortCode'], { unique: true })
@Index(['createdById'])
@Index(['type'])
@Index(['status'])
@Index(['expiresAt'])
@Index(['originalUrl'])
export class ShortLinkEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 20, unique: true })
  shortCode!: string; // e.g., "abc123", "xyz789"

  @Column({ type: 'text' })
  originalUrl!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ 
    type: 'enum', 
    enum: LinkType, 
    default: LinkType.EXTERNAL 
  })
  type!: LinkType;

  @Column({ 
    type: 'enum', 
    enum: LinkStatus, 
    default: LinkStatus.ACTIVE 
  })
  status!: LinkStatus;

  @Column({ type: 'uuid', name: 'created_by_id' })
  createdById!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: UserEntity;

  // Optional relations to specific resources
  @Column({ type: 'uuid', name: 'artifact_id', nullable: true })
  artifactId?: string;

  @ManyToOne(() => Artifact, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'artifact_id' })
  artifact?: Artifact;

  @Column({ type: 'uuid', name: 'project_file_id', nullable: true })
  projectFileId?: string;

  // Note: ProjectFileEntity relation will be added after it's created

  @Column({ type: 'timestamp', name: 'expires_at', nullable: true })
  expiresAt?: Date;

  @Column({ type: 'jsonb', default: {} })
  accessRestrictions!: LinkAccessRestrictions;

  @Column({ type: 'jsonb', default: {} })
  analytics!: LinkAnalytics;

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  customDomain?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  password?: string; // Hashed password for protected links

  @Column({ type: 'timestamp', name: 'last_clicked_at', nullable: true })
  lastClickedAt?: Date;

  @Column({ type: 'integer', name: 'click_count', default: 0 })
  clickCount!: number;

  @Column({ type: 'boolean', name: 'is_public', default: true })
  isPublic!: boolean;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  // QR Code support
  @Column({ type: 'text', nullable: true })
  qrCode?: string; // Base64 encoded QR code image

  @Column({ type: 'boolean', name: 'track_clicks', default: true })
  trackClicks!: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  utmSource?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  utmMedium?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  utmCampaign?: string;
}