/**
 * Knowledge Routes for Agent Intelligence Service
 * Handles knowledge-related endpoints routed from nginx gateway
 */

import express, { Request, Response, Router } from 'express';
import { authMiddleware } from '@uaip/middleware';
import { logger } from '@uaip/utils';

const router: Router = express.Router();

// Helper function to search knowledge for agents
async function searchKnowledgeForAgent(query: string, options: {
  limit?: number;
  offset?: number;
  userId?: string;
  agentContext?: string;
}): Promise<any[]> {
  try {
    // Import knowledge service
    const { getUserKnowledgeService } = await import('@uaip/shared-services');
    const userKnowledgeService = await getUserKnowledgeService();
    
    if (!userKnowledgeService || !options.userId) {
      console.warn('Knowledge service not available or user not provided');
      return [];
    }

    // Search user's knowledge
    const searchResult = await userKnowledgeService.search(options.userId, {
      query,
      filters: {},
      options: {
        limit: options.limit || 20,
        includeRelationships: false
      },
      timestamp: Date.now()
    });

    // Transform to expected format
    return searchResult.items.map(item => ({
      id: item.id,
      title: item.content.substring(0, 100) + (item.content.length > 100 ? '...' : ''),
      content: item.content,
      relevance: item.confidence,
      type: item.type.toLowerCase(),
      tags: item.tags,
      sourceType: item.sourceType,
      createdAt: item.createdAt
    }));

  } catch (error) {
    console.error('Knowledge search failed:', error);
    return [];
  }
}

// Mock results for development
const mockResults = {
  items: [
    {
      id: 'kb_001',
      title: 'Sample Knowledge Entry',
      content: 'This is a sample knowledge entry for agent intelligence service',
      relevance: 0.85,
      type: 'factual',
      tags: ['sample', 'knowledge']
    }
  ],
  total: 1,
  query: '',
  filters: {}
};

// Apply authentication middleware to all knowledge routes
router.use(authMiddleware);

/**
 * GET /api/v1/knowledge/search
 * Search the knowledge base
 */
router.get('/search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { query, limit = 10, offset = 0 } = req.query;
    
    if (!query || typeof query !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_QUERY',
          message: 'Search query is required'
        }
      });
      return;
    }

    logger.info('Knowledge search request', {
      query,
      limit,
      offset,
      userId: req.user?.id
    });

    // Agent-specific knowledge search - integrates with user knowledge via internal API
    const results = await searchKnowledgeForAgent(query as string, {
      limit: Number(limit),
      offset: Number(offset),
      userId: req.user?.id,
      agentContext: req.query.context as string
    });

    res.json({
      success: true,
      data: {
        ...mockResults,
        query,
        items: results
      },
      meta: {
        timestamp: new Date(),
        service: 'agent-intelligence'
      }
    });
  } catch (error) {
    logger.error('Knowledge search error', { error, query: req.query });
    res.status(500).json({
      success: false,
      error: {
        code: 'KNOWLEDGE_SEARCH_ERROR',
        message: 'Failed to search knowledge base'
      }
    });
  }
});

/**
 * GET /api/v1/knowledge/entries/:id
 * Get specific knowledge entry
 */
router.get('/entries/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    logger.info('Knowledge entry request', {
      entryId: id,
      userId: req.user?.id
    });

    // TODO: Implement actual knowledge entry retrieval
    const mockEntry = {
      id,
      title: 'Sample Knowledge Entry',
      content: 'This is a detailed knowledge entry with comprehensive information',
      metadata: {
        created: new Date('2024-01-01'),
        updated: new Date(),
        author: 'system',
        version: '1.0'
      },
      tags: ['knowledge', 'sample'],
      relations: []
    };

    res.json({
      success: true,
      data: mockEntry,
      meta: {
        timestamp: new Date(),
        service: 'agent-intelligence'
      }
    });
  } catch (error) {
    logger.error('Knowledge entry retrieval error', { error, entryId: req.params.id });
    res.status(500).json({
      success: false,
      error: {
        code: 'KNOWLEDGE_ENTRY_ERROR',
        message: 'Failed to retrieve knowledge entry'
      }
    });
  }
});

/**
 * POST /api/v1/knowledge/entries
 * Create new knowledge entry
 */
router.post('/entries', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, content, tags = [], metadata = {} } = req.body;
    
    if (!title || !content) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ENTRY',
          message: 'Title and content are required'
        }
      });
      return;
    }

    logger.info('Knowledge entry creation request', {
      title,
      userId: req.user?.id,
      tags
    });

    // TODO: Implement actual knowledge entry creation
    const newEntry = {
      id: `kb_${Date.now()}`,
      title,
      content,
      tags,
      metadata: {
        ...metadata,
        created: new Date(),
        updated: new Date(),
        author: req.user?.id || 'system',
        version: '1.0'
      }
    };

    res.status(201).json({
      success: true,
      data: newEntry,
      meta: {
        timestamp: new Date(),
        service: 'agent-intelligence'
      }
    });
  } catch (error) {
    logger.error('Knowledge entry creation error', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: {
        code: 'KNOWLEDGE_CREATION_ERROR',
        message: 'Failed to create knowledge entry'
      }
    });
  }
});

/**
 * GET /api/v1/knowledge/recommendations
 * Get knowledge recommendations for agents
 */
router.get('/recommendations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { agentId, context } = req.query;
    
    logger.info('Knowledge recommendations request', {
      agentId,
      context,
      userId: req.user?.id
    });

    // TODO: Implement actual knowledge recommendations based on agent context
    const mockRecommendations = {
      recommendations: [
        {
          id: 'rec_1',
          title: 'Relevant Knowledge for Agent',
          description: 'This knowledge entry is relevant to the agent\'s current context',
          relevance: 0.92,
          type: 'contextual'
        }
      ],
      agentId,
      context,
      generated: new Date()
    };

    res.json({
      success: true,
      data: mockRecommendations,
      meta: {
        timestamp: new Date(),
        service: 'agent-intelligence'
      }
    });
  } catch (error) {
    logger.error('Knowledge recommendations error', { error, query: req.query });
    res.status(500).json({
      success: false,
      error: {
        code: 'KNOWLEDGE_RECOMMENDATIONS_ERROR',
        message: 'Failed to get knowledge recommendations'
      }
    });
  }
});

export default router;