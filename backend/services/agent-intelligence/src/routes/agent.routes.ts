import { z } from 'zod';
import { logger } from '@uaip/utils';
import { relevance, type RelevanceInput } from '../services/relevance.js';

interface AgentRouteGroup {
  post(path: string, handler: (ctx: unknown) => unknown): AgentRouteGroup;
}

interface AgentRouteAppLike {
  group(path: string, handler: (group: AgentRouteGroup) => unknown): unknown;
}

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

export function registerAgentRoutes<T>(app: T): T {
  const routeApp = app as unknown as AgentRouteAppLike;
  routeApp.group('/api/v1/agents', (group) =>
    group.post('/relevance', async (ctx) => {
      const context =
        ctx && typeof ctx === 'object' ? (ctx as { body?: unknown; set?: { status?: number | string } }) : {};
      const body = context.body;
      const set = context.set;
      const parsed = relevanceSchema.safeParse(body);

      if (!parsed.success) {
        if (set) set.status = 400;
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
        if (set) set.status = 500;
        return {
          success: false,
          error: 'Failed to score relevance',
        };
      }
    })
  );

  return app;
}
