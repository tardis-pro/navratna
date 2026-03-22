import { z } from 'zod';
import { logger } from '@uaip/utils';
import { getConstellations } from '../services/constellation.service.js';
import type { ConstellationRequest } from '@uaip/types';

const constellationRequestSchema = z.object({
  query: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
  includeItems: z.boolean().optional(),
});

export function registerConstellationRoutes(app: Record<string, unknown>): Record<string, unknown> {
  return app.group('/api/v1/knowledge', (group: Record<string, unknown>) =>
    group.post('/constellations', async ({ body, set }: Record<string, unknown>) => {
      const parsed = constellationRequestSchema.safeParse(body);

      if (!parsed.success) {
        set.status = 400;
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
        set.status = 500;
        return {
          success: false,
          error: 'Failed to build constellations',
        };
      }
    })
  );
}
