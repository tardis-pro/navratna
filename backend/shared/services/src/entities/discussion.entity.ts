import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';
import { DiscussionParticipant } from './discussionParticipant.entity.js';
import { 
  DiscussionStatus, 
  DiscussionVisibility, 
  TurnStrategy,
  DiscussionState,
  DiscussionSettings,
  TurnStrategyConfig
} from '@uaip/types';

/**
 * Discussion Entity
 * Represents a discussion/conversation between multiple participants
 */
@Entity('discussions')
export class Discussion extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 1000 })
  topic: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'uuid', nullable: true })
  documentId?: string;

  @Column({ type: 'uuid', nullable: true })
  operationId?: string;

  @OneToMany(() => DiscussionParticipant, participant => participant.discussion, { cascade: true })
  participants: DiscussionParticipant[];

  @Column({ type: 'jsonb', nullable: true })
  state: DiscussionState;

  @Column({ type: 'jsonb' })
  settings: DiscussionSettings;

  @Column({ type: 'jsonb' })
  turnStrategy: TurnStrategyConfig;

  @Column({ 
    type: 'enum', 
    enum: DiscussionStatus, 
    default: DiscussionStatus.DRAFT 
  })
  status: DiscussionStatus;

  @Column({ 
    type: 'enum', 
    enum: DiscussionVisibility, 
    default: DiscussionVisibility.PRIVATE 
  })
  visibility: DiscussionVisibility;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'createdBy' })
  creator: UserEntity;

  @Column({ type: 'uuid', nullable: true })
  organizationId?: string;

  @Column({ type: 'uuid', nullable: true })
  teamId?: string;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  scheduledFor?: Date;

  @Column({ type: 'integer', nullable: true })
  estimatedDuration?: number; // minutes

  @Column({ type: 'integer', nullable: true })
  actualDuration?: number; // minutes

  @Column({ type: 'text', array: true, default: [] })
  tags: string[];

  @Column({ type: 'text', array: true, default: [] })
  objectives: string[];

  @Column({ type: 'jsonb', default: [] })
  outcomes: Array<{
    outcome: string;
    achievedAt: Date;
    confidence: number;
  }>;

  @Column({ type: 'uuid', array: true, default: [] })
  relatedDiscussions: string[];

  @Column({ type: 'uuid', nullable: true })
  parentDiscussionId?: string;

  @Column({ type: 'uuid', array: true, default: [] })
  childDiscussions: string[];

  @Column({ type: 'jsonb', nullable: true })
  analytics?: {
    totalMessages: number;
    uniqueParticipants: number;
    averageMessageLength: number;
    participationDistribution?: Record<string, number>;
    sentimentDistribution?: Record<string, number>;
    topicProgression: Array<{
      topic: string;
      timestamp: Date;
      confidence: number;
    }>;
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;
} 