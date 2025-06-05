// Main service
export { KnowledgeGraphService } from './knowledge-graph.service.js';

// Supporting services
export { QdrantService } from './qdrant.service.js';
export { KnowledgeRepository } from './knowledge.repository.js';
export { EmbeddingService } from './embedding.service.js';
export { ContentClassifier } from './content-classifier.service.js';
export { RelationshipDetector } from './relationship-detector.service.js';

// Entities
export { KnowledgeItemEntity } from './entities/knowledge-item.entity.js';
export { KnowledgeRelationshipEntity } from './entities/knowledge-relationship.entity.js';

// Module
