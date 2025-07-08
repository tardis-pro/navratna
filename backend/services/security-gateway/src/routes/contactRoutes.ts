import express, { Router } from 'express';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { authMiddleware, optionalAuth } from '@uaip/middleware';
import { validateRequest } from '@uaip/middleware';
import { AuditService } from '../services/auditService.js';
import { DatabaseService } from '@uaip/shared-services';
import { Request, Response } from 'express';
import { AuditEventType } from '@uaip/types';
import { ContactStatus } from '@uaip/shared-services';

const router: Router = express.Router();

// Lazy initialization of services
let databaseService: DatabaseService | null = null;
let auditService: AuditService | null = null;

async function getServices() {
  if (!databaseService) {
    databaseService = new DatabaseService();
    await databaseService.initialize();
    auditService = new AuditService();
  }
  return { databaseService, auditService: auditService! };
}

// Validation schemas
const contactRequestSchema = z.object({
  targetUserId: z.string().uuid('Invalid target user ID'),
  message: z.string().max(500).optional(),
  type: z.enum(['FRIEND', 'COLLEAGUE', 'PUBLIC']).default('FRIEND')
});

const contactActionSchema = z.object({
  action: z.enum(['accept', 'reject', 'block', 'unblock']),
  message: z.string().max(500).optional()
});

const contactQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'ACCEPTED', 'BLOCKED', 'REJECTED']).optional(),
  type: z.enum(['FRIEND', 'COLLEAGUE', 'PUBLIC']).optional(),
  search: z.string().max(100).optional()
});

// Helper function for Zod validation
const validateWithZod = (schema: z.ZodSchema, data: any) => {
  const result = schema.safeParse(data);
  if (result.success) {
    return { error: null, value: result.data };
  } else {
    return {
      error: {
        details: result.error.errors.map(err => ({
          message: err.message,
          path: err.path.join('.')
        }))
      },
      value: null
    };
  }
};

/**
 * @route POST /api/v1/contacts/request
 * @desc Send a contact request
 * @access Private - Authenticated users only
 */
router.post('/request', 
  authMiddleware,
  validateRequest({ body: contactRequestSchema }),
  async (req, res) => {
    try {
      const { error, value } = validateWithZod(contactRequestSchema, req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          details: error.details.map(d => d.message)
        });
        return;
      }

      const userId = (req as any).user.userId;
      const { targetUserId, message, type } = value;

      // Prevent sending request to self
      if (userId === targetUserId) {
        res.status(400).json({
          success: false,
          error: 'Invalid Request',
          message: 'Cannot send contact request to yourself'
        });
        return;
      }

      const { databaseService, auditService } = await getServices();

      // Check if target user exists
      const targetUser = await databaseService.users.findUserById(targetUserId);
      if (!targetUser) {
        res.status(404).json({
          success: false,
          error: 'User Not Found',
          message: 'Target user not found'
        });
        return;
      }

      // Check if contact relationship already exists
      const contactRepo = databaseService.users.getUserContactRepository();
      const existingContact = await contactRepo.findContactByUsers(userId, targetUserId);
      
      if (existingContact) {
        res.status(409).json({
          success: false,
          error: 'Contact Already Exists',
          message: `Contact relationship already exists with status: ${existingContact.status}`
        });
        return;
      }

      // Create contact request
      const contactRequest = await contactRepo.create({
        requesterId: userId,
        targetId: targetUserId,
        status: ContactStatus.PENDING,
        type: type,
        message: message
      });

      // Log audit event
      await auditService.logSecurityEvent({
        eventType: AuditEventType.USER_ACTION,
        userId: userId,
        details: {
          action: 'contact_request_sent',
          targetUserId: targetUserId,
          contactType: type,
          message: message
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(201).json({
        success: true,
        message: 'Contact request sent successfully',
        data: {
          id: contactRequest.id,
          targetUserId: targetUserId,
          status: contactRequest.status,
          type: contactRequest.type,
          createdAt: contactRequest.createdAt
        }
      });

    } catch (error) {
      logger.error('Send contact request error', { error, userId: (req as any).user?.userId });
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'An error occurred while sending the contact request'
      });
    }
  });

/**
 * @route GET /api/v1/contacts
 * @desc Get user's contacts
 * @access Private - Authenticated users only
 */
router.get('/', 
  authMiddleware,
  validateRequest({ query: contactQuerySchema }),
  async (req, res) => {
    try {
      const {
        page,
        limit,
        status,
        type,
        search
      } = req.query;

      const userId = (req as any).user.userId;
      const pageQuery = parseInt(page as string) || 1;
      const limitQuery = parseInt(limit as string) || 20;
      const offset = (pageQuery - 1) * limitQuery;

      const { databaseService } = await getServices();
      const contactRepo = databaseService.users.getUserContactRepository();

      // Build query filters
      const filters: any = {};
      if (status) filters.status = status;
      if (type) filters.type = type;

      // Get contacts with pagination
      const contacts = await contactRepo.findUserContacts(userId, {
        ...filters,
        limit: limitQuery,
        offset: offset,
        search: search as string
      });

      // Get total count for pagination (simplified for now)
      const totalCount = contacts.length;

      res.json({
        success: true,
        message: 'Contacts retrieved successfully',
        data: {
          contacts: contacts.map(contact => ({
            id: contact.id,
            user: contact.requesterId === userId ? contact.target : contact.requester,
            status: contact.status,
            type: contact.type,
            message: contact.message,
            isInitiator: contact.requesterId === userId,
            createdAt: contact.createdAt,
            acceptedAt: contact.acceptedAt
          })),
          pagination: {
            page: pageQuery,
            limit: limitQuery,
            total: totalCount,
            pages: Math.ceil(totalCount / limitQuery)
          }
        }
      });

    } catch (error) {
      logger.error('Get contacts error', { error, userId: (req as any).user?.userId });
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'An error occurred while retrieving contacts'
      });
    }
  });

/**
 * @route POST /api/v1/contacts/:contactId/action
 * @desc Accept, reject, or block a contact request
 * @access Private - Authenticated users only
 */
router.post('/:contactId/action',
  authMiddleware,
  validateRequest({ body: contactActionSchema }),
  async (req, res) => {
    try {
      const { contactId } = req.params;
      const { error, value } = validateWithZod(contactActionSchema, req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          details: error.details.map(d => d.message)
        });
        return;
      }

      const userId = (req as any).user.userId;
      const { action, message } = value;

      const { databaseService, auditService } = await getServices();
      const contactRepo = databaseService.users.getUserContactRepository();

      // Find the contact request
      const contact = await contactRepo.findById(contactId);

      if (!contact) {
        res.status(404).json({
          success: false,
          error: 'Contact Not Found',
          message: 'Contact request not found'
        });
        return;
      }

      // Check if user is authorized to perform this action
      const isTarget = contact.targetId === userId;
      const isRequester = contact.requesterId === userId;
      
      if (!isTarget && !isRequester) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: 'You are not authorized to perform this action'
        });
        return;
      }

      // Validate action based on current status and user role
      if (action === 'accept' && (!isTarget || contact.status !== ContactStatus.PENDING)) {
        res.status(400).json({
          success: false,
          error: 'Invalid Action',
          message: 'Can only accept pending requests as the target user'
        });
        return;
      }

      if (action === 'reject' && (!isTarget || contact.status !== ContactStatus.PENDING)) {
        res.status(400).json({
          success: false,
          error: 'Invalid Action',
          message: 'Can only reject pending requests as the target user'
        });
        return;
      }

      // Perform the action
      let updatedContact;
      switch (action) {
        case 'accept':
          updatedContact = await contactRepo.updateStatus(contactId, ContactStatus.ACCEPTED);
          break;
        case 'reject':
          updatedContact = await contactRepo.updateStatus(contactId, ContactStatus.REJECTED);
          break;
        case 'block':
          updatedContact = await contactRepo.blockContact(userId, contact.requesterId === userId ? contact.targetId : contact.requesterId);
          break;
        case 'unblock':
          await contactRepo.unblockContact(userId, contact.requesterId === userId ? contact.targetId : contact.requesterId);
          updatedContact = null;
          break;
        default:
          res.status(400).json({
            success: false,
            error: 'Invalid Action',
            message: 'Invalid action specified'
          });
          return;
      }

      // Log audit event
      await auditService.logSecurityEvent({
        eventType: AuditEventType.USER_ACTION,
        userId: userId,
        details: {
          action: `contact_${action}`,
          contactId: contactId,
          otherUserId: isTarget ? contact.requesterId : contact.targetId,
          previousStatus: contact.status,
          newStatus: updatedContact.status,
          message: message
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        message: `Contact ${action}ed successfully`,
        data: {
          id: updatedContact.id,
          status: updatedContact.status,
          acceptedAt: updatedContact.acceptedAt,
          blockedAt: updatedContact.blockedAt
        }
      });

    } catch (error) {
      logger.error('Contact action error', { error, userId: (req as any).user?.userId });
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'An error occurred while processing the contact action'
      });
    }
  });

/**
 * @route GET /api/v1/contacts/pending
 * @desc Get pending contact requests
 * @access Private - Authenticated users only
 */
router.get('/pending',
  authMiddleware,
  async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { databaseService } = await getServices();
      const contactRepo = databaseService.users.getUserContactRepository();

      const pendingRequests = await contactRepo.findPendingRequests(userId);

      res.json({
        success: true,
        message: 'Pending contact requests retrieved successfully',
        data: {
          requests: pendingRequests.map(contact => ({
            id: contact.id,
            requester: contact.requester,
            type: contact.type,
            message: contact.message,
            createdAt: contact.createdAt
          }))
        }
      });

    } catch (error) {
      logger.error('Get pending requests error', { error, userId: (req as any).user?.userId });
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'An error occurred while retrieving pending requests'
      });
    }
  });

export default router;