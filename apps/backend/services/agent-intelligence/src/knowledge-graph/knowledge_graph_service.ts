import {
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeIngestRequest,
  KnowledgeIngestResponse,
  KnowledgeItem,
  KnowledgeClassification,
  ContextRequest,
  KnowledgeFilters,
  KnowledgeScope,
  KnowledgeType,
  SourceType,
  VectorSearchResult,
} from '@uaip/types';
import { logger, DatabaseError } from '@uaip/utils';
import { QdrantService } from './qdrant_service.js';
import { KnowledgeRepository } from '@uaip/shared-services';
import { EmbeddingService } from './embedding_service.js';
import { ContentClassifier } from './content_classifier_service.js';
import { RelationshipDetector } from './relationship_detector_service.js';
import { ConceptExtractorService, ConceptExtractionResult } from './concept_extractor_service.js';
import { OntologyBuilderService, OntologyBuildResult } from './ontology_builder_service.js';
import {
  TaxonomyGeneratorService,
  TaxonomyGenerationResult,
} from './taxonomy_generator_service.js';
import {
  ReconciliationService,
  KnowledgeConflict,
  ResolvedKnowledge,
} from './reconciliation_service.js';
import { KnowledgeSyncService } from './knowledge_sync_service.js';
import { ChatParserService, ParsedConversation, ParsedMessage } from './chat_parser_service.js';
import {
  ChatKnowledgeExtractorService,
  ExtractedKnowledge,
  QAPair,
  DecisionPoint,
  KnowledgeExtractionResult,
} from './chat_knowledge_extractor_service.js';
import { BatchProcessorService, FileData, ProcessingOptions } from './batch_processor_service';
import { QAGeneratorService, GeneratedQA, QAGenerationOptions } from './qa_generator_service.js';
import {
  WorkflowExtractorService,
  ExtractedWorkflow,
  WorkflowExtractionOptions,
} from './workflow_extractor_service.js';
import {
  ExpertiseAnalyzerService,
  ExpertiseProfile,
  ExpertiseAnalysisOptions,
} from './expertise_analyzer_service.js';
import {
  LearningDetectorService,
  LearningMoment,
  LearningDetectionOptions,
} from './learning_detector_service.js';

export interface IngestionOptions {
  extractKnowledge?: boolean;
  saveToGraph?: boolean;
  generateEmbeddings?: boolean;
  batchSize?: number;
  concurrency?: number;
}

export interface IngestionResult {
  conversationsFound: number;
  knowledgeExtracted: number;
  processingTime: number;
  success: boolean;
  errors?: string[];
}

export class KnowledgeGraphService {
  private readonly conceptExtractor: ConceptExtractorService;
  private readonly ontologyBuilder: OntologyBuilderService;
  private readonly taxonomyGenerator: TaxonomyGeneratorService;
  private readonly reconciliationService: ReconciliationService;
  private readonly chatParser: ChatParserService;
  private readonly chatKnowledgeExtractor: ChatKnowledgeExtractorService;
  private readonly batchProcessor: BatchProcessorService;
  private readonly qaGenerator: QAGeneratorService;
  private readonly workflowExtractor: WorkflowExtractorService;
  private readonly expertiseAnalyzer: ExpertiseAnalyzerService;
  private readonly learningDetector: LearningDetectorService;

  constructor(
    private readonly vectorDb: QdrantService,
    private readonly repository: KnowledgeRepository,
    private readonly embeddings: EmbeddingService,
    private readonly classifier: ContentClassifier,
    private readonly relationshipDetector: RelationshipDetector,
    private readonly knowledgeSync: KnowledgeSyncService
  ) {
    // Initialize ontology services
    this.conceptExtractor = new ConceptExtractorService(this.classifier, this.embeddings);
    this.ontologyBuilder = new OntologyBuilderService(
      this.conceptExtractor,
      this.repository,
      this.knowledgeSync
    );
    this.taxonomyGenerator = new TaxonomyGeneratorService(this.repository, this.classifier);
    this.reconciliationService = new ReconciliationService(
      this.embeddings,
      this.repository,
      this.knowledgeSync
    );

    // Initialize chat services
    this.chatParser = new ChatParserService();
    this.chatKnowledgeExtractor = new ChatKnowledgeExtractorService(
      this.classifier,
      this.embeddings
    );
    this.batchProcessor = new BatchProcessorService(
      this.chatParser,
      this.chatKnowledgeExtractor,
      this
    );

    // Initialize Phase 2 services
    this.qaGenerator = new QAGeneratorService(this.repository, this.classifier, this.embeddings);
    this.workflowExtractor = new WorkflowExtractorService(this.classifier, this.embeddings);
    this.expertiseAnalyzer = new ExpertiseAnalyzerService(this.classifier, this.embeddings);
    this.learningDetector = new LearningDetectorService(this.classifier, this.embeddings);
  }

  /**
   * Primary search interface - used by all UAIP services
   */
  async search(
    request: KnowledgeSearchRequest & { scope?: KnowledgeScope }
  ): Promise<KnowledgeSearchResponse> {
    const startTime = Date.now();
    const { query, filters, options, scope } = request;
    let filteredResults: KnowledgeItem[] = [];
    let vectorResults: VectorSearchResult[] = [];
    try {
      // Generate query embedding or get all items
      if (query && query.trim()) {
        try {
          const queryEmbedding = await this.embeddings.generateEmbedding(query);
          const vectorFilters = this.buildVectorFilters(filters, scope);

          // Check if collection has points before searching
          const collectionInfo = await this.vectorDb.getCollectionInfo();
          if (collectionInfo.result?.points_count === 0) {
            // No embeddings available, fall back to repository search
            console.warn('Vector collection is empty, falling back to repository search');
            filteredResults = (await this.repository.findByScope(
              scope || {}
            )) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;
          } else {
            vectorResults = await this.vectorDb.search(queryEmbedding, {
              limit: options?.limit || 20,
              threshold: options?.similarityThreshold || 0.7,
              filters: vectorFilters,
            });
            filteredResults = (await this.repository.applyFilters({
              limit: options?.limit || 20,
            })) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;
          }
        } catch (vectorError) {
          // If vector search fails, fall back to repository search
          console.warn(
            'Vector search failed, falling back to repository search:',
            vectorError.message
          );
          filteredResults = (await this.repository.findByScope(
            scope || {}
          )) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;
        }
      } else {
        // When no query is provided, get all items with scope filtering
        filteredResults = (await this.repository.findByScope(
          scope || {}
        )) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;
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
          similarityScores: vectorResults ? vectorResults.map((r) => r.score) : [],
          filtersApplied: this.getAppliedFilters(filters),
        },
      };
    } catch (error) {
      logger.error('Knowledge search error', { error: error instanceof Error ? error.message : String(error) });
      throw new DatabaseError(`Knowledge search failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }

  /**
   * Ingestion interface - used by data connectors and services
   */
  async ingest(
    items: (KnowledgeIngestRequest & { scope?: KnowledgeScope })[]
  ): Promise<KnowledgeIngestResponse> {
    const results: KnowledgeItem[] = [];
    const errors: string[] = [];

    for (const item of items) {
      try {
        // Classify content
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const classification = await this.classifier.classify(item.content);

        // Generate embeddings
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const embeddings = await this.embeddings.generateEmbeddings(item.content);

        // Store knowledge item with scope
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const knowledgeItem = await this.repository.create({
          ...item,
          tags: [...(item.tags || []), ...classification.tags],
          confidence: item.confidence || classification.confidence,
          type: item.type || classification.type,
          userId: item.scope?.userId,
          agentId: item.scope?.agentId,
        });

        // Store embeddings in vector database with scope metadata
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        await this.vectorDb.store(knowledgeItem.id, embeddings);

        // Sync to Qdrant + Neo4j immediately so constellations reflect new data
        this.knowledgeSync
          .syncKnowledgeItem(knowledgeItem as Parameters<typeof this.knowledgeSync.syncKnowledgeItem>[0])
          .catch((syncErr: unknown) => {
            logger.warn('Post-ingest Qdrant sync failed (item still saved to Postgres)', {
              itemId: knowledgeItem.id,
              error: syncErr instanceof Error ? syncErr.message : String(syncErr),
            });
          });

        // Detect and create relationships
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const relationships = await this.relationshipDetector.detectRelationships(
          knowledgeItem as unknown as KnowledgeItem /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */
        );
        if (relationships.length > 0) {
          // Add scope to relationships
          const scopedRelationships = relationships.map((rel) => ({
            ...rel,
            userId: item.scope?.userId,
            agentId: item.scope?.agentId,
          }));
          // oxlint-disable-next-line no-await-in-loop -- sequential processing required
          await this.repository.createRelationships(scopedRelationships);
        }

        results.push(knowledgeItem as unknown as KnowledgeItem /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */);
      } catch (error) {
        logger.error('Failed to ingest knowledge item', {
          preview: item.content.substring(0, 100),
          error: error instanceof Error ? error.message : String(error),
        });
        errors.push(`Ingestion failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      items: results,
      processedCount: results.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Context-aware retrieval - used by Agent Intelligence
   */
  async getContextualKnowledge(
    context: ContextRequest & { scope?: KnowledgeScope }
  ): Promise<KnowledgeItem[]> {
    try {
      // Generate context embedding from discussion history and preferences
      const contextEmbedding = await this.embeddings.generateContextEmbedding(context);

      const _results = await this.vectorDb.search(contextEmbedding, {
        limit: 10,
        threshold: 0.6,
        filters: {
          tags: context.relevantTags,
          timeRange: context.timeRange,
          scope: context.scope,
        },
      });

      return this.repository.applyFilters({ limit: 10 }) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;
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
  async findRelated(
    itemId: string,
    _relationshipTypes?: string[],
    _scope?: KnowledgeScope
  ): Promise<KnowledgeItem[]> {
    try {
      const relationships = await this.repository.getRelationships(itemId);
      const relatedIds = relationships.map((r) => r.targetId);
      return this.repository.getItems(relatedIds.map((id) => id)) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;
    } catch (error) {
      console.error('Related knowledge retrieval error:', error);
      return [];
    }
  }

  /**
   * Bulk knowledge update - used for maintaining knowledge quality
   */
  async updateKnowledge(itemId: string, updates: Partial<KnowledgeItem>): Promise<KnowledgeItem> {
    const updatedItem = await this.repository.update(
      itemId,
      updates as unknown as Parameters<typeof this.repository.update>[1] /* Partial<KnowledgeItem>→KnowledgeRow update param: domain type differs from Drizzle update shape */
    );

    // Re-generate embeddings if content changed
    if (updates.content) {
      const embeddings = await this.embeddings.generateEmbeddings(updates.content);
      await this.vectorDb.update(itemId, embeddings);
    }

    return updatedItem as unknown as KnowledgeItem /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;
  }

  /**
   * Knowledge deletion - used for cleanup and privacy
   */
  async deleteKnowledge(itemId: string): Promise<void> {
    await this.repository.delete(itemId);
    await this.vectorDb.delete(itemId);
  }

  /**
   * Add feedback to knowledge items
   */
  async addFeedback(feedback: {
    entityId: string;
    feedbackType: string;
    comments?: string;
    userId: string;
    timestamp: Date;
  }): Promise<void> {
    const feedbackTimestamp = feedback.timestamp.toISOString();
    const feedbackContent = `Feedback for ${feedback.entityId}: ${feedback.feedbackType}${feedback.comments ? ` - ${feedback.comments}` : ''}`;
    const feedbackClassification = await this.classifier.classify(feedbackContent);

    const syncResult = await this.knowledgeSync.createKnowledgeItem(
      feedbackContent,
      feedbackClassification.type,
      {
        tags: ['feedback', `feedback-${feedback.feedbackType}`, `entity-${feedback.entityId}`],
        feedbackType: feedback.feedbackType,
        comments: feedback.comments,
        entityId: feedback.entityId,
        timestamp: feedbackTimestamp,
      },
      feedback.userId
    );

    if (syncResult.success) {
      await this.repository.createRelationships([
        {
          sourceId: feedback.entityId,
          targetId: syncResult.knowledgeItemId,
          relationshipType: 'HAS_FEEDBACK',
          strength: 0.9,
          metadata: {
            userId: feedback.userId,
            summary: `Feedback linked: ${feedback.feedbackType}`,
          },
        },
      ]);
    } else {
      logger.error('Operation failed', {
        error: syncResult.error,
        context: 'addFeedback',
        entityId: feedback.entityId,
      });
    }
  }

  /**
   * Store interaction data
   */
  async storeInteraction(interaction: Record<string, unknown>): Promise<void> {
    const interactionTimestamp =
      interaction?.timestamp instanceof Date
        ? interaction.timestamp.toISOString()
        : new Date().toISOString();
    const interactionType = interaction?.interactionType || interaction?.type || 'unknown';
    const interactionContent = `Interaction ${interactionType}: ${
      interaction?.summary || interaction?.context || 'No context provided'
    }`;
    const interactionClassification = await this.classifier.classify(interactionContent);

    const syncResult = await this.knowledgeSync.createKnowledgeItem(
      interactionContent,
      interactionClassification.type,
      {
        tags: ['interaction', `interaction-${interactionType}`],
        interaction,
        interactionType,
        timestamp: interactionTimestamp,
      },
      interaction?.userId as string | undefined,
      interaction?.agentId as string | undefined
    );

    if (syncResult.success && interaction?.entityId) {
      await this.repository.createRelationships([
        {
          sourceId: interaction.entityId as string,
          targetId: syncResult.knowledgeItemId,
          relationshipType: 'HAS_INTERACTION',
          strength: 0.85,
          metadata: {
            userId: interaction?.userId as string | undefined,
            agentId: interaction?.agentId as string | undefined,
            summary: `Interaction linked: ${interactionType}`,
          },
        },
      ]);
    } else if (!syncResult.success) {
      logger.error('Operation failed', {
        error: syncResult.error,
        context: 'storeInteraction',
        interactionType,
      });
    }
  }

  /**
   * Adjust confidence scores
   */
  async adjustConfidence(itemId: string, adjustment: number): Promise<void> {
    const item = await this.repository.findById(itemId);
    if (!item) {
      logger.error('Operation failed', {
        error: `Knowledge item not found: ${itemId}`,
        context: 'adjustConfidence',
        itemId,
      });
      return;
    }

    const currentConfidence =
      typeof item.confidence === 'string' ? parseFloat(item.confidence) : item.confidence;
    const updatedConfidence = Math.max(0, Math.min(1, currentConfidence + adjustment));
    await this.repository.update(itemId, {
      confidence: updatedConfidence,
      metadata: {
        ...(item.metadata || {}),
        lastConfidenceAdjustment: {
          previous: item.confidence,
          adjustment,
          updated: updatedConfidence,
          timestamp: new Date().toISOString(),
        },
      },
    });

    await this.knowledgeSync.createKnowledgeItem(
      `Confidence adjusted for ${itemId} from ${item.confidence} to ${updatedConfidence}`,
      item.type,
      {
        tags: ['confidence-adjustment', `item-${itemId}`],
        itemId,
        previousConfidence: item.confidence,
        newConfidence: updatedConfidence,
        adjustment,
      },
      item.userId,
      item.agentId
    );
  }

  /**
   * Initialize agent context
   */
  async initializeAgentContext(agentId: string, context: Record<string, unknown>): Promise<void> {
    const contextTimestamp = new Date().toISOString();
    const contextContent = `Agent ${agentId} context initialized`;
    const contextClassification = await this.classifier.classify(contextContent);

    const syncResult = await this.knowledgeSync.createKnowledgeItem(
      contextContent,
      contextClassification.type,
      {
        tags: ['agent-context', `agent-${agentId}`],
        agentId,
        context,
        initializedAt: contextTimestamp,
      },
      context?.userId as string | undefined,
      agentId
    );

    if (!syncResult.success) {
      logger.error('Operation failed', {
        error: syncResult.error,
        context: 'initializeAgentContext',
        agentId,
      });
      return;
    }

    if (context?.baseKnowledgeItemId) {
      await this.repository.createRelationships([
        {
          sourceId: context.baseKnowledgeItemId as string,
          targetId: syncResult.knowledgeItemId,
          relationshipType: 'INITIALIZES_CONTEXT',
          strength: 0.8,
          metadata: {
            userId: context?.userId as string | undefined,
            agentId,
            summary: `Initial context for agent ${agentId}`,
          },
        },
      ]);
    }
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
    const stats = await this.repository.getStatistics();
    return {
      totalItems: stats.totalItems,
      itemsByType: stats.byType,
      itemsBySource: {},
      averageConfidence: 0,
    };
  }

  // Private helper methods
  private buildVectorFilters(
    filters?: KnowledgeFilters,
    scope?: KnowledgeScope
  ): Record<string, unknown> {
    if (!filters) return {};

    return {
      tags: filters.tags,
      types: filters.types,
      confidence: filters.confidence,
      sourceTypes: filters.sourceTypes,
      scope: scope,
    };
  }

  private async enhanceWithRelationships(
    items: KnowledgeItem[],
    _scope?: KnowledgeScope
  ): Promise<KnowledgeItem[]> {
    const enhanced = [];

    for (const item of items) {
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const relationships = await this.repository.getRelationships(item.id);
      enhanced.push({
        ...item,
        relationships: relationships,
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

  // =====================================================
  // ONTOLOGY METHODS
  // =====================================================

  /**
   * Extract concepts from knowledge items in a domain
   */
  async extractConcepts(domain?: string, options?: { minConfidence?: number; maxItems?: number }) {
    let items: KnowledgeItem[];
    if (domain) {
      items = (await this.repository.findByDomain(
        domain,
        options?.maxItems
      )) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;
    } else {
      const allItems = (await this.repository.findRecentItems(
        options?.maxItems || 100
      )) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;
      items = options?.minConfidence
        ? allItems.filter((item) => item.confidence >= options.minConfidence!)
        : allItems;
    }

    return await this.conceptExtractor.extractConcepts(items, domain);
  }

  /**
   * Build domain ontology from knowledge items
   */
  async buildDomainOntology(
    domain: string,
    options?: {
      includeInstances?: boolean;
      minConfidence?: number;
      maxConcepts?: number;
      saveToKnowledgeGraph?: boolean;
    }
  ) {
    return await this.ontologyBuilder.buildDomainOntology(domain, undefined, options);
  }

  /**
   * Get existing ontology for a domain
   */
  async getDomainOntology(domain: string) {
    return await this.ontologyBuilder.getOntologyForDomain(domain);
  }

  /**
   * Generate taxonomy for knowledge classification
   */
  async generateTaxonomy(
    domain?: string,
    options?: {
      maxCategories?: number;
      minCategorySize?: number;
      autoClassify?: boolean;
    }
  ) {
    const items = (domain
      ? await this.repository.findByDomain(domain)
      : await this.repository.findRecentItems(100)) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;

    return await this.taxonomyGenerator.generateTaxonomy(items, domain, options);
  }

  /**
   * Detect and resolve knowledge conflicts
   */
  async detectKnowledgeConflicts(
    domain?: string,
    options?: {
      confidenceThreshold?: number;
      similarityThreshold?: number;
      maxConflictsPerBatch?: number;
      autoResolve?: boolean;
    }
  ) {
    const items = (domain
      ? await this.repository.findByDomain(domain)
      : await this.repository.findRecentItems(100)) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;

    return await this.reconciliationService.detectConflicts(items, {
      domains: domain ? [domain] : undefined,
      ...options,
    });
  }

  /**
   * Resolve knowledge conflicts
   */
  async resolveKnowledgeConflicts(
    conflicts: KnowledgeConflict[],
    options?: {
      autoResolve?: boolean;
      preserveHistory?: boolean;
      generateSummaries?: boolean;
    }
  ) {
    return await this.reconciliationService.resolveConflicts(conflicts, options);
  }

  /**
   * Merge duplicate knowledge items
   */
  async mergeDuplicates(domain?: string) {
    const items = (domain
      ? await this.repository.findByDomain(domain)
      : await this.repository.findRecentItems(100)) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;

    return await this.reconciliationService.mergeDuplicates(items);
  }

  /**
   * Generate knowledge summaries for clusters
   */
  async generateKnowledgeSummaries(domain?: string) {
    const items = (domain
      ? await this.repository.findByDomain(domain)
      : await this.repository.findRecentItems(100)) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;

    return await this.reconciliationService.generateSummaries(items);
  }

  /**
   * Run comprehensive knowledge reconciliation
   */
  async reconcileKnowledge(
    domain?: string,
    options?: {
      includeOntologyBuilding?: boolean;
      includeTaxonomyGeneration?: boolean;
      autoResolveConflicts?: boolean;
    }
  ) {
    const startTime = Date.now();
    const results = {
      domain: domain || 'all',
      conceptExtraction: null as ConceptExtractionResult | null,
      ontologyBuilding: null as OntologyBuildResult | null,
      taxonomyGeneration: null as TaxonomyGenerationResult | null,
      conflictDetection: null as KnowledgeConflict[] | null,
      conflictResolution: null as ResolvedKnowledge | null,
      processingTime: 0,
    };

    try {
      // Step 1: Extract concepts
      results.conceptExtraction = await this.extractConcepts(domain);

      // Step 2: Build ontology if requested
      if (options?.includeOntologyBuilding && domain) {
        results.ontologyBuilding = await this.buildDomainOntology(domain, {
          saveToKnowledgeGraph: true,
        });
      }

      // Step 3: Generate taxonomy if requested
      if (options?.includeTaxonomyGeneration) {
        results.taxonomyGeneration = await this.generateTaxonomy(domain, {
          autoClassify: true,
        });
      }

      // Step 4: Detect conflicts
      results.conflictDetection = await this.detectKnowledgeConflicts(domain);

      // Step 5: Resolve conflicts if requested
      if (options?.autoResolveConflicts && results.conflictDetection.length > 0) {
        results.conflictResolution = await this.resolveKnowledgeConflicts(
          results.conflictDetection,
          { autoResolve: true, generateSummaries: true }
        );
      }

      results.processingTime = Date.now() - startTime;
      return results;
    } catch (error) {
      results.processingTime = Date.now() - startTime;
      throw error;
    }
  }

  // ============================================
  // Chat Ingestion Methods
  // ============================================

  /**
   * Ingest a single chat file and extract knowledge
   */
  async ingestChatFile(file: FileData, options: IngestionOptions = {}): Promise<IngestionResult> {
    const startTime = Date.now();
    const result: IngestionResult = {
      conversationsFound: 0,
      knowledgeExtracted: 0,
      processingTime: 0,
      success: false,
      errors: [],
    };

    try {
      // Parse conversations from file
      const parseResult = await this.chatParser.parseFile(file.content, file.name);
      const conversations = parseResult.conversations;

      result.conversationsFound = conversations.length;

      if (conversations.length === 0) {
        result.errors = ['No conversations found in file'];
        return result;
      }

      // Extract knowledge from conversations
      if (options.extractKnowledge !== false) {
        let totalKnowledgeExtracted = 0;

        for (const conversation of conversations) {
          // oxlint-disable-next-line no-await-in-loop -- sequential processing required
          const knowledge = await this.chatKnowledgeExtractor.extractKnowledgeFromConversations(
            [conversation],
            {
              extractQA: true,
              extractDecisions: true,
              extractExpertise: true,
              extractLearning: true,
            }
          );

          const knowledgeCount =
            knowledge.extractedKnowledge.length +
            knowledge.qaPairs.length +
            knowledge.decisionPoints.length +
            knowledge.expertiseAreas.length +
            knowledge.learningMoments.length;

          totalKnowledgeExtracted += knowledgeCount;

          // Save to knowledge graph if requested
          if (options.saveToGraph !== false) {
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.saveExtractedKnowledge(knowledge, file.userId);
          }
        }

        result.knowledgeExtracted = totalKnowledgeExtracted;
      }

      result.success = true;
      result.processingTime = Date.now() - startTime;
      return result;
    } catch (error) {
      result.errors = [error.message];
      result.processingTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Process multiple chat files in batch
   */
  async processBatchUpload(files: FileData[], options: ProcessingOptions = {}): Promise<string> {
    return await this.batchProcessor.startBatchJob(files, options);
  }

  /**
   * Get batch processing job status
   */
  getBatchJobStatus(jobId: string) {
    return this.batchProcessor.getJobStatus(jobId);
  }

  /**
   * Get batch processing statistics
   */
  getBatchProcessingStats() {
    return this.batchProcessor.getJobStatistics();
  }

  /**
   * Generate Q&A pairs from existing knowledge
   */
  async generateQAFromKnowledge(
    domain?: string,
    options?: QAGenerationOptions
  ): Promise<GeneratedQA[]> {
    try {
      const items = (domain
        ? await this.repository.findByDomain(domain)
        : await this.repository.findRecentItems(
            options?.maxPairs || 100
          )) as unknown as KnowledgeItem[] /* KnowledgeRow→KnowledgeItem: repository returns KnowledgeRow which lacks domain fields */;

      return await this.qaGenerator.generateFromKnowledge(items, options);
    } catch (error) {
      logger.error('Failed to generate Q&A from knowledge', { error: error.message, domain });
      throw error;
    }
  }

  /**
   * Extract workflows from chat conversations
   */
  async extractWorkflowsFromChats(
    conversations: ParsedConversation[],
    options?: WorkflowExtractionOptions
  ): Promise<ExtractedWorkflow[]> {
    try {
      return await this.workflowExtractor.extractWorkflows(conversations, options);
    } catch (error) {
      logger.error('Failed to extract workflows from chats', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze participant expertise from conversations
   */
  async analyzeParticipantExpertise(
    conversations: ParsedConversation[],
    options?: ExpertiseAnalysisOptions
  ): Promise<ExpertiseProfile[]> {
    try {
      return await this.expertiseAnalyzer.analyzeParticipantExpertise(conversations, options);
    } catch (error) {
      logger.error('Failed to analyze participant expertise', { error: error.message });
      throw error;
    }
  }

  /**
   * Detect learning moments in conversations
   */
  async detectLearningMoments(
    conversations: ParsedConversation[],
    options?: LearningDetectionOptions
  ): Promise<LearningMoment[]> {
    try {
      // Extract all messages from conversations
      const allMessages = conversations.flatMap((conv) => conv.messages || []);
      return await this.learningDetector.detectLearningMoments(allMessages, options);
    } catch (error) {
      logger.error('Failed to detect learning moments', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate Q&A pairs from conversations
   */
  async generateQAFromConversations(
    conversations: ParsedConversation[],
    options?: QAGenerationOptions
  ): Promise<GeneratedQA[]> {
    try {
      return await this.qaGenerator.generateFromConversations(conversations, options);
    } catch (error) {
      logger.error('Failed to generate Q&A from conversations', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate Q&A pairs
   */
  async validateQAPairs(pairs: GeneratedQA[]) {
    try {
      return await this.qaGenerator.validateQAPairs(pairs);
    } catch (error) {
      logger.error('Failed to validate Q&A pairs', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate workflows
   */
  async validateWorkflows(workflows: ExtractedWorkflow[]) {
    try {
      return await this.workflowExtractor.validateWorkflows(workflows);
    } catch (error) {
      logger.error('Failed to validate workflows', { error: error.message });
      throw error;
    }
  }

  /**
   * Track learning progression for a participant
   */
  async trackLearningProgression(participant: string, timeWindow?: { start?: Date; end?: Date }) {
    try {
      // Get conversations for the time window
      const conversations: ParsedConversation[] = []; // Would get from repository with time filter
      const allMessages: ParsedMessage[] = conversations.flatMap((conv) => conv.messages || []);

      const moments = await this.learningDetector.detectLearningMoments(allMessages, {
        participants: [participant],
        timeWindow,
      });

      return await this.learningDetector.trackLearningProgression(moments, participant);
    } catch (error) {
      logger.error('Failed to track learning progression', { error: error.message, participant });
      throw error;
    }
  }

  /**
   * Generate learning insights
   */
  async generateLearningInsights(
    conversations: ParsedConversation[],
    options?: LearningDetectionOptions
  ) {
    try {
      const allMessages = conversations.flatMap((conv) => conv.messages || []);
      const moments = await this.learningDetector.detectLearningMoments(allMessages, options);
      const transfers = await this.learningDetector.identifyKnowledgeTransfer(
        conversations,
        options
      );

      return await this.learningDetector.generateLearningInsights(moments, [], transfers);
    } catch (error) {
      logger.error('Failed to generate learning insights', { error: error.message });
      throw error;
    }
  }

  /**
   * Save extracted knowledge to the knowledge graph
   */
  private async saveExtractedKnowledge(
    knowledge: KnowledgeExtractionResult,
    userId: string
  ): Promise<void> {
    const savePromises: Promise<unknown>[] = [];

    // Save extracted knowledge (replaces facts and procedures)
    if (knowledge.extractedKnowledge?.length > 0) {
      savePromises.push(
        ...knowledge.extractedKnowledge.map((item: ExtractedKnowledge) =>
          this.ingest([
            {
              content: item.content,
              type: item.type,
              confidence: item.confidence,
              tags: item.tags,
              source: {
                type: SourceType.AGENT_INTERACTION,
                identifier: 'chat-ingestion',
                metadata: {
                  context: item.context,
                  extractedFrom: 'chat',
                  extractionMethod: item.metadata.extractionMethod,
                  sourceMessages: item.metadata.sourceMessages,
                  participants: item.metadata.participants,
                  domain: item.metadata.domain,
                },
              },
              createdBy: userId,
            },
          ])
        )
      );
    }

    // Save Q&A pairs
    if (knowledge.qaPairs?.length > 0) {
      savePromises.push(
        ...knowledge.qaPairs.map((qa: QAPair) =>
          this.ingest([
            {
              content: `Q: ${qa.question}\nA: ${qa.answer}`,
              type: KnowledgeType.PROCEDURAL,
              confidence: qa.confidence,
              tags: qa.tags,
              source: {
                type: SourceType.AGENT_INTERACTION,
                identifier: 'chat-qa-extraction',
                metadata: {
                  question: qa.question,
                  answer: qa.answer,
                  context: qa.context,
                  participants: qa.participants,
                  extractedFrom: 'chat',
                },
              },
              createdBy: userId,
            },
          ])
        )
      );
    }

    // Save decision points
    if (knowledge.decisionPoints?.length > 0) {
      savePromises.push(
        ...knowledge.decisionPoints.map((decision: DecisionPoint) =>
          this.ingest([
            {
              content: decision.decision,
              type: KnowledgeType.EXPERIENTIAL,
              confidence: decision.confidence,
              source: {
                type: SourceType.AGENT_INTERACTION,
                identifier: 'chat-decision-extraction',
                metadata: {
                  reasoning: decision.reasoning,
                  alternatives: decision.alternatives,
                  outcome: decision.outcome,
                  context: decision.context,
                  participants: decision.participants,
                  extractedFrom: 'chat',
                },
              },
              createdBy: userId,
            },
          ])
        )
      );
    }

    // Execute all save operations
    await Promise.allSettled(savePromises);
  }
}
