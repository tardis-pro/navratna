import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Discussion Participant Entity
 * Tracks persona participation in discussions and conversations
 */
@Entity('discussion_participants')
@Index(['personaId', 'discussionId'])
@Index(['joinedAt', 'leftAt'])
@Index(['role', 'isActive'])
export class DiscussionParticipant extends BaseEntity {
  @Column({ name: 'persona_id', type: 'varchar' })
  personaId: string;

  @Column({ name: 'discussion_id', type: 'varchar' })
  discussionId: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  @Column({ type: 'enum', enum: ['participant', 'moderator', 'observer', 'facilitator'], default: 'participant' })
  role: 'participant' | 'moderator' | 'observer' | 'facilitator';

  @Column({ name: 'joined_at', type: 'timestamp' })
  joinedAt: Date;

  @Column({ name: 'left_at', type: 'timestamp', nullable: true })
  leftAt?: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'message_count', default: 0 })
  messageCount: number;

  @Column({ name: 'contribution_score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  contributionScore?: number;

  @Column({ name: 'engagement_level', type: 'decimal', precision: 3, scale: 2, nullable: true })
  engagementLevel?: number;

  @Column({ name: 'last_message_at', type: 'timestamp', nullable: true })
  lastMessageAt?: Date;

  @Column({ name: 'total_speaking_time_ms', nullable: true })
  totalSpeakingTimeMs?: number;

  @Column({ name: 'interruption_count', default: 0 })
  interruptionCount: number;

  @Column({ name: 'questions_asked', default: 0 })
  questionsAsked: number;

  @Column({ name: 'questions_answered', default: 0 })
  questionsAnswered: number;

  @Column({ name: 'sentiment_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  sentimentScore?: number;

  @Column({ name: 'collaboration_rating', type: 'decimal', precision: 3, scale: 2, nullable: true })
  collaborationRating?: number;

  @Column({ type: 'jsonb', default: '[]' })
  topics: string[];

  @Column({ type: 'jsonb', nullable: true })
  preferences?: Record<string, any>;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @ManyToOne('Persona', 'discussionParticipants')
  @JoinColumn({ name: 'persona_id' })
  persona: any;
} 