import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { OAuthProviderType, AgentCapability } from '@uaip/types';

@Entity('oauth_providers')
@Index(['type', 'isEnabled'])
export class OAuthProviderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'enum', enum: OAuthProviderType })
  type!: OAuthProviderType;

  @Column({ type: 'varchar', length: 255 })
  clientId!: string;

  @Column({ type: 'text', nullable: true })
  clientSecret?: string; // Encrypted

  @Column({ type: 'text' })
  redirectUri!: string;

  @Column({ type: 'json', default: '[]' })
  scope!: string[];

  @Column({ type: 'text' })
  authorizationUrl!: string;

  @Column({ type: 'text' })
  tokenUrl!: string;

  @Column({ type: 'text', nullable: true })
  userInfoUrl?: string;

  @Column({ type: 'text', nullable: true })
  revokeUrl?: string;

  @Column({ type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({ type: 'json', nullable: true })
  securityConfig?: {
    allowedUserTypes?: string[];
    requireMFA?: boolean;
    sessionTimeout?: number;
    ipRestrictions?: string[];
  };

  @Column({ type: 'json', nullable: true })
  agentConfig?: {
    allowAgentAccess?: boolean;
    requiredCapabilities?: AgentCapability[];
    permissions?: string[];
    rateLimits?: {
      maxHourlyRequests?: number;
      maxDailyRequests?: number;
      maxConcurrentSessions?: number;
    };
    monitoring?: {
      logLevel?: string;
      alertOnUnusualActivity?: boolean;
      maxDailyRequests?: number;
    };
  };

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
