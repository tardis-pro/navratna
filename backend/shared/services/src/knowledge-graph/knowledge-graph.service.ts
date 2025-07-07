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
import { logger } from '@uaip/utils';
import { QdrantService } from '../qdrant.service.js';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
import { EmbeddingService } from './embedding.service.js';
import { ContentClassifier } from './content-classifier.service.js';
import { RelationshipDetector } from './relationship-detector.service.js';
import { ConceptExtractorService } from './concept-extractor.service.js';
import { OntologyBuilderService } from './ontology-builder.service.js';
import { TaxonomyGeneratorService } from './taxonomy-generator.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { KnowledgeSyncService } from './knowledge-sync.service.js';
import { ChatParserService } from './chat-parser.service.js';
import { ChatKnowledgeExtractorService } from './chat-knowledge-extractor.service.js';
import { BatchProcessorService, FileData, ProcessingOptions, BatchResult } from './batch-processor.service.js';
import { QAGeneratorService, GeneratedQA, QAGenerationOptions } from './qa-generator.service.js';
import { WorkflowExtractorService, ExtractedWorkflow, WorkflowExtractionOptions } from './workflow-extractor.service.js';
import { ExpertiseAnalyzerService, ExpertiseProfile, ExpertiseAnalysisOptions } from './expertise-analyzer.service.js';
import { LearningDetectorService, LearningMoment, LearningDetectionOptions } from './learning-detector.service.js';

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
    this.ontologyBuilder = new OntologyBuilderService(this.conceptExtractor, this.repository, this.knowledgeSync);
    this.taxonomyGenerator = new TaxonomyGeneratorService(this.repository, this.classifier);
    this.reconciliationService = new ReconciliationService(this.embeddings, this.repository, this.knowledgeSync);
    
    // Initialize chat services
    this.chatParser = new ChatParserService();
    this.chatKnowledgeExtractor = new ChatKnowledgeExtractorService(this.classifier, this.embeddings);
    this.batchProcessor = new BatchProcessorService(this.chatParser, this.chatKnowledgeExtractor, this);
    
    // Initialize Phase 2 services
    this.qaGenerator = new QAGeneratorService(this.repository, this.classifier, this.embeddings);
    this.workflowExtractor = new WorkflowExtractorService(this.classifier, this.embeddings);
    this.expertiseAnalyzer = new ExpertiseAnalyzerService(this.classifier, this.embeddings);
    this.learningDetector = new LearningDetectorService(this.classifier, this.embeddings);
  }

  /**
   * Primary search interface - used by all UAIP services
   */
  async search(request: KnowledgeSearchRequest & { scope?: KnowledgeScope }): Promise<KnowledgeSearchResponse> {
    const startTime = Date.now();
    const { query, filters, options, scope } = request;
    let filteredResults: KnowledgeItem[] = [];
    let vectorResults: any[] = [];
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
            filteredResults = await this.repository.findByScope(scope || {}, filters, options?.limit || 20);
          } else {
            vectorResults = await this.vectorDb.search(queryEmbedding, {
              limit: options?.limit || 20,
              threshold: options?.similarityThreshold || 0.7,
              filters: vectorFilters
            });
            filteredResults = await this.repository.applyFilters(vectorResults, filters, scope);
          }
        } catch (vectorError) {
          // If vector search fails, fall back to repository search
          console.warn('Vector search failed, falling back to repository search:', vectorError.message);
          filteredResults = await this.repository.findByScope(scope || {}, filters, options?.limit || 20);
        }
      } else {
        // When no query is provided, get all items with scope filtering
        filteredResults = await this.repository.findByScope(scope || {}, filters, options?.limit || 20);
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
   * Add feedback to knowledge items
   */
  async addFeedback(feedback: {
    entityId: string;
    feedbackType: string;
    comments?: string;
    userId: string;
    timestamp: Date;
  }): Promise<void> {
    // Store feedback in repository
    // This is a placeholder implementation
    console.log('Feedback added:', feedback);
  }

  /**
   * Store interaction data
   */
  async storeInteraction(interaction: any): Promise<void> {
    // Store interaction in repository
    // This is a placeholder implementation
    console.log('Interaction stored:', interaction);
  }

  /**
   * Adjust confidence scores
   */
  async adjustConfidence(itemId: string, adjustment: number): Promise<void> {
    // Adjust confidence in repository
    // This is a placeholder implementation
    console.log('Confidence adjusted:', { itemId, adjustment });
  }

  /**
   * Initialize agent context
   */
  async initializeAgentContext(agentId: string, context: any): Promise<void> {
    // Initialize agent context
    // This is a placeholder implementation
    console.log('Agent context initialized:', { agentId, context });
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

  // =====================================================
  // ONTOLOGY METHODS
  // =====================================================

  /**
   * Extract concepts from knowledge items in a domain
   */
  async extractConcepts(domain?: string, options?: { minConfidence?: number; maxItems?: number }) {
    let items: KnowledgeItem[];
    if (domain) {
      items = await this.repository.findByDomain(domain, options?.maxItems);
    } else {
      const allItems = await this.repository.findRecentItems(options?.maxItems || 100);
      items = options?.minConfidence 
        ? allItems.filter(item => item.confidence >= options.minConfidence!)
        : allItems;
    }

    return await this.conceptExtractor.extractConcepts(items, domain);
  }

  /**
   * Build domain ontology from knowledge items
   */
  async buildDomainOntology(domain: string, options?: {
    includeInstances?: boolean;
    minConfidence?: number;
    maxConcepts?: number;
    saveToKnowledgeGraph?: boolean;
  }) {
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
  async generateTaxonomy(domain?: string, options?: {
    maxCategories?: number;
    minCategorySize?: number;
    autoClassify?: boolean;
  }) {
    const items = domain 
      ? await this.repository.findByDomain(domain)
      : await this.repository.findRecentItems(100);

    return await this.taxonomyGenerator.generateTaxonomy(items, domain, options);
  }

  /**
   * Detect and resolve knowledge conflicts
   */
  async detectKnowledgeConflicts(domain?: string, options?: {
    confidenceThreshold?: number;
    similarityThreshold?: number;
    maxConflictsPerBatch?: number;
    autoResolve?: boolean;
  }) {
    const items = domain 
      ? await this.repository.findByDomain(domain)
      : await this.repository.findRecentItems(100);

    return await this.reconciliationService.detectConflicts(items, {
      domains: domain ? [domain] : undefined,
      ...options
    });
  }

  /**
   * Resolve knowledge conflicts
   */
  async resolveKnowledgeConflicts(conflicts: any[], options?: {
    autoResolve?: boolean;
    preserveHistory?: boolean;
    generateSummaries?: boolean;
  }) {
    return await this.reconciliationService.resolveConflicts(conflicts, options);
  }

  /**
   * Merge duplicate knowledge items
   */
  async mergeDuplicates(domain?: string) {
    const items = domain 
      ? await this.repository.findByDomain(domain)
      : await this.repository.findRecentItems(100);

    return await this.reconciliationService.mergeDuplicates(items);
  }

  /**
   * Generate knowledge summaries for clusters
   */
  async generateKnowledgeSummaries(domain?: string) {
    const items = domain 
      ? await this.repository.findByDomain(domain)
      : await this.repository.findRecentItems(100);

    return await this.reconciliationService.generateSummaries(items);
  }

  /**
   * Run comprehensive knowledge reconciliation
   */
  async reconcileKnowledge(domain?: string, options?: {
    includeOntologyBuilding?: boolean;
    includeTaxonomyGeneration?: boolean;
    autoResolveConflicts?: boolean;
  }) {
    const startTime = Date.now();
    const results = {
      domain: domain || 'all',
      conceptExtraction: null as any,
      ontologyBuilding: null as any,
      taxonomyGeneration: null as any,
      conflictDetection: null as any,
      conflictResolution: null as any,
      processingTime: 0
    };

    try {
      // Step 1: Extract concepts
      results.conceptExtraction = await this.extractConcepts(domain);

      // Step 2: Build ontology if requested
      if (options?.includeOntologyBuilding && domain) {
        results.ontologyBuilding = await this.buildDomainOntology(domain, {
          saveToKnowledgeGraph: true
        });
      }

      // Step 3: Generate taxonomy if requested
      if (options?.includeTaxonomyGeneration) {
        results.taxonomyGeneration = await this.generateTaxonomy(domain, {
          autoClassify: true
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
      errors: []
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
          const knowledge = await this.chatKnowledgeExtractor.extractKnowledgeFromConversations(
            [conversation],
            {
              extractQA: true,
              extractDecisions: true,
              extractExpertise: true,
              extractLearning: true
            }
          );

          const knowledgeCount = knowledge.extractedKnowledge.length +
            knowledge.qaPairs.length +
            knowledge.decisionPoints.length +
            knowledge.expertiseAreas.length +
            knowledge.learningMoments.length;

          totalKnowledgeExtracted += knowledgeCount;

          // Save to knowledge graph if requested
          if (options.saveToGraph !== false) {
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
  async generateQAFromKnowledge(domain?: string, options?: QAGenerationOptions): Promise<GeneratedQA[]> {
    try {
      const items = domain 
        ? await this.repository.findByDomain(domain)
        : await this.repository.findRecentItems(options?.maxPairs || 100);

      return await this.qaGenerator.generateFromKnowledge(items, options);
    } catch (error) {
      logger.error('Failed to generate Q&A from knowledge', { error: error.message, domain });
      throw error;
    }
  }

  /**
   * Extract workflows from chat conversations
   */
  async extractWorkflowsFromChats(conversations: any[], options?: WorkflowExtractionOptions): Promise<ExtractedWorkflow[]> {
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
  async analyzeParticipantExpertise(conversations: any[], options?: ExpertiseAnalysisOptions): Promise<ExpertiseProfile[]> {
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
  async detectLearningMoments(conversations: any[], options?: LearningDetectionOptions): Promise<LearningMoment[]> {
    try {
      // Extract all messages from conversations
      const allMessages = conversations.flatMap(conv => conv.messages || []);
      return await this.learningDetector.detectLearningMoments(allMessages, options);
    } catch (error) {
      logger.error('Failed to detect learning moments', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate Q&A pairs from conversations
   */
  async generateQAFromConversations(conversations: any[], options?: QAGenerationOptions): Promise<GeneratedQA[]> {
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
      const conversations = []; // Would get from repository with time filter
      const allMessages = conversations.flatMap(conv => conv.messages || []);
      
      const moments = await this.learningDetector.detectLearningMoments(allMessages, {
        participants: [participant],
        timeWindow
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
  async generateLearningInsights(conversations: any[], options?: LearningDetectionOptions) {
    try {
      const allMessages = conversations.flatMap(conv => conv.messages || []);
      const moments = await this.learningDetector.detectLearningMoments(allMessages, options);
      const transfers = await this.learningDetector.identifyKnowledgeTransfer(conversations, options);
      
      return await this.learningDetector.generateLearningInsights(moments, [], transfers);
    } catch (error) {
      logger.error('Failed to generate learning insights', { error: error.message });
      throw error;
    }
  }

  /**
   * Save extracted knowledge to the knowledge graph
   */
  private async saveExtractedKnowledge(knowledge: any, userId: string): Promise<void> {
    const savePromises: Promise<any>[] = [];

    // Save extracted knowledge (replaces facts and procedures)
    if (knowledge.extractedKnowledge?.length > 0) {
      savePromises.push(
        ...knowledge.extractedKnowledge.map(item =>
          this.ingest([{
            content: item.content,
            type: item.type,
            confidence: item.confidence,
            tags: item.tags,
            source: {
              type: 'AGENT_INTERACTION' as any,
              identifier: 'chat-ingestion',
              metadata: {
                context: item.context,
                extractedFrom: 'chat',
                extractionMethod: item.metadata.extractionMethod,
                sourceMessages: item.metadata.sourceMessages,
                participants: item.metadata.participants,
                domain: item.metadata.domain
              }
            },
            createdBy: userId
          }])
        )
      );
    }


    // Save Q&A pairs
    if (knowledge.qaPairs?.length > 0) {
      savePromises.push(
        ...knowledge.qaPairs.map(qa =>
          this.ingest([{
            content: `Q: ${qa.question}\nA: ${qa.answer}`,
            type: 'PROCEDURAL' as any,
            confidence: qa.confidence,
            tags: qa.tags,
            source: {
              type: 'AGENT_INTERACTION' as any,
              identifier: 'chat-qa-extraction',
              metadata: {
                question: qa.question,
                answer: qa.answer,
                context: qa.context,
                participants: qa.participants,
                extractedFrom: 'chat'
              }
            },
            createdBy: userId
          }])
        )
      );
    }

    // Save decision points
    if (knowledge.decisionPoints?.length > 0) {
      savePromises.push(
        ...knowledge.decisionPoints.map(decision =>
          this.ingest([{
            content: decision.decision,
            type: 'EXPERIENTIAL' as any,
            confidence: decision.confidence,
            source: {
              type: 'AGENT_INTERACTION' as any,
              identifier: 'chat-decision-extraction',
              metadata: {
                reasoning: decision.reasoning,
                alternatives: decision.alternatives,
                outcome: decision.outcome,
                context: decision.context,
                participants: decision.participants,
                extractedFrom: 'chat'
              }
            },
            createdBy: userId
          }])
        )
      );
    }

    // Execute all save operations
    await Promise.allSettled(savePromises);
  }
} 