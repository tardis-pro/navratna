import { Elysia } from 'elysia';
import { z } from 'zod';
import { withRequiredAuth } from '@uaip/middleware';
import { AuditService } from '../services/audit_service.js';
import { UserService } from '@uaip/shared-services';
import { AuditEventType } from '@uaip/types';

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

function getContactMeta(contact: { metadata?: Record<string, unknown> | null }) {
  return (contact.metadata ?? {}) as Record<string, unknown>;
}

function getContactStatus(contact: { metadata?: Record<string, unknown> | null }): string {
  const status = getContactMeta(contact)['status'];
  return typeof status === 'string' ? status : 'PENDING';
}

export function registerContactRoutes<T extends Elysia>(elysiaApp: T): T {
  elysiaApp.group('/api/v1/contacts', (app: any) =>
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
        const directContacts = await contactRepo.findByUserId(userId);
        const reverseContacts = await contactRepo.findByUserId(targetUserId);
        const existing =
          directContacts.find((c) => c.contactUserId === targetUserId) ??
          reverseContacts.find((c) => c.contactUserId === userId);
        if (existing) {
          set.status = 409;
          return {
            success: false,
            error: 'Contact Already Exists',
            message: `Contact relationship already exists with status: ${getContactStatus(existing)}`,
          };
        }
        const contactRequest = await contactRepo.create({
          userId,
          contactUserId: targetUserId,
          relationship: type.toLowerCase(),
          metadata: {
            status: 'PENDING',
            type,
            message,
            requesterId: userId,
            targetUserId,
          },
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
            status: getContactStatus(contactRequest),
            type,
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
        const { page, limit, status } = parsed.data;
        const userId = user!.id;
        const _offset = (page - 1) * limit;
        const { userService } = await getServices();
        const contactRepo = userService.getUserContactRepository();
        const allContacts = await contactRepo.findByUserId(userId);
        const contacts = status
          ? allContacts.filter((c) => getContactStatus(c) === status)
          : allContacts;
        const total = contacts.length;
        return {
          success: true,
          message: 'Contacts retrieved successfully',
          data: {
            contacts: contacts.map((c) => ({
              id: c.id,
              user: {
                id: c.contactUserId,
                name: c.name,
                email: c.email,
                phone: c.phone,
              },
              status: getContactStatus(c),
              type:
                typeof getContactMeta(c)['type'] === 'string'
                  ? String(getContactMeta(c)['type'])
                  : c.relationship,
              message:
                typeof getContactMeta(c)['message'] === 'string'
                  ? String(getContactMeta(c)['message'])
                  : undefined,
              isInitiator: c.userId === userId,
              createdAt: c.createdAt,
              acceptedAt: getContactMeta(c)['acceptedAt'],
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
        const { contactId } = params;
        const { action, message } = parsed.data;
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
        const isTarget = contact.contactUserId === userId;
        const isRequester = contact.userId === userId;
        if (!isTarget && !isRequester) {
          set.status = 403;
          return {
            success: false,
            error: 'Unauthorized',
            message: 'You are not authorized to perform this action',
          };
        }
        const currentStatus = getContactStatus(contact);
        if (action === 'accept' && (!isTarget || currentStatus !== 'PENDING')) {
          set.status = 400;
          return {
            success: false,
            error: 'Invalid Action',
            message: 'Can only accept pending requests as the target user',
          };
        }
        if (action === 'reject' && (!isTarget || currentStatus !== 'PENDING')) {
          set.status = 400;
          return {
            success: false,
            error: 'Invalid Action',
            message: 'Can only reject pending requests as the target user',
          };
        }
        let updated = contact;
        const baseMeta = getContactMeta(contact);
        switch (action) {
          case 'accept':
            updated =
              (await contactRepo.update(contactId, {
                metadata: {
                  ...baseMeta,
                  status: 'ACCEPTED',
                  acceptedAt: new Date().toISOString(),
                },
              })) ?? contact;
            break;
          case 'reject':
            updated =
              (await contactRepo.update(contactId, {
                metadata: {
                  ...baseMeta,
                  status: 'REJECTED',
                  rejectedAt: new Date().toISOString(),
                },
              })) ?? contact;
            break;
          case 'block':
            updated =
              (await contactRepo.update(contactId, {
                metadata: {
                  ...baseMeta,
                  status: 'BLOCKED',
                  blockedBy: userId,
                  blockedAt: new Date().toISOString(),
                },
              })) ?? contact;
            break;
          case 'unblock':
            updated =
              (await contactRepo.update(contactId, {
                metadata: {
                  ...baseMeta,
                  status: 'ACTIVE',
                  unblockedBy: userId,
                  unblockedAt: new Date().toISOString(),
                },
              })) ?? contact;
            break;
        }
        const updatedMeta = getContactMeta(updated);
        await auditService.logSecurityEvent({
          eventType: AuditEventType.USER_ACTION,
          userId,
          details: {
            action: `contact_${action}`,
            contactId,
            otherUserId: isTarget ? contact.userId : contact.contactUserId,
            previousStatus: currentStatus,
            newStatus: getContactStatus(updated),
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
                status: getContactStatus(updated),
                acceptedAt: updatedMeta['acceptedAt'],
                blockedAt: updatedMeta['blockedAt'],
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
        const pending = (await contactRepo.findByUserId(userId)).filter(
          (c) => getContactStatus(c) === 'PENDING'
        );
        return {
          success: true,
          message: 'Pending contact requests retrieved successfully',
          data: {
            requests: pending.map((c) => ({
              id: c.id,
              requester: {
                id: c.userId,
                name: c.name,
                email: c.email,
              },
              type:
                typeof getContactMeta(c)['type'] === 'string'
                  ? String(getContactMeta(c)['type'])
                  : c.relationship,
              message:
                typeof getContactMeta(c)['message'] === 'string'
                  ? String(getContactMeta(c)['message'])
                  : undefined,
              createdAt: c.createdAt,
            })),
          },
        };
      })
  );

  return elysiaApp;
}

export default registerContactRoutes;
