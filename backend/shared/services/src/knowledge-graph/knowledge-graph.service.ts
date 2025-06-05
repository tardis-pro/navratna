import {
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeIngestRequest,
  KnowledgeIngestResponse,
  KnowledgeItem,
  KnowledgeClassification,
  ContextRequest,
  KnowledgeFilters
} from '@uaip/types';
import { QdrantService } from './qdrant.service.js';
import { KnowledgeRepository } from './knowledge.repository.js';
import { EmbeddingService } from './embedding.service.js';
import { ContentClassifier } from './content-classifier.service.js';
import { RelationshipDetector } from './relationship-detector.service.js';

export class KnowledgeGraphService {
  constructor(
    private readonly vectorDb: QdrantService,
    private readonly repository: KnowledgeRepository,
    private readonly embeddings: EmbeddingService,
    private readonly classifier: ContentClassifier,
    private readonly relationshipDetector: RelationshipDetector
  ) {}

  /**
   * Primary search interface - used by all UAIP services
   */
  async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
    const startTime = Date.now();
    const { query, filters, options } = request;
    
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddings.generateEmbedding(query);
      
      // Perform vector similarity search
      const vectorResults = await this.vectorDb.search(queryEmbedding, {
        limit: options?.limit || 20,
        threshold: options?.similarityThreshold || 0.7,
        filters: this.buildVectorFilters(filters)
      });
      
      // Apply metadata filters and hydrate results
      const filteredResults = await this.repository.applyFilters(vectorResults, filters);
      
      // Enhance with relationships if requested
      const enhancedResults = options?.includeRelationships 
        ? await this.enhanceWithRelationships(filteredResults)
        : filteredResults;
      
      return {
        items: enhancedResults,
        totalCount: enhancedResults.length,
        searchMetadata: {
          query,
          processingTime: Date.now() - startTime,
          similarityScores: vectorResults.map(r => r.score),
          filtersApplied: this.getAppliedFilters(filters)
        }
      };
    } catch (error) {
      console.error('Knowledge search error:', error);
      throw new Error(`Knowledge search failed: ${error.message}`);
    }
  }

  /**
   * Ingestion interface - used by data connectors and services
   */
  async ingest(items: KnowledgeIngestRequest[]): Promise<KnowledgeIngestResponse> {
    const results: KnowledgeItem[] = [];
    const errors: string[] = [];
    
    for (const item of items) {
      try {
        // Classify content
        const classification = await this.classifier.classify(item.content);
        
        // Generate embeddings
        const embeddings = await this.embeddings.generateEmbeddings(item.content);
        
        // Store knowledge item
        const knowledgeItem = await this.repository.create({
          ...item,
          tags: [...(item.tags || []), ...classification.tags],
          confidence: item.confidence || classification.confidence,
          type: item.type || classification.type
        });
        
        // Store embeddings in vector database
        await this.vectorDb.store(knowledgeItem.id, embeddings);
        
        // Detect and create relationships
        const relationships = await this.relationshipDetector.detectRelationships(knowledgeItem);
        if (relationships.length > 0) {
          await this.repository.createRelationships(relationships);
        }
        
        results.push(knowledgeItem);
      } catch (error) {
        console.error(`Failed to ingest item: ${item.content.substring(0, 100)}...`, error);
        errors.push(`Ingestion failed: ${error.message}`);
      }
    }
    
    return { 
      items: results, 
      processedCount: results.length,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Context-aware retrieval - used by Agent Intelligence
   */
  async getContextualKnowledge(context: ContextRequest): Promise<KnowledgeItem[]> {
    try {
      // Generate context embedding from discussion history and preferences
      const contextEmbedding = await this.embeddings.generateContextEmbedding(context);
      
      const results = await this.vectorDb.search(contextEmbedding, {
        limit: 10,
        threshold: 0.6,
        filters: {
          tags: context.relevantTags,
          timeRange: context.timeRange
        }
      });
      
      return this.repository.hydrate(results);
    } catch (error) {
      console.error('Contextual knowledge retrieval error:', error);
      return [];
    }
  }

  /**
   * Classification utility - used by all services
   */
  async classify(content: string): Promise<KnowledgeClassification> {
    return this.classifier.classify(content);
  }

  /**
   * Relationship discovery - used by services for knowledge graph navigation
   */
  async findRelated(itemId: string, relationshipTypes?: string[]): Promise<KnowledgeItem[]> {
    try {
      const relationships = await this.repository.getRelationships(itemId, relationshipTypes);
      const relatedIds = relationships.map(r => r.targetItemId);
      return this.repository.getItems(relatedIds);
    } catch (error) {
      console.error('Related knowledge retrieval error:', error);
      return [];
    }
  }

  /**
   * Bulk knowledge update - used for maintaining knowledge quality
   */
  async updateKnowledge(itemId: string, updates: Partial<KnowledgeItem>): Promise<KnowledgeItem> {
    const updatedItem = await this.repository.update(itemId, updates);
    
    // Re-generate embeddings if content changed
    if (updates.content) {
      const embeddings = await this.embeddings.generateEmbeddings(updates.content);
      await this.vectorDb.update(itemId, embeddings);
    }
    
    return updatedItem;
  }

  /**
   * Knowledge deletion - used for cleanup and privacy
   */
  async deleteKnowledge(itemId: string): Promise<void> {
    await this.repository.delete(itemId);
    await this.vectorDb.delete(itemId);
  }

  /**
   * Get knowledge statistics - used for monitoring and analytics
   */
  async getStatistics(): Promise<{
    totalItems: number;
    itemsByType: Record<string, number>;
    itemsBySource: Record<string, number>;
    averageConfidence: number;
  }> {
    return this.repository.getStatistics();
  }

  // Private helper methods
  private buildVectorFilters(filters?: KnowledgeFilters): any {
    if (!filters) return {};
    
    return {
      tags: filters.tags,
      types: filters.types,
      confidence: filters.confidence,
      sourceTypes: filters.sourceTypes
    };
  }

  private async enhanceWithRelationships(items: KnowledgeItem[]): Promise<KnowledgeItem[]> {
    const enhanced = [];
    
    for (const item of items) {
      const relationships = await this.repository.getRelationships(item.id);
      enhanced.push({
        ...item,
        relationships: relationships
      });
    }
    
    return enhanced;
  }

  private getAppliedFilters(filters?: KnowledgeFilters): string[] {
    if (!filters) return [];
    
    const applied = [];
    if (filters.tags?.length) applied.push('tags');
    if (filters.types?.length) applied.push('types');
    if (filters.confidence) applied.push('confidence');
    if (filters.timeRange) applied.push('timeRange');
    if (filters.sourceTypes?.length) applied.push('sourceTypes');
    
    return applied;
  }
} 