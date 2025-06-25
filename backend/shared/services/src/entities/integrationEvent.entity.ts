import { Entity, Column, Index, CreateDateColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Integration Event Entity for the Outbox Pattern
 * Stores events that need to be synchronized to Neo4j
 */
@Entity('integration_events')
@Index(['processed', 'entityType'])
@Index(['timestamp'])
@Index(['retries'])
export class IntegrationEventEntity extends BaseEntity {
  @Column({ name: 'entity_type', type: 'enum', enum: ['MCPServer', 'MCPToolCall', 'Tool', 'Agent'] })
  entityType: 'MCPServer' | 'MCPToolCall' | 'Tool' | 'Agent';

  @Column({ name: 'entity_id', type: 'varchar' })
  entityId: string;

  @Column({ type: 'enum', enum: ['CREATE', 'UPDATE', 'DELETE'] })
  action: 'CREATE' | 'UPDATE' | 'DELETE';

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @CreateDateColumn({ name: 'timestamp' })
  timestamp: Date;

  @Column({ default: false })
  processed: boolean;

  @Column({ default: 0 })
  retries: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string;

  @Column({ default: 1 })
  version: number;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt?: Date;

  @Column({ name: 'next_retry_at', type: 'timestamp', nullable: true })
  nextRetryAt?: Date;

  @Column({ name: 'batch_id', nullable: true })
  batchId?: string;
} 