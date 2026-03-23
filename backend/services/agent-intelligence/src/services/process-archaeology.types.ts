export interface DataSource {
  id: string;
  type: 'database' | 'api' | 'file' | 'repository' | 'saas';
  name: string;
  connectionConfig: Record<string, unknown>;
  status: 'pending' | 'crawling' | 'analyzed' | 'failed';
}

export interface DiscoveredEntity {
  id: string;
  sourceId: string;
  name: string;
  type: 'field' | 'table' | 'endpoint' | 'file' | 'concept';
  metadata: Record<string, unknown>;
  sampleValues?: string[];
}

export interface EntityRelationship {
  entityA: string;
  entityB: string;
  relationshipType: 'same_entity' | 'parent_child' | 'reference' | 'derived' | 'unknown';
  confidence: number;
  evidence: string;
}

export interface OntologyProposal {
  id: string;
  entities: DiscoveredEntity[];
  relationships: EntityRelationship[];
  suggestedMerges: Array<{
    entities: string[];
    proposedName: string;
    confidence: number;
    reason: string;
  }>;
  missingConnections: string[];
  createdAt: Date;
}
