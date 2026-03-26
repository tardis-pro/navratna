// Main service
export { KnowledgeGraphService } from './knowledge_graph_service';

// Sync services
export { KnowledgeSyncService } from './knowledge_sync_service';
export { KnowledgeBootstrapService } from './bootstrap_service';

// Supporting services
export { QdrantService } from '../qdrant_service';
export { KnowledgeRepository } from '../database/repositories/knowledge_repository';
export { EmbeddingService } from './embedding_service';
export { TEIEmbeddingService } from './tei_embedding_service';
export { SmartEmbeddingService } from './smart_embedding_service';
export { EnhancedRAGService } from './enhanced_rag_service';
export { ContentClassifier } from './content_classifier_service';
export { RelationshipDetector } from './relationship_detector_service';

// Ontology services
export { ConceptExtractorService } from './concept_extractor_service';
export { OntologyBuilderService } from './ontology_builder_service';
export { TaxonomyGeneratorService } from './taxonomy_generator_service';
export { ReconciliationService } from './reconciliation_service';

// Health and diagnostics
export { QdrantHealthService } from './qdrant_health_service';

// Chat ingestion services
export { ChatParserService } from './chat_parser_service';
export { ChatKnowledgeExtractorService } from './chat_knowledge_extractor_service';
export { BatchProcessorService } from './batch_processor_service';
export type { KnowledgeIngestionPort } from './knowledge_ingestion_port';
export {
  ChatIngestionMiddleware,
  createChatIngestionMiddleware,
} from './chat_ingestion_middleware';

// Phase 2: Knowledge Enhancement services
export { QAGeneratorService } from './qa_generator_service';
export { WorkflowExtractorService } from './workflow_extractor_service';
export { ExpertiseAnalyzerService } from './expertise_analyzer_service';
export { LearningDetectorService } from './learning_detector_service';

// Production Hardening services
export {
  ProductionHardeningService,
  CircuitBreaker,
  RetryManager,
  RateLimiter,
  HealthCheckManager,
  MetricsCollector,
  SecurityValidator,
  productionHardening,
} from './production_hardening_service';

// Entities

// Module
