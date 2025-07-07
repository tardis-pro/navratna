import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../entities/base.entity.js';
import { UserEntity } from '../../entities/user.entity.js';

export enum LearningMomentType {
  INSIGHT = 'insight',
  BREAKTHROUGH = 'breakthrough',
  CLARIFICATION = 'clarification',
  MISTAKE_CORRECTION = 'mistake_correction',
  KNOWLEDGE_GAP = 'knowledge_gap',
  SKILL_DEVELOPMENT = 'skill_development',
  PATTERN_RECOGNITION = 'pattern_recognition',
  CONCEPTUAL_UNDERSTANDING = 'conceptual_understanding'
}

export enum LearningImpact {
  MINIMAL = 'minimal',
  MODERATE = 'moderate',
  SIGNIFICANT = 'significant',
  TRANSFORMATIVE = 'transformative'
}

export enum LearningContext {
  INDIVIDUAL = 'individual',
  COLLABORATIVE = 'collaborative',
  MENTORING = 'mentoring',
  PROBLEM_SOLVING = 'problem_solving',
  KNOWLEDGE_SHARING = 'knowledge_sharing',
  PEER_LEARNING = 'peer_learning'
}

@Entity('learning_moments')
@Index(['participantId'])
@Index(['learningType'])
@Index(['domain'])
@Index(['impact'])
@Index(['context'])
@Index(['confidence'])
@Index(['extractedAt'])
export class LearningMomentEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255, name: 'participant_id' })
  participantId!: string;

  @Column({ type: 'varchar', length: 255, name: 'participant_name' })
  participantName!: string;

  @Column({
    type: 'enum',
    enum: LearningMomentType,
    name: 'learning_type'
  })
  learningType!: LearningMomentType;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 100 })
  domain!: string;

  @Column({ type: 'json', nullable: true })
  topics?: string[];

  @Column({ type: 'json', nullable: true })
  concepts?: string[];

  @Column({
    type: 'enum',
    enum: LearningImpact,
    default: LearningImpact.MODERATE
  })
  impact!: LearningImpact;

  @Column({
    type: 'enum',
    enum: LearningContext,
    default: LearningContext.INDIVIDUAL
  })
  context!: LearningContext;

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence!: number;

  @Column({ type: 'json', nullable: true })
  beforeState?: {
    understanding?: string;
    skillLevel?: string;
    misconceptions?: string[];
    knowledgeGaps?: string[];
    confidence?: number;
  };

  @Column({ type: 'json', nullable: true })
  afterState?: {
    understanding?: string;
    skillLevel?: string;
    newKnowledge?: string[];
    clarifiedConcepts?: string[];
    confidence?: number;
  };

  @Column({ type: 'json', nullable: true })
  triggers?: {
    conversationTriggers?: string[];
    questionTriggers?: string[];
    problemTriggers?: string[];
    mentorTriggers?: string[];
    resourceTriggers?: string[];
  };

  @Column({ type: 'json', nullable: true })
  learningProcess?: {
    steps?: string[];
    methods?: string[];
    duration?: number;
    iterations?: number;
    breakthroughMoment?: string;
  };

  @Column({ type: 'json', nullable: true })
  outcomes?: {
    knowledgeGained?: string[];
    skillsImproved?: string[];
    attitudinalChanges?: string[];
    behavioralChanges?: string[];
    applicationPotential?: string[];
  };

  @Column({ type: 'json', nullable: true })
  socialDimensions?: {
    mentorsInvolved?: string[];
    peersInvolved?: string[];
    collaborativeElements?: string[];
    socialSupport?: string[];
    communityImpact?: string[];
  };

  @Column({ type: 'json', nullable: true })
  emotionalDimensions?: {
    frustrationLevel?: number;
    satisfactionLevel?: number;
    curiosityLevel?: number;
    confidenceChange?: number;
    motivationChange?: number;
  };

  @Column({ type: 'json', nullable: true })
  applicationContext?: {
    immediateApplications?: string[];
    futureApplications?: string[];
    practicalExamples?: string[];
    realWorldRelevance?: string[];
    transferability?: string[];
  };

  @Column({ type: 'json', nullable: true })
  followUpActions?: {
    additionalLearning?: string[];
    practiceNeeds?: string[];
    mentorshipNeeds?: string[];
    resourceNeeds?: string[];
    collaborationOpportunities?: string[];
  };

  @Column({ type: 'json', nullable: true })
  relatedMoments?: {
    prerequisiteMoments?: string[];
    buildingMoments?: string[];
    similarMoments?: string[];
    contrastingMoments?: string[];
  };

  @Column({ type: 'json', nullable: true })
  validationEvidence?: {
    demonstratedUnderstanding?: string[];
    successfulApplications?: string[];
    teachingOthers?: string[];
    problemSolvingEvidence?: string[];
    peerRecognition?: string[];
  };

  @Column({ type: 'timestamp', name: 'occurred_at' })
  occurredAt!: Date;

  @Column({ type: 'timestamp', name: 'extracted_at' })
  extractedAt!: Date;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  creator!: UserEntity;

  @Column({ type: 'json', nullable: true })
  extractionMetadata?: {
    extractionMethod?: string;
    sourceConversationIds?: string[];
    analysisVersion?: string;
    confidenceFactors?: string[];
    extractionTechniques?: string[];
    validationMethods?: string[];
  };

  @Column({ type: 'json', nullable: true })
  longitudinalData?: {
    learningTrajectory?: string[];
    progressIndicators?: string[];
    masteryMilestones?: string[];
    retentionEvidence?: string[];
    applicationEvidence?: string[];
  };

  @Column({ type: 'boolean', name: 'is_validated', default: false })
  isValidated!: boolean;

  @Column({ type: 'uuid', name: 'validated_by', nullable: true })
  validatedBy?: string;

  @Column({ type: 'timestamp', name: 'validated_at', nullable: true })
  validatedAt?: Date;

  @Column({ type: 'text', name: 'validation_notes', nullable: true })
  validationNotes?: string;
}