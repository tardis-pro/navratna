import { Router, Request, Response } from 'express';
import { 
  KnowledgeIngestRequest, 
  KnowledgeSearchRequest,
  KnowledgeItem 
} from '@uaip/types';
import { 
  UserKnowledgeService,
  getUserKnowledgeServiceForAPI,
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
    const userKnowledgeService = await getUserKnowledgeServiceForAPI();
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
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
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
router.get('/search', authMiddleware, async (req: Request, res: Response): Promise<void> => {
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
router.get('/tags/:tag', authMiddleware, async (req: Request, res: Response): Promise<void> => {
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
router.get('/stats', authMiddleware, async (req: Request, res: Response): Promise<void> => {
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
router.patch('/:itemId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
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
router.delete('/:itemId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
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
router.get('/:itemId/related', authMiddleware, async (req: Request, res: Response): Promise<void> => {
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
 * GET /v1/knowledge/health
 * Health check for knowledge services
 */
router.get('/health', async (req: Request, res: Response): Promise<void> => {
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