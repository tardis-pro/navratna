import { Entity, Column, PrimaryColumn, CreateDateColumn, Index } from 'typeorm';
import { UserType, AgentCapability } from '@uaip/types';

@Entity('oauth_states')
@Index(['expiresAt'])
export class OAuthStateEntity {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  state!: string;

  @Column({ type: 'uuid' })
  providerId!: string;

  @Column({ type: 'text' })
  redirectUri!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  codeVerifier?: string; // For PKCE

  @Column({ type: 'varchar', length: 255, nullable: true })
  nonce?: string;

  @Column({ type: 'enum', enum: UserType, default: UserType.HUMAN })
  userType!: UserType;

  @Column({ type: 'json', nullable: true })
  agentCapabilities?: AgentCapability[];

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;
}
