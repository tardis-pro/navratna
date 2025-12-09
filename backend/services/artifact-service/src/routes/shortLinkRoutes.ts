import { ShortLinkService } from '../services/shortLink.service.js';
import { logger } from '@uaip/utils';

function getShortLinkService(): ShortLinkService {
  return new ShortLinkService();
}

export function registerShortLinkRoutes(app: any) {
  // Auth via x-user-id header for user routes
  app.group('/api/v1', (g: any) =>
    g
      .post('/links', async ({ headers, body, set }: any) => {
        try {
          const userId = headers['x-user-id'];
          if (!userId) {
            set.status = 401;
            return { error: 'User not authenticated' };
          }
          const svc = getShortLinkService();
          const shortLink = await svc.createShortLink(body.originalUrl, userId, body);
          logger.info('Short link created', {
            shortCode: shortLink.shortCode,
            userId,
            originalUrl: body.originalUrl,
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
      })

      .get('/links', async ({ headers, query, set }: any) => {
        try {
          const userId = headers['x-user-id'];
          if (!userId) {
            set.status = 401;
            return { error: 'User not authenticated' };
          }
          const svc = getShortLinkService();
          const options = {
            page: parseInt(String(query.page ?? 1)),
            limit: parseInt(String(query.limit ?? 20)),
            type: query.type,
            search: query.search,
          } as any;
          const links = await svc.getUserLinks(userId, options);
          return { success: true, data: links };
        } catch (error) {
          logger.error('Error fetching user links:', error);
          set.status = 500;
          return { success: false, error: 'Failed to fetch links' };
        }
      })

      .get('/links/:id', async ({ headers, params, set }: any) => {
        try {
          const userId = headers['x-user-id'];
          if (!userId) {
            set.status = 401;
            return { error: 'User not authenticated' };
          }
          const svc = getShortLinkService();
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
      })

      .put('/links/:id', async ({ headers, params, body, set }: any) => {
        try {
          const userId = headers['x-user-id'];
          if (!userId) {
            set.status = 401;
            return { error: 'User not authenticated' };
          }
          const svc = getShortLinkService();
          const updated = await svc.updateLink(params.id, userId, body);
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
      })

      .delete('/links/:id', async ({ headers, params, set }: any) => {
        try {
          const userId = headers['x-user-id'];
          if (!userId) {
            set.status = 401;
            return { error: 'User not authenticated' };
          }
          const svc = getShortLinkService();
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
      })

      .post('/links/:id/qr', async ({ headers, params, set }: any) => {
        try {
          const userId = headers['x-user-id'];
          if (!userId) {
            set.status = 401;
            return { error: 'User not authenticated' };
          }
          const svc = getShortLinkService();
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
      })

      .get('/links/:id/analytics', async ({ headers, params, set }: any) => {
        try {
          const userId = headers['x-user-id'];
          if (!userId) {
            set.status = 401;
            return { error: 'User not authenticated' };
          }
          const svc = getShortLinkService();
          const analytics = await svc.getLinkAnalytics(params.id, userId);
          return { success: true, data: analytics };
        } catch (error) {
          logger.error('Error fetching link analytics:', error);
          set.status = 500;
          return { success: false, error: 'Failed to fetch analytics' };
        }
      })
  );

  // Public resolution (no auth) under /s/:shortCode
  app.group('/s', (g: any) =>
    g.get('/:shortCode', async ({ params, headers }: any) => {
      try {
        const svc = getShortLinkService();
        const result = await svc.resolveShortLink(params.shortCode, {
          password: undefined,
          userId: headers['x-user-id'],
          userAgent: headers['user-agent'],
          ip: headers['x-forwarded-for'] || undefined,
          referer: headers['referer'],
        });

        if ((result as any).requiresPassword) {
          return { success: false, error: 'Password required', requiresPassword: true };
        }

        return new Response(null, { status: 302, headers: { Location: (result as any).url } });
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
    })
  );

  return app;
}
