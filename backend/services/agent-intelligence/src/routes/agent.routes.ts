import { z } from 'zod';
import { logger } from '@uaip/utils';
import { relevance, type RelevanceInput } from '../services/relevance.js';

const candidateSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['agent', 'sop', 'task', 'knowledge', 'capability']),
  vector: z.array(z.number()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const relevanceSchema = z.object({
  query: z.string().min(1),
  candidates: z.array(candidateSchema),
  weights: z
    .object({
      vector: z.number(),
      graph: z.number(),
      recency: z.number(),
      explicit: z.number(),
    })
    .optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export function registerAgentRoutes(app: Record<string, unknown>): Record<string, unknown> {
  return app.group('/api/v1/agents', (group: Record<string, unknown>) =>
    group.post('/relevance', async ({ body, set }: Record<string, unknown>) => {
      const parsed = relevanceSchema.safeParse(body);

      if (!parsed.success) {
        set.status = 400;
        return {
          success: false,
          error: 'Invalid relevance payload',
          details: parsed.error.flatten(),
        };
      }

      try {
        const payload = parsed.data as RelevanceInput;
        const results = await relevance(payload);

        return {
          results,
          total: results.length,
          query: payload.query,
        };
      } catch (error) {
        logger.error('Failed to score relevance', { error });
        set.status = 500;
        return {
          success: false,
          error: 'Failed to score relevance',
        };
      }
    })
  );
}
