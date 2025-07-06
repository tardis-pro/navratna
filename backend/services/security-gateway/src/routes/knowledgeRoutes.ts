import { Router, Request, Response } from 'express';
import {
  KnowledgeIngestRequest,
  KnowledgeSearchRequest,
  KnowledgeItem
} from '@uaip/types';
import {
  UserKnowledgeService,
  getUserKnowledgeService,
  servicesHealthCheck
} from '@uaip/shared-services';
import { authMiddleware } from '@uaip/middleware';

const router: Router = Router();

// Service access with proper dependency injection
async function getServices(): Promise<{
  userKnowledgeService: UserKnowledgeService | null;
  initializationError: string | null;
}> {
  try {
    const userKnowledgeService = await getUserKnowledgeService();
    return { userKnowledgeService, initializationError: null };
  } catch (error) {
    const initializationError = `Failed to initialize UserKnowledgeService: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return { userKnowledgeService: null, initializationError };
  }
}

// All knowledge routes require authentication
router.use(authMiddleware);

/**
 * POST /v1/knowledge
 * Add knowledge to user's personal knowledge base
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { userKnowledgeService, initializationError } = await getServices();
    if (initializationError) {
      res.status(503).json({
        error: 'Knowledge service not available',
        details: initializationError
      });
      return;
    }

    const knowledgeItems: KnowledgeIngestRequest[] = Array.isArray(req.body) ? req.body : [req.body];

    // Validate knowledge items
    for (const item of knowledgeItems) {
      if (!item.content || !item.source) {
        res.status(400).json({
          error: 'Each knowledge item must have content and source'
        });
        return;
      }
    }

    const result = await userKnowledgeService!.addKnowledge(userId, knowledgeItems);

    res.status(201).json({
      success: true,
      data: result,
      message: `Successfully added ${result.processedCount} knowledge items`
    });
  } catch (error) {
    console.error('Error adding user knowledge:', error);
    res.status(500).json({
      error: 'Failed to add knowledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /v1/knowledge/search
 * Search user's knowledge base
 */
router.get('/search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { userKnowledgeService, initializationError } = await getServices();
    if (initializationError) {
      res.status(503).json({
        error: 'Knowledge service not available',
        details: initializationError
      });
      return;
    }

    const {
      q: query,
      tags,
      types,
      limit = '20',
      confidence,
      includeRelationships = 'false'
    } = req.query;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const searchRequest: Omit<KnowledgeSearchRequest, 'scope'> = {
      query,
      filters: {
        tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags as string[]) : undefined,
        types: types ? (typeof types === 'string' ? types.split(',') : types as any[]) : undefined,
        confidence: confidence ? parseFloat(confidence as string) : undefined
      },
      options: {
        limit: parseInt(limit as string),
        includeRelationships: includeRelationships === 'true'
      },
      timestamp: Date.now()
    };

    const result = await userKnowledgeService!.search(userId, searchRequest);

    res.json({
      success: true,
      data: result,
      message: `Found ${result.totalCount} knowledge items`
    });
  } catch (error) {
    console.error('Error searching user knowledge:', error);
    res.status(500).json({
      error: 'Failed to search knowledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /v1/knowledge/tags/:tag
 * Get knowledge items by tag
 */
router.get('/tags/:tag', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { userKnowledgeService, initializationError } = await getServices();
    if (initializationError) {
      res.status(503).json({
        error: 'Knowledge service not available',
        details: initializationError
      });
      return;
    }

    const { tag } = req.params;
    const { limit = '20' } = req.query;

    const items = await userKnowledgeService!.getKnowledgeByTags(
      userId,
      [tag],
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: items,
      message: `Found ${items.length} items with tag "${tag}"`
    });
  } catch (error) {
    console.error('Error getting knowledge by tag:', error);
    res.status(500).json({
      error: 'Failed to get knowledge by tag',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /v1/knowledge/stats
 * Get user's knowledge statistics
 */
router.get('/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { userKnowledgeService, initializationError } = await getServices();
    if (initializationError) {
      res.status(503).json({
        error: 'Knowledge service not available',
        details: initializationError
      });
      return;
    }

    const stats = await userKnowledgeService!.getUserKnowledgeStats(userId);

    res.json({
      success: true,
      data: stats,
      message: 'Knowledge statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting knowledge stats:', error);
    res.status(500).json({
      error: 'Failed to get knowledge statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PATCH /v1/knowledge/:itemId
 * Update a knowledge item
 */
router.patch('/:itemId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { userKnowledgeService, initializationError } = await getServices();
    if (initializationError) {
      res.status(503).json({
        error: 'Knowledge service not available',
        details: initializationError
      });
      return;
    }

    const { itemId } = req.params;
    const updates = req.body;

    // Validate itemId
    if (!itemId) {
      res.status(400).json({ error: 'Item ID is required' });
      return;
    }

    // Validate updates
    if (!updates || Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'Update data is required' });
      return;
    }

    const updatedItem = await userKnowledgeService!.updateKnowledge(userId, itemId, updates);

    res.json({
      success: true,
      data: updatedItem,
      message: 'Knowledge item updated successfully'
    });
  } catch (error) {
    console.error('Error updating knowledge item:', error);
    if (error instanceof Error && error.message.includes('not found or not accessible')) {
      res.status(404).json({
        error: 'Knowledge item not found or access denied',
        details: error.message
      });
    } else {
      res.status(500).json({
        error: 'Failed to update knowledge item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * DELETE /v1/knowledge/:itemId
 * Delete a knowledge item
 */
router.delete('/:itemId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { userKnowledgeService, initializationError } = await getServices();
    if (initializationError) {
      res.status(503).json({
        error: 'Knowledge service not available',
        details: initializationError
      });
      return;
    }

    const { itemId } = req.params;

    if (!itemId) {
      res.status(400).json({ error: 'Item ID is required' });
      return;
    }

    await userKnowledgeService!.deleteKnowledge(userId, itemId);

    res.json({
      success: true,
      message: 'Knowledge item deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting knowledge item:', error);
    if (error instanceof Error && error.message.includes('not found or not accessible')) {
      res.status(404).json({
        error: 'Knowledge item not found or access denied',
        details: error.message
      });
    } else {
      res.status(500).json({
        error: 'Failed to delete knowledge item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /v1/knowledge/:itemId/related
 * Get related knowledge items
 */
router.get('/:itemId/related', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { userKnowledgeService, initializationError } = await getServices();
    if (initializationError) {
      res.status(503).json({
        error: 'Knowledge service not available',
        details: initializationError
      });
      return;
    }

    const { itemId } = req.params;

    if (!itemId) {
      res.status(400).json({ error: 'Item ID is required' });
      return;
    }

    const relatedItems = await userKnowledgeService!.findRelatedKnowledge(userId, itemId);

    res.json({
      success: true,
      data: relatedItems,
      message: `Found ${relatedItems.length} related items`
    });
  } catch (error) {
    console.error('Error getting related knowledge:', error);
    res.status(500).json({
      error: 'Failed to get related knowledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /v1/knowledge/graph
 * Get user's knowledge graph data (nodes and relationships)
 */
router.get('/graph', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { userKnowledgeService, initializationError } = await getServices();
    if (initializationError) {
      res.status(503).json({
        error: 'Knowledge service not available',
        details: initializationError
      });
      return;
    }

    const {
      limit = '50',
      types,
      tags,
      includeRelationships = 'true'
    } = req.query;

    // Get user's knowledge items
    const searchRequest = {
      query: '',
      filters: {
        types: types ? (typeof types === 'string' ? types.split(',') : types as any[]) : undefined,
        tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags as string[]) : undefined
      },
      options: {
        limit: parseInt(limit as string),
        includeRelationships: includeRelationships === 'true'
      },
      timestamp: Date.now()
    };

    const searchResult = await userKnowledgeService!.search(userId, searchRequest);

    // Transform knowledge items to graph format
    const nodes = searchResult.items.map(item => ({
      id: item.id,
      type: 'knowledge',
      data: {
        label: item.content.substring(0, 50) + (item.content.length > 50 ? '...' : ''),
        knowledgeType: item.type,
        tags: item.tags,
        confidence: item.confidence,
        sourceType: item.sourceType,
        createdAt: item.createdAt,
        fullContent: item.content
      }
    }));

    // Get relationships for all items
    const edges: any[] = [];
    if (includeRelationships === 'true') {
      for (const item of searchResult.items) {
        try {
          const relatedItems = await userKnowledgeService!.findRelatedKnowledge(userId, item.id);
          relatedItems.forEach(relatedItem => {
            // Only include edges where both nodes exist in our result set
            if (searchResult.items.some(i => i.id === relatedItem.id)) {
              edges.push({
                id: `${item.id}-${relatedItem.id}`,
                source: item.id,
                target: relatedItem.id,
                type: 'relationship',
                data: {
                  relationshipType: 'related',
                  confidence: 0.8
                }
              });
            }
          });
        } catch (error) {
          console.warn(`Failed to get relationships for item ${item.id}:`, error);
        }
      }
    }

    res.json({
      success: true,
      data: {
        nodes,
        edges,
        metadata: {
          totalNodes: nodes.length,
          totalEdges: edges.length,
          searchMetadata: searchResult.searchMetadata
        }
      },
      message: `Retrieved knowledge graph with ${nodes.length} nodes and ${edges.length} relationships`
    });

  } catch (error) {
    console.error('Knowledge graph retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve knowledge graph',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /v1/knowledge/graph/relationships/:itemId
 * Get relationships for a specific knowledge item
 */
router.get('/graph/relationships/:itemId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { userKnowledgeService, initializationError } = await getServices();
    if (initializationError) {
      res.status(503).json({
        error: 'Knowledge service not available',
        details: initializationError
      });
      return;
    }

    const { itemId } = req.params;
    const { relationshipTypes, limit = '20' } = req.query;

    if (!itemId) {
      res.status(400).json({ error: 'Item ID is required' });
      return;
    }

    // Verify the item belongs to the user
    const item = await userKnowledgeService!.getKnowledgeItem(userId, itemId);
    if (!item) {
      res.status(404).json({ error: 'Knowledge item not found or not accessible' });
      return;
    }

    // Get related items
    const types = relationshipTypes ?
      (typeof relationshipTypes === 'string' ? relationshipTypes.split(',') : relationshipTypes as string[]) :
      undefined;

    const relatedItems = await userKnowledgeService!.findRelatedKnowledge(userId, itemId, types);

    // Transform to graph format
    const relationships = relatedItems.slice(0, parseInt(limit as string)).map(relatedItem => ({
      id: `${itemId}-${relatedItem.id}`,
      source: itemId,
      target: relatedItem.id,
      type: 'relationship',
      data: {
        relationshipType: 'related',
        confidence: 0.8,
        targetItem: {
          id: relatedItem.id,
          label: relatedItem.content.substring(0, 50) + (relatedItem.content.length > 50 ? '...' : ''),
          knowledgeType: relatedItem.type,
          tags: relatedItem.tags
        }
      }
    }));

    res.json({
      success: true,
      data: {
        itemId,
        relationships,
        totalCount: relatedItems.length
      },
      message: `Found ${relationships.length} relationships for knowledge item`
    });

  } catch (error) {
    console.error('Knowledge relationships retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve knowledge relationships',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /v1/knowledge/health
 * Health check for knowledge services
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthStatus = await servicesHealthCheck();

    if (healthStatus.healthy) {
      res.json({
        success: true,
        data: healthStatus,
        message: 'Knowledge services are healthy'
      });
    } else {
      res.status(503).json({
        success: false,
        data: healthStatus,
        message: 'Knowledge services are not healthy'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;