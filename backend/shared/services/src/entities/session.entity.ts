import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  SessionStatus,
  UserType,
  AuthenticationMethod,
  OAuthProviderType,
  AgentCapability,
} from '@uaip/types';

@Entity('sessions')
@Index(['userId'])
@Index(['sessionToken'], { unique: true })
@Index(['status'])
@Index(['expiresAt'])
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  sessionToken!: string;

  @Column({ type: 'text', nullable: true })
  refreshToken?: string;

  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.ACTIVE })
  status!: SessionStatus;

  @Column({ type: 'enum', enum: UserType, default: UserType.HUMAN })
  userType!: UserType;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @Column({ type: 'json', nullable: true })
  deviceInfo?: {
    deviceId?: string;
    deviceName?: string;
    platform?: string;
    browser?: string;
    version?: string;
    isMobile?: boolean;
    isTablet?: boolean;
    isDesktop?: boolean;
  };

  @Column({ type: 'json', nullable: true })
  location?: {
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };

  @Column({ type: 'enum', enum: AuthenticationMethod })
  authenticationMethod!: AuthenticationMethod;

  @Column({ type: 'enum', enum: OAuthProviderType, nullable: true })
  oauthProvider?: OAuthProviderType;

  @Column({ type: 'json', nullable: true })
  agentCapabilities?: AgentCapability[];

  @Column({ type: 'boolean', default: false })
  mfaVerified!: boolean;

  @Column({ type: 'decimal', precision: 3, scale: 1, default: 0 })
  riskScore!: number;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @Column({ type: 'timestamp' })
  lastActivityAt!: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
