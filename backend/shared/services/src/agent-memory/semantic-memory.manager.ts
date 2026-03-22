import { SemanticMemory, KnowledgeType, SourceType } from '@uaip/types';
import { logger } from '@uaip/utils';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';

export class SemanticMemoryManager {
  constructor(private readonly knowledgeGraph: KnowledgeGraphService) {}

  async storeConcept(agentId: string, concept: SemanticMemory): Promise<void>;
  async storeConcept(agentId: string, concept: string, definition: string): Promise<void>;
  async storeConcept(
    agentId: string,
    conceptOrMemory: SemanticMemory | string,
    definition?: string
  ): Promise<void> {
    try {
      const concept =
        typeof conceptOrMemory === 'string'
          ? this.createSemanticMemory(agentId, conceptOrMemory, definition || '')
          : conceptOrMemory;

      await this.knowledgeGraph.ingest([
        {
          content: `Concept: ${concept.concept}
Definition: ${concept.knowledge.definition}
Properties: ${JSON.stringify(concept.knowledge.properties)}
Examples: ${concept.knowledge.examples.join(', ')}
Counter-examples: ${concept.knowledge.counterExamples.join(', ')}
Relationships: ${concept.knowledge.relationships.map((r) => `${r.relatedConcept} (${r.relationshipType})`).join(', ')}
Confidence: ${concept.confidence}
Usage: Accessed ${concept.usage.timesAccessed} times, Success rate: ${concept.usage.successRate}`,
          type: KnowledgeType.SEMANTIC,
          tags: [
            'agent-memory',
            `agent-${agentId}`,
            'concept',
            this.toConceptTag(concept.concept),
            `confidence-${Math.round(concept.confidence * 10)}`,
          ],
          source: {
            type: SourceType.AGENT_CONCEPT,
            identifier: `${agentId}-concept-${this.toConceptTag(concept.concept)}`,
            metadata: {
              agentId,
              concept: concept.concept,
              confidence: concept.confidence,
              usage: concept.usage,
              knowledge: concept.knowledge,
              sources: concept.sources,
              collectionType: 'semantic',
            },
          },
          confidence: concept.confidence,
        },
      ]);
    } catch (error) {
      console.error('Concept storage error:', error);
      throw new Error(`Failed to store concept: ${error.message}`, { cause: error });
    }
  }

  async storeConceptDefinition(
    agentId: string,
    concept: string,
    definition: string
  ): Promise<void> {
    await this.storeConcept(agentId, concept, definition);
  }

  async pruneMemory(agentId: string, conceptId: string): Promise<void> {
    try {
      const conceptItem = await this.findConceptKnowledgeItem(agentId, conceptId);
      if (!conceptItem) {
        logger.warn('Concept not found for pruning', { agentId, conceptId });
        return;
      }

      await this.knowledgeGraph.deleteKnowledge(conceptItem.id);
      logger.info('Semantic concept pruned', { agentId, conceptId, itemId: conceptItem.id });
    } catch (error) {
      logger.error('Failed to prune semantic memory', {
        agentId,
        conceptId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async downvoteMemory(agentId: string, conceptId: string): Promise<void> {
    try {
      const conceptItem = await this.findConceptKnowledgeItem(agentId, conceptId);
      if (!conceptItem) {
        logger.warn('Concept not found for downvote', { agentId, conceptId });
        return;
      }

      const currentConfidence = Number(conceptItem.confidence || 0.5);
      const updatedConfidence = Math.max(currentConfidence - 0.1, 0);

      await this.knowledgeGraph.updateKnowledge(conceptItem.id, {
        confidence: updatedConfidence,
      });

      logger.info('Semantic concept downvoted', {
        agentId,
        conceptId,
        itemId: conceptItem.id,
        previousConfidence: currentConfidence,
        updatedConfidence,
      });
    } catch (error) {
      logger.error('Failed to downvote semantic memory', {
        agentId,
        conceptId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getConcept(agentId: string, conceptName: string): Promise<SemanticMemory | null> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `concept ${conceptName}`,
        filters: {
          tags: [`agent-${agentId}`, 'concept'],
          types: [KnowledgeType.SEMANTIC],
        },
        options: { limit: 1 },
        timestamp: Date.now(),
      });

      if (results.items.length > 0) {
        return this.itemToSemanticMemory(results.items[0]);
      }
      return null;
    } catch (error) {
      console.error('Concept retrieval error:', error);
      return null;
    }
  }

  async updateConceptUsage(agentId: string, conceptName: string, success: boolean): Promise<void> {
    try {
      const concept = await this.getConcept(agentId, conceptName);
      if (concept) {
        concept.usage.timesAccessed++;
        concept.usage.lastUsed = new Date();

        // Update success rate
        const totalUses = concept.usage.timesAccessed;
        const currentSuccessCount = concept.usage.successRate * (totalUses - 1);
        const newSuccessCount = currentSuccessCount + (success ? 1 : 0);
        concept.usage.successRate = newSuccessCount / totalUses;

        await this.storeConcept(agentId, concept);
      }
    } catch (error) {
      console.error('Concept usage update error:', error);
    }
  }

  async getRelatedConcepts(agentId: string, conceptName: string): Promise<SemanticMemory[]> {
    try {
      if (!conceptName) {
        // Return all concepts for this agent
        const results = await this.knowledgeGraph.search({
          query: `agent concepts`,
          filters: {
            tags: [`agent-${agentId}`, 'concept'],
            types: [KnowledgeType.SEMANTIC],
          },
          options: { limit: 50 },
          timestamp: Date.now(),
        });
        return results.items.map((item) => this.itemToSemanticMemory(item));
      }

      const results = await this.knowledgeGraph.search({
        query: `related to ${conceptName}`,
        filters: {
          tags: [`agent-${agentId}`, 'concept'],
          types: [KnowledgeType.SEMANTIC],
        },
        options: { limit: 10, similarityThreshold: 0.6 },
        timestamp: Date.now(),
      });

      return results.items.map((item) => this.itemToSemanticMemory(item));
    } catch (error) {
      console.error('Related concepts retrieval error:', error);
      return [];
    }
  }

  async getConceptsByUsage(
    agentId: string,
    minUsage: number = 1,
    limit: number = 10
  ): Promise<SemanticMemory[]> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `frequently used concepts`,
        filters: {
          tags: [`agent-${agentId}`, 'concept'],
          types: [KnowledgeType.SEMANTIC],
        },
        options: { limit },
        timestamp: Date.now(),
      });

      const concepts = results.items.map((item) => this.itemToSemanticMemory(item));
      return concepts.filter((concept) => concept.usage.timesAccessed >= minUsage);
    } catch (error) {
      console.error('Concepts by usage retrieval error:', error);
      return [];
    }
  }

  async getConceptsByConfidence(
    agentId: string,
    minConfidence: number = 0.7,
    limit: number = 10
  ): Promise<SemanticMemory[]> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `high confidence concepts`,
        filters: {
          tags: [`agent-${agentId}`, 'concept'],
          types: [KnowledgeType.SEMANTIC],
          confidence: minConfidence,
        },
        options: { limit },
        timestamp: Date.now(),
      });

      return results.items.map((item) => this.itemToSemanticMemory(item));
    } catch (error) {
      console.error('Concepts by confidence retrieval error:', error);
      return [];
    }
  }

  async searchConcepts(
    agentId: string,
    query: string,
    limit: number = 10
  ): Promise<SemanticMemory[]> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `concept search: ${query}`,
        filters: {
          tags: [`agent-${agentId}`, 'concept'],
          types: [KnowledgeType.SEMANTIC],
        },
        options: { limit, similarityThreshold: 0.5 },
        timestamp: Date.now(),
      });

      return results.items.map((item) => this.itemToSemanticMemory(item));
    } catch (error) {
      console.error('Concept search error:', error);
      return [];
    }
  }

  async addConceptRelationship(
    agentId: string,
    conceptName: string,
    relatedConcept: string,
    relationshipType: string,
    strength: number
  ): Promise<void> {
    try {
      const concept = await this.getConcept(agentId, conceptName);
      if (concept) {
        // Add or update relationship
        const existingRelIndex = concept.knowledge.relationships.findIndex(
          (r) => r.relatedConcept === relatedConcept
        );

        if (existingRelIndex >= 0) {
          concept.knowledge.relationships[existingRelIndex] = {
            relatedConcept,
            relationshipType,
            strength,
          };
        } else {
          concept.knowledge.relationships.push({
            relatedConcept,
            relationshipType,
            strength,
          });
        }

        await this.storeConcept(agentId, concept);
      }
    } catch (error) {
      console.error('Concept relationship addition error:', error);
    }
  }

  async reinforceConcept(agentId: string, conceptName: string, newExample?: string): Promise<void> {
    try {
      const concept = await this.getConcept(agentId, conceptName);
      if (concept) {
        concept.sources.reinforcements++;

        if (newExample) {
          concept.knowledge.examples.push(newExample);
          // Keep only the most recent examples
          if (concept.knowledge.examples.length > 10) {
            concept.knowledge.examples = concept.knowledge.examples.slice(-10);
          }
        }

        // Increase confidence slightly with reinforcement
        concept.confidence = Math.min(concept.confidence + 0.05, 1.0);

        await this.storeConcept(agentId, concept);
      }
    } catch (error) {
      console.error('Concept reinforcement error:', error);
    }
  }

  private itemToSemanticMemory(item: unknown): SemanticMemory {
    const record = item as Record<string, unknown>;
    const source = record.source as Record<string, unknown> | undefined;
    const metadata = (source?.metadata || record.metadata) as Record<string, unknown> | undefined;

    if (!metadata) {
      // Fallback parsing from content
      return this.parseSemanticMemoryFromContent(item);
    }

    return {
      agentId: metadata.agentId as string,
      concept: metadata.concept as string,
      knowledge: (metadata.knowledge as SemanticMemory['knowledge']) || {
        definition: '',
        properties: {},
        relationships: [],
        examples: [],
        counterExamples: [],
      },
      confidence: (metadata.confidence as number) || (record.confidence as number) || 0.5,
      sources: (metadata.sources as SemanticMemory['sources']) || {
        episodeIds: [],
        externalSources: [],
        reinforcements: 0,
      },
      usage: (metadata.usage as SemanticMemory['usage']) || {
        timesAccessed: 0,
        lastUsed: new Date(),
        successRate: 1.0,
        contexts: [],
      },
    };
  }

  private parseSemanticMemoryFromContent(item: unknown): SemanticMemory {
    const record = item as Record<string, unknown>;
    const content = (record.content as string) || '';
    const lines = content.split('\n');

    let concept = 'unknown';
    let definition = '';
    let properties = {};
    let examples: string[] = [];

    // Try to extract information from content
    for (const line of lines) {
      if (line.startsWith('Concept:')) {
        concept = line.replace('Concept:', '').trim();
      } else if (line.startsWith('Definition:')) {
        definition = line.replace('Definition:', '').trim();
      } else if (line.startsWith('Examples:')) {
        examples = line
          .replace('Examples:', '')
          .split(',')
          .map((e: string) => e.trim());
      } else if (line.startsWith('Properties:')) {
        try {
          properties = JSON.parse(line.replace('Properties:', '').trim());
        } catch {
          properties = {};
        }
      }
    }

    return {
      agentId: (record.createdBy as string) || 'unknown',
      concept,
      knowledge: {
        definition,
        properties,
        relationships: [],
        examples,
        counterExamples: [],
      },
      confidence: (record.confidence as number) || 0.5,
      sources: {
        episodeIds: [],
        externalSources: [],
        reinforcements: 0,
      },
      usage: {
        timesAccessed: 0,
        lastUsed: new Date(),
        successRate: 1.0,
        contexts: [],
      },
    };
  }

  private createSemanticMemory(
    agentId: string,
    conceptName: string,
    definition: string
  ): SemanticMemory {
    return {
      agentId,
      concept: conceptName,
      knowledge: {
        definition,
        properties: {},
        relationships: [],
        examples: [],
        counterExamples: [],
      },
      confidence: 0.7,
      sources: {
        episodeIds: [],
        externalSources: ['consolidation'],
        reinforcements: 1,
      },
      usage: {
        timesAccessed: 1,
        lastUsed: new Date(),
        successRate: 1.0,
        contexts: ['consolidation'],
      },
    };
  }

  private toConceptTag(concept: string): string {
    return concept
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
  }

  private async findConceptKnowledgeItem(
    agentId: string,
    conceptId: string
  ): Promise<unknown | null> {
    const results = await this.knowledgeGraph.search({
      query: `concept ${conceptId}`,
      filters: {
        tags: [`agent-${agentId}`, 'concept'],
        types: [KnowledgeType.SEMANTIC],
      },
      options: { limit: 25, similarityThreshold: 0.2 },
      timestamp: Date.now(),
    });

    const normalizedConceptId = conceptId.toLowerCase();
    return (
      results.items.find((item) =>
        this.matchesConceptIdentifier(item, conceptId, normalizedConceptId)
      ) || null
    );
  }

  private matchesConceptIdentifier(
    item: unknown,
    conceptId: string,
    normalizedConceptId: string
  ): boolean {
    const record = item as Record<string, unknown>;
    const source = record.source as Record<string, unknown> | undefined;
    const metadata = ((source?.metadata || record.metadata) as Record<string, unknown>) || {};
    const metadataConcept = String(metadata.concept || '').toLowerCase();
    const sourceIdentifier = String(source?.identifier || '').toLowerCase();

    return (
      record.id === conceptId ||
      sourceIdentifier === normalizedConceptId ||
      sourceIdentifier.endsWith(`-concept-${normalizedConceptId}`) ||
      metadataConcept === normalizedConceptId ||
      this.toConceptTag(metadataConcept) === normalizedConceptId
    );
  }
}
