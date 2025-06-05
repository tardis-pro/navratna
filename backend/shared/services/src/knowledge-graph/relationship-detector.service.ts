import { KnowledgeItem, KnowledgeRelationship } from '@uaip/types';
import { EmbeddingService } from './embedding.service';
import { KnowledgeRepository } from './knowledge.repository';

export class RelationshipDetector {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly knowledgeRepository: KnowledgeRepository
  ) {}

  async detectRelationships(newItem: KnowledgeItem): Promise<Omit<KnowledgeRelationship, 'id' | 'createdAt'>[]> {
    const relationships: Omit<KnowledgeRelationship, 'id' | 'createdAt'>[] = [];

    try {
      // Get recent items to compare against (limit for performance)
      const recentItems = await this.knowledgeRepository.findRecentItems(50);
      
      // Generate embedding for the new item
      const newItemEmbedding = await this.embeddingService.generateEmbedding(newItem.content);

      for (const existingItem of recentItems) {
        if (existingItem.id === newItem.id) continue;

        // Generate embedding for existing item
        const existingEmbedding = await this.embeddingService.generateEmbedding(existingItem.content);
        
        // Calculate similarity
        const similarity = await this.embeddingService.calculateSimilarity(newItemEmbedding, existingEmbedding);
        
        // Detect relationship type and confidence
        const relationshipInfo = this.analyzeRelationship(newItem, existingItem, similarity);
        
        if (relationshipInfo) {
          relationships.push({
            sourceItemId: newItem.id,
            targetItemId: existingItem.id,
            relationshipType: relationshipInfo.type,
            confidence: relationshipInfo.confidence
          });
        }
      }

      // Also detect tag-based relationships
      const tagRelationships = await this.detectTagBasedRelationships(newItem);
      relationships.push(...tagRelationships);

      return relationships;
    } catch (error) {
      console.error('Relationship detection error:', error);
      return [];
    }
  }

  private analyzeRelationship(
    newItem: KnowledgeItem, 
    existingItem: KnowledgeItem, 
    similarity: number
  ): { type: string; confidence: number } | null {
    
    // High similarity threshold for "similar" relationships
    if (similarity > 0.8) {
      return { type: 'similar', confidence: similarity };
    }

    // Medium similarity for "related" relationships
    if (similarity > 0.6) {
      return { type: 'related', confidence: similarity * 0.8 };
    }

    // Check for specific relationship patterns
    const specificRelationship = this.detectSpecificRelationship(newItem, existingItem);
    if (specificRelationship && similarity > 0.4) {
      return {
        type: specificRelationship,
        confidence: Math.min(similarity + 0.2, 1.0)
      };
    }

    // Check for contradictory content
    if (this.detectContradiction(newItem, existingItem) && similarity > 0.5) {
      return { type: 'contradicts', confidence: 0.7 };
    }

    return null;
  }

  private detectSpecificRelationship(newItem: KnowledgeItem, existingItem: KnowledgeItem): string | null {
    const newContent = newItem.content.toLowerCase();
    const existingContent = existingItem.content.toLowerCase();

    // Reference relationships
    if (this.containsReference(newContent, existingContent) || this.containsReference(existingContent, newContent)) {
      return 'references';
    }

    // Prerequisite relationships
    if (this.isPrerequisite(existingItem, newItem)) {
      return 'prerequisite';
    }

    // Follow-up relationships
    if (this.isFollowUp(newItem, existingItem)) {
      return 'follows';
    }

    // Example relationships
    if (this.isExample(newItem, existingItem)) {
      return 'exemplifies';
    }

    // Implementation relationships
    if (this.isImplementation(newItem, existingItem)) {
      return 'implements';
    }

    // Update relationships
    if (this.isUpdate(newItem, existingItem)) {
      return 'updates';
    }

    return null;
  }

  private containsReference(content1: string, content2: string): boolean {
    // Look for explicit references
    const referencePatterns = [
      /see also/gi,
      /refer to/gi,
      /as mentioned in/gi,
      /according to/gi,
      /based on/gi
    ];

    return referencePatterns.some(pattern => content1.match(pattern));
  }

  private isPrerequisite(item1: KnowledgeItem, item2: KnowledgeItem): boolean {
    const content1 = item1.content.toLowerCase();
    const content2 = item2.content.toLowerCase();

    // Check for prerequisite indicators
    const prerequisitePatterns = [
      /before/gi,
      /first/gi,
      /prerequisite/gi,
      /requirement/gi,
      /setup/gi,
      /install/gi
    ];

    // Check if item1 contains basic concepts that item2 builds upon
    const basicKeywords = ['basic', 'introduction', 'getting started', 'overview', 'fundamentals'];
    const advancedKeywords = ['advanced', 'complex', 'detailed', 'implementation', 'optimization'];

    const item1IsBasic = basicKeywords.some(keyword => content1.includes(keyword));
    const item2IsAdvanced = advancedKeywords.some(keyword => content2.includes(keyword));

    return (item1IsBasic && item2IsAdvanced) || 
           prerequisitePatterns.some(pattern => content1.match(pattern));
  }

  private isFollowUp(newItem: KnowledgeItem, existingItem: KnowledgeItem): boolean {
    const newContent = newItem.content.toLowerCase();
    const existingContent = existingItem.content.toLowerCase();

    // Check temporal indicators
    const followUpPatterns = [
      /next/gi,
      /then/gi,
      /after/gi,
      /following/gi,
      /subsequently/gi,
      /part 2/gi,
      /continued/gi
    ];

    return followUpPatterns.some(pattern => newContent.match(pattern)) &&
           newItem.createdAt > existingItem.createdAt;
  }

  private isExample(newItem: KnowledgeItem, existingItem: KnowledgeItem): boolean {
    const newContent = newItem.content.toLowerCase();
    const existingContent = existingItem.content.toLowerCase();

    const examplePatterns = [
      /for example/gi,
      /example:/gi,
      /instance/gi,
      /case study/gi,
      /demonstration/gi
    ];

    // Check if new item is an example of existing item's concept
    return examplePatterns.some(pattern => newContent.match(pattern)) ||
           (newItem.type === 'EXPERIENTIAL' && existingItem.type === 'CONCEPTUAL');
  }

  private isImplementation(newItem: KnowledgeItem, existingItem: KnowledgeItem): boolean {
    const newContent = newItem.content.toLowerCase();
    const existingContent = existingItem.content.toLowerCase();

    const implementationPatterns = [
      /implementation/gi,
      /code/gi,
      /function/gi,
      /class/gi,
      /method/gi
    ];

    // Check if new item implements concepts from existing item
    return (newItem.type === 'PROCEDURAL' && existingItem.type === 'CONCEPTUAL') ||
           implementationPatterns.some(pattern => newContent.match(pattern));
  }

  private isUpdate(newItem: KnowledgeItem, existingItem: KnowledgeItem): boolean {
    // Check if items are from the same source but new item is more recent
    return newItem.sourceIdentifier === existingItem.sourceIdentifier &&
           newItem.sourceType === existingItem.sourceType &&
           newItem.createdAt > existingItem.createdAt;
  }

  private detectContradiction(newItem: KnowledgeItem, existingItem: KnowledgeItem): boolean {
    const newContent = newItem.content.toLowerCase();
    const existingContent = existingItem.content.toLowerCase();

    const contradictionPatterns = [
      /however/gi,
      /but/gi,
      /contrary/gi,
      /opposite/gi,
      /different/gi,
      /not/gi,
      /wrong/gi,
      /incorrect/gi
    ];

    // Simple contradiction detection based on negation patterns
    return contradictionPatterns.some(pattern => 
      newContent.match(pattern) || existingContent.match(pattern)
    );
  }

  private async detectTagBasedRelationships(newItem: KnowledgeItem): Promise<Omit<KnowledgeRelationship, 'id' | 'createdAt'>[]> {
    const relationships: Omit<KnowledgeRelationship, 'id' | 'createdAt'>[] = [];

    if (!newItem.tags || newItem.tags.length === 0) {
      return relationships;
    }

    try {
      // Find items with overlapping tags
      const relatedItems = await this.knowledgeRepository.findByTags(newItem.tags, 20);

      for (const relatedItem of relatedItems) {
        if (relatedItem.id === newItem.id) continue;

        const commonTags = newItem.tags.filter(tag => relatedItem.tags.includes(tag));
        const tagOverlapRatio = commonTags.length / Math.max(newItem.tags.length, relatedItem.tags.length);

        if (tagOverlapRatio > 0.3) { // At least 30% tag overlap
          relationships.push({
            sourceItemId: newItem.id,
            targetItemId: relatedItem.id,
            relationshipType: 'tag_related',
            confidence: tagOverlapRatio
          });
        }
      }
    } catch (error) {
      console.error('Tag-based relationship detection error:', error);
    }

    return relationships;
  }

  async findStrongRelationships(itemId: string, threshold: number = 0.8): Promise<KnowledgeRelationship[]> {
    try {
      const relationships = await this.knowledgeRepository.getRelationships(itemId);
      return relationships.filter(rel => rel.confidence >= threshold);
    } catch (error) {
      console.error('Strong relationship retrieval error:', error);
      return [];
    }
  }

  async suggestRelationships(itemId: string): Promise<{
    item: KnowledgeItem;
    suggestedType: string;
    confidence: number;
  }[]> {
    try {
      const item = await this.knowledgeRepository.findById(itemId);
      if (!item) return [];

      const suggestions = [];
      
      // Find items with similar tags
      const tagRelated = await this.knowledgeRepository.findByTags(item.tags, 10);
      
      for (const related of tagRelated) {
        if (related.id === itemId) continue;
        
        const commonTags = item.tags.filter(tag => related.tags.includes(tag));
        const confidence = commonTags.length / Math.max(item.tags.length, related.tags.length);
        
        if (confidence > 0.2) {
          suggestions.push({
            item: related,
            suggestedType: 'related',
            confidence
          });
        }
      }

      return suggestions.slice(0, 5); // Return top 5 suggestions
    } catch (error) {
      console.error('Relationship suggestion error:', error);
      return [];
    }
  }
} 