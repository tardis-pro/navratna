import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Conversation Context Entity
 * Tracks conversation state and context for agents
 */
@Entity('conversation_contexts')
@Index(['agentId', 'sessionId'])
@Index(['userId', 'createdAt'])
@Index(['status', 'lastActivityAt'])
export class ConversationContext extends BaseEntity {
  @Column({ name: 'agent_id', type: 'varchar' })
  agentId: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  @Column({ name: 'session_id', type: 'varchar' })
  sessionId: string;

  @Column({ type: 'enum', enum: ['active', 'paused', 'completed', 'terminated'], default: 'active' })
  status: 'active' | 'paused' | 'completed' | 'terminated';

  @Column({ type: 'jsonb', default: '[]' })
  messages: any[];

  @Column({ type: 'jsonb', nullable: true })
  context?: Record<string, any>;

  @Column({ name: 'conversation_summary', type: 'text', nullable: true })
  conversationSummary?: string;

  @Column({ name: 'key_topics', type: 'jsonb', default: '[]' })
  keyTopics: string[];

  @Column({ name: 'sentiment_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  sentimentScore?: number;

  @Column({ name: 'engagement_level', type: 'decimal', precision: 3, scale: 2, nullable: true })
  engagementLevel?: number;

  @Column({ name: 'message_count', default: 0 })
  messageCount: number;

  @Column({ name: 'last_activity_at', type: 'timestamp', nullable: true })
  lastActivityAt?: Date;

  @Column({ name: 'started_at', type: 'timestamp' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'timestamp', nullable: true })
  endedAt?: Date;

  @Column({ name: 'total_duration_ms', nullable: true })
  totalDurationMs?: number;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @ManyToOne('Agent', 'conversations')
  @JoinColumn({ name: 'agent_id' })
  agent: any;
} 