import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Discussion Participant Entity - Enterprise Multi-Agent Collaboration System
 * 
 * This entity manages participant identity in enterprise-scale discussions where
 * multiple AI agents (like 10 Claude Opus models) collaborate on complex projects.
 * 
 * Key Design Principles:
 * - Each participant has a unique identity per discussion
 * - Supports multiple participant types (agent, persona, user, system)
 * - Maintains clear separation between participant ID and underlying entity ID
 * - Enables sophisticated turn management and role-based permissions
 */
@Entity('discussion_participants')
@Index(['participantType', 'participantId'])
@Index(['discussionId', 'participantType', 'participantId'])
@Index(['agentId', 'discussionId'])
@Index(['joinedAt', 'leftAt'])
@Index(['roleInDiscussion', 'isActive'])
@Unique(['discussionId', 'participantType', 'participantId'])
export class DiscussionParticipant extends BaseEntity {
  // === Core Identity Fields ===
  @Column({ name: 'discussion_id', type: 'uuid' })
  discussionId: string;

  @Column({ 
    name: 'participant_type', 
    type: 'enum', 
    enum: ['agent', 'persona', 'user', 'system'],
    default: 'agent'
  })
  participantType: 'agent' | 'persona' | 'user' | 'system';

  @Column({ name: 'participant_id', type: 'uuid' })
  participantId: string;

  // === Entity References (based on participant type) ===
  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId?: string;

  @Column({ name: 'persona_id', type: 'uuid', nullable: true })
  personaId?: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string;

  // === Display & Role Management ===
  @Column({ name: 'display_name', type: 'varchar', length: 255, nullable: true })
  displayName?: string;

  @Column({ 
    name: 'role_in_discussion', 
    type: 'enum', 
    enum: ['moderator', 'participant', 'observer', 'facilitator', 'expert', 'critic'],
    default: 'participant'
  })
  roleInDiscussion: 'moderator' | 'participant' | 'observer' | 'facilitator' | 'expert' | 'critic';

  // === Participation Lifecycle ===
  @Column({ name: 'joined_at', type: 'timestamp' })
  joinedAt: Date;

  @Column({ name: 'left_at', type: 'timestamp', nullable: true })
  leftAt?: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_muted', type: 'boolean', default: false })
  isMuted: boolean;

  // === Turn Management & Permissions ===
  @Column({ name: 'permissions', type: 'jsonb', default: '[]' })
  permissions: string[];

  @Column({ name: 'turn_order', type: 'integer', nullable: true })
  turnOrder?: number;

  @Column({ name: 'turn_weight', type: 'decimal', precision: 3, scale: 2, default: 1.0 })
  turnWeight: number;

  @Column({ name: 'can_initiate_turns', type: 'boolean', default: true })
  canInitiateTurns: boolean;

  @Column({ name: 'can_moderate', type: 'boolean', default: false })
  canModerate: boolean;

  @Column({ name: 'max_consecutive_turns', type: 'integer', default: 3 })
  maxConsecutiveTurns: number;

  // === Advanced Configuration ===
  @Column({ name: 'participation_config', type: 'jsonb', nullable: true })
  participationConfig?: Record<string, any>;

  @Column({ name: 'behavioral_constraints', type: 'jsonb', nullable: true })
  behavioralConstraints?: Record<string, any>;

  @Column({ name: 'context_awareness', type: 'jsonb', nullable: true })
  contextAwareness?: Record<string, any>;

  // === Performance & Analytics ===
  @Column({ name: 'message_count', type: 'integer', default: 0 })
  messageCount: number;

  @Column({ name: 'last_message_at', type: 'timestamp', nullable: true })
  lastMessageAt?: Date;

  @Column({ name: 'total_speaking_time_ms', type: 'integer', nullable: true })
  totalSpeakingTimeMs?: number;

  @Column({ name: 'contribution_score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  contributionScore?: number;

  @Column({ name: 'engagement_level', type: 'decimal', precision: 3, scale: 2, nullable: true })
  engagementLevel?: number;

  @Column({ name: 'interruption_count', type: 'integer', default: 0 })
  interruptionCount: number;

  @Column({ name: 'questions_asked', type: 'integer', default: 0 })
  questionsAsked: number;

  @Column({ name: 'questions_answered', type: 'integer', default: 0 })
  questionsAnswered: number;

  @Column({ name: 'sentiment_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  sentimentScore?: number;

  @Column({ name: 'collaboration_rating', type: 'decimal', precision: 3, scale: 2, nullable: true })
  collaborationRating?: number;

  @Column({ name: 'expertise_tags', type: 'jsonb', default: '[]' })
  expertiseTags: string[];

  @Column({ name: 'topics', type: 'jsonb', default: '[]' })
  topics: string[];

  @Column({ name: 'preferences', type: 'jsonb', nullable: true })
  preferences?: Record<string, any>;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // === Computed Properties ===
  
  /**
   * Get the unique participant identifier - this is what should be used
   * throughout the system for participant identification
   */
  getParticipantId(): string {
    return this.participantId;
  }

  /**
   * Get the display name for this participant
   */
  getDisplayName(): string {
    return this.displayName || `${this.participantType}-${this.participantId.substring(0, 8)}`;
  }

  /**
   * Check if this participant can perform a specific action
   */
  hasPermission(permission: string): boolean {
    return this.permissions.includes(permission) || this.permissions.includes('*');
  }

  /**
   * Get the underlying entity ID based on participant type
   */
  getEntityId(): string | undefined {
    switch (this.participantType) {
      case 'agent':
        return this.agentId;
      case 'persona':
        return this.personaId;
      case 'user':
        return this.userId;
      case 'system':
        return 'system';
      default:
        return undefined;
    }
  }

  // === Relationships ===
  @ManyToOne('Agent', { nullable: true })
  @JoinColumn({ name: 'agent_id' })
  agent?: any;

  @ManyToOne('Discussion', { nullable: true })
  @JoinColumn({ name: 'discussion_id' })
  discussion?: any;

  @ManyToOne('UserEntity', { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: any;

  @ManyToOne('Persona', { nullable: true })
  @JoinColumn({ name: 'persona_id' })
  persona?: any;
} 