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

// Entities

// Module
