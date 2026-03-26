import type { AnyElysia } from 'elysia';
import { z } from 'zod';
import { withRequiredAuth } from '@uaip/middleware';
import { AuditService } from '../services/audit_service.js';
import {
  ContactStatus as RepoContactStatus,
  ContactType,
  UserService,
} from '@uaip/shared-services';
import { AuditEventType } from '@uaip/types';
import { ContactStatus as _ContactStatus } from '@uaip/shared-services';

let auditServiceSingleton: AuditService | null = null;
let userServiceSingleton: UserService | null = null;
async function getServices() {
  if (!userServiceSingleton) {
    userServiceSingleton = UserService.getInstance();
  }
  if (!auditServiceSingleton) {
    auditServiceSingleton = new AuditService();
  }
  return { userService: userServiceSingleton, auditService: auditServiceSingleton };
}

const contactRequestSchema = z.object({
  targetUserId: z.string().uuid('Invalid target user ID'),
  message: z.string().max(500).optional(),
  type: z.enum(['FRIEND', 'COLLEAGUE', 'PUBLIC']).default('FRIEND'),
});

const contactActionSchema = z.object({
  action: z.enum(['accept', 'reject', 'block', 'unblock']),
  message: z.string().max(500).optional(),
});

const contactQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'ACCEPTED', 'BLOCKED', 'REJECTED']).optional(),
  type: z.enum(['FRIEND', 'COLLEAGUE', 'PUBLIC']).optional(),
  search: z.string().max(100).optional(),
});

export function registerContactRoutes(elysiaApp: AnyElysia): AnyElysia {
  return elysiaApp.group('/api/v1/contacts', (app: AnyElysia) =>
    withRequiredAuth(app)
      // POST /request
      // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
      .post('/request', async ({ set, body, user, request, headers }) => {
        const parsed = contactRequestSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return {
            success: false,
            error: 'Validation Error',
            details: parsed.error.issues.map((i) => i.message),
          };
        }
        const { targetUserId, message, type } = parsed.data;
        const userId = user!.id;
        if (userId === targetUserId) {
          set.status = 400;
          return {
            success: false,
            error: 'Invalid Request',
            message: 'Cannot send contact request to yourself',
          };
        }
        const { userService, auditService } = await getServices();
        const targetUser = await userService.findUserById(targetUserId);
        if (!targetUser) {
          set.status = 404;
          return { success: false, error: 'User Not Found', message: 'Target user not found' };
        }
        const contactRepo = userService.getUserContactRepository();
        const existing = await contactRepo.findContactByUsers(userId, targetUserId);
        if (existing) {
          set.status = 409;
          return {
            success: false,
            error: 'Contact Already Exists',
            message: `Contact relationship already exists with status: ${existing.status}`,
          };
        }
        const typeEnum = String(type).toLowerCase() as ContactType;
        const contactRequest = await contactRepo.create({
          requesterId: userId,
          targetId: targetUserId,
          status: RepoContactStatus.PENDING,
          type: typeEnum,
          message,
        });
        await auditService.logSecurityEvent({
          eventType: AuditEventType.USER_ACTION,
          userId,
          details: { action: 'contact_request_sent', targetUserId, contactType: type, message },
          ipAddress: request.headers.get('x-forwarded-for') || '',
          userAgent: headers['user-agent'],
        });
        set.status = 201;
        return {
          success: true,
          message: 'Contact request sent successfully',
          data: {
            id: contactRequest.id,
            targetUserId,
            status: contactRequest.status,
            type: contactRequest.type,
            createdAt: contactRequest.createdAt,
          },
        };
      })

      // GET /
      // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
      .get('/', async ({ set, query, user }) => {
        const parsed = contactQuerySchema.safeParse(query);
        if (!parsed.success) {
          set.status = 400;
          return {
            success: false,
            error: 'Validation Error',
            details: parsed.error.issues.map((i) => i.message),
          };
        }
        const { page, limit, status } = parsed.data as unknown;
        const userId = user!.id;
        const _offset = (page - 1) * limit;
        const { userService } = await getServices();
        const contactRepo = userService.getUserContactRepository();
        const statusEnum = status ? (String(status).toLowerCase() as RepoContactStatus) : undefined;
        const contacts = await contactRepo.findUserContacts(userId, statusEnum as unknown);
        const total = contacts.length;
        return {
          success: true,
          message: 'Contacts retrieved successfully',
          data: {
            contacts: contacts.map((c) => ({
              id: c.id,
              user: c.requesterId === userId ? c.target : c.requester,
              status: c.status,
              type: c.type,
              message: c.message,
              isInitiator: c.requesterId === userId,
              createdAt: c.createdAt,
              acceptedAt: c.acceptedAt,
            })),
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
          },
        };
      })

      // POST /:contactId/action
      // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
      .post('/:contactId/action', async ({ set, params, body, user, request, headers }) => {
        const parsed = contactActionSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return {
            success: false,
            error: 'Validation Error',
            details: parsed.error.issues.map((i) => i.message),
          };
        }
        const { contactId } = params as unknown;
        const { action, message } = parsed.data as unknown;
        const userId = user!.id;
        const { userService, auditService } = await getServices();
        const contactRepo = userService.getUserContactRepository();
        const contact = await contactRepo.findById(contactId);
        if (!contact) {
          set.status = 404;
          return {
            success: false,
            error: 'Contact Not Found',
            message: 'Contact request not found',
          };
        }
        const isTarget = contact.targetId === userId;
        const isRequester = contact.requesterId === userId;
        if (!isTarget && !isRequester) {
          set.status = 403;
          return {
            success: false,
            error: 'Unauthorized',
            message: 'You are not authorized to perform this action',
          };
        }
        if (action === 'accept' && (!isTarget || contact.status !== RepoContactStatus.PENDING)) {
          set.status = 400;
          return {
            success: false,
            error: 'Invalid Action',
            message: 'Can only accept pending requests as the target user',
          };
        }
        if (action === 'reject' && (!isTarget || contact.status !== RepoContactStatus.PENDING)) {
          set.status = 400;
          return {
            success: false,
            error: 'Invalid Action',
            message: 'Can only reject pending requests as the target user',
          };
        }
        let updated: Record<string, unknown> | null = null;
        switch (action) {
          case 'accept':
            updated = await contactRepo.updateStatus(contactId, RepoContactStatus.ACCEPTED);
            break;
          case 'reject':
            updated = await contactRepo.updateStatus(contactId, RepoContactStatus.REJECTED);
            break;
          case 'block':
            updated = await contactRepo.blockContact(
              userId,
              contact.requesterId === userId ? contact.targetId : contact.requesterId
            );
            break;
          case 'unblock':
            await contactRepo.unblockContact(
              userId,
              contact.requesterId === userId ? contact.targetId : contact.requesterId
            );
            break;
        }
        await auditService.logSecurityEvent({
          eventType: AuditEventType.USER_ACTION,
          userId,
          details: {
            action: `contact_${action}`,
            contactId,
            otherUserId: isTarget ? contact.requesterId : contact.targetId,
            previousStatus: contact.status,
            newStatus: updated?.status,
            message,
          },
          ipAddress: request.headers.get('x-forwarded-for') || '',
          userAgent: headers['user-agent'],
        });
        return {
          success: true,
          message: `Contact ${action}ed successfully`,
          data: updated
            ? {
                id: updated.id,
                status: updated.status,
                acceptedAt: updated.acceptedAt,
                blockedAt: updated.blockedAt,
              }
            : null,
        };
      })

      // GET /pending
      // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
      .get('/pending', async ({ user }) => {
        const userId = user!.id;
        const { userService } = await getServices();
        const contactRepo = userService.getUserContactRepository();
        const pending = await contactRepo.findPendingRequests(userId);
        return {
          success: true,
          message: 'Pending contact requests retrieved successfully',
          data: {
            requests: pending.map((c) => ({
              id: c.id,
              requester: c.requester,
              type: c.type,
              message: c.message,
              createdAt: c.createdAt,
            })),
          },
        };
      })
  );
}

export default registerContactRoutes;
