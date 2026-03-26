// Main service
export { KnowledgeGraphService } from './knowledge_graph_service.js';

// Sync services
export { KnowledgeSyncService } from './knowledge_sync_service.js';
export { KnowledgeBootstrapService } from './bootstrap_service.js';

// Supporting services
export { QdrantService } from '@/knowledge-graph/qdrant_service';
export { KnowledgeRepository } from '@uaip/shared-services';
export { EmbeddingService } from './embedding_service.js';
export { TEIEmbeddingService } from './tei_embedding_service.js';
export { SmartEmbeddingService } from './smart_embedding_service.js';
export { EnhancedRAGService } from './enhanced_rag_service.js';
export { ContentClassifier } from './content_classifier_service.js';
export { RelationshipDetector } from './relationship_detector_service.js';

// Ontology services
export { ConceptExtractorService } from './concept_extractor_service.js';
export { OntologyBuilderService } from './ontology_builder_service.js';
export { TaxonomyGeneratorService } from './taxonomy_generator_service.js';
export { ReconciliationService } from './reconciliation_service.js';

// Health and diagnostics
export { QdrantHealthService } from './qdrant_health_service.js';

// Chat ingestion services
export { ChatParserService } from './chat_parser_service.js';
export { ChatKnowledgeExtractorService } from './chat_knowledge_extractor_service.js';
export { BatchProcessorService } from './batch_processor_service.js';
export {
  ChatIngestionMiddleware,
  createChatIngestionMiddleware,
} from './chat_ingestion_middleware.js';

// Phase 2: Knowledge Enhancement services
export { QAGeneratorService } from './qa_generator_service.js';
export { WorkflowExtractorService } from './workflow_extractor_service.js';
export { ExpertiseAnalyzerService } from './expertise_analyzer_service.js';
export { LearningDetectorService } from './learning_detector_service.js';

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
} from './production_hardening_service.js';

// Entities

// Module
