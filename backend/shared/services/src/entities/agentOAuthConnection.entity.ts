import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { OAuthProviderType, AgentCapability } from '@uaip/types';

@Entity('agent_oauth_connections')
@Index(['agentId', 'providerId'], { unique: true })
@Index(['agentId'])
@Index(['providerId'])
export class AgentOAuthConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  agentId!: string;

  @Column({ type: 'uuid' })
  providerId!: string;

  @Column({ type: 'enum', enum: OAuthProviderType })
  providerType!: OAuthProviderType;

  @Column({ type: 'json', default: '[]' })
  capabilities!: AgentCapability[];

  @Column({ type: 'text' })
  accessToken!: string; // Encrypted

  @Column({ type: 'text', nullable: true })
  refreshToken?: string; // Encrypted

  @Column({ type: 'timestamp', nullable: true })
  tokenExpiresAt?: Date;

  @Column({ type: 'json', default: '[]' })
  scope!: string[];

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  @Column({ type: 'json', nullable: true })
  usageStats?: {
    totalRequests?: number;
    dailyRequests?: number;
    lastResetDate?: Date;
    errors?: number;
    rateLimitHits?: number;
  };

  @Column({ type: 'json', nullable: true })
  securityConfig?: {
    ipRestrictions?: string[];
  };

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
