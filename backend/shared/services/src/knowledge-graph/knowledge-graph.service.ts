import {
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeIngestRequest,
  KnowledgeIngestResponse,
  KnowledgeItem,
  KnowledgeClassification,
  ContextRequest,
  KnowledgeFilters,
  KnowledgeScope
} from '@uaip/types';
import { QdrantService } from '../qdrant.service.js';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
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
  async search(request: KnowledgeSearchRequest & { scope?: KnowledgeScope }): Promise<KnowledgeSearchResponse> {
    const startTime = Date.now();
    const { query, filters, options, scope } = request;
    let filteredResults: KnowledgeItem[] = [];
    let vectorResults: any[] = [];
    try {
      // Generate query embedding
      if(query) {
        const queryEmbedding = await this.embeddings.generateEmbedding(query);
        const vectorFilters = this.buildVectorFilters(filters, scope);

        vectorResults = await this.vectorDb.search(queryEmbedding, {
          limit: options?.limit || 20,
          threshold: options?.similarityThreshold || 0.7,
          filters: vectorFilters
        });
        filteredResults = await this.repository.applyFilters(vectorResults, filters, scope);
      } else {
        filteredResults = await this.repository.applyFilters([], filters, scope);
      }
      
      // Build vector filters including scope
      
      // Perform vector similarity search
     
      
      // Apply metadata filters and hydrate results with scope
      
      // Enhance with relationships if requested
      const enhancedResults = options?.includeRelationships 
        ? await this.enhanceWithRelationships(filteredResults, scope)
        : filteredResults;
      
      return {
        items: enhancedResults,
        totalCount: enhancedResults.length,
        searchMetadata: {
          query,
          processingTime: Date.now() - startTime,
          similarityScores: vectorResults ? vectorResults.map(r => r.score) : [],
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
  async ingest(items: (KnowledgeIngestRequest & { scope?: KnowledgeScope })[]): Promise<KnowledgeIngestResponse> {
    const results: KnowledgeItem[] = [];
    const errors: string[] = [];
    
    for (const item of items) {
      try {
        // Classify content
        const classification = await this.classifier.classify(item.content);
        console.log('classification', classification);
        // Generate embeddings
        const embeddings = await this.embeddings.generateEmbeddings(item.content);
        console.log('embeddings', embeddings);
        // Store knowledge item with scope
        const knowledgeItem = await this.repository.create({
          ...item,
          tags: [...(item.tags || []), ...classification.tags],
          confidence: item.confidence || classification.confidence,
          type: item.type || classification.type,
          userId: item.scope?.userId,
          agentId: item.scope?.agentId
        });
        console.log('knowledgeItem', knowledgeItem);
        // Store embeddings in vector database with scope metadata
        await this.vectorDb.store(knowledgeItem.id, embeddings);
        // Detect and create relationships
        const relationships = await this.relationshipDetector.detectRelationships(knowledgeItem);
        if (relationships.length > 0) {
          // Add scope to relationships
          const scopedRelationships = relationships.map(rel => ({
            ...rel,
            userId: item.scope?.userId,
            agentId: item.scope?.agentId
          }));
          await this.repository.createRelationships(scopedRelationships);
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
  async getContextualKnowledge(context: ContextRequest & { scope?: KnowledgeScope }): Promise<KnowledgeItem[]> {
    try {
      // Generate context embedding from discussion history and preferences
      const contextEmbedding = await this.embeddings.generateContextEmbedding(context);
      
      const results = await this.vectorDb.search(contextEmbedding, {
        limit: 10,
        threshold: 0.6,
        filters: {
          tags: context.relevantTags,
          timeRange: context.timeRange,
          scope: context.scope
        }
      });
      
      return this.repository.applyFilters(results, undefined, context.scope);
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
  async findRelated(itemId: string, relationshipTypes?: string[], scope?: KnowledgeScope): Promise<KnowledgeItem[]> {
    try {
      const relationships = await this.repository.getRelationships(itemId, relationshipTypes, scope);
      const relatedIds = relationships.map(r => r.targetItemId);
      return this.repository.getItems(relatedIds.map(id => id));
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
  private buildVectorFilters(filters?: KnowledgeFilters, scope?: KnowledgeScope): any {
    if (!filters) return {};
    
    return {
      tags: filters.tags,
      types: filters.types,
      confidence: filters.confidence,
      sourceTypes: filters.sourceTypes,
      scope: scope
    };
  }

  private async enhanceWithRelationships(items: KnowledgeItem[], scope?: KnowledgeScope): Promise<KnowledgeItem[]> {
    const enhanced = [];
    
    for (const item of items) {
      const relationships = await this.repository.getRelationships(item.id, undefined, scope);
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