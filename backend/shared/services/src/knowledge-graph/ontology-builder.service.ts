import { v4 as uuidv4 } from 'uuid';
import { logger } from '@uaip/utils';
import { KnowledgeIngestRequest, KnowledgeItem, KnowledgeType, SourceType } from '@uaip/types';
import {
  ConceptExtractorService,
  ConceptNode,
  ConceptRelationship,
  ConceptExtractionResult,
  ConceptProperty,
} from './concept-extractor.service.js';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
import { KnowledgeSyncService } from './knowledge-sync.service.js';

export interface ConceptHierarchy {
  rootConcepts: ConceptNode[];
  hierarchy: Map<string, ConceptNode[]>; // parent -> children
  depth: Map<string, number>; // concept -> depth in hierarchy
  maxDepth: number;
}

export interface OntologyRule {
  id: string;
  type: 'CONSTRAINT' | 'INFERENCE' | 'VALIDATION';
  condition: string;
  action: string;
  confidence: number;
  domain: string;
}

export interface DomainOntology {
  id: string;
  domain: string;
  version: string;
  concepts: ConceptNode[];
  relationships: ConceptRelationship[];
  hierarchy: ConceptHierarchy;
  rules: OntologyRule[];
  metadata: {
    totalConcepts: number;
    totalRelationships: number;
    avgConfidence: number;
    buildTime: number;
    lastUpdated: Date;
    sourceKnowledgeItems: number;
  };
}

export interface OntologyBuildResult {
  ontology: DomainOntology;
  warnings: string[];
  errors: string[];
  performance: {
    conceptExtractionTime: number;
    hierarchyBuildTime: number;
    ruleGenerationTime: number;
    totalBuildTime: number;
  };
}

export class OntologyBuilderService {
  private readonly ruleTemplates = {
    CONSTRAINT: [
      'A concept cannot be both an instance and a class of the same thing',
      'Circular IS_A relationships are not allowed',
      'A concept cannot be part of itself',
    ],
    INFERENCE: [
      'If A IS_A B and B IS_A C, then A IS_A C',
      'If A PART_OF B and B PART_OF C, then A PART_OF C',
      'If A CAUSES B and B CAUSES C, then A may CAUSE C',
    ],
    VALIDATION: [
      'All concepts must have at least one definition',
      'Relationship confidence must be between 0 and 1',
      'Domain-specific concepts should be linked to domain root',
    ],
  };

  constructor(
    private readonly conceptExtractor: ConceptExtractorService,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly knowledgeSync: KnowledgeSyncService
  ) {}

  async buildDomainOntology(
    domain: string,
    knowledgeItems?: KnowledgeItem[],
    options?: {
      includeInstances?: boolean;
      minConfidence?: number;
      maxConcepts?: number;
      saveToKnowledgeGraph?: boolean;
    }
  ): Promise<OntologyBuildResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      logger.info(`Building domain ontology for: ${domain}`);

      // Get knowledge items if not provided
      let items = knowledgeItems;
      if (!items) {
        items = await this.knowledgeRepository.findByDomain(domain);
        if (items.length === 0) {
          throw new Error(`No knowledge items found for domain: ${domain}`);
        }
      }

      // Apply filters
      if (options?.minConfidence) {
        items = items.filter((item) => item.confidence >= options.minConfidence!);
      }
      if (options?.maxConcepts) {
        items = items.slice(0, options.maxConcepts);
      }

      // Step 1: Extract concepts and relationships
      const conceptStartTime = Date.now();
      const extractionResult = await this.conceptExtractor.extractConcepts(items, domain);
      const conceptExtractionTime = Date.now() - conceptStartTime;

      if (extractionResult.concepts.length === 0) {
        warnings.push('No concepts extracted from knowledge items');
      }

      // Step 2: Build concept hierarchy
      const hierarchyStartTime = Date.now();
      const hierarchy = this.buildConceptHierarchy(
        extractionResult.concepts,
        extractionResult.relationships
      );
      const hierarchyBuildTime = Date.now() - hierarchyStartTime;

      // Step 3: Generate ontology rules
      const rulesStartTime = Date.now();
      const rules = this.generateOntologyRules(extractionResult, domain);
      const ruleGenerationTime = Date.now() - rulesStartTime;

      // Step 4: Validate ontology
      const validationResult = this.validateOntology(extractionResult, hierarchy, rules);
      warnings.push(...validationResult.warnings);
      errors.push(...validationResult.errors);

      // Step 5: Create ontology object
      const ontologyId = uuidv4();
      const ontology: DomainOntology = {
        id: ontologyId,
        domain,
        version: '1.0.0',
        concepts: extractionResult.concepts,
        relationships: extractionResult.relationships,
        hierarchy,
        rules,
        metadata: {
          totalConcepts: extractionResult.concepts.length,
          totalRelationships: extractionResult.relationships.length,
          avgConfidence: extractionResult.extractionMetrics.avgConfidence,
          buildTime: Date.now() - startTime,
          lastUpdated: new Date(),
          sourceKnowledgeItems: items.length,
        },
      };

      // Step 6: Save to knowledge graph if requested
      if (options?.saveToKnowledgeGraph) {
        await this.saveOntologyToKnowledgeGraph(ontology);
      }

      const totalBuildTime = Date.now() - startTime;

      logger.info(
        `Domain ontology built successfully for ${domain}: ${ontology.metadata.totalConcepts} concepts, ${ontology.metadata.totalRelationships} relationships in ${totalBuildTime}ms`
      );

      return {
        ontology,
        warnings,
        errors,
        performance: {
          conceptExtractionTime,
          hierarchyBuildTime,
          ruleGenerationTime,
          totalBuildTime,
        },
      };
    } catch (error) {
      logger.error(`Error building domain ontology for ${domain}:`, error);
      throw new Error(
        `Ontology building failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private buildConceptHierarchy(
    concepts: ConceptNode[],
    relationships: ConceptRelationship[]
  ): ConceptHierarchy {
    const hierarchy = new Map<string, ConceptNode[]>();
    const depth = new Map<string, number>();
    const parentMap = new Map<string, string>();

    // Build parent-child relationships from IS_A relationships
    for (const rel of relationships) {
      if (rel.relationshipType === 'IS_A') {
        parentMap.set(rel.sourceConceptId, rel.targetConceptId);

        if (!hierarchy.has(rel.targetConceptId)) {
          hierarchy.set(rel.targetConceptId, []);
        }

        const child = concepts.find((c) => c.id === rel.sourceConceptId);
        if (child) {
          hierarchy.get(rel.targetConceptId)!.push(child);
        }
      }
    }

    // Find root concepts (concepts with no parents)
    const rootConcepts = concepts.filter((concept) => !parentMap.has(concept.id));

    // Calculate depths
    let maxDepth = 0;
    const calculateDepth = (conceptId: string, currentDepth: number) => {
      if (depth.has(conceptId)) return depth.get(conceptId)!;

      depth.set(conceptId, currentDepth);
      maxDepth = Math.max(maxDepth, currentDepth);

      const children = hierarchy.get(conceptId) || [];
      for (const child of children) {
        calculateDepth(child.id, currentDepth + 1);
      }

      return currentDepth;
    };

    for (const root of rootConcepts) {
      calculateDepth(root.id, 0);
    }

    return {
      rootConcepts,
      hierarchy,
      depth,
      maxDepth,
    };
  }

  private generateOntologyRules(
    extractionResult: ConceptExtractionResult,
    domain: string
  ): OntologyRule[] {
    const rules: OntologyRule[] = [];

    // Generate constraint rules
    for (const template of this.ruleTemplates.CONSTRAINT) {
      rules.push({
        id: uuidv4(),
        type: 'CONSTRAINT',
        condition: template,
        action: 'REJECT',
        confidence: 0.9,
        domain,
      });
    }

    // Generate inference rules
    for (const template of this.ruleTemplates.INFERENCE) {
      rules.push({
        id: uuidv4(),
        type: 'INFERENCE',
        condition: template,
        action: 'INFER',
        confidence: 0.8,
        domain,
      });
    }

    // Generate validation rules
    for (const template of this.ruleTemplates.VALIDATION) {
      rules.push({
        id: uuidv4(),
        type: 'VALIDATION',
        condition: template,
        action: 'VALIDATE',
        confidence: 0.95,
        domain,
      });
    }

    // Generate domain-specific rules based on concepts
    const conceptTypes = new Set(extractionResult.concepts.map((c) => c.domain));
    if (conceptTypes.size > 1) {
      rules.push({
        id: uuidv4(),
        type: 'VALIDATION',
        condition: 'Concepts from different domains should be explicitly linked',
        action: 'WARN',
        confidence: 0.7,
        domain,
      });
    }

    return rules;
  }

  private validateOntology(
    extractionResult: ConceptExtractionResult,
    hierarchy: ConceptHierarchy,
    rules: OntologyRule[]
  ): { warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for circular relationships
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCircular = (conceptId: string): boolean => {
      if (recursionStack.has(conceptId)) {
        errors.push(`Circular IS_A relationship detected involving concept: ${conceptId}`);
        return true;
      }

      if (visited.has(conceptId)) return false;

      visited.add(conceptId);
      recursionStack.add(conceptId);

      const children = hierarchy.hierarchy.get(conceptId) || [];
      for (const child of children) {
        if (detectCircular(child.id)) {
          return true;
        }
      }

      recursionStack.delete(conceptId);
      return false;
    };

    for (const root of hierarchy.rootConcepts) {
      detectCircular(root.id);
    }

    // Check concept quality
    for (const concept of extractionResult.concepts) {
      if (!concept.definition || concept.definition.trim().length < 10) {
        warnings.push(`Concept "${concept.name}" has insufficient definition`);
      }

      if (concept.confidence < 0.5) {
        warnings.push(`Concept "${concept.name}" has low confidence: ${concept.confidence}`);
      }
    }

    // Check relationship quality
    for (const rel of extractionResult.relationships) {
      if (rel.confidence < 0.3) {
        warnings.push(
          `Relationship ${rel.sourceConceptId} -> ${rel.targetConceptId} has low confidence: ${rel.confidence}`
        );
      }
    }

    // Check hierarchy balance
    if (hierarchy.maxDepth > 10) {
      warnings.push(
        `Concept hierarchy is very deep (${hierarchy.maxDepth} levels). Consider restructuring.`
      );
    }

    return { warnings, errors };
  }

  private async saveOntologyToKnowledgeGraph(ontology: DomainOntology): Promise<void> {
    try {
      // Create knowledge ingest requests for each concept
      const conceptItems: KnowledgeIngestRequest[] = ontology.concepts.map((concept) => ({
        content: `${concept.name}: ${concept.definition}`,
        type: KnowledgeType.CONCEPTUAL,
        source: {
          type: SourceType.AGENT_CONCEPT,
          identifier: `ontology_${ontology.domain}`,
          url: undefined as string | undefined,
          metadata: {
            domain: ontology.domain,
            ontologyId: ontology.id,
            conceptType: 'definition',
            properties: concept.properties,
            instances: concept.instances,
          },
        },
        tags: [...concept.synonyms, concept.domain, 'ontology', 'concept'],
        confidence: concept.confidence,
        accessLevel: 'public',
      }));

      // Save concepts to knowledge graph
      for (const item of conceptItems) {
        const createdItem = await this.knowledgeRepository.create(item);

        // Sync to Neo4j and Qdrant
        await this.knowledgeSync.syncKnowledgeItem(createdItem);
      }

      // Create relationship items
      const relationshipItems: KnowledgeIngestRequest[] = ontology.relationships.map((rel) => ({
        content: `${rel.sourceConceptId} ${rel.relationshipType} ${rel.targetConceptId}`,
        type: KnowledgeType.SEMANTIC,
        source: {
          type: SourceType.AGENT_CONCEPT,
          identifier: `ontology_${ontology.domain}_relationships`,
          url: undefined as string | undefined,
          metadata: {
            domain: ontology.domain,
            ontologyId: ontology.id,
            relationshipType: rel.relationshipType,
            sourceConceptId: rel.sourceConceptId,
            targetConceptId: rel.targetConceptId,
            evidence: rel.evidence,
          },
        },
        tags: [ontology.domain, 'ontology', 'relationship', rel.relationshipType.toLowerCase()],
        confidence: rel.confidence,
        accessLevel: 'public',
      }));

      // Save relationships to knowledge graph
      for (const item of relationshipItems) {
        const createdItem = await this.knowledgeRepository.create(item);
        await this.knowledgeSync.syncKnowledgeItem(createdItem);
      }

      // Create ontology metadata item
      const ontologyMetadataItem: KnowledgeIngestRequest = {
        content: `Domain ontology for ${ontology.domain} with ${ontology.metadata.totalConcepts} concepts`,
        type: KnowledgeType.SEMANTIC,
        source: {
          type: SourceType.AGENT_CONCEPT,
          identifier: `ontology_${ontology.domain}_metadata`,
          url: undefined as string | undefined,
          metadata: {
            domain: ontology.domain,
            ontologyId: ontology.id,
            ontologyVersion: ontology.version,
            ...ontology.metadata,
          },
        },
        tags: [ontology.domain, 'ontology', 'metadata'],
        confidence: 0.95,
        accessLevel: 'public',
      };

      const createdMetadataItem = await this.knowledgeRepository.create(ontologyMetadataItem);
      await this.knowledgeSync.syncKnowledgeItem(createdMetadataItem);

      logger.info(
        `Ontology for domain ${ontology.domain} saved to knowledge graph with ${conceptItems.length} concepts and ${relationshipItems.length} relationships`
      );
    } catch (error) {
      logger.error('Error saving ontology to knowledge graph:', error);
      throw new Error(
        `Failed to save ontology: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getOntologyForDomain(domain: string): Promise<DomainOntology | null> {
    try {
      // Find ontology metadata in knowledge graph
      const ontologyItems = await this.knowledgeRepository.findByTags([
        domain,
        'ontology',
        'metadata',
      ]);

      if (ontologyItems.length === 0) {
        return null;
      }

      const metadataItem = ontologyItems[0];
      const ontologyId =
        typeof metadataItem.metadata.ontologyId === 'string'
          ? metadataItem.metadata.ontologyId
          : metadataItem.id;
      const ontologyVersion =
        typeof metadataItem.metadata.ontologyVersion === 'string'
          ? metadataItem.metadata.ontologyVersion
          : '1.0.0';

      // Reconstruct ontology from knowledge graph
      const conceptItems = await this.knowledgeRepository.findByTags([
        domain,
        'ontology',
        'concept',
      ]);

      const relationshipItems = await this.knowledgeRepository.findByTags([
        domain,
        'ontology',
        'relationship',
      ]);

      const concepts: ConceptNode[] = conceptItems.map((item) => {
        const conceptDomain =
          typeof item.metadata.domain === 'string' && item.metadata.domain
            ? item.metadata.domain
            : domain;
        const properties = Array.isArray(item.metadata.properties)
          ? (item.metadata.properties as ConceptProperty[])
          : [];
        const instances = Array.isArray(item.metadata.instances)
          ? (item.metadata.instances as string[])
          : [];

        return {
          id: item.id,
          name: item.content.split(':')[0].trim(),
          definition: item.content.split(':').slice(1).join(':').trim(),
          domain: conceptDomain,
          confidence: item.confidence,
          properties,
          instances,
          synonyms: item.tags.filter(
            (tag) => tag !== domain && tag !== 'ontology' && tag !== 'concept'
          ),
          relatedConcepts: [] as string[],
        };
      });

      const relationships: ConceptRelationship[] = relationshipItems
        .map((item) => {
          const sourceConceptId =
            typeof item.metadata.sourceConceptId === 'string'
              ? item.metadata.sourceConceptId
              : null;
          const targetConceptId =
            typeof item.metadata.targetConceptId === 'string'
              ? item.metadata.targetConceptId
              : null;
          const relationshipType =
            typeof item.metadata.relationshipType === 'string'
              ? (item.metadata.relationshipType as ConceptRelationship['relationshipType'])
              : null;

          if (!sourceConceptId || !targetConceptId || !relationshipType) {
            return null;
          }

          const evidence =
            Array.isArray(item.metadata.evidence) &&
            item.metadata.evidence.every((entry: unknown) => typeof entry === 'string')
              ? (item.metadata.evidence as string[])
              : [];

        return {
            sourceConceptId,
            targetConceptId,
            relationshipType,
            confidence: item.confidence,
            evidence,
          };
        })
        .filter((rel): rel is ConceptRelationship => rel !== null);

      const hierarchy = this.buildConceptHierarchy(concepts, relationships);
      const rules = this.generateOntologyRules(
        {
          concepts,
          relationships,
          extractionMetrics: {
            totalConcepts: concepts.length,
            avgConfidence: concepts.reduce((sum, c) => sum + c.confidence, 0) / concepts.length,
            processingTime: 0,
            sourceItems: 0,
          },
        },
        domain
      );

      const totalConcepts = concepts.length;
      const totalRelationships = relationships.length;
      const avgConfidence =
        totalConcepts > 0 ? concepts.reduce((sum, c) => sum + c.confidence, 0) / totalConcepts : 0;
      const buildTime =
        typeof metadataItem.metadata.buildTime === 'number' ? metadataItem.metadata.buildTime : 0;
      const sourceKnowledgeItems =
        typeof metadataItem.metadata.sourceKnowledgeItems === 'number'
          ? metadataItem.metadata.sourceKnowledgeItems
          : 0;

      const ontology: DomainOntology = {
        id: ontologyId,
        domain,
        version: ontologyVersion,
        concepts,
        relationships,
        hierarchy,
        rules,
        metadata: {
          totalConcepts,
          totalRelationships,
          avgConfidence,
          buildTime,
          lastUpdated: metadataItem.updatedAt,
          sourceKnowledgeItems,
        },
      };

      return ontology;
    } catch (error) {
      logger.error(`Error retrieving ontology for domain ${domain}:`, error);
      return null;
    }
  }
}
