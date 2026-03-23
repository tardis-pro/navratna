// Main service
export { KnowledgeGraphService } from './knowledge-graph.service';

// Sync services
export { KnowledgeSyncService } from './knowledge-sync.service';
export { KnowledgeBootstrapService } from './bootstrap.service';

// Supporting services
export { QdrantService } from '../qdrant.service';
export { KnowledgeRepository } from '../database/repositories/knowledge.repository';
export { EmbeddingService } from './embedding.service';
export { TEIEmbeddingService } from './tei-embedding.service';
export { SmartEmbeddingService } from './smart-embedding.service';
export { EnhancedRAGService } from './enhanced-rag.service';
export { ContentClassifier } from './content-classifier.service';
export { RelationshipDetector } from './relationship-detector.service';

// Ontology services
export { ConceptExtractorService } from './concept-extractor.service';
export { OntologyBuilderService } from './ontology-builder.service';
export { TaxonomyGeneratorService } from './taxonomy-generator.service';
export { ReconciliationService } from './reconciliation.service';

// Health and diagnostics
export { QdrantHealthService } from './qdrant-health.service';

// Chat ingestion services
export { ChatParserService } from './chat-parser.service';
export { ChatKnowledgeExtractorService } from './chat-knowledge-extractor.service';
export { BatchProcessorService } from './batch-processor.service';
export { KnowledgeIngestionPort } from './knowledge-ingestion.port';
export {
  ChatIngestionMiddleware,
  createChatIngestionMiddleware,
} from './chat-ingestion.middleware';

// Phase 2: Knowledge Enhancement services
export { QAGeneratorService } from './qa-generator.service';
export { WorkflowExtractorService } from './workflow-extractor.service';
export { ExpertiseAnalyzerService } from './expertise-analyzer.service';
export { LearningDetectorService } from './learning-detector.service';

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
} from './production-hardening.service';

// Entities

// Module
