import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';

/**
 * Audit Event Entity
 * Tracks all security and operational events in the system
 */
@Entity('audit_events')
@Index(['eventType', 'timestamp'])
@Index(['userId', 'timestamp'])
@Index(['agentId', 'timestamp'])
@Index(['resourceType', 'resourceId'])
@Index(['riskLevel', 'timestamp'])
@Index(['timestamp'])
@Index(['isArchived', 'timestamp'])
@Index(['archivedAt'])
export class AuditEvent extends BaseEntity {
  @Column({ name: 'event_type', length: 100 })
  eventType: string;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId?: number;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'agent_id', type: 'bigint', nullable: true })
  agentId?: number;

  @Column({ name: 'resource_type', length: 100, nullable: true })
  resourceType?: string;

  @Column({ name: 'resource_id', length: 255, nullable: true })
  resourceId?: string;

  @Column({ type: 'jsonb' })
  details: Record<string, any>;

  @Column({ name: 'ip_address', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Column({ name: 'risk_level', length: 20, nullable: true })
  riskLevel?: string;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived: boolean;

  @Column({ name: 'archived_at', type: 'timestamp', nullable: true })
  archivedAt?: Date;
} 