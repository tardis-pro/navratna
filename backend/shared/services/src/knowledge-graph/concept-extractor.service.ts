import { logger } from '@uaip/utils';
import { KnowledgeItem, KnowledgeType, SourceType } from '@uaip/types';
import { ContentClassifier } from './content-classifier.service.js';
import { EmbeddingService } from './embedding.service.js';

export interface ConceptNode {
  id: string;
  name: string;
  definition: string;
  domain: string;
  confidence: number;
  properties: ConceptProperty[];
  instances: string[];
  synonyms: string[];
  relatedConcepts: string[];
}

export interface ConceptProperty {
  name: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  confidence: number;
}

export interface ConceptRelationship {
  sourceConceptId: string;
  targetConceptId: string;
  relationshipType: 'IS_A' | 'PART_OF' | 'RELATED_TO' | 'INSTANCE_OF' | 'CAUSES' | 'USED_FOR';
  confidence: number;
  evidence: string[];
}

export interface ConceptExtractionResult {
  concepts: ConceptNode[];
  relationships: ConceptRelationship[];
  extractionMetrics: {
    totalConcepts: number;
    avgConfidence: number;
    processingTime: number;
    sourceItems: number;
  };
}

export class ConceptExtractorService {
  private readonly conceptPatterns = {
    // Concept identification patterns
    definitions: [
      /(.+?)\s+(?:is|are|means?|refers?\s+to|defined\s+as)\s+(.+)/gi,
      /(.+?)\s*[:：]\s*(.+)/gi,
      /define\s+(.+?)\s+as\s+(.+)/gi,
      /(.+?)\s+can\s+be\s+described\s+as\s+(.+)/gi,
    ],

    // Property extraction patterns
    properties: [
      /(.+?)\s+(?:has|have|contains?|includes?)\s+(.+)/gi,
      /(.+?)\s+(?:with|featuring)\s+(.+)/gi,
      /(.+?)\s*[:：]\s*(.+?)(?:,|;|\.|\n)/gi,
    ],

    // Relationship patterns
    relationships: {
      IS_A: [/(.+?)\s+(?:is\s+a|are|is\s+an?)\s+(.+)/gi],
      PART_OF: [/(.+?)\s+(?:is\s+part\s+of|belongs\s+to|is\s+in)\s+(.+)/gi],
      CAUSES: [/(.+?)\s+(?:causes?|leads?\s+to|results?\s+in)\s+(.+)/gi],
      USED_FOR: [/(.+?)\s+(?:is\s+used\s+for|used\s+to|helps?\s+with)\s+(.+)/gi],
    },
  };

  private readonly stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'it',
    'this',
    'that',
    'these',
    'those',
  ]);

  constructor(
    private readonly contentClassifier: ContentClassifier,
    private readonly embeddingService: EmbeddingService
  ) {}

  async extractConcepts(
    knowledgeItems: KnowledgeItem[],
    domain?: string
  ): Promise<ConceptExtractionResult> {
    const startTime = Date.now();

    try {
      // Filter items by domain and semantic/conceptual types
      const relevantItems = knowledgeItems.filter(
        (item) =>
          (item.type === KnowledgeType.SEMANTIC || item.type === KnowledgeType.CONCEPTUAL) &&
          (!domain || item.tags.includes(domain) || item.metadata.domain === domain)
      );

      logger.info(
        `Extracting concepts from ${relevantItems.length} knowledge items${domain ? ` in domain: ${domain}` : ''}`
      );

      const concepts = new Map<string, ConceptNode>();
      const relationships: ConceptRelationship[] = [];

      // Process each knowledge item
      for (const item of relevantItems) {
        await this.processKnowledgeItem(item, concepts, relationships);
      }

      // Post-process concepts to find additional relationships
      await this.detectImplicitRelationships(Array.from(concepts.values()), relationships);

      // Calculate metrics
      const conceptArray = Array.from(concepts.values());
      const avgConfidence =
        conceptArray.reduce((sum, c) => sum + c.confidence, 0) / conceptArray.length;
      const processingTime = Date.now() - startTime;

      const result: ConceptExtractionResult = {
        concepts: conceptArray,
        relationships,
        extractionMetrics: {
          totalConcepts: conceptArray.length,
          avgConfidence: avgConfidence || 0,
          processingTime,
          sourceItems: relevantItems.length,
        },
      };

      logger.info(
        `Concept extraction completed: ${result.extractionMetrics.totalConcepts} concepts, ${relationships.length} relationships in ${processingTime}ms`
      );
      return result;
    } catch (error) {
      logger.error('Error extracting concepts:', error);
      throw new Error(
        `Concept extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async processKnowledgeItem(
    item: KnowledgeItem,
    concepts: Map<string, ConceptNode>,
    relationships: ConceptRelationship[]
  ): Promise<void> {
    const content = item.content;

    // Extract explicit definitions
    await this.extractDefinitions(content, concepts, item);

    // Extract properties for existing concepts
    await this.extractProperties(content, concepts, item);

    // Extract relationships
    await this.extractRelationships(content, concepts, relationships, item);

    // Extract instances/examples
    await this.extractInstances(content, concepts, item);
  }

  private async extractDefinitions(
    content: string,
    concepts: Map<string, ConceptNode>,
    sourceItem: KnowledgeItem
  ): Promise<void> {
    for (const pattern of this.conceptPatterns.definitions) {
      let match;
      pattern.lastIndex = 0; // Reset regex

      while ((match = pattern.exec(content)) !== null) {
        const [, conceptName, definition] = match;

        if (conceptName && definition) {
          const cleanName = this.cleanConceptName(conceptName);
          const cleanDefinition = definition.trim();

          if (cleanName && cleanDefinition && !this.isStopWord(cleanName)) {
            const conceptId = this.generateConceptId(cleanName);

            const existing = concepts.get(conceptId);
            if (existing) {
              // Merge definitions
              existing.definition = this.mergeDefinitions(existing.definition, cleanDefinition);
              existing.confidence = Math.max(existing.confidence, 0.8);
            } else {
              concepts.set(conceptId, {
                id: conceptId,
                name: cleanName,
                definition: cleanDefinition,
                domain: (sourceItem.metadata.domain as string) || this.inferDomain(sourceItem.tags),
                confidence: 0.8,
                properties: [],
                instances: [],
                synonyms: [],
                relatedConcepts: [],
              });
            }
          }
        }
      }
    }
  }

  private async extractProperties(
    content: string,
    concepts: Map<string, ConceptNode>,
    sourceItem: KnowledgeItem
  ): Promise<void> {
    for (const pattern of this.conceptPatterns.properties) {
      let match;
      pattern.lastIndex = 0;

      while ((match = pattern.exec(content)) !== null) {
        const [, subject, property] = match;

        if (subject && property) {
          const cleanSubject = this.cleanConceptName(subject);
          const conceptId = this.generateConceptId(cleanSubject);

          const concept = concepts.get(conceptId);
          if (concept) {
            const propertyValue = property.trim();

            // Determine property type
            const propType = this.inferPropertyType(propertyValue);

            concept.properties.push({
              name: 'attribute',
              value: propertyValue,
              type: propType,
              confidence: 0.7,
            });
          }
        }
      }
    }
  }

  private async extractRelationships(
    content: string,
    concepts: Map<string, ConceptNode>,
    relationships: ConceptRelationship[],
    sourceItem: KnowledgeItem
  ): Promise<void> {
    for (const [relType, patterns] of Object.entries(this.conceptPatterns.relationships)) {
      for (const pattern of patterns) {
        let match;
        pattern.lastIndex = 0;

        while ((match = pattern.exec(content)) !== null) {
          const [fullMatch, source, target] = match;

          if (source && target) {
            const sourceId = this.generateConceptId(this.cleanConceptName(source));
            const targetId = this.generateConceptId(this.cleanConceptName(target));

            if (sourceId !== targetId) {
              relationships.push({
                sourceConceptId: sourceId,
                targetConceptId: targetId,
                relationshipType: relType as any,
                confidence: 0.75,
                evidence: [fullMatch.trim()],
              });
            }
          }
        }
      }
    }
  }

  private async extractInstances(
    content: string,
    concepts: Map<string, ConceptNode>,
    sourceItem: KnowledgeItem
  ): Promise<void> {
    // Look for example patterns
    const examplePatterns = [
      /(?:examples?|instances?|such as|including|like)\s+(.+)/gi,
      /for\s+example[,:]?\s+(.+)/gi,
      /e\.g\.[\s,]*(.+)/gi,
    ];

    for (const pattern of examplePatterns) {
      let match;
      pattern.lastIndex = 0;

      while ((match = pattern.exec(content)) !== null) {
        const examples = match[1].split(/[,;]/).map((e) => e.trim());

        // Try to match examples to concepts
        for (const [conceptId, concept] of concepts) {
          for (const example of examples) {
            if (example && !concept.instances.includes(example)) {
              concept.instances.push(example);
            }
          }
        }
      }
    }
  }

  private async detectImplicitRelationships(
    concepts: ConceptNode[],
    relationships: ConceptRelationship[]
  ): Promise<void> {
    // Use embeddings to find semantically similar concepts
    const embeddings = new Map<string, number[]>();

    for (const concept of concepts) {
      try {
        const embedding = await this.embeddingService.generateEmbedding(
          `${concept.name}: ${concept.definition}`
        );
        embeddings.set(concept.id, embedding);
      } catch (error) {
        logger.warn(`Failed to generate embedding for concept ${concept.name}:`, error);
      }
    }

    // Find similar concepts and create RELATED_TO relationships
    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const concept1 = concepts[i];
        const concept2 = concepts[j];

        const embedding1 = embeddings.get(concept1.id);
        const embedding2 = embeddings.get(concept2.id);

        if (embedding1 && embedding2) {
          try {
            const similarity = await this.embeddingService.calculateSimilarity(
              embedding1,
              embedding2
            );

            if (similarity > 0.7) {
              // Check if relationship already exists
              const existingRel = relationships.find(
                (r) =>
                  (r.sourceConceptId === concept1.id && r.targetConceptId === concept2.id) ||
                  (r.sourceConceptId === concept2.id && r.targetConceptId === concept1.id)
              );

              if (!existingRel) {
                relationships.push({
                  sourceConceptId: concept1.id,
                  targetConceptId: concept2.id,
                  relationshipType: 'RELATED_TO',
                  confidence: similarity,
                  evidence: [`Semantic similarity: ${similarity.toFixed(3)}`],
                });
              }
            }
          } catch (error) {
            logger.warn(
              `Failed to calculate similarity between ${concept1.name} and ${concept2.name}:`,
              error
            );
          }
        }
      }
    }
  }

  private cleanConceptName(name: string): string {
    return name
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private generateConceptId(name: string): string {
    return `concept_${name.replace(/\s+/g, '_').toLowerCase()}`;
  }

  private isStopWord(word: string): boolean {
    return this.stopWords.has(word.toLowerCase());
  }

  private inferDomain(tags: string[]): string {
    // Simple domain inference from tags
    const domainKeywords = {
      programming: ['code', 'software', 'development', 'programming'],
      business: ['business', 'strategy', 'management', 'enterprise'],
      science: ['research', 'analysis', 'study', 'experiment'],
      technology: ['tech', 'system', 'infrastructure', 'platform'],
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (tags.some((tag) => keywords.includes(tag.toLowerCase()))) {
        return domain;
      }
    }

    return 'general';
  }

  private inferPropertyType(value: string): 'string' | 'number' | 'boolean' | 'array' {
    if (value.includes(',') || value.includes(';')) return 'array';
    if (!isNaN(Number(value))) return 'number';
    if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') return 'boolean';
    return 'string';
  }

  private mergeDefinitions(existing: string, newDef: string): string {
    if (existing.includes(newDef) || newDef.includes(existing)) {
      return existing.length > newDef.length ? existing : newDef;
    }
    return `${existing}; ${newDef}`;
  }
}
