/**
 * Inbound ingress for workflow definitions whose trigger.kind is 'webhook'.
 *
 * These definitions were previously accepted by the API, persisted, and never
 * registered anywhere — buildRepeatOptions() returned null for them and
 * registration silently skipped. This is the other half of that fix: the path a
 * 'webhook' trigger actually fires through.
 *
 * The routing key is `trigger.expr` on the definition, and it becomes the last
 * path segment. WorkflowEngineService owns the key → definition map; this route
 * only resolves and dispatches.
 *
 * AUTHENTICATION IS HMAC, NOT A SESSION. The caller is an external system, so
 * this route deliberately sits outside withRequiredAuth. Every request must carry
 * an `x-navratna-signature-256: sha256=<hex>` header computed over the exact raw
 * body with WORKFLOW_WEBHOOK_SECRET. With no secret configured the route refuses
 * every request rather than accepting unsigned ones — an unauthenticated path
 * that starts workflows (which can run shell steps) must fail closed.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Elysia, t } from 'elysia';
import { logger } from '@uaip/utils';
import { WorkflowEngineService } from '../services/workflow_engine_service.js';
import { WorkflowExecutorService } from '../services/workflow_executor_service.js';

const SIGNATURE_HEADER = 'x-navratna-signature-256';

const HookErrorSchema = t.Object({ success: t.Literal(false), error: t.String() });

export interface HookVerification {
  valid: boolean;
  error?: string;
}

/**
 * Constant-time comparison of the provided signature against one computed over
 * `rawBody`. Exported for tests: a signature check that is never exercised is
 * indistinguishable from one that always passes.
 */
export function verifyHookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): HookVerification {
  if (!secret) {
    return {
      valid: false,
      error: 'WORKFLOW_WEBHOOK_SECRET is not configured; workflow hooks are disabled',
    };
  }
  if (!signatureHeader) {
    return { valid: false, error: `Missing ${SIGNATURE_HEADER} header` };
  }

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const provided = Buffer.from(signatureHeader);
  const computed = Buffer.from(expected);

  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (provided.length !== computed.length) {
    return { valid: false, error: 'Signature mismatch' };
  }
  if (!timingSafeEqual(provided, computed)) {
    return { valid: false, error: 'Signature mismatch' };
  }
  return { valid: true };
}

export function registerWorkflowHookRoutes(
  workflowEngine: WorkflowEngineService,
  workflowExecutor: WorkflowExecutorService
) {
  return (
    new Elysia()
      // Same reasoning as the GitHub webhook route: the HMAC covers the exact
      // bytes sent, so Elysia must not parse and re-serialize the JSON before we
      // verify it. This instance holds only the hook route.
      .onParse(({ request }, contentType) => {
        if (contentType.startsWith('application/json')) {
          return request.text();
        }
      })
      .post(
        '/api/v1/workflows/hooks/:routingKey',
        async (ctx) => {
          const { routingKey } = ctx.params;
          const rawBody = typeof ctx.body === 'string' ? ctx.body : JSON.stringify(ctx.body ?? '');

          const verification = verifyHookSignature(
            rawBody,
            ctx.request.headers.get(SIGNATURE_HEADER),
            process.env.WORKFLOW_WEBHOOK_SECRET
          );
          if (!verification.valid) {
            logger.warn('Workflow hook rejected', { routingKey, error: verification.error });
            ctx.set.status = 401;
            return { success: false as const, error: verification.error ?? 'Unauthorized' };
          }

          // Resolved AFTER signature verification so an unsigned caller cannot
          // probe which routing keys exist.
          const definitionId = workflowEngine.resolveWebhookRoute(routingKey);
          if (!definitionId) {
            logger.warn('Workflow hook has no registered definition', { routingKey });
            ctx.set.status = 404;
            return { success: false as const, error: 'No workflow registered for this hook' };
          }

          try {
            const run = await workflowExecutor.runDefinition(definitionId);
            if (!run) {
              ctx.set.status = 404;
              return { success: false as const, error: 'Workflow definition not found' };
            }

            logger.info('Workflow hook fired', {
              routingKey,
              workflowDefinitionId: definitionId,
              operationId: run.operationId,
              status: run.status,
            });

            return {
              success: true as const,
              data: {
                operationId: run.operationId,
                workflowDefinitionId: run.workflowDefinitionId,
                status: run.status,
                durationMs: run.durationMs,
              },
            };
          } catch (error) {
            logger.error('Workflow hook execution failed', {
              routingKey,
              workflowDefinitionId: definitionId,
              error: error instanceof Error ? error.message : String(error),
            });
            ctx.set.status = 500;
            return { success: false as const, error: 'Workflow execution failed' };
          }
        },
        {
          params: t.Object({ routingKey: t.String() }),
          response: {
            200: t.Object({
              success: t.Literal(true),
              data: t.Object({
                operationId: t.String(),
                workflowDefinitionId: t.String(),
                status: t.String(),
                durationMs: t.Number(),
              }),
            }),
            401: HookErrorSchema,
            404: HookErrorSchema,
            500: HookErrorSchema,
          },
        }
      )
  );
}
