import { v4 as uuidv4 } from 'uuid';
import { KnowledgeItem, KnowledgeRelationship, KnowledgeType, SourceType } from '@uaip/types';
import { KnowledgeItemEntity } from '../entities/knowledge-item.entity.js';
import { KnowledgeRelationshipEntity } from '../entities/knowledge-relationship.entity.js';
import { UserEntity } from '../entities/user.entity.js';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
import { QdrantService } from '../qdrant.service.js';
import { ToolGraphDatabase } from '../database/toolGraphDatabase.js';
import { EmbeddingService } from './embedding.service.js';
import { logger } from '@uaip/utils';

export interface KnowledgeSyncResult {
  success: boolean;
  knowledgeItemId: string;
  postgresId?: string;
  neo4jSynced?: boolean;
  qdrantSynced?: boolean;
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
    private readonly embeddingService: EmbeddingService,
    private readonly userRepository: any // Will be properly typed later
  ) {}

  /**
   * Sync knowledge item with user persona context
   * Enhances knowledge items with user behavioral patterns and preferences
   */
  async syncWithUserPersona(knowledgeItemId: string, userId: string): Promise<KnowledgeSyncResult> {
    try {
      // Get knowledge item and user data
      const knowledgeItem = await this.knowledgeRepository.findById(knowledgeItemId);
      const user = await this.userRepository.findById(userId);

      if (!knowledgeItem || !user) {
        return {
          success: false,
          knowledgeItemId,
          error: 'Knowledge item or user not found',
        };
      }

      // Enhance knowledge item with user persona context
      const enhancedMetadata = {
        ...knowledgeItem.metadata,
        userPersona: {
          workStyle: user.userPersona?.workStyle,
          domainExpertise: user.userPersona?.domainExpertise,
          communicationPreference: user.userPersona?.communicationPreference,
          workflowStyle: user.userPersona?.workflowStyle,
          learningStyle: user.userPersona?.learningStyle,
        },
        userContext: {
          userId: user.id,
          userRole: user.role,
          department: user.department,
          activeHours: user.behavioralPatterns?.activeHours,
          preferredTools: user.behavioralPatterns?.frequentlyUsedTools,
          interactionStyle: user.behavioralPatterns?.interactionStyle,
        },
        personaRelevance: this.calculatePersonaRelevance(knowledgeItem, user),
      };

      // Update knowledge item with enhanced metadata
      await this.knowledgeRepository.update(knowledgeItemId, {
        metadata: enhancedMetadata,
      });

      // Sync to Neo4j with persona relationships
      await this.syncToNeo4jWithPersona(knowledgeItem, user);

      // Sync to Qdrant with persona-weighted embeddings
      await this.syncToQdrantWithPersona(knowledgeItem, user);

      logger.info('Knowledge item synced with user persona context', {
        knowledgeItemId,
        userId,
        personaRelevance: enhancedMetadata.personaRelevance,
      });

      return {
        success: true,
        knowledgeItemId,
        neo4jSynced: true,
        qdrantSynced: true,
      };
    } catch (error) {
      logger.error('Error syncing knowledge item with user persona', {
        knowledgeItemId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        knowledgeItemId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Calculate persona relevance score based on user characteristics
   */
  private calculatePersonaRelevance(knowledgeItem: KnowledgeItemEntity, user: UserEntity): number {
    let relevanceScore = 0.5; // Base relevance

    const persona = user.userPersona;
    const behavioral = user.behavioralPatterns;

    if (!persona) return relevanceScore;

    // Domain expertise alignment
    if (persona.domainExpertise && knowledgeItem.tags) {
      const expertiseMatch = knowledgeItem.tags.some((tag) =>
        persona.domainExpertise.some(
          (domain) =>
            tag.toLowerCase().includes(domain.toLowerCase()) ||
            domain.toLowerCase().includes(tag.toLowerCase())
        )
      );
      if (expertiseMatch) relevanceScore += 0.3;
    }

    // Communication preference alignment
    if (persona.communicationPreference) {
      const contentLength = knowledgeItem.content.length;
      if (persona.communicationPreference === 'brief' && contentLength < 500) {
        relevanceScore += 0.1;
      } else if (persona.communicationPreference === 'detailed' && contentLength > 1000) {
        relevanceScore += 0.1;
      }
    }

    // Workflow style alignment
    if (persona.workflowStyle === 'structured' && knowledgeItem.type === KnowledgeType.PROCEDURAL) {
      relevanceScore += 0.1;
    }

    // Behavioral pattern alignment
    if (behavioral?.frequentlyUsedTools && knowledgeItem.tags) {
      const toolMatch = knowledgeItem.tags.some((tag) =>
        behavioral.frequentlyUsedTools.some((tool) =>
          tag.toLowerCase().includes(tool.toLowerCase())
        )
      );
      if (toolMatch) relevanceScore += 0.2;
    }

    return Math.min(1.0, relevanceScore);
  }

  /**
   * Sync knowledge item to Neo4j with persona-based relationships
   */
  private async syncToNeo4jWithPersona(
    knowledgeItem: KnowledgeItemEntity,
    user: UserEntity
  ): Promise<void> {
    try {
      // Create or update knowledge node
      await this.graphDb.runQuery(
        `
        MERGE (k:Knowledge {id: $knowledgeId})
        SET k.content = $content,
            k.type = $type,
            k.tags = $tags,
            k.confidence = $confidence,
            k.updatedAt = datetime(),
            k.userId = $userId,
            k.userRole = $userRole,
            k.department = $department
      `,
        {
          knowledgeId: knowledgeItem.id,
          content: knowledgeItem.content,
          type: knowledgeItem.type,
          tags: knowledgeItem.tags,
          confidence: knowledgeItem.confidence,
          userId: user.id,
          userRole: user.role,
          department: user.department,
        }
      );

      // Create persona-based relationships
      if (user.userPersona?.domainExpertise) {
        for (const domain of user.userPersona.domainExpertise) {
          await this.graphDb.runQuery(
            `
            MATCH (k:Knowledge {id: $knowledgeId})
            MERGE (d:Domain {name: $domain})
            MERGE (k)-[:RELEVANT_TO {relevance: $relevance}]->(d)
          `,
            {
              knowledgeId: knowledgeItem.id,
              domain,
              relevance: this.calculatePersonaRelevance(knowledgeItem, user),
            }
          );
        }
      }

      // Create user-knowledge relationships
      await this.graphDb.runQuery(
        `
        MATCH (k:Knowledge {id: $knowledgeId})
        MERGE (u:User {id: $userId})
        SET u.workStyle = $workStyle,
            u.communicationPreference = $communicationPreference,
            u.role = $role
        MERGE (u)-[:CREATED {timestamp: datetime()}]->(k)
      `,
        {
          knowledgeId: knowledgeItem.id,
          userId: user.id,
          workStyle: user.userPersona?.workStyle,
          communicationPreference: user.userPersona?.communicationPreference,
          role: user.role,
        }
      );
    } catch (error) {
      logger.error('Error syncing to Neo4j with persona', {
        knowledgeItemId: knowledgeItem.id,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Sync knowledge item to Qdrant with persona-weighted embeddings
   */
  private async syncToQdrantWithPersona(
    knowledgeItem: KnowledgeItemEntity,
    user: UserEntity
  ): Promise<void> {
    try {
      // Create enhanced content for embedding that includes persona context
      const enhancedContent = [
        knowledgeItem.content,
        user.userPersona?.domainExpertise?.join(' ') || '',
        user.userPersona?.workStyle || '',
        user.userPersona?.communicationPreference || '',
        user.role,
        user.department || '',
      ]
        .filter(Boolean)
        .join(' ');

      // Generate embedding with persona context
      const embedding = await this.embeddingService.generateEmbedding(enhancedContent);

      // Create metadata with persona information
      const metadata = {
        id: knowledgeItem.id,
        type: knowledgeItem.type,
        tags: knowledgeItem.tags,
        confidence: knowledgeItem.confidence,
        userId: user.id,
        userRole: user.role,
        department: user.department,
        workStyle: user.userPersona?.workStyle,
        domainExpertise: user.userPersona?.domainExpertise,
        communicationPreference: user.userPersona?.communicationPreference,
        personaRelevance: this.calculatePersonaRelevance(knowledgeItem, user),
        createdAt: knowledgeItem.createdAt.toISOString(),
        updatedAt: knowledgeItem.updatedAt.toISOString(),
      };

      // Upsert to Qdrant
      await this.qdrantService.upsertPoints([
        {
          id: knowledgeItem.id,
          vector: embedding,
          payload: metadata,
        },
      ]);
    } catch (error) {
      logger.error('Error syncing to Qdrant with persona', {
        knowledgeItemId: knowledgeItem.id,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

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
      errors: [],
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
            result.errors.push(
              `Item ${item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        });

        await Promise.allSettled(batchPromises);

        // Brief pause between batches
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 3. Sync relationships after all items are processed
      await this.syncAllRelationships();

      logger.info(
        `Universal sync completed. Found: ${result.totalFound}, Synced: ${result.totalSynced}, Failed: ${result.totalFailed}`
      );
      return result;
    } catch (error) {
      logger.error('Universal sync failed:', error);
      result.errors.push(
        `Universal sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
      errors: universalResult.errors,
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
      qdrantSynced: false,
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
          metadata,
        },
        tags: metadata.tags || [],
        confidence: metadata.confidence || 0.8,
        accessLevel: metadata.accessLevel || 'STANDARD',
        userId,
        agentId,
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
        error: error instanceof Error ? error.message : 'Unknown error',
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
      updatedAt: item.updatedAt.toISOString(),
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
        updated_at: item.updatedAt.toISOString(),
      },
    };

    // Store in Qdrant
    await this.qdrantService.upsertPoints([point]);
  }

  /**
   * Create user-knowledge relationship in Neo4j
   */
  private async createUserKnowledgeRelationship(
    userId: string,
    knowledgeId: string
  ): Promise<void> {
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
  private async createAgentKnowledgeRelationship(
    agentId: string,
    knowledgeId: string
  ): Promise<void> {
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
      updatedAt: rel.updatedAt.toISOString(),
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
      await this.graphDb.runQuery(
        `
        MATCH (k:KnowledgeItem {id: $id})
        DETACH DELETE k
      `,
        { id: itemId }
      );

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
          pgEntity: item,
        });
      }
      logger.info(`Found ${pgItems.length} items in PostgreSQL`);
    } catch (error) {
      logger.warn('Failed to discover PostgreSQL items:', error);
    }

    // 2. Discover from Neo4j - find ALL nodes and convert to knowledge items
    try {
      const neo4jResult = await this.graphDb.runQuery(
        `
        MATCH (n) 
        RETURN 
          COALESCE(n.id, toString(id(n))) as id,
          COALESCE(n.content, n.name, n.title, 'Auto-generated content') as content,
          COALESCE(n.type, head(labels(n)), 'GENERAL') as type,
          n as node,
          labels(n) as labels
        LIMIT 500
      `,
        {}
      );

      for (const record of neo4jResult.records) {
        let id = record.get('id');
        const content = record.get('content');
        const type = record.get('type');
        const labels = record.get('labels');
        const node = record.get('node');

        // Generate UUID if needed
        if (
          !id ||
          typeof id !== 'string' ||
          !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        ) {
          id = uuidv4();
        }

        // Extract meaningful content
        let extractedContent = content;
        if (!extractedContent || extractedContent === '[object Object]') {
          // Try to extract meaningful content from node properties
          const nodeProps = node?.properties || {};
          extractedContent =
            nodeProps.description ||
            nodeProps.summary ||
            nodeProps.name ||
            nodeProps.title ||
            `${labels?.join(', ') || type} node`;
        }

        if (itemsMap.has(id)) {
          itemsMap.get(id)!.existsIn.neo4j = true;
        } else {
          const originalType = type === 'Memory' && labels?.length > 1 ? labels[1] : type;

          itemsMap.set(id, {
            id,
            content: extractedContent,
            type: this.mapToKnowledgeType(originalType),
            metadata: {
              originalType, // Preserve exact original type
              originalLabels: labels, // Preserve all Neo4j labels
              sourceNode: 'neo4j-conversion',
              originalProperties: node?.properties || {}, // Preserve all original properties
              neo4jInternalId: node?.identity?.toString(), // Preserve Neo4j internal ID
              conversionTimestamp: new Date().toISOString(),
            },
            source: 'neo4j',
            existsIn: { postgres: false, neo4j: true, qdrant: false },
            needsConversion: true, // Flag to indicate this needs conversion to KnowledgeItem
          });
        }
      }
      logger.info(
        `Found ${neo4jResult.records.length} items in Neo4j (including non-KnowledgeItem nodes)`
      );
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
              qdrantPayload: point.payload,
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
      qdrantSynced: item.existsIn.qdrant,
    };

    try {
      // 1. Ensure item exists in PostgreSQL
      if (!item.existsIn.postgres) {
        await this.createInPostgres(item);
        result.postgresId = item.id;
      } else {
        result.postgresId = item.id;
      }

      // 2. Sync to Neo4j if missing or needs conversion
      if (!item.existsIn.neo4j) {
        const entity = item.pgEntity || (await this.createKnowledgeEntityFromItem(item));
        await this.syncToNeo4j(entity);
        result.neo4jSynced = true;
      } else if (item.needsConversion) {
        // Convert existing Neo4j node to KnowledgeItem format
        await this.convertNeo4jNodeToKnowledgeItem(item);
        result.neo4jSynced = true;
      }

      // 3. Sync to Qdrant if missing
      if (!item.existsIn.qdrant) {
        const entity = item.pgEntity || (await this.createKnowledgeEntityFromItem(item));
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
        filters: {},
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
        metadata: item.metadata,
      },
      tags: [],
      confidence: 0.8,
      accessLevel: 'STANDARD',
    });
  }

  /**
   * Create a KnowledgeItemEntity from universal item
   */
  private async createKnowledgeEntityFromItem(
    item: UniversalKnowledgeItem
  ): Promise<KnowledgeItemEntity> {
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
      const neo4jResult = await this.graphDb.runQuery(
        `
        MATCH (k:KnowledgeItem {id: $id}) RETURN k LIMIT 1
      `,
        { id: itemId }
      );
      status.neo4j = neo4jResult.records.length > 0;

      // Check Qdrant
      const qdrantResult = await this.qdrantService.getPoints([itemId]);
      status.qdrant = qdrantResult.length > 0;
    } catch (error) {
      logger.error(`Error verifying sync status for ${itemId}:`, error);
    }

    return status;
  }

  /**
   * Convert an existing Neo4j node to KnowledgeItem format
   */
  private async convertNeo4jNodeToKnowledgeItem(item: UniversalKnowledgeItem): Promise<void> {
    try {
      // First, get the PostgreSQL entity to have the proper UUID
      const pgEntity = await this.knowledgeRepository.findById(item.id);
      if (!pgEntity) {
        logger.warn(`No PostgreSQL entity found for ${item.id}, skipping Neo4j conversion`);
        return;
      }

      // Add KnowledgeItem label to the existing node and update properties
      const cypher = `
        MATCH (n) 
        WHERE n.name = $content OR n.title = $content OR n.content = $content 
           OR (n.id IS NOT NULL AND n.id = $oldId)
        SET n:KnowledgeItem,
            n.id = $newId,
            n.content = $content,
            n.type = $type,
            n.sourceType = $sourceType,
            n.sourceIdentifier = $sourceIdentifier,
            n.tags = $tags,
            n.confidence = $confidence,
            n.metadata = $metadata,
            n.accessLevel = $accessLevel,
            n.summary = $summary,
            n.createdAt = $createdAt,
            n.updatedAt = $updatedAt,
            n.converted = true
        RETURN n
      `;

      const params = {
        oldId: item.metadata.originalProperties?.id || null,
        newId: pgEntity.id,
        content: pgEntity.content,
        type: pgEntity.type,
        sourceType: pgEntity.sourceType,
        sourceIdentifier: pgEntity.sourceIdentifier,
        tags: pgEntity.tags,
        confidence: pgEntity.confidence,
        metadata: JSON.stringify({
          ...pgEntity.metadata,
          converted: true,
          originalLabels: item.metadata.originalLabels,
          conversionDate: new Date().toISOString(),
        }),
        accessLevel: pgEntity.accessLevel,
        summary: pgEntity.summary,
        createdAt: pgEntity.createdAt.toISOString(),
        updatedAt: pgEntity.updatedAt.toISOString(),
      };

      const result = await this.graphDb.runQuery(cypher, params);

      if (result.records.length > 0) {
        logger.info(`Successfully converted Neo4j node to KnowledgeItem: ${pgEntity.id}`);

        // Create user/agent relationships if they exist
        if (pgEntity.userId) {
          await this.createUserKnowledgeRelationship(pgEntity.userId, pgEntity.id);
        }

        if (pgEntity.agentId) {
          await this.createAgentKnowledgeRelationship(pgEntity.agentId, pgEntity.id);
        }
      } else {
        logger.warn(`No Neo4j node found to convert for item: ${item.content}`);
      }
    } catch (error) {
      logger.error(`Failed to convert Neo4j node to KnowledgeItem for ${item.id}:`, error);
      throw error;
    }
  }

  /**
   * Map Neo4j node types to valid KnowledgeType enum values
   * Preserves all original information in metadata
   */
  private mapToKnowledgeType(originalType: string): KnowledgeType {
    // Comprehensive mapping that doesn't lose any semantic meaning
    const typeMap: Record<string, KnowledgeType> = {
      // Project/Work concepts
      WorkItem: KnowledgeType.PROCEDURAL,
      Epic: KnowledgeType.CONCEPTUAL,
      Module: KnowledgeType.CONCEPTUAL,
      Component: KnowledgeType.CONCEPTUAL,
      Task: KnowledgeType.PROCEDURAL,
      Phase: KnowledgeType.PROCEDURAL,
      Sprint: KnowledgeType.PROCEDURAL,
      Milestone: KnowledgeType.PROCEDURAL,
      ActionItem: KnowledgeType.PROCEDURAL,
      ActionPhase: KnowledgeType.PROCEDURAL,
      ActionPlan: KnowledgeType.PROCEDURAL,

      // Technical concepts
      Microservice: KnowledgeType.CONCEPTUAL,
      Database: KnowledgeType.CONCEPTUAL,
      Technology: KnowledgeType.CONCEPTUAL,
      Platform: KnowledgeType.CONCEPTUAL,
      Infrastructure: KnowledgeType.CONCEPTUAL,
      ArchitectureComponent: KnowledgeType.CONCEPTUAL,
      ArchitecturalPattern: KnowledgeType.CONCEPTUAL,
      SystemComponent: KnowledgeType.CONCEPTUAL,
      DataSchema: KnowledgeType.CONCEPTUAL,
      DataFlow: KnowledgeType.CONCEPTUAL,
      DataConnector: KnowledgeType.CONCEPTUAL,

      // Documentation and information
      Document: KnowledgeType.FACTUAL,
      Metric: KnowledgeType.FACTUAL,
      Analysis: KnowledgeType.FACTUAL,
      ExecutiveSummary: KnowledgeType.FACTUAL,
      BudgetAnalysis: KnowledgeType.FACTUAL,
      Summary: KnowledgeType.FACTUAL,

      // Geographic and places
      city: KnowledgeType.FACTUAL,
      City: KnowledgeType.FACTUAL,
      Location: KnowledgeType.FACTUAL,
      Country: KnowledgeType.FACTUAL,
      State: KnowledgeType.FACTUAL,
      MountainRange: KnowledgeType.FACTUAL,
      River: KnowledgeType.FACTUAL,

      // People and organizations
      Person: KnowledgeType.FACTUAL,
      Stakeholder: KnowledgeType.FACTUAL,
      Company: KnowledgeType.FACTUAL,
      Organization: KnowledgeType.FACTUAL,
      Workplace: KnowledgeType.FACTUAL,

      // Cultural and historical
      Empire: KnowledgeType.FACTUAL,
      HistoricalEvent: KnowledgeType.FACTUAL,
      HistoricalCivilization: KnowledgeType.FACTUAL,
      HistoricalPeriod: KnowledgeType.FACTUAL,
      ColonialPeriod: KnowledgeType.FACTUAL,
      CulturalAspect: KnowledgeType.FACTUAL,
      Festival: KnowledgeType.FACTUAL,
      Religion: KnowledgeType.FACTUAL,
      TraditionalArt: KnowledgeType.FACTUAL,

      // Business concepts
      BusinessMetric: KnowledgeType.FACTUAL,
      BusinessProcess: KnowledgeType.PROCEDURAL,
      BusinessModel: KnowledgeType.CONCEPTUAL,
      BusinessStrategy: KnowledgeType.CONCEPTUAL,
      BusinessRisk: KnowledgeType.FACTUAL,
      Strategy: KnowledgeType.CONCEPTUAL,
      BrandStrategy: KnowledgeType.CONCEPTUAL,
      EconomicProfile: KnowledgeType.FACTUAL,
      EconomicSector: KnowledgeType.FACTUAL,

      // Risks and compliance
      Risk: KnowledgeType.FACTUAL,
      SecurityThreat: KnowledgeType.FACTUAL,
      OperationalRisk: KnowledgeType.FACTUAL,
      ComplianceRisk: KnowledgeType.FACTUAL,
      ComplianceRequirement: KnowledgeType.PROCEDURAL,

      // Tools and capabilities
      PersonalTool: KnowledgeType.PROCEDURAL,
      Capability: KnowledgeType.CONCEPTUAL,
      Feature: KnowledgeType.CONCEPTUAL,
      FeatureList: KnowledgeType.CONCEPTUAL,
      Enhancement: KnowledgeType.CONCEPTUAL,
      EnhancementSystem: KnowledgeType.CONCEPTUAL,

      // Processes and frameworks
      Guideline: KnowledgeType.PROCEDURAL,
      QualityFramework: KnowledgeType.CONCEPTUAL,
      PedagogicalFramework: KnowledgeType.CONCEPTUAL,
      TestingFramework: KnowledgeType.CONCEPTUAL,

      // Additional types from your Neo4j data
      Opportunity: KnowledgeType.CONCEPTUAL,
      CriticalTask: KnowledgeType.PROCEDURAL,
      Disruptor: KnowledgeType.FACTUAL,
      Project: KnowledgeType.CONCEPTUAL,
      UserPersona: KnowledgeType.FACTUAL,
      ValidationCheckpoint: KnowledgeType.PROCEDURAL,
      ResourceRequirement: KnowledgeType.PROCEDURAL,
      DecisionPoint: KnowledgeType.CONCEPTUAL,
      MagicService: KnowledgeType.CONCEPTUAL,
      Status: KnowledgeType.FACTUAL,
      Priority: KnowledgeType.FACTUAL,
      ImplementationPhase: KnowledgeType.PROCEDURAL,
      SuccessCriteria: KnowledgeType.CONCEPTUAL,
      InfrastructureComponent: KnowledgeType.CONCEPTUAL,
      ExternalIntegration: KnowledgeType.CONCEPTUAL,
      TechnicalSolution: KnowledgeType.CONCEPTUAL,
      MediaPlatform: KnowledgeType.FACTUAL,
      FuturePlan: KnowledgeType.CONCEPTUAL,
      AIPlatform: KnowledgeType.CONCEPTUAL,
      CinemaIndustry: KnowledgeType.FACTUAL,
      CollectionOfSymbols: KnowledgeType.FACTUAL,
      Policy: KnowledgeType.PROCEDURAL,
      AncientInstitution: KnowledgeType.FACTUAL,
      Scientist: KnowledgeType.FACTUAL,
      Software: KnowledgeType.CONCEPTUAL,
      LearningJourney: KnowledgeType.EXPERIENTIAL,
      LearningOutcome: KnowledgeType.CONCEPTUAL,
      QualityAssurance: KnowledgeType.PROCEDURAL,
      TechnicalPlan: KnowledgeType.PROCEDURAL,
      AIService: KnowledgeType.CONCEPTUAL,
      IntegrationLayer: KnowledgeType.CONCEPTUAL,
      CapabilitySystem: KnowledgeType.CONCEPTUAL,
      PersonaSystem: KnowledgeType.CONCEPTUAL,
      VectorDatabase: KnowledgeType.CONCEPTUAL,
      KnowledgeService: KnowledgeType.CONCEPTUAL,
      DataModel: KnowledgeType.CONCEPTUAL,
      DevelopmentTracker: KnowledgeType.PROCEDURAL,
      DevelopmentStandards: KnowledgeType.PROCEDURAL,
      DataArchitecture: KnowledgeType.CONCEPTUAL,
      SearchSystem: KnowledgeType.CONCEPTUAL,
      FutureFeature: KnowledgeType.CONCEPTUAL,
      Meta: KnowledgeType.FACTUAL,
      TechnicalComponent: KnowledgeType.CONCEPTUAL,
      TechnicalArchitecture: KnowledgeType.CONCEPTUAL,
      Service: KnowledgeType.CONCEPTUAL,
      Application: KnowledgeType.CONCEPTUAL,
      ProjectStatus: KnowledgeType.FACTUAL,
      DevelopmentPhase: KnowledgeType.PROCEDURAL,
      Movement: KnowledgeType.FACTUAL,
      TimelineAnalysis: KnowledgeType.FACTUAL,

      // Geographic compound labels
      mountain: KnowledgeType.FACTUAL,
      river: KnowledgeType.FACTUAL,
      person: KnowledgeType.FACTUAL,
      monument: KnowledgeType.FACTUAL,
      Building: KnowledgeType.FACTUAL,
      state: KnowledgeType.FACTUAL,
      country: KnowledgeType.FACTUAL,

      // Default mappings
      Memory: KnowledgeType.EPISODIC,
      GENERAL: KnowledgeType.FACTUAL,
    };

    // Return mapped type or default to FACTUAL while preserving original type in metadata
    return typeMap[originalType] || KnowledgeType.FACTUAL;
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
  needsConversion?: boolean; // Flag for nodes that need to be converted to KnowledgeItem
}
