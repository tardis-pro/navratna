// Main service
export { KnowledgeGraphService } from './knowledge-graph.service.js';

// Sync services
export { KnowledgeSyncService } from './knowledge-sync.service.js';
export { KnowledgeBootstrapService } from './bootstrap.service.js';

// Supporting services
export { QdrantService } from '../qdrant.service.js';
export { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
export { EmbeddingService } from './embedding.service.js';
export { TEIEmbeddingService } from './tei-embedding.service.js';
export { SmartEmbeddingService } from './smart-embedding.service.js';
export { EnhancedRAGService } from './enhanced-rag.service.js';
export { ContentClassifier } from './content-classifier.service.js';
export { RelationshipDetector } from './relationship-detector.service.js';

// Ontology services
export { ConceptExtractorService } from './concept-extractor.service.js';
export { OntologyBuilderService } from './ontology-builder.service.js';
export { TaxonomyGeneratorService } from './taxonomy-generator.service.js';
export { ReconciliationService } from './reconciliation.service.js';

// Health and diagnostics
export { QdrantHealthService } from './qdrant-health.service.js';

// Chat ingestion services
export { ChatParserService } from './chat-parser.service.js';
export { ChatKnowledgeExtractorService } from './chat-knowledge-extractor.service.js';
export { BatchProcessorService } from './batch-processor.service.js';
export { ChatIngestionMiddleware, createChatIngestionMiddleware } from './chat-ingestion.middleware.js';

// Phase 2: Knowledge Enhancement services
export { QAGeneratorService } from './qa-generator.service.js';
export { WorkflowExtractorService } from './workflow-extractor.service.js';
export { ExpertiseAnalyzerService } from './expertise-analyzer.service.js';
export { LearningDetectorService } from './learning-detector.service.js';

// Production Hardening services
export { 
  ProductionHardeningService, 
  CircuitBreaker, 
  RetryManager, 
  RateLimiter, 
  HealthCheckManager, 
  MetricsCollector, 
  SecurityValidator,
  productionHardening 
} from './production-hardening.service.js';

// Entities

// Module
