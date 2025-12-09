import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../entities/base.entity.js';
import { UserEntity } from '../../entities/user.entity.js';

export enum ExpertiseLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
  MASTER = 'master',
}

export enum ExpertiseConfidence {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high',
}

@Entity('expertise_profiles')
@Index(['participantId'])
@Index(['domain'])
@Index(['expertiseLevel'])
@Index(['confidence'])
@Index(['isActive'])
export class ExpertiseProfileEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255, name: 'participant_id' })
  participantId!: string;

  @Column({ type: 'varchar', length: 255, name: 'participant_name' })
  participantName!: string;

  @Column({ type: 'varchar', length: 100 })
  domain!: string;

  @Column({ type: 'json', nullable: true })
  skills?: string[];

  @Column({ type: 'json', nullable: true })
  technologies?: string[];

  @Column({
    type: 'enum',
    enum: ExpertiseLevel,
    name: 'expertise_level',
    default: ExpertiseLevel.INTERMEDIATE,
  })
  expertiseLevel!: ExpertiseLevel;

  @Column({
    type: 'enum',
    enum: ExpertiseConfidence,
    default: ExpertiseConfidence.MEDIUM,
  })
  confidence!: ExpertiseConfidence;

  @Column({ type: 'decimal', precision: 3, scale: 2, name: 'expertise_score' })
  expertiseScore!: number;

  @Column({ type: 'json', nullable: true })
  evidencePoints?: {
    technicalDepth?: number;
    problemSolving?: number;
    communication?: number;
    leadership?: number;
    innovation?: number;
    mentoring?: number;
  };

  @Column({ type: 'json', nullable: true })
  domainKnowledge?: {
    concepts?: string[];
    frameworks?: string[];
    patterns?: string[];
    bestPractices?: string[];
    commonPitfalls?: string[];
  };

  @Column({ type: 'json', nullable: true })
  communicationStyle?: {
    clarity?: number;
    patience?: number;
    helpfulness?: number;
    accessibility?: number;
    engagement?: number;
  };

  @Column({ type: 'json', nullable: true })
  collaborationPatterns?: {
    preferredRoles?: string[];
    workingStyle?: string;
    strengths?: string[];
    growthAreas?: string[];
  };

  @Column({ type: 'json', nullable: true })
  contributions?: {
    totalMessages?: number;
    helpfulAnswers?: number;
    questionsAsked?: number;
    solutionsProvided?: number;
    knowledgeShared?: number;
  };

  @Column({ type: 'json', nullable: true })
  learningJourney?: {
    recentTopics?: string[];
    knowledgeGaps?: string[];
    learningGoals?: string[];
    preferredLearningStyle?: string;
  };

  @Column({ type: 'json', nullable: true })
  networkConnections?: {
    mentors?: string[];
    mentees?: string[];
    collaborators?: string[];
    subjectMatterExperts?: string[];
  };

  @Column({ type: 'json', nullable: true })
  industryContext?: {
    industry?: string;
    yearsOfExperience?: number;
    currentRole?: string;
    organizationSize?: string;
    relevantProjects?: string[];
  };

  @Column({ type: 'json', nullable: true })
  recognitionMetrics?: {
    endorsements?: number;
    citations?: number;
    reputation?: number;
    successfulCollaborations?: number;
    positiveInteractions?: number;
  };

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  creator!: UserEntity;

  @Column({ type: 'json', nullable: true })
  extractionMetadata?: {
    extractionMethod?: string;
    sourceConversationIds?: string[];
    extractedAt?: Date;
    analysisVersion?: string;
    confidenceFactors?: string[];
    lastUpdated?: Date;
  };

  @Column({ type: 'json', nullable: true })
  validationMetadata?: {
    validatedBy?: string;
    validatedAt?: Date;
    validationMethod?: string;
    validationScore?: number;
    validationNotes?: string;
  };

  @Column({ type: 'timestamp', name: 'last_activity_at', nullable: true })
  lastActivityAt?: Date;

  @Column({ type: 'timestamp', name: 'expertise_updated_at', nullable: true })
  expertiseUpdatedAt?: Date;
}
