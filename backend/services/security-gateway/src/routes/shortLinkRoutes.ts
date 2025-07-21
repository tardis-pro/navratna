import { Router } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { ShortLinkService } from '../services/shortLink.service.js';
import { authMiddleware } from '@uaip/middleware';
import { logger } from '@uaip/utils';

// Define types locally to avoid entity imports
const LinkType = {
  ARTIFACT: 'artifact' as const,
  PROJECT_FILE: 'project_file' as const,
  DOCUMENT: 'document' as const,
  EXTERNAL: 'external' as const
};

const router: Router = Router();
const shortLinkService = new ShortLinkService();

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

// Create short link
router.post('/links',
  authMiddleware,
  [
    body('originalUrl').isURL().withMessage('Must be a valid URL'),
    body('title').optional().isString().isLength({ max: 255 }).withMessage('Title must be max 255 characters'),
    body('description').optional().isString().isLength({ max: 1000 }).withMessage('Description must be max 1000 characters'),
    body('type').optional().isIn(Object.values(LinkType)).withMessage('Invalid link type'),
    body('customCode').optional().isString().isLength({ min: 3, max: 20 }).withMessage('Custom code must be 3-20 characters'),
    body('expiresAt').optional().isISO8601().withMessage('Must be a valid date'),
    body('password').optional().isString().isLength({ min: 4, max: 50 }).withMessage('Password must be 4-50 characters'),
    body('maxClicks').optional().isInt({ min: 1 }).withMessage('Max clicks must be positive'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('generateQR').optional().isBoolean().withMessage('Generate QR must be boolean')
  ],
  validateRequest,
  async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
      }

      const { originalUrl, title, description, type, customCode, expiresAt, password, maxClicks, tags, generateQR } = req.body;

      const shortLink = await shortLinkService.createShortLink(originalUrl, userId, {
        title,
        description,
        type,
        customCode,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        password,
        maxClicks,
        tags,
        generateQR
      });

      res.status(201).json({
        success: true,
        data: {
          id: shortLink.id,
          shortCode: shortLink.shortCode,
          originalUrl: shortLink.originalUrl,
          shortUrl: `${process.env.SHORT_LINK_DOMAIN || 'https://s.uaip.dev'}/${shortLink.shortCode}`,
          title: shortLink.title,
          description: shortLink.description,
          type: shortLink.type,
          qrCode: shortLink.qrCode,
          createdAt: shortLink.createdAt
        }
      });
    } catch (error: any) {
      logger.error('Error creating short link:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create short link'
      });
    }
  }
);

// Create short link for artifact
router.post('/artifacts/:artifactId/share',
  authMiddleware,
  [
    param('artifactId').isString().withMessage('Artifact ID is required'),
    body('title').optional().isString().isLength({ max: 255 }),
    body('description').optional().isString().isLength({ max: 1000 }),
    body('expiresAt').optional().isISO8601(),
    body('password').optional().isString().isLength({ min: 4, max: 50 }),
    body('maxClicks').optional().isInt({ min: 1 }),
    body('generateQR').optional().isBoolean()
  ],
  validateRequest,
  async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { artifactId } = req.params;
      const { title, description, expiresAt, password, maxClicks, generateQR } = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
      }

      // Create artifact URL
      const artifactUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/artifacts/${artifactId}`;

      const shortLink = await shortLinkService.createShortLink(artifactUrl, userId, {
        title: title || `Artifact ${artifactId}`,
        description: description || `Shared artifact: ${artifactId}`,
        type: LinkType.ARTIFACT,
        artifactId,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        password,
        maxClicks,
        generateQR: generateQR !== false, // Default to true for artifacts
        tags: ['artifact', 'generated']
      });

      res.status(201).json({
        success: true,
        data: {
          id: shortLink.id,
          shortCode: shortLink.shortCode,
          originalUrl: shortLink.originalUrl,
          shortUrl: `${process.env.SHORT_LINK_DOMAIN || 'https://s.uaip.dev'}/${shortLink.shortCode}`,
          artifactId: shortLink.artifactId,
          title: shortLink.title,
          description: shortLink.description,
          qrCode: shortLink.qrCode,
          createdAt: shortLink.createdAt
        }
      });
    } catch (error: any) {
      logger.error('Error creating artifact share link:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create artifact share link'
      });
    }
  }
);

// Get user's short links
router.get('/links',
  authMiddleware,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('type').optional().isIn(Object.values(LinkType)).withMessage('Invalid link type'),
    query('search').optional().isString().isLength({ max: 255 })
  ],
  validateRequest,
  async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const type = req.query.type;
      const search = req.query.search;

      const links = await shortLinkService.getUserLinks(userId, { page, limit, type, search });

      res.json({
        success: true,
        data: links.map(link => ({
          id: link.id,
          shortCode: link.shortCode,
          originalUrl: link.originalUrl,
          shortUrl: `${process.env.SHORT_LINK_DOMAIN || 'https://s.uaip.dev'}/${link.shortCode}`,
          title: link.title,
          description: link.description,
          type: link.type,
          status: link.status,
          clickCount: link.clickCount,
          analytics: link.analytics,
          createdAt: link.createdAt,
          expiresAt: link.expiresAt
        }))
      });
    } catch (error: any) {
      logger.error('Error getting user links:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get links'
      });
    }
  }
);

// Get short link details
router.get('/links/:id',
  authMiddleware,
  [
    param('id').isString().withMessage('Link ID is required')
  ],
  validateRequest,
  async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
      }

      const link = await shortLinkService.getLinkById(id, userId);

      if (!link) {
        return res.status(404).json({
          success: false,
          message: 'Link not found'
        });
      }

      res.json({
        success: true,
        data: {
          id: link.id,
          shortCode: link.shortCode,
          originalUrl: link.originalUrl,
          shortUrl: `${process.env.SHORT_LINK_DOMAIN || 'https://s.uaip.dev'}/${link.shortCode}`,
          title: link.title,
          description: link.description,
          type: link.type,
          status: link.status,
          clickCount: link.clickCount,
          analytics: link.analytics,
          createdAt: link.createdAt,
          expiresAt: link.expiresAt,
          qrCode: link.qrCode,
          tags: link.tags
        }
      });
    } catch (error: any) {
      logger.error('Error getting link details:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get link details'
      });
    }
  }
);

// Update short link
router.put('/links/:id',
  authMiddleware,
  [
    param('id').isString().withMessage('Link ID is required'),
    body('title').optional().isString().isLength({ max: 255 }),
    body('description').optional().isString().isLength({ max: 1000 }),
    body('expiresAt').optional().isISO8601(),
    body('tags').optional().isArray()
  ],
  validateRequest,
  async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const updates = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
      }

      const updatedLink = await shortLinkService.updateLink(id, userId, updates);

      res.json({
        success: true,
        data: {
          id: updatedLink.id,
          shortCode: updatedLink.shortCode,
          title: updatedLink.title,
          description: updatedLink.description,
          expiresAt: updatedLink.expiresAt,
          tags: updatedLink.tags,
          updatedAt: updatedLink.updatedAt
        }
      });
    } catch (error: any) {
      logger.error('Error updating short link:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update link'
      });
    }
  }
);

// Delete short link
router.delete('/links/:id',
  authMiddleware,
  [
    param('id').isString().withMessage('Link ID is required')
  ],
  validateRequest,
  async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
      }

      await shortLinkService.deleteLink(id, userId);

      res.json({
        success: true,
        message: 'Link deleted successfully'
      });
    } catch (error: any) {
      logger.error('Error deleting short link:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete link'
      });
    }
  }
);

// Generate QR code for existing link
router.post('/links/:id/qr',
  authMiddleware,
  [
    param('id').isString().withMessage('Link ID is required')
  ],
  validateRequest,
  async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
      }

      const qrCode = await shortLinkService.generateQRCode(id, userId);

      res.json({
        success: true,
        data: {
          qrCode
        }
      });
    } catch (error: any) {
      logger.error('Error generating QR code:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate QR code'
      });
    }
  }
);

// Get link analytics
router.get('/links/:id/analytics',
  authMiddleware,
  [
    param('id').isString().withMessage('Link ID is required')
  ],
  validateRequest,
  async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
      }

      const analytics = await shortLinkService.getLinkAnalytics(id, userId);

      res.json({
        success: true,
        data: analytics
      });
    } catch (error: any) {
      logger.error('Error getting link analytics:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get analytics'
      });
    }
  }
);

// PUBLIC ROUTES - No authentication required

// Resolve short link (public)
router.get('/:shortCode',
  [
    param('shortCode').isString().withMessage('Short code is required'),
    query('password').optional().isString()
  ],
  validateRequest,
  async (req: any, res: any) => {
    try {
      const { shortCode } = req.params;
      const password = req.query.password;
      const userAgent = req.get('User-Agent');
      const ip = req.ip || req.connection.remoteAddress;
      const referer = req.get('Referer');

      const result = await shortLinkService.resolveShortLink(shortCode, {
        password,
        userAgent,
        ip,
        referer
      });

      if (result.requiresPassword) {
        return res.status(200).json({
          success: false,
          requiresPassword: true,
          message: 'Password required'
        });
      }

      // Check if client accepts JSON (API call) or HTML (browser)
      const acceptsJson = req.get('Accept')?.includes('application/json');

      if (acceptsJson) {
        // Return JSON for API calls
        res.json({
          success: true,
          url: result.url
        });
      } else {
        // Redirect for browser requests
        res.redirect(302, result.url);
      }
    } catch (error: any) {
      logger.error('Error resolving short link:', error);

      const acceptsJson = req.get('Accept')?.includes('application/json');

      if (acceptsJson) {
        res.status(404).json({
          success: false,
          message: error.message || 'Link not found'
        });
      } else {
        // Redirect to a 404 page or home page for browser requests
        res.status(404).send(`
          <html>
            <head><title>Link Not Found</title></head>
            <body>
              <h1>Link Not Found</h1>
              <p>The short link you requested could not be found or has expired.</p>
              <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}">Go to Home</a></p>
            </body>
          </html>
        `);
      }
    }
  }
);

export default router;