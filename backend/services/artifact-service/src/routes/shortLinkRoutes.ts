import { Router } from '@uaip/shared-services';
import { ShortLinkService } from '../services/shortLink.service.js';
import { authMiddleware, validateRequest } from '@uaip/middleware';
import { logger } from '@uaip/utils';
import { z } from 'zod';

// Define types locally to avoid entity imports
const LinkType = {
  ARTIFACT: 'artifact' as const,
  PROJECT_FILE: 'project_file' as const,
  DOCUMENT: 'document' as const,
  EXTERNAL: 'external' as const
};

const router = Router();

// Factory function to get ShortLinkService instance
// This delays initialization until routes are actually called
function getShortLinkService(): ShortLinkService {
  return new ShortLinkService();
}

// Zod schemas for validation
const createShortLinkSchema = z.object({
  originalUrl: z.string().url('Must be a valid URL'),
  title: z.string().max(255, 'Title must be max 255 characters').optional(),
  description: z.string().max(1000, 'Description must be max 1000 characters').optional(),
  type: z.enum(['artifact', 'project_file', 'document', 'external']).optional(),
  customCode: z.string().min(3, 'Custom code must be at least 3 characters').max(20, 'Custom code must be max 20 characters').optional(),
  expiresAt: z.string().datetime().optional(),
  password: z.string().min(4, 'Password must be at least 4 characters').max(50, 'Password must be max 50 characters').optional(),
  maxClicks: z.number().int().positive('Max clicks must be positive').optional(),
  tags: z.array(z.string()).optional(),
  generateQR: z.boolean().optional(),
  artifactId: z.string().uuid().optional(),
  projectFileId: z.string().uuid().optional()
});

const updateShortLinkSchema = z.object({
  title: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  type: z.enum(['artifact', 'project_file', 'document', 'external']).optional(),
  expiresAt: z.string().datetime().optional(),
  password: z.string().min(4).max(50).optional(),
  maxClicks: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional()
});

const getUserLinksSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  type: z.enum(['artifact', 'project_file', 'document', 'external']).optional(),
  search: z.string().optional()
});

const resolveShortLinkSchema = z.object({
  password: z.string().optional()
});

// Create short link
router.post('/links',
  authMiddleware,
  validateRequest({ body: createShortLinkSchema }),
  async (req: any, res: any) => {
    try {
      const shortLinkService = getShortLinkService();
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const shortLink = await shortLinkService.createShortLink(
        req.body.originalUrl,
        userId,
        req.body
      );

      logger.info('Short link created', { 
        shortCode: shortLink.shortCode, 
        userId, 
        originalUrl: req.body.originalUrl 
      });

      res.status(201).json({
        success: true,
        data: shortLink
      });

    } catch (error) {
      logger.error('Error creating short link:', error);
      const message = error instanceof Error ? error.message : 'Failed to create short link';
      res.status(500).json({ success: false, error: message });
    }
  }
);

// Get user's short links
router.get('/links',
  authMiddleware,
  validateRequest({ query: getUserLinksSchema }),
  async (req: any, res: any) => {
    try {
      const shortLinkService = getShortLinkService();
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const options = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        type: req.query.type,
        search: req.query.search
      };

      const links = await shortLinkService.getUserLinks(userId, options);

      res.json({
        success: true,
        data: links
      });

    } catch (error) {
      logger.error('Error fetching user links:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch links' });
    }
  }
);

// Get short link by ID
router.get('/links/:id',
  authMiddleware,
  async (req: any, res: any) => {
    try {
      const shortLinkService = getShortLinkService();
      const userId = req.user?.id;
      const linkId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const link = await shortLinkService.getLinkById(linkId, userId);

      if (!link) {
        return res.status(404).json({ success: false, error: 'Link not found' });
      }

      res.json({
        success: true,
        data: link
      });

    } catch (error) {
      logger.error('Error fetching link by ID:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch link' });
    }
  }
);

// Update short link
router.put('/links/:id',
  authMiddleware,
  validateRequest({ body: updateShortLinkSchema }),
  async (req: any, res: any) => {
    try {
      const shortLinkService = getShortLinkService();
      const userId = req.user?.id;
      const linkId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const updatedLink = await shortLinkService.updateLink(linkId, userId, req.body);

      logger.info('Short link updated', { linkId, userId });

      res.json({
        success: true,
        data: updatedLink
      });

    } catch (error) {
      logger.error('Error updating link:', error);
      const message = error instanceof Error ? error.message : 'Failed to update link';
      res.status(500).json({ success: false, error: message });
    }
  }
);

// Delete short link
router.delete('/links/:id',
  authMiddleware,
  async (req: any, res: any) => {
    try {
      const shortLinkService = getShortLinkService();
      const userId = req.user?.id;
      const linkId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      await shortLinkService.deleteLink(linkId, userId);

      logger.info('Short link deleted', { linkId, userId });

      res.json({
        success: true,
        message: 'Link deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting link:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete link';
      res.status(500).json({ success: false, error: message });
    }
  }
);

// Generate QR code for link
router.post('/links/:id/qr',
  authMiddleware,
  async (req: any, res: any) => {
    try {
      const shortLinkService = getShortLinkService();
      const userId = req.user?.id;
      const linkId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const qrCode = await shortLinkService.generateQRCode(linkId, userId);

      res.json({
        success: true,
        data: { qrCode }
      });

    } catch (error) {
      logger.error('Error generating QR code:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate QR code';
      res.status(500).json({ success: false, error: message });
    }
  }
);

// Get link analytics
router.get('/links/:id/analytics',
  authMiddleware,
  async (req: any, res: any) => {
    try {
      const shortLinkService = getShortLinkService();
      const userId = req.user?.id;
      const linkId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const analytics = await shortLinkService.getLinkAnalytics(linkId, userId);

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error('Error fetching link analytics:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
    }
  }
);

// Resolve short link (public endpoint)
router.get('/:shortCode',
  validateRequest({ body: resolveShortLinkSchema }),
  async (req: any, res: any) => {
    try {
      const shortLinkService = getShortLinkService();
      const shortCode = req.params.shortCode;

      const options = {
        password: req.body?.password,
        userId: req.user?.id,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        referer: req.headers.referer
      };

      const result = await shortLinkService.resolveShortLink(shortCode, options);

      if (result.requiresPassword) {
        return res.status(401).json({
          success: false,
          error: 'Password required',
          requiresPassword: true
        });
      }

      // Redirect to original URL
      res.redirect(302, result.url);

    } catch (error) {
      logger.error('Error resolving short link:', error);
      const message = error instanceof Error ? error.message : 'Failed to resolve link';
      
      if (message.includes('not found')) {
        res.status(404).json({ success: false, error: 'Link not found' });
      } else if (message.includes('expired')) {
        res.status(410).json({ success: false, error: 'Link has expired' });
      } else if (message.includes('password')) {
        res.status(401).json({ success: false, error: 'Invalid password' });
      } else {
        res.status(500).json({ success: false, error: message });
      }
    }
  }
);

export { router as shortLinkRoutes };