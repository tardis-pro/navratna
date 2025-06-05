import { SemanticMemory, KnowledgeType, SourceType } from '@uaip/types';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service.js';

export class SemanticMemoryManager {
  constructor(private readonly knowledgeGraph: KnowledgeGraphService) {}

  async storeConcept(agentId: string, concept: SemanticMemory): Promise<void> {
    try {
      await this.knowledgeGraph.ingest([{
        content: `Concept: ${concept.concept}
Definition: ${concept.knowledge.definition}
Properties: ${JSON.stringify(concept.knowledge.properties)}
Examples: ${concept.knowledge.examples.join(', ')}
Counter-examples: ${concept.knowledge.counterExamples.join(', ')}
Relationships: ${concept.knowledge.relationships.map(r => `${r.relatedConcept} (${r.relationshipType})`).join(', ')}
Confidence: ${concept.confidence}
Usage: Accessed ${concept.usage.timesAccessed} times, Success rate: ${concept.usage.successRate}`,
        type: KnowledgeType.SEMANTIC,
        tags: [
          'agent-memory',
          `agent-${agentId}`,
          'concept',
          concept.concept.toLowerCase().replace(/\s+/g, '-'),
          `confidence-${Math.round(concept.confidence * 10)}`
        ],
        source: {
          type: SourceType.AGENT_CONCEPT,
          identifier: `${agentId}-concept-${concept.concept}`,
          metadata: {
            agentId,
            concept: concept.concept,
            confidence: concept.confidence,
            usage: concept.usage,
            knowledge: concept.knowledge,
            sources: concept.sources
          }
        },
        confidence: concept.confidence
      }]);
    } catch (error) {
      console.error('Concept storage error:', error);
      throw new Error(`Failed to store concept: ${error.message}`);
    }
  }

  async getConcept(agentId: string, conceptName: string): Promise<SemanticMemory | null> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `concept ${conceptName}`,
        filters: {
          tags: [`agent-${agentId}`, 'concept'],
          types: [KnowledgeType.SEMANTIC]
        },
        options: { limit: 1 },
        timestamp: Date.now()
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
            types: [KnowledgeType.SEMANTIC]
          },
          options: { limit: 50 },
          timestamp: Date.now()
        });
        return results.items.map(item => this.itemToSemanticMemory(item));
      }

      const results = await this.knowledgeGraph.search({
        query: `related to ${conceptName}`,
        filters: {
          tags: [`agent-${agentId}`, 'concept'],
          types: [KnowledgeType.SEMANTIC]
        },
        options: { limit: 10, similarityThreshold: 0.6 },
        timestamp: Date.now()
      });

      return results.items.map(item => this.itemToSemanticMemory(item));
    } catch (error) {
      console.error('Related concepts retrieval error:', error);
      return [];
    }
  }

  async getConceptsByUsage(agentId: string, minUsage: number = 1, limit: number = 10): Promise<SemanticMemory[]> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `frequently used concepts`,
        filters: {
          tags: [`agent-${agentId}`, 'concept'],
          types: [KnowledgeType.SEMANTIC]
        },
        options: { limit },
        timestamp: Date.now()
      });

      const concepts = results.items.map(item => this.itemToSemanticMemory(item));
      return concepts.filter(concept => concept.usage.timesAccessed >= minUsage);
    } catch (error) {
      console.error('Concepts by usage retrieval error:', error);
      return [];
    }
  }

  async getConceptsByConfidence(agentId: string, minConfidence: number = 0.7, limit: number = 10): Promise<SemanticMemory[]> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `high confidence concepts`,
        filters: {
          tags: [`agent-${agentId}`, 'concept'],
          types: [KnowledgeType.SEMANTIC],
          confidence: minConfidence
        },
        options: { limit },
        timestamp: Date.now()
      });

      return results.items.map(item => this.itemToSemanticMemory(item));
    } catch (error) {
      console.error('Concepts by confidence retrieval error:', error);
      return [];
    }
  }

  async searchConcepts(agentId: string, query: string, limit: number = 10): Promise<SemanticMemory[]> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `concept search: ${query}`,
        filters: {
          tags: [`agent-${agentId}`, 'concept'],
          types: [KnowledgeType.SEMANTIC]
        },
        options: { limit, similarityThreshold: 0.5 },
        timestamp: Date.now()
      });

      return results.items.map(item => this.itemToSemanticMemory(item));
    } catch (error) {
      console.error('Concept search error:', error);
      return [];
    }
  }

  async addConceptRelationship(agentId: string, conceptName: string, relatedConcept: string, relationshipType: string, strength: number): Promise<void> {
    try {
      const concept = await this.getConcept(agentId, conceptName);
      if (concept) {
        // Add or update relationship
        const existingRelIndex = concept.knowledge.relationships.findIndex(r => r.relatedConcept === relatedConcept);
        
        if (existingRelIndex >= 0) {
          concept.knowledge.relationships[existingRelIndex] = {
            relatedConcept,
            relationshipType,
            strength
          };
        } else {
          concept.knowledge.relationships.push({
            relatedConcept,
            relationshipType,
            strength
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

  private itemToSemanticMemory(item: any): SemanticMemory {
    const metadata = item.source?.metadata || item.metadata;
    
    if (!metadata) {
      // Fallback parsing from content
      return this.parseSemanticMemoryFromContent(item);
    }

    return {
      agentId: metadata.agentId,
      concept: metadata.concept,
      knowledge: metadata.knowledge || {
        definition: '',
        properties: {},
        relationships: [],
        examples: [],
        counterExamples: []
      },
      confidence: metadata.confidence || item.confidence || 0.5,
      sources: metadata.sources || {
        episodeIds: [],
        externalSources: [],
        reinforcements: 0
      },
      usage: metadata.usage || {
        timesAccessed: 0,
        lastUsed: new Date(),
        successRate: 1.0,
        contexts: []
      }
    };
  }

  private parseSemanticMemoryFromContent(item: any): SemanticMemory {
    const content = item.content || '';
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
        examples = line.replace('Examples:', '').split(',').map(e => e.trim());
      } else if (line.startsWith('Properties:')) {
        try {
          properties = JSON.parse(line.replace('Properties:', '').trim());
        } catch {
          properties = {};
        }
      }
    }

    return {
      agentId: item.createdBy || 'unknown',
      concept,
      knowledge: {
        definition,
        properties,
        relationships: [],
        examples,
        counterExamples: []
      },
      confidence: item.confidence || 0.5,
      sources: {
        episodeIds: [],
        externalSources: [],
        reinforcements: 0
      },
      usage: {
        timesAccessed: 0,
        lastUsed: new Date(),
        successRate: 1.0,
        contexts: []
      }
    };
  }
} 