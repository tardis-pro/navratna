import { z } from 'zod';
import { logger } from '@uaip/utils';
import { getConstellations } from '../services/constellation_service.js';
import type { ConstellationRequest } from '@uaip/types';

interface ConstellationRouteGroup {
  post(path: string, handler: (ctx: unknown) => unknown): ConstellationRouteGroup;
}

interface ConstellationRouteAppLike {
  group(path: string, handler: (group: ConstellationRouteGroup) => unknown): unknown;
}

const constellationRequestSchema = z.object({
  query: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
  includeItems: z.boolean().optional(),
});

export function registerConstellationRoutes<T>(app: T): T {
  const routeApp = app as unknown as ConstellationRouteAppLike;
  routeApp.group('/api/v1/knowledge', (group) =>
    group.post('/constellations', async (ctx) => {
      const context =
        ctx && typeof ctx === 'object'
          ? (ctx as { body?: unknown; set?: { status?: number | string } })
          : {};
      const body = context.body;
      const set = context.set;
      const parsed = constellationRequestSchema.safeParse(body);

      if (!parsed.success) {
        if (set) set.status = 400;
        return {
          success: false,
          error: 'Invalid constellation request',
          details: parsed.error.flatten(),
        };
      }

      try {
        const request: ConstellationRequest = parsed.data;
        const response = await getConstellations(request);

        return {
          success: true,
          ...response,
        };
      } catch (error) {
        logger.error('Failed to build constellations', { error });
        if (set) set.status = 500;
        return {
          success: false,
          error: 'Failed to build constellations',
        };
      }
    })
  );

  return app;
}
