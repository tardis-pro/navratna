import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { Discussion } from './discussion.entity.js';
import { DiscussionParticipant } from './discussionParticipant.entity.js';
import { MessageType } from '@uaip/types';

/**
 * Discussion Message Entity
 * Represents a message sent within a discussion
 */
@Entity('discussion_messages')
export class DiscussionMessage extends BaseEntity {
  @Column({ type: 'uuid' })
  discussionId: string;

  @ManyToOne(() => Discussion, { nullable: false })
  @JoinColumn({ name: 'discussionId' })
  discussion: Discussion;

  @Column({ type: 'uuid' })
  participantId: string;

  @ManyToOne(() => DiscussionParticipant, { nullable: false })
  @JoinColumn({ name: 'participantId' })
  participant: DiscussionParticipant;

  @Column({ type: 'text' })
  content: string;

  @Column({ 
    type: 'enum', 
    enum: MessageType, 
    default: MessageType.MESSAGE 
  })
  messageType: MessageType;

  @Column({ type: 'uuid', nullable: true })
  replyToMessageId?: string;

  @ManyToOne(() => DiscussionMessage, { nullable: true })
  @JoinColumn({ name: 'replyToMessageId' })
  replyToMessage?: DiscussionMessage;

  @Column({ type: 'text', array: true, default: [] })
  attachments: string[];

  @Column({ type: 'jsonb', nullable: true })
  reactions?: Record<string, string[]>; // { "👍": ["userId1", "userId2"], "❤️": ["userId3"] }

  @Column({ type: 'boolean', default: false })
  isEdited: boolean;

  @Column({ type: 'timestamp', nullable: true })
  editedAt?: Date;

  @Column({ type: 'text', nullable: true })
  editReason?: string;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt?: Date;

  @Column({ type: 'uuid', nullable: true })
  deletedBy?: string;

  @Column({ type: 'boolean', default: false })
  isPinned: boolean;

  @Column({ type: 'timestamp', nullable: true })
  pinnedAt?: Date;

  @Column({ type: 'uuid', nullable: true })
  pinnedBy?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'float', nullable: true })
  confidence?: number;

  @Column({ type: 'uuid', nullable: true })
  agentId?: string; // For messages sent by agents

  @Column({ type: 'jsonb', nullable: true })
  processingInfo?: {
    source: string;
    processingTime?: number;
    llmModel?: string;
    llmProvider?: string;
    isInitialParticipation?: boolean;
  };
}