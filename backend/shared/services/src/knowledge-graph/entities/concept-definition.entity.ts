import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../entities/base.entity.js';
import { UserEntity } from '../../entities/user.entity.js';

export enum ConceptType {
  ENTITY = 'entity',
  PROCESS = 'process',
  ATTRIBUTE = 'attribute',
  RELATIONSHIP = 'relationship',
  EVENT = 'event',
  STATE = 'state',
  ROLE = 'role',
  FUNCTION = 'function',
  PRINCIPLE = 'principle',
  PATTERN = 'pattern',
}

export enum ConceptCategory {
  TECHNICAL = 'technical',
  BUSINESS = 'business',
  DOMAIN_SPECIFIC = 'domain_specific',
  METHODOLOGICAL = 'methodological',
  THEORETICAL = 'theoretical',
  PRACTICAL = 'practical',
  ABSTRACT = 'abstract',
  CONCRETE = 'concrete',
}

export enum ConceptStatus {
  DRAFT = 'draft',
  REVIEW = 'review',
  VALIDATED = 'validated',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
}

export enum ConceptComplexity {
  BASIC = 'basic',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

@Entity('concept_definitions')
@Index(['name'])
@Index(['domain'])
@Index(['conceptType'])
@Index(['category'])
@Index(['status'])
@Index(['complexity'])
@Index(['isActive'])
export class ConceptDefinitionEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  domain!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  subdomain?: string;

  @Column({
    type: 'enum',
    enum: ConceptType,
    name: 'concept_type',
  })
  conceptType!: ConceptType;

  @Column({
    type: 'enum',
    enum: ConceptCategory,
    default: ConceptCategory.TECHNICAL,
  })
  category!: ConceptCategory;

  @Column({
    type: 'enum',
    enum: ConceptStatus,
    default: ConceptStatus.DRAFT,
  })
  status!: ConceptStatus;

  @Column({
    type: 'enum',
    enum: ConceptComplexity,
    default: ConceptComplexity.INTERMEDIATE,
  })
  complexity!: ConceptComplexity;

  @Column({ type: 'text' })
  definition!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  aliases?: string[];

  @Column({ type: 'json', nullable: true })
  synonyms?: string[];

  @Column({ type: 'json', nullable: true })
  antonyms?: string[];

  @Column({ type: 'json', nullable: true })
  relatedTerms?: string[];

  @Column({ type: 'json', nullable: true })
  prerequisites?: {
    conceptIds?: string[];
    knowledgeAreas?: string[];
    skills?: string[];
    experienceLevel?: string;
  };

  @Column({ type: 'json', nullable: true })
  properties?: {
    key: string;
    value: any;
    dataType: string;
    description?: string;
    constraints?: any;
  }[];

  @Column({ type: 'json', nullable: true })
  characteristics?: {
    essential?: string[];
    accidental?: string[];
    distinguishing?: string[];
    typical?: string[];
  };

  @Column({ type: 'json', nullable: true })
  relationships?: {
    id: string;
    type: string;
    target: string;
    description?: string;
    strength?: number;
    bidirectional?: boolean;
  }[];

  @Column({ type: 'json', nullable: true })
  taxonomy?: {
    parentConcepts?: string[];
    childConcepts?: string[];
    siblingConcepts?: string[];
    hierarchyLevel?: number;
  };

  @Column({ type: 'json', nullable: true })
  examples?: {
    positive?: string[];
    negative?: string[];
    borderline?: string[];
    contextual?: Array<{
      context: string;
      example: string;
      explanation?: string;
    }>;
  };

  @Column({ type: 'json', nullable: true })
  usageContext?: {
    primaryContexts?: string[];
    secondaryContexts?: string[];
    inappropriateContexts?: string[];
    commonMisuses?: string[];
  };

  @Column({ type: 'json', nullable: true })
  learningObjectives?: {
    knowledge?: string[];
    skills?: string[];
    applications?: string[];
    assessmentCriteria?: string[];
  };

  @Column({ type: 'json', nullable: true })
  pedagogicalNotes?: {
    teachingStrategies?: string[];
    commonMisconceptions?: string[];
    learningDifficulties?: string[];
    assessmentMethods?: string[];
    prerequisites?: string[];
  };

  @Column({ type: 'json', nullable: true })
  formalRepresentation?: {
    logicalDefinition?: string;
    mathematicalDefinition?: string;
    algorithmicDefinition?: string;
    structuralDefinition?: Record<string, any>;
  };

  @Column({ type: 'json', nullable: true })
  historicalContext?: {
    origin?: string;
    evolution?: string[];
    keyContributors?: string[];
    paradigmShifts?: string[];
    currentTrends?: string[];
  };

  @Column({ type: 'json', nullable: true })
  applicationDomains?: {
    primary?: string[];
    secondary?: string[];
    emerging?: string[];
    examples?: Array<{
      domain: string;
      application: string;
      context: string;
    }>;
  };

  @Column({ type: 'json', nullable: true })
  qualityMetrics?: {
    clarity?: number;
    precision?: number;
    completeness?: number;
    consistency?: number;
    usability?: number;
    relevance?: number;
  };

  @Column({ type: 'json', nullable: true })
  references?: {
    authoritative?: Array<{
      title: string;
      author: string;
      source: string;
      url?: string;
      year?: number;
    }>;
    supporting?: Array<{
      title: string;
      source: string;
      relevance: string;
    }>;
    contradictory?: Array<{
      title: string;
      source: string;
      pointOfDifference: string;
    }>;
  };

  @Column({ type: 'json', nullable: true })
  socialDimensions?: {
    communityAcceptance?: number;
    controversyLevel?: number;
    debatedAspects?: string[];
    consensus?: string[];
    stakeholders?: string[];
  };

  @Column({ type: 'json', nullable: true })
  practicalImplications?: {
    tools?: string[];
    techniques?: string[];
    bestPractices?: string[];
    commonPitfalls?: string[];
    successFactors?: string[];
  };

  @Column({ type: 'json', nullable: true })
  measurabilityAspects?: {
    quantitativeMetrics?: string[];
    qualitativeIndicators?: string[];
    assessmentMethods?: string[];
    benchmarks?: string[];
  };

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  confidence?: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  creator!: UserEntity;

  @Column({ type: 'uuid', name: 'validated_by', nullable: true })
  validatedBy?: string;

  @Column({ type: 'timestamp', name: 'validated_at', nullable: true })
  validatedAt?: Date;

  @Column({ type: 'json', nullable: true })
  extractionMetadata?: {
    extractionMethod?: string;
    sourceConversationIds?: string[];
    extractedAt?: Date;
    analysisVersion?: string;
    automationLevel?: string;
    humanValidation?: boolean;
    confidenceFactors?: string[];
  };

  @Column({ type: 'json', nullable: true })
  versionHistory?: {
    changes?: Array<{
      version: string;
      date: Date;
      author: string;
      changeType: string;
      description: string;
      rationale?: string;
    }>;
    majorRevisions?: Array<{
      version: string;
      date: Date;
      summary: string;
      impact: string;
    }>;
  };

  @Column({ type: 'json', nullable: true })
  usageStatistics?: {
    viewCount?: number;
    applicationCount?: number;
    citationCount?: number;
    lastAccessed?: Date;
    popularityScore?: number;
    userRatings?: Array<{
      userId: string;
      rating: number;
      feedback?: string;
      date: Date;
    }>;
  };
}
