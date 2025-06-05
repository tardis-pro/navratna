import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';

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
export class AuditEvent extends BaseEntity {
  @Column({ name: 'event_type', length: 100 })
  eventType: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId?: string;

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
} 