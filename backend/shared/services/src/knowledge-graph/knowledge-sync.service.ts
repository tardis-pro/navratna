import { v4 as uuidv4 } from 'uuid';
import { KnowledgeItem, KnowledgeRelationship, KnowledgeType, SourceType } from '@uaip/types';
import { KnowledgeItemEntity } from '../entities/knowledge-item.entity.js';
import { KnowledgeRelationshipEntity } from '../entities/knowledge-relationship.entity.js';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
import { QdrantService } from '../qdrant.service.js';
import { ToolGraphDatabase } from '../database/toolGraphDatabase.js';
import { EmbeddingService } from './embedding.service.js';
import { logger } from '@uaip/utils';

export interface KnowledgeSyncResult {
  success: boolean;
  knowledgeItemId: string;
  postgresId?: string;
  neo4jSynced: boolean;
  qdrantSynced: boolean;
  error?: string;
}

export interface UniversalSyncResult {
  totalFound: number;
  totalSynced: number;
  totalFailed: number;
  syncedFromPostgres: number;
  syncedFromNeo4j: number;
  syncedFromQdrant: number;
  errors: string[];
}

export interface KnowledgeBootstrapResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  errors: string[];
}

export class KnowledgeSyncService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly qdrantService: QdrantService,
    private readonly graphDb: ToolGraphDatabase,
    private readonly embeddingService: EmbeddingService
  ) {}

  /**
   * Universal sync: Read data from all sources and sync bidirectionally
   * Handles any combination of existing data in PostgreSQL, Neo4j, or Qdrant
   */
  async universalSync(): Promise<UniversalSyncResult> {
    logger.info('Starting universal knowledge graph synchronization');
    
    const result: UniversalSyncResult = {
      totalFound: 0,
      totalSynced: 0,
      totalFailed: 0,
      syncedFromPostgres: 0,
      syncedFromNeo4j: 0,
      syncedFromQdrant: 0,
      errors: []
    };

    try {
      // 1. Discover all unique knowledge items across all systems
      const allItems = await this.discoverAllKnowledgeItems();
      result.totalFound = allItems.size;
      
      logger.info(`Discovered ${allItems.size} unique knowledge items across all systems`);

      // 2. Process each unique item and sync to missing systems
      const batchSize = 10;
      const itemArray = Array.from(allItems.values());
      
      for (let i = 0; i < itemArray.length; i += batchSize) {
        const batch = itemArray.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (item) => {
          try {
            const syncResult = await this.syncUniversalItem(item);
            if (syncResult.success) {
              result.totalSynced++;
              if (item.source === 'postgres') result.syncedFromPostgres++;
              if (item.source === 'neo4j') result.syncedFromNeo4j++;
              if (item.source === 'qdrant') result.syncedFromQdrant++;
            } else {
              result.totalFailed++;
              result.errors.push(`Item ${item.id}: ${syncResult.error}`);
            }
          } catch (error) {
            result.totalFailed++;
            result.errors.push(`Item ${item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        });

        await Promise.allSettled(batchPromises);
        
        // Brief pause between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 3. Sync relationships after all items are processed
      await this.syncAllRelationships();

      logger.info(`Universal sync completed. Found: ${result.totalFound}, Synced: ${result.totalSynced}, Failed: ${result.totalFailed}`);
      return result;

    } catch (error) {
      logger.error('Universal sync failed:', error);
      result.errors.push(`Universal sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Legacy bootstrap sync - now calls universal sync for backward compatibility
   */
  async bootstrapSync(): Promise<KnowledgeBootstrapResult> {
    const universalResult = await this.universalSync();
    
    return {
      totalProcessed: universalResult.totalFound,
      successful: universalResult.totalSynced,
      failed: universalResult.totalFailed,
      errors: universalResult.errors
    };
  }

  /**
   * Sync a single knowledge item across all three systems
   * Continues forward even if individual systems fail - system will self-improve over time
   */
  async syncKnowledgeItem(item: KnowledgeItemEntity): Promise<KnowledgeSyncResult> {
    const result: KnowledgeSyncResult = {
      success: false,
      knowledgeItemId: item.id,
      neo4jSynced: false,
      qdrantSynced: false
    };

    // 1. PostgreSQL UUID (should already exist)
    result.postgresId = item.id;

    // 2. Try to sync to Neo4j - continue if fails
    try {
      await this.syncToNeo4j(item);
      result.neo4jSynced = true;
      logger.debug(`Neo4j sync successful for ${item.id}`);
    } catch (error) {
      logger.warn(`Neo4j sync failed for ${item.id}, continuing:`, error);
    }

    // 3. Try to sync to Qdrant - continue if fails
    try {
      await this.syncToQdrant(item);
      result.qdrantSynced = true;
      logger.debug(`Qdrant sync successful for ${item.id}`);
    } catch (error) {
      logger.warn(`Qdrant sync failed for ${item.id}, continuing:`, error);
    }

    // Success if at least one system synced (PostgreSQL always exists)
    result.success = result.neo4jSynced || result.qdrantSynced;
    
    if (!result.success) {
      result.error = 'All sync operations failed, but item exists in PostgreSQL';
      logger.warn(`All sync operations failed for ${item.id}, but PostgreSQL record exists`);
    }

    return result;
  }

  /**
   * Create or update a knowledge item in all three systems
   */
  async createKnowledgeItem(
    content: string,
    type: KnowledgeType,
    metadata: Record<string, any> = {},
    userId?: string,
    agentId?: string
  ): Promise<KnowledgeSyncResult> {
    const itemId = uuidv4();
    
    try {
      // 1. Create in PostgreSQL first
      const knowledgeItem = await this.knowledgeRepository.create({
        content,
        type,
        source: {
          type: SourceType.USER_INPUT,
          identifier: `direct-${itemId}`,
          metadata
        },
        tags: metadata.tags || [],
        confidence: metadata.confidence || 0.8,
        accessLevel: metadata.accessLevel || 'STANDARD',
        userId,
        agentId
      });

      // 2. Sync to other systems
      return await this.syncKnowledgeItem(knowledgeItem);

    } catch (error) {
      logger.error(`Failed to create knowledge item:`, error);
      return {
        success: false,
        knowledgeItemId: itemId,
        neo4jSynced: false,
        qdrantSynced: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Sync knowledge item to Neo4j
   */
  private async syncToNeo4j(item: KnowledgeItemEntity): Promise<void> {
    const cypher = `
      MERGE (k:KnowledgeItem {id: $id})
      SET k.content = $content,
          k.type = $type,
          k.sourceType = $sourceType,
          k.sourceIdentifier = $sourceIdentifier,
          k.tags = $tags,
          k.confidence = $confidence,
          k.metadata = $metadata,
          k.accessLevel = $accessLevel,
          k.summary = $summary,
          k.createdAt = $createdAt,
          k.updatedAt = $updatedAt
      RETURN k
    `;

    const params = {
      id: item.id,
      content: item.content,
      type: item.type,
      sourceType: item.sourceType,
      sourceIdentifier: item.sourceIdentifier,
      tags: item.tags,
      confidence: item.confidence,
      metadata: JSON.stringify(item.metadata),
      accessLevel: item.accessLevel,
      summary: item.summary,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    };

    await this.graphDb.runQuery(cypher, params);

    // Create user/agent relationships if they exist
    if (item.userId) {
      await this.createUserKnowledgeRelationship(item.userId, item.id);
    }
    
    if (item.agentId) {
      await this.createAgentKnowledgeRelationship(item.agentId, item.id);
    }
  }

  /**
   * Sync knowledge item to Qdrant with UUID metadata
   */
  private async syncToQdrant(item: KnowledgeItemEntity): Promise<void> {
    // Generate embedding for the content
    const embedding = await this.embeddingService.generateEmbedding(item.content);

    // Create point with UUID in metadata
    const point = {
      id: item.id, // Use UUID as Qdrant point ID
      vector: embedding,
      payload: {
        knowledge_item_id: item.id,
        content: item.content,
        type: item.type,
        tags: item.tags,
        confidence: item.confidence,
        user_id: item.userId,
        agent_id: item.agentId,
        access_level: item.accessLevel,
        created_at: item.createdAt.toISOString(),
        updated_at: item.updatedAt.toISOString()
      }
    };

    // Store in Qdrant
    await this.qdrantService.upsertPoints([point]);
  }

  /**
   * Create user-knowledge relationship in Neo4j
   */
  private async createUserKnowledgeRelationship(userId: string, knowledgeId: string): Promise<void> {
    const cypher = `
      MATCH (u:User {id: $userId})
      MATCH (k:KnowledgeItem {id: $knowledgeId})
      MERGE (u)-[:OWNS]->(k)
    `;

    await this.graphDb.runQuery(cypher, { userId, knowledgeId });
  }

  /**
   * Create agent-knowledge relationship in Neo4j
   */
  private async createAgentKnowledgeRelationship(agentId: string, knowledgeId: string): Promise<void> {
    const cypher = `
      MATCH (a:Agent {id: $agentId})
      MATCH (k:KnowledgeItem {id: $knowledgeId})
      MERGE (a)-[:KNOWS]->(k)
    `;

    await this.graphDb.runQuery(cypher, { agentId, knowledgeId });
  }

  /**
   * Sync all knowledge relationships to Neo4j
   */
  private async syncAllRelationships(): Promise<void> {
    logger.info('Syncing knowledge relationships to Neo4j');
    
    const relationships = await this.knowledgeRepository.findAllRelationships();
    
    for (const rel of relationships) {
      await this.syncRelationshipToNeo4j(rel);
    }
    
    logger.info(`Synced ${relationships.length} knowledge relationships`);
  }

  /**
   * Sync a single relationship to Neo4j
   */
  private async syncRelationshipToNeo4j(rel: KnowledgeRelationshipEntity): Promise<void> {
    const cypher = `
      MATCH (source:KnowledgeItem {id: $sourceId})
      MATCH (target:KnowledgeItem {id: $targetId})
      MERGE (source)-[r:RELATES_TO {type: $relType}]->(target)
      SET r.confidence = $confidence,
          r.summary = $summary,
          r.created_at = $createdAt,
          r.updated_at = $updatedAt
      RETURN r
    `;

    const params = {
      sourceId: rel.sourceItemId,
      targetId: rel.targetItemId,
      relType: rel.relationshipType,
      confidence: rel.confidence,
      summary: rel.summary,
      createdAt: rel.createdAt.toISOString(),
      updatedAt: rel.updatedAt.toISOString()
    };

    await this.graphDb.runQuery(cypher, params);
  }

  /**
   * Remove knowledge item from all systems
   */
  async deleteKnowledgeItem(itemId: string): Promise<void> {
    try {
      // Delete from PostgreSQL (cascade relationships)
      await this.knowledgeRepository.delete(itemId);

      // Delete from Neo4j
      await this.graphDb.runQuery(`
        MATCH (k:KnowledgeItem {id: $id})
        DETACH DELETE k
      `, { id: itemId });

      // Delete from Qdrant
      await this.qdrantService.deletePoints([itemId]);

      logger.info(`Successfully deleted knowledge item ${itemId} from all systems`);
    } catch (error) {
      logger.error(`Failed to delete knowledge item ${itemId}:`, error);
      throw error;
    }
  }

  /**
   * Discover all unique knowledge items across all three systems
   */
  private async discoverAllKnowledgeItems(): Promise<Map<string, UniversalKnowledgeItem>> {
    const itemsMap = new Map<string, UniversalKnowledgeItem>();

    // 1. Discover from PostgreSQL
    try {
      const pgItems = await this.knowledgeRepository.findAll();
      for (const item of pgItems) {
        itemsMap.set(item.id, {
          id: item.id,
          content: item.content,
          type: item.type,
          metadata: item.metadata,
          source: 'postgres',
          existsIn: { postgres: true, neo4j: false, qdrant: false },
          pgEntity: item
        });
      }
      logger.info(`Found ${pgItems.length} items in PostgreSQL`);
    } catch (error) {
      logger.warn('Failed to discover PostgreSQL items:', error);
    }

    // 2. Discover from Neo4j
    try {
      const neo4jResult = await this.graphDb.runQuery(`
        MATCH (k:KnowledgeItem) 
        RETURN k.id as id, k.content as content, k.type as type, k.metadata as metadata
      `, {});
      
      for (const record of neo4jResult.records) {
        const id = record.get('id');
        const content = record.get('content');
        const type = record.get('type');
        const metadata = record.get('metadata');
        
        if (itemsMap.has(id)) {
          itemsMap.get(id)!.existsIn.neo4j = true;
        } else {
          itemsMap.set(id, {
            id,
            content,
            type,
            metadata: metadata ? JSON.parse(metadata) : {},
            source: 'neo4j',
            existsIn: { postgres: false, neo4j: true, qdrant: false }
          });
        }
      }
      logger.info(`Found ${neo4jResult.records.length} items in Neo4j`);
    } catch (error) {
      logger.warn('Failed to discover Neo4j items:', error);
    }

    // 3. Discover from Qdrant
    try {
      // Get collection info to see how many points we have
      const collectionInfo = await this.qdrantService.getCollectionInfo();
      const pointsCount = collectionInfo.result?.points_count || 0;
      
      if (pointsCount > 0) {
        // Use scroll to get all points (Qdrant doesn't have a "get all" method)
        const qdrantPoints = await this.scrollAllQdrantPoints();
        
        for (const point of qdrantPoints) {
          const id = point.payload?.knowledge_item_id;
          if (!id) continue;
          
          if (itemsMap.has(id)) {
            itemsMap.get(id)!.existsIn.qdrant = true;
          } else {
            itemsMap.set(id, {
              id,
              content: point.payload?.content || '',
              type: point.payload?.type || 'FACTUAL',
              metadata: {},
              source: 'qdrant',
              existsIn: { postgres: false, neo4j: false, qdrant: true },
              qdrantPayload: point.payload
            });
          }
        }
        logger.info(`Found ${qdrantPoints.length} items in Qdrant`);
      }
    } catch (error) {
      logger.warn('Failed to discover Qdrant items:', error);
    }

    return itemsMap;
  }

  /**
   * Sync a universal knowledge item to all missing systems
   */
  private async syncUniversalItem(item: UniversalKnowledgeItem): Promise<KnowledgeSyncResult> {
    const result: KnowledgeSyncResult = {
      success: false,
      knowledgeItemId: item.id,
      neo4jSynced: item.existsIn.neo4j,
      qdrantSynced: item.existsIn.qdrant
    };

    try {
      // 1. Ensure item exists in PostgreSQL
      if (!item.existsIn.postgres) {
        await this.createInPostgres(item);
        result.postgresId = item.id;
      } else {
        result.postgresId = item.id;
      }

      // 2. Sync to Neo4j if missing
      if (!item.existsIn.neo4j) {
        const entity = item.pgEntity || await this.createKnowledgeEntityFromItem(item);
        await this.syncToNeo4j(entity);
        result.neo4jSynced = true;
      }

      // 3. Sync to Qdrant if missing
      if (!item.existsIn.qdrant) {
        const entity = item.pgEntity || await this.createKnowledgeEntityFromItem(item);
        await this.syncToQdrant(entity);
        result.qdrantSynced = true;
      }

      result.success = true;

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to sync universal item ${item.id}:`, error);
    }

    return result;
  }

  /**
   * Scroll through all Qdrant points (since there's no "get all" method)
   */
  private async scrollAllQdrantPoints(): Promise<any[]> {
    // This is a simplified version - in practice you'd use Qdrant's scroll API
    // For now, we'll use a high limit search with a dummy vector
    try {
      const dummyVector = new Array(768).fill(0); // Adjust dimensions as needed
      const searchResult = await this.qdrantService.search(dummyVector, {
        limit: 10000, // High limit to get all points
        threshold: 0, // Very low threshold to get all points
        filters: {}
      });
      
      return searchResult;
    } catch (error) {
      logger.warn('Failed to scroll Qdrant points:', error);
      return [];
    }
  }

  /**
   * Create a knowledge item in PostgreSQL from universal item
   */
  private async createInPostgres(item: UniversalKnowledgeItem): Promise<void> {
    await this.knowledgeRepository.create({
      content: item.content,
      type: item.type,
      source: {
        type: SourceType.EXTERNAL_API,
        identifier: `sync-${item.source}-${item.id}`,
        metadata: item.metadata
      },
      tags: [],
      confidence: 0.8,
      accessLevel: 'STANDARD'
    });
  }

  /**
   * Create a KnowledgeItemEntity from universal item
   */
  private async createKnowledgeEntityFromItem(item: UniversalKnowledgeItem): Promise<KnowledgeItemEntity> {
    if (item.pgEntity) {
      return item.pgEntity;
    }

    // If no PostgreSQL entity, create a temporary one for sync
    const entity = new KnowledgeItemEntity();
    entity.id = item.id;
    entity.content = item.content;
    entity.type = item.type;
    entity.sourceType = 'UNIVERSAL_SYNC' as any;
    entity.sourceIdentifier = `sync-${item.source}-${item.id}`;
    entity.tags = [];
    entity.confidence = 0.8;
    entity.metadata = item.metadata;
    entity.accessLevel = 'STANDARD';
    entity.createdAt = new Date();
    entity.updatedAt = new Date();

    return entity;
  }

  /**
   * Verify sync status for a knowledge item
   */
  async verifySyncStatus(itemId: string): Promise<{
    postgres: boolean;
    neo4j: boolean;
    qdrant: boolean;
  }> {
    const status = { postgres: false, neo4j: false, qdrant: false };

    try {
      // Check PostgreSQL
      const pgItem = await this.knowledgeRepository.findById(itemId);
      status.postgres = !!pgItem;

      // Check Neo4j
      const neo4jResult = await this.graphDb.runQuery(`
        MATCH (k:KnowledgeItem {id: $id}) RETURN k LIMIT 1
      `, { id: itemId });
      status.neo4j = neo4jResult.records.length > 0;

      // Check Qdrant
      const qdrantResult = await this.qdrantService.getPoints([itemId]);
      status.qdrant = qdrantResult.length > 0;

    } catch (error) {
      logger.error(`Error verifying sync status for ${itemId}:`, error);
    }

    return status;
  }
}

interface UniversalKnowledgeItem {
  id: string;
  content: string;
  type: KnowledgeType;
  metadata: Record<string, any>;
  source: 'postgres' | 'neo4j' | 'qdrant';
  existsIn: {
    postgres: boolean;
    neo4j: boolean;
    qdrant: boolean;
  };
  pgEntity?: KnowledgeItemEntity;
  qdrantPayload?: any;
}