import { Elysia, t } from 'elysia';
import { z } from 'zod';
import { withRequiredAuth } from '@uaip/middleware';
import { logger } from '@uaip/utils';

import { DevLoopOrchestrator } from '../services/dev_loop_orchestrator.js';
import { HealingAgentService } from '../services/healing_agent_service.js';

/**
 * Deliberately narrow surface.
 *
 * HealingAgentService.applyFixes() publishes `rdlo.healing.fix.applied` and returns
 * true without writing a single file, and DevAgentService.executeStory() opens a pull
 * request for a branch it never creates or pushes. Exposing either as an endpoint would
 * report success for work that did not happen, so only genuinely-performed capabilities
 * are routed here: CI failure diagnosis (real classification) and dev-loop state reads.
 */

const ErrorSchema = t.Object({ success: t.Literal(false), error: t.String() });

const diagnoseSchema = z.object({
  prUrl: z.string().min(1),
  ciOutput: z.string().min(1),
});

interface DevLoopServices {
  devLoopOrchestrator?: DevLoopOrchestrator;
  healingAgent?: HealingAgentService;
}

export function registerDevLoopRoutes(services: DevLoopServices) {
  return new Elysia().group('/api/v1/dev-loop', (group) =>
    withRequiredAuth(group)
      .post(
        '/diagnose',
        async (ctx) => {
          const healingAgent = services.healingAgent;
          if (!healingAgent) {
            ctx.set.status = 503;
            return { success: false, error: 'Healing agent unavailable' };
          }

          const parsed = diagnoseSchema.safeParse(ctx.body);
          if (!parsed.success) {
            ctx.set.status = 400;
            return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload' };
          }

          try {
            const diagnosis = await healingAgent.diagnose(
              parsed.data.prUrl,
              parsed.data.ciOutput
            );
            return { success: true, data: diagnosis };
          } catch (error) {
            logger.error('CI failure diagnosis failed', {
              error: error instanceof Error ? error.message : String(error),
            });
            ctx.set.status = 500;
            return { success: false, error: 'Diagnosis failed' };
          }
        },
        {
          body: t.Object({ prUrl: t.String(), ciOutput: t.String() }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: ErrorSchema,
            500: ErrorSchema,
            503: ErrorSchema,
          },
        }
      )

      .get(
        '/loops/:id',
        async (ctx) => {
          const orchestrator = services.devLoopOrchestrator;
          if (!orchestrator) {
            ctx.set.status = 503;
            return { success: false, error: 'Dev loop orchestrator unavailable' };
          }

          try {
            const state = await orchestrator.getLoopState(ctx.params.id);
            if (!state) {
              ctx.set.status = 404;
              return { success: false, error: 'Dev loop not found' };
            }
            return { success: true, data: state };
          } catch (error) {
            logger.error('Failed to read dev loop state', {
              error: error instanceof Error ? error.message : String(error),
              loopId: ctx.params.id,
            });
            ctx.set.status = 500;
            return { success: false, error: 'Failed to read dev loop state' };
          }
        },
        {
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            404: ErrorSchema,
            500: ErrorSchema,
            503: ErrorSchema,
          },
        }
      )

      .post(
        '/loops/:id/cancel',
        async (ctx) => {
          const orchestrator = services.devLoopOrchestrator;
          if (!orchestrator) {
            ctx.set.status = 503;
            return { success: false, error: 'Dev loop orchestrator unavailable' };
          }

          try {
            await orchestrator.cancelLoop(ctx.params.id);
            return { success: true, data: { id: ctx.params.id, cancelled: true } };
          } catch (error) {
            logger.error('Failed to cancel dev loop', {
              error: error instanceof Error ? error.message : String(error),
              loopId: ctx.params.id,
            });
            ctx.set.status = 500;
            return { success: false, error: 'Failed to cancel dev loop' };
          }
        },
        {
          response: {
            200: t.Object({
              success: t.Literal(true),
              data: t.Object({ id: t.String(), cancelled: t.Boolean() }),
            }),
            500: ErrorSchema,
            503: ErrorSchema,
          },
        }
      )
  );
}
