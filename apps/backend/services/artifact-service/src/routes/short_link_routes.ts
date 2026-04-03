import { ShortLinkService } from '../services/short_link_service.js';
import { logger } from '@uaip/utils';

import { Elysia, t } from 'elysia';

function getBodyRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? value : null;
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

const LinkSchema = t.Any()
const LinkErrorSchema = t.Object({ success: t.Literal(false), error: t.String() })

export function registerShortLinkRoutes() {
  return new Elysia()
    .group(
      '/api/v1',
      (g) =>
      g
        .post(
          '/links',
          async ({ headers, body, set }) => {
            try {
              const userId = headers['x-user-id'];
              if (!userId) {
                set.status = 401;
                return { success: false, error: 'User not authenticated' };
              }

              const payload = getBodyRecord(body);
              const originalUrl = payload ? getString(Reflect.get(payload, 'originalUrl')) : undefined;
              if (!originalUrl) {
                set.status = 400;
                return { success: false, error: 'originalUrl is required' };
              }

              const svc = new ShortLinkService();
              const shortLink = await svc.createShortLink(originalUrl, userId, payload ?? undefined);
              logger.info('Short link created', {
                shortCode: shortLink.shortCode,
                userId,
                originalUrl,
              });
              set.status = 201;
              return { success: true, data: shortLink };
            } catch (error) {
              logger.error('Error creating short link:', error);
              set.status = 500;
              return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create short link',
              };
            }
          },
          {
            body: t.Object({
              originalUrl: t.String(),
              title: t.Optional(t.String()),
              description: t.Optional(t.String()),
              type: t.Optional(t.String()),
              customCode: t.Optional(t.String()),
              expiresAt: t.Optional(t.String()),
              maxClicks: t.Optional(t.Number()),
              tags: t.Optional(t.Array(t.String())),
              artifactId: t.Optional(t.String()),
              projectFileId: t.Optional(t.String()),
              generateQR: t.Optional(t.Boolean()),
            }),
            response: { 201: t.Object({ success: t.Literal(true), data: LinkSchema }), 400: LinkErrorSchema, 401: LinkErrorSchema, 500: LinkErrorSchema },
          }
        )

        .get(
          '/links',
          async ({ headers, query, set }) => {
            try {
              const userId = headers['x-user-id'];
              if (!userId) {
                set.status = 401;
                return { success: false, error: 'User not authenticated' };
              }

              const svc = new ShortLinkService();
              const options = {
                page: parseInt(String(query.page ?? 1)),
                limit: parseInt(String(query.limit ?? 20)),
                type: getString(query.type),
                search: getString(query.search),
              };
              const links = await svc.getUserLinks(userId, options);
              return { success: true, data: links };
            } catch (error) {
              logger.error('Error fetching user links:', error);
              set.status = 500;
              return { success: false, error: 'Failed to fetch links' };
            }
          },
          {
            query: t.Object({ page: t.Optional(t.String()), limit: t.Optional(t.String()), type: t.Optional(t.String()), search: t.Optional(t.String()) }),
            response: { 200: t.Object({ success: t.Literal(true), data: t.Array(LinkSchema) }), 401: LinkErrorSchema, 500: LinkErrorSchema },
          }
        )

        .get(
          '/links/:id',
          async ({ headers, params, set }) => {
            try {
              const userId = headers['x-user-id'];
              if (!userId) {
                set.status = 401;
                return { success: false, error: 'User not authenticated' };
              }

              const svc = new ShortLinkService();
              const link = await svc.getLinkById(params.id, userId);
              if (!link) {
                set.status = 404;
                return { success: false, error: 'Link not found' };
              }
              return { success: true, data: link };
            } catch (error) {
              logger.error('Error fetching link by ID:', error);
              set.status = 500;
              return { success: false, error: 'Failed to fetch link' };
            }
          },
          {
            response: { 200: t.Object({ success: t.Literal(true), data: LinkSchema }), 401: LinkErrorSchema, 404: LinkErrorSchema, 500: LinkErrorSchema },
          }
        )

        .put(
          '/links/:id',
          async ({ headers, params, body, set }) => {
            try {
              const userId = headers['x-user-id'];
              if (!userId) {
                set.status = 401;
                return { success: false, error: 'User not authenticated' };
              }

              const payload = getBodyRecord(body);
              if (!payload) {
                set.status = 400;
                return { success: false, error: 'Request body is required' };
              }

              const svc = new ShortLinkService();
              const updated = await svc.updateLink(params.id, userId, payload);
              logger.info('Short link updated', { linkId: params.id, userId });
              return { success: true, data: updated };
            } catch (error) {
              logger.error('Error updating link:', error);
              set.status = 500;
              return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to update link',
              };
            }
          },
          {
            body: t.Any(),
            response: { 200: t.Object({ success: t.Literal(true), data: LinkSchema }), 400: LinkErrorSchema, 401: LinkErrorSchema, 500: LinkErrorSchema },
          }
        )

        .delete(
          '/links/:id',
          async ({ headers, params, set }) => {
            try {
              const userId = headers['x-user-id'];
              if (!userId) {
                set.status = 401;
                return { success: false, error: 'User not authenticated' };
              }

              const svc = new ShortLinkService();
              await svc.deleteLink(params.id, userId);
              logger.info('Short link deleted', { linkId: params.id, userId });
              return { success: true, message: 'Link deleted successfully' };
            } catch (error) {
              logger.error('Error deleting link:', error);
              set.status = 500;
              return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete link',
              };
            }
          },
          {
            response: { 200: t.Object({ success: t.Literal(true), message: t.String() }), 401: LinkErrorSchema, 500: LinkErrorSchema },
          }
        )

        .post(
          '/links/:id/qr',
          async ({ headers, params, set }) => {
            try {
              const userId = headers['x-user-id'];
              if (!userId) {
                set.status = 401;
                return { success: false, error: 'User not authenticated' };
              }

              const svc = new ShortLinkService();
              const qrCode = await svc.generateQRCode(params.id, userId);
              return { success: true, data: { qrCode } };
            } catch (error) {
              logger.error('Error generating QR code:', error);
              set.status = 500;
              return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate QR code',
              };
            }
          },
          {
            response: { 200: t.Object({ success: t.Literal(true), data: t.Object({ qrCode: t.String() }) }), 401: LinkErrorSchema, 500: LinkErrorSchema },
          }
        )

        .get(
          '/links/:id/analytics',
          async ({ headers, params, set }) => {
            try {
              const userId = headers['x-user-id'];
              if (!userId) {
                set.status = 401;
                return { success: false, error: 'User not authenticated' };
              }

              const svc = new ShortLinkService();
              const analytics = await svc.getLinkAnalytics(params.id, userId);
              return { success: true, data: analytics };
            } catch (error) {
              logger.error('Error fetching link analytics:', error);
              set.status = 500;
              return { success: false, error: 'Failed to fetch analytics' };
            }
          },
          {
            response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }), 401: LinkErrorSchema, 500: LinkErrorSchema },
          }
        )
    )
    .group('/s', (g) =>
      g.get(
        '/:shortCode',
        async ({ params, headers }) => {
        try {
          const svc = new ShortLinkService();
          const result = await svc.resolveShortLink(params.shortCode, {
            password: undefined,
            userId: headers['x-user-id'],
            userAgent: headers['user-agent'],
            ip: headers['x-forwarded-for'] || undefined,
            referer: headers['referer'],
          });

          if ((result as Record<string, unknown>).requiresPassword) {
            return { success: false, error: 'Password required', requiresPassword: true };
          }

          return new Response(null, {
            status: 302,
            headers: { Location: (result as Record<string, unknown>).url as string },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to resolve link';
          if (message.includes('not found'))
            return new Response(JSON.stringify({ success: false, error: 'Link not found' }), {
              status: 404,
            });
          if (message.includes('expired'))
            return new Response(JSON.stringify({ success: false, error: 'Link has expired' }), {
              status: 410,
            });
          if (message.includes('password'))
            return new Response(JSON.stringify({ success: false, error: 'Invalid password' }), {
              status: 401,
            });
          return new Response(JSON.stringify({ success: false, error: message }), { status: 500 });
        }
        },
        {
          response: { 200: t.Any(), 302: t.Any() },
        }
      )
    );
}
