import { Router } from 'express';
import { authMiddleware, validateRequest } from '@uaip/middleware';
import { UserToolPreferencesService, DatabaseService } from '@uaip/shared-services';
import { z } from 'zod';
import { Request, Response } from 'express';

const router: Router = Router();

export interface UserToolPreferencesData {
  userId: string;
  toolId: string;
  parameterDefaults?: Record<string, any>;
  customConfig?: Record<string, any>;
  isFavorite?: boolean;
  isEnabled?: boolean;
  autoApprove?: boolean;
  rateLimits?: Record<string, number>;
  budgetLimit?: number;
  notifyOnCompletion?: boolean;
  notifyOnError?: boolean;
}

// Initialize service
const databaseService = DatabaseService.getInstance();
let userToolPreferencesService: UserToolPreferencesService;

// Async initialization helper
async function getService(): Promise<UserToolPreferencesService> {
  if (!userToolPreferencesService) {
    const dataSource = await databaseService.getDataSource();
    userToolPreferencesService = new UserToolPreferencesService(dataSource);
  }
  return userToolPreferencesService;
}

// Validation schemas
const setPreferencesSchema = z.object({
  toolId: z.string().uuid(),
  parameterDefaults: z.record(z.any()).optional(),
  customConfig: z.record(z.any()).optional(),
  isFavorite: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
  rateLimits: z.record(z.number()).optional(),
  budgetLimit: z.number().optional(),
  notifyOnCompletion: z.boolean().optional(),
  notifyOnError: z.boolean().optional()
});

const userIdSchema = z.object({
  userId: z.string().uuid()
});

const toolIdSchema = z.object({
  toolId: z.string().uuid()
});

/**
 * GET /api/v1/users/:userId/tool-preferences
 * Get all tool preferences for a user
 */
router.get(
  '/:userId/tool-preferences',
  authMiddleware,
  validateRequest({
    params: userIdSchema
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      
      // Authorization check - users can only access their own preferences
      if (req.user?.id !== userId && req.user?.role !== 'system_admin') {
        res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own tool preferences.'
        });
        return;
      }

      const service = await getService();
      const toolAccess = await service.getUserToolAccess(userId);
      
      res.json({
        success: true,
        data: toolAccess
      });
    } catch (error) {
      console.error('Error getting user tool preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve tool preferences'
      });
    }
  }
);

/**
 * GET /api/v1/users/:userId/available-tools
 * Get all tools available to a user based on their security clearance
 */
router.get(
  '/:userId/available-tools',
  authMiddleware,
  validateRequest({
    params: userIdSchema
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      
      // Authorization check
      if (req.user?.id !== userId && req.user?.role !== 'system_admin') {
        res.status(403).json({
          success: false,
          message: 'Access denied. You can only view available tools for your account.'
        });
        return;
      }

      const service = await getService();
      const availableTools = await service.getAvailableToolsForUser(userId);
      
      res.json({
        success: true,
        data: availableTools
      });
    } catch (error) {
      console.error('Error getting available tools:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve available tools'
      });
    }
  }
);

/**
 * POST /api/v1/users/:userId/tool-preferences
 * Set/update tool preferences for a user
 */
router.post(
  '/:userId/tool-preferences',
  authMiddleware,
  validateRequest({
    params: userIdSchema,
    body: setPreferencesSchema
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const preferencesData = req.body;
      
      // Authorization check
      if (req.user?.id !== userId && req.user?.role !== 'system_admin') {
        res.status(403).json({
          success: false,
          message: 'Access denied. You can only modify your own tool preferences.'
        });
        return;
      }

      const data: UserToolPreferencesData = {
        userId,
        ...preferencesData
      };

      const service = await getService();
      const preferences = await service.setUserToolPreferences(data);
      
      res.json({
        success: true,
        data: preferences
      });
    } catch (error) {
      console.error('Error setting user tool preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to set tool preferences'
      });
    }
  }
);

/**
 * GET /api/v1/users/:userId/tool-preferences/:toolId
 * Get specific tool preferences for a user
 */
router.get(
  '/:userId/tool-preferences/:toolId',
  authMiddleware,
  validateRequest({
    params: userIdSchema.merge(toolIdSchema)
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, toolId } = req.params;
      
      // Authorization check
      if (req.user?.id !== userId && req.user?.role !== 'system_admin') {
        res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own tool preferences.'
        });
        return;
      }

      const service = await getService();
      const preferences = await service.getUserToolPreferences(userId, toolId);
      
      if (!preferences) {
        res.status(404).json({
          success: false,
          message: 'Tool preferences not found'
        });
        return;
      }

      res.json({
        success: true,
        data: preferences
      });
    } catch (error) {
      console.error('Error getting tool preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve tool preferences'
      });
    }
  }
);

/**
 * GET /api/v1/users/:userId/favorite-tools
 * Get user's favorite tools
 */
router.get(
  '/:userId/favorite-tools',
  authMiddleware,
  validateRequest({
    params: userIdSchema
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      
      // Authorization check
      if (req.user?.id !== userId && req.user?.role !== 'system_admin') {
        res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own favorite tools.'
        });
        return;
      }

      const service = await getService();
      const favoriteTools = await service.getUserFavoriteTools(userId);
      
      res.json({
        success: true,
        data: favoriteTools
      });
    } catch (error) {
      console.error('Error getting favorite tools:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve favorite tools'
      });
    }
  }
);

/**
 * GET /api/v1/users/:userId/tool-usage-stats
 * Get tool usage statistics for a user
 */
router.get(
  '/:userId/tool-usage-stats',
  authMiddleware,
  validateRequest({
    params: userIdSchema
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      
      // Authorization check
      if (req.user?.id !== userId && req.user?.role !== 'system_admin') {
        res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own usage statistics.'
        });
        return;
      }

      const service = await getService();
      const stats = await service.getUserToolUsageStats(userId);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting tool usage stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve tool usage statistics'
      });
    }
  }
);

/**
 * POST /api/v1/users/:userId/tools/:toolId/check-access
 * Check if user can access a specific tool
 */
router.post(
  '/:userId/tools/:toolId/check-access',
  authMiddleware,
  validateRequest({
    params: userIdSchema.merge(toolIdSchema)
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, toolId } = req.params;
      
      // Authorization check
      if (req.user?.id !== userId && req.user?.role !== 'system_admin') {
        res.status(403).json({
          success: false,
          message: 'Access denied. You can only check access for your own account.'
        });
        return;
      }

      const service = await getService();
      const canAccess = await service.canUserAccessTool(userId, toolId);
      
      res.json({
        success: true,
        data: {
          canAccess,
          userId,
          toolId
        }
      });
    } catch (error) {
      console.error('Error checking tool access:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check tool access'
      });
    }
  }
);

export default router;