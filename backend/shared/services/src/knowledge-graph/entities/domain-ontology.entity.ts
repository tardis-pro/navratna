import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../entities/base.entity.js';
import { UserEntity } from '../../entities/user.entity.js';

export enum OntologyType {
  DOMAIN = 'domain',
  SUBDOMAIN = 'subdomain',
  CONCEPT_HIERARCHY = 'concept_hierarchy',
  TAXONOMY = 'taxonomy',
  WORKFLOW_ONTOLOGY = 'workflow_ontology',
  SKILL_ONTOLOGY = 'skill_ontology',
  TOOL_ONTOLOGY = 'tool_ontology'
}

export enum OntologyStatus {
  DRAFT = 'draft',
  REVIEW = 'review',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated'
}

export enum OntologyScope {
  GLOBAL = 'global',
  ORGANIZATIONAL = 'organizational',
  PROJECT = 'project',
  TEAM = 'team',
  PERSONAL = 'personal'
}

@Entity('domain_ontologies')
@Index(['domain'])
@Index(['ontologyType'])
@Index(['status'])
@Index(['scope'])
@Index(['version'])
@Index(['isActive'])
export class DomainOntologyEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  domain!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  subdomain?: string;

  @Column({
    type: 'enum',
    enum: OntologyType,
    name: 'ontology_type'
  })
  ontologyType!: OntologyType;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: OntologyStatus,
    default: OntologyStatus.DRAFT
  })
  status!: OntologyStatus;

  @Column({
    type: 'enum',
    enum: OntologyScope,
    default: OntologyScope.ORGANIZATIONAL
  })
  scope!: OntologyScope;

  @Column({ type: 'varchar', length: 50, default: '1.0.0' })
  version!: string;

  @Column({ type: 'json', nullable: true })
  concepts?: {
    id: string;
    name: string;
    description?: string;
    aliases?: string[];
    properties?: Record<string, any>;
    relationships?: Array<{
      type: string;
      target: string;
      properties?: Record<string, any>;
    }>;
  }[];

  @Column({ type: 'json', nullable: true })
  relationships?: {
    id: string;
    type: string;
    source: string;
    target: string;
    properties?: Record<string, any>;
    bidirectional?: boolean;
    strength?: number;
  }[];

  @Column({ type: 'json', nullable: true })
  hierarchy?: {
    root: string;
    levels: Array<{
      level: number;
      concepts: string[];
      relationships: string[];
    }>;
    depth: number;
    breadth: number;
  };

  @Column({ type: 'json', nullable: true })
  taxonomy?: {
    classes: Array<{
      id: string;
      name: string;
      parentId?: string;
      children?: string[];
      properties?: Record<string, any>;
    }>;
    properties: Array<{
      id: string;
      name: string;
      dataType: string;
      domain?: string[];
      range?: string[];
    }>;
  };

  @Column({ type: 'json', nullable: true })
  axioms?: {
    id: string;
    type: string;
    statement: string;
    formalRepresentation?: string;
    constraints?: Record<string, any>;
  }[];

  @Column({ type: 'json', nullable: true })
  rules?: {
    id: string;
    name: string;
    condition: string;
    conclusion: string;
    confidence?: number;
    applicability?: string[];
  }[];

  @Column({ type: 'json', nullable: true })
  semanticMappings?: {
    externalOntologies?: Array<{
      ontologyId: string;
      mappings: Array<{
        localConcept: string;
        externalConcept: string;
        mappingType: string;
        confidence?: number;
      }>;
    }>;
    standardVocabularies?: Array<{
      vocabulary: string;
      mappings: Array<{
        localTerm: string;
        standardTerm: string;
        uri?: string;
      }>;
    }>;
  };

  @Column({ type: 'json', nullable: true })
  usagePatterns?: {
    commonQueries?: string[];
    frequentConcepts?: Array<{
      concept: string;
      frequency: number;
      contexts: string[];
    }>;
    relationshipPatterns?: Array<{
      pattern: string;
      frequency: number;
      examples: string[];
    }>;
  };

  @Column({ type: 'json', nullable: true })
  qualityMetrics?: {
    completeness?: number;
    consistency?: number;
    clarity?: number;
    coverage?: number;
    depth?: number;
    breadth?: number;
    usability?: number;
  };

  @Column({ type: 'json', nullable: true })
  provenance?: {
    sources?: string[];
    extractionMethods?: string[];
    validationMethods?: string[];
    contributors?: string[];
    derivedFrom?: string[];
  };

  @Column({ type: 'json', nullable: true })
  applicationDomains?: {
    primaryDomains?: string[];
    secondaryDomains?: string[];
    useCase?: string[];
    applicability?: string[];
  };

  @Column({ type: 'json', nullable: true })
  evolutionHistory?: {
    changes?: Array<{
      version: string;
      date: Date;
      author: string;
      changeType: string;
      description: string;
      impact: string;
    }>;
    deprecations?: Array<{
      concept: string;
      version: string;
      reason: string;
      replacement?: string;
    }>;
  };

  @Column({ type: 'json', nullable: true })
  validationResults?: {
    structuralValidation?: {
      isValid: boolean;
      issues?: string[];
      warnings?: string[];
    };
    semanticValidation?: {
      isValid: boolean;
      inconsistencies?: string[];
      suggestions?: string[];
    };
    usabilityValidation?: {
      score: number;
      feedback?: string[];
      recommendations?: string[];
    };
  };

  @Column({ type: 'json', nullable: true })
  exportFormats?: {
    rdf?: string;
    owl?: string;
    jsonLd?: string;
    skos?: string;
    custom?: Record<string, any>;
  };

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  creator!: UserEntity;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedBy?: string;

  @Column({ type: 'timestamp', name: 'approved_at', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'timestamp', name: 'published_at', nullable: true })
  publishedAt?: Date;

  @Column({ type: 'json', nullable: true })
  extractionMetadata?: {
    extractionMethod?: string;
    sourceConversationIds?: string[];
    extractedAt?: Date;
    analysisVersion?: string;
    automationLevel?: string;
    humanValidation?: boolean;
  };

  @Column({ type: 'json', nullable: true })
  usageStats?: {
    accessCount?: number;
    queryCount?: number;
    applicationCount?: number;
    lastUsed?: Date;
    popularConcepts?: string[];
    userFeedback?: Array<{
      userId: string;
      rating: number;
      feedback: string;
      date: Date;
    }>;
  };
}