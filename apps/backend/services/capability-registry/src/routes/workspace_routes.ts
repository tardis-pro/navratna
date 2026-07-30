import { Elysia, t } from 'elysia';
import { logger } from '@uaip/utils';
import { withNginxAuth, getNginxUser } from '@uaip/middleware';
import { WorkspaceManager } from '../services/workspace_manager_service.js';
import type { CodingSessionCoordinator } from '../services/execution_mesh/coding_session_coordinator.js';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

const WsAny = t.Any();
const WsErrorSchema = t.Object({
  success: t.Literal(false),
  error: t.Object({ code: t.String(), message: t.String() }),
});
const WsSuccessSchema = t.Object({ success: t.Boolean() });

function coordinatorErrorMessage(error: { code: string } & Record<string, unknown>): string {
  return typeof error.message === 'string' ? error.message : error.code;
}

function closeStreamController(
  controller: ReadableStreamDefaultController<Uint8Array>,
  sessionId: string,
): void {
  try {
    controller.close();
  } catch (error) {
    logger.debug('workspace-routes: SSE controller already closed', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function registerWorkspaceRoutes(
  workspaceManager?: WorkspaceManager,
  coordinator?: CodingSessionCoordinator,
) {
  const wm = workspaceManager ?? WorkspaceManager.getInstance();

  logger.info('Registering workspace routes');

  const app = new Elysia({ prefix: '/api/v1/workspaces' });

  return withNginxAuth(app)
    .get('/', (ctx) => {
      const user = getNginxUser(ctx);
      return { success: true as const, data: wm.listWorkspaces().filter((w) => w.userId === user.id) };
    })
    .get(
      '/:id',
      async (ctx) => {
        const user = getNginxUser(ctx);
        const id = ctx.params.id;
        const info = await wm.getWorkspace(id);
        if (!info) {
          ctx.set.status = 404;
          return { success: false as const, error: { code: 'NOT_FOUND', message: 'Workspace not found' } };
        }
        if (info.userId !== user.id) {
          ctx.set.status = 403;
          return { success: false as const, error: { code: 'FORBIDDEN', message: 'Not your workspace' } };
        }
        return { success: true as const, data: info };
      },
      { response: { 200: t.Object({ success: t.Literal(true), data: WsAny }), 404: WsErrorSchema } },
    )
    .delete(
      '/:id',
      async (ctx) => {
        const user = getNginxUser(ctx);
        const id = ctx.params.id;
        const info = await wm.getWorkspace(id);
        if (!info) {
          ctx.set.status = 404;
          return { success: false as const, error: { code: 'NOT_FOUND', message: 'Workspace not found' } };
        }
        if (info.userId !== user.id) {
          ctx.set.status = 403;
          return { success: false as const, error: { code: 'FORBIDDEN', message: 'Not your workspace' } };
        }
        await wm.destroyWorkspace(id);
        return { success: true as const };
      },
      { response: { 200: WsSuccessSchema } },
    )
    .post(
      '/:id/sessions',
      async (ctx) => {
        if (!coordinator) {
          ctx.set.status = 503;
          return { success: false as const, error: { code: 'SERVICE_UNAVAILABLE', message: 'Coding session coordinator not configured' } };
        }

        const user = getNginxUser(ctx);
        const workspaceId = ctx.params.id;
        const b = asRecord(ctx.body);
        const projectId = asString(b.projectId) || '';
        const tenantId = user.organizationId;

        const llmCredentials = (Array.isArray(b.llmCredentials) ? b.llmCredentials : [])
          .map((x) => asRecord(x))
          .map((x) => ({
            provider: asString(x.provider) || '',
            type: (x.type === 'oauth' ? 'oauth' : 'api_key') as 'api_key' | 'oauth',
            apiKey: asString(x.apiKey),
            accessToken: asString(x.accessToken),
            refreshToken: asString(x.refreshToken),
            expiresAt: typeof x.expiresAt === 'number' ? x.expiresAt : undefined,
          }))
          .filter((c) => Boolean(c.provider));

        if (!workspaceId || !projectId) {
          ctx.set.status = 400;
          return { success: false as const, error: { code: 'VALIDATION_ERROR', message: 'workspaceId and projectId are required' } };
        }

        const repositoryId = asString(b.repositoryId) || '';
        if (!repositoryId || !/^[1-9]\d*$/.test(repositoryId)) {
          ctx.set.status = 400;
          return { success: false as const, error: { code: 'VALIDATION_ERROR', message: 'repositoryId is required and must be a positive canonical decimal integer' } };
        }

        const bindingId = asString(b.bindingId) || '';
        if (!bindingId) {
          ctx.set.status = 400;
          return { success: false as const, error: { code: 'VALIDATION_ERROR', message: 'bindingId (GitHub App installation binding UUID) is required' } };
        }

        if ('githubToken' in b && b.githubToken !== undefined) {
          ctx.set.status = 400;
          return { success: false as const, error: { code: 'VALIDATION_ERROR', message: 'githubToken is not accepted; use bindingId instead' } };
        }

        const result = await coordinator.createSession({
          workspaceId, projectId, userId: user.id, tenantId, repositoryId, bindingId, llmCredentials,
          systemPromptAdditions: asString(b.systemPromptAdditions),
        });

        if (!result.ok) {
          const { code } = result.error;
          if (code === 'REDIS_UNAVAILABLE') { ctx.set.status = 503; return { success: false as const, error: { code, message: 'Session store unavailable' } }; }
          if (code === 'PROVISION_FAILED') { ctx.set.status = 503; return { success: false as const, error: { code, message: result.error.message } }; }
          if (code === 'BINDING_NOT_FOUND' || code === 'BINDING_INACTIVE') { ctx.set.status = 404; return { success: false as const, error: { code, message: result.error.message } }; }
          if (code === 'GITHUB_TOKEN_FAILED') { ctx.set.status = 502; return { success: false as const, error: { code, message: result.error.message } }; }
          ctx.set.status = 502;
          return { success: false as const, error: { code, message: coordinatorErrorMessage(result.error) } };
        }

        return { success: true as const, data: result.value };
      },
      {
        body: t.Object({
          projectId: t.String({ minLength: 1 }),
          repositoryId: t.String({ minLength: 1, pattern: '^[1-9]\\d*$' }),
          bindingId: t.String({
            minLength: 1,
            pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
          }),
          llmCredentials: t.Optional(t.Array(t.Any())),
          systemPromptAdditions: t.Optional(t.String()),
        }),
        response: {
          200: t.Object({ success: t.Literal(true), data: WsAny }),
          400: WsErrorSchema,
          503: WsErrorSchema,
        },
      },
    )
    .post(
      '/:id/sessions/:sessionId/prompt',
      async (ctx) => {
        if (!coordinator) {
          ctx.set.status = 503;
          return { success: false as const, error: { code: 'SERVICE_UNAVAILABLE', message: 'Coding session coordinator not configured' } };
        }

        const user = getNginxUser(ctx);
        const workspaceId = ctx.params.id;
        const sessionId = ctx.params.sessionId;
        const b = asRecord(ctx.body);
        const message = asString(b.message) || asString(b.prompt) || '';
        const idempotencyKey = ctx.headers['x-idempotency-key'] || asString(b.idempotencyKey) || '';

        if (!workspaceId || !sessionId || !message) {
          ctx.set.status = 400;
          return { success: false as const, error: { code: 'VALIDATION_ERROR', message: 'workspaceId, sessionId, message are required' } };
        }
        if (!idempotencyKey) {
          ctx.set.status = 400;
          return { success: false as const, error: { code: 'VALIDATION_ERROR', message: 'X-Idempotency-Key header or idempotencyKey body field is required' } };
        }

        const result = await coordinator.submitPrompt({
          workspaceId,
          sessionId,
          userId: user.id,
          tenantId: user.organizationId,
          message,
          idempotencyKey,
        });

        if (!result.ok) {
          const { code } = result.error;
          if (code === 'REDIS_UNAVAILABLE') { ctx.set.status = 503; return { success: false as const, error: { code, message: 'Session store unavailable' } }; }
          ctx.set.status = 502;
          return { success: false as const, error: { code, message: coordinatorErrorMessage(result.error) } };
        }

        const outcome = result.value;
        if (outcome.outcome === 'not_found') { ctx.set.status = 404; return { success: false as const, error: { code: 'NOT_FOUND', message: 'Session not found' } }; }
        if (outcome.outcome === 'owner_mismatch') { ctx.set.status = 403; return { success: false as const, error: { code: 'FORBIDDEN', message: 'Not your session' } }; }
        if (outcome.outcome === 'pending_duplicate') { ctx.set.status = 409; return { success: false as const, error: { code: 'DUPLICATE_PENDING', message: 'Prompt with this idempotency key is already in progress' } }; }
        if (outcome.outcome === 'busy') { ctx.set.status = 409; return { success: false as const, error: { code: 'SESSION_BUSY', message: `Session is ${outcome.state}` } }; }
        if (outcome.outcome === 'completed_duplicate') { return { success: true as const, data: { outcome: 'completed_duplicate', sessionId } }; }

        ctx.set.status = 202;
        return { success: true as const, data: { outcome: 'accepted', sessionId } };
      },
      {
        body: t.Object({
          message: t.Optional(t.String()),
          prompt: t.Optional(t.String()),
          idempotencyKey: t.Optional(t.String()),
        }),
      },
    )
    .get(
      '/:id/sessions/:sessionId/events',
      (ctx) => {
        if (!coordinator) {
          ctx.set.status = 503;
          return new Response(JSON.stringify({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Coordinator not configured' } }), { status: 503 });
        }

        const user = getNginxUser(ctx);
        const workspaceId = ctx.params.id;
        const sessionId = ctx.params.sessionId;
        const lastEventId = ctx.headers['last-event-id'] ?? undefined;
        const encoder = new TextEncoder();
        const abortCtrl = new AbortController();

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            void coordinator.streamEvents({
              workspaceId, sessionId, userId: user.id, lastEventId,
              tenantId: user.organizationId,
              signal: abortCtrl.signal,
              onEvent: (raw) => {
                if ((controller.desiredSize ?? 1) <= 0) {
                  abortCtrl.abort();
                  throw new Error('SSE downstream backpressure limit reached');
                }
                controller.enqueue(encoder.encode(raw));
              },
              onEnd: () => closeStreamController(controller, sessionId),
              onError: (errStr) => {
                logger.warn('workspace-routes: SSE stream error', { sessionId, errStr });
                try {
                  controller.enqueue(encoder.encode(`event: stream_error\ndata: ${JSON.stringify({ error: errStr })}\n\n`));
                } catch (error) {
                  logger.debug('workspace-routes: could not emit SSE stream error', {
                    sessionId,
                    error: error instanceof Error ? error.message : String(error),
                  });
                }
                abortCtrl.abort();
                closeStreamController(controller, sessionId);
              },
            }).catch((error: unknown) => {
              logger.error('workspace-routes: SSE proxy failed', {
                sessionId,
                error: error instanceof Error ? error.message : String(error),
              });
              abortCtrl.abort();
              closeStreamController(controller, sessionId);
            });

            ctx.request.signal?.addEventListener('abort', () => {
              abortCtrl.abort();
              closeStreamController(controller, sessionId);
            }, { once: true });

            const heartbeat = setInterval(() => {
              if ((controller.desiredSize ?? 1) <= 0) {
                clearInterval(heartbeat);
                abortCtrl.abort();
                return;
              }
              try {
                controller.enqueue(encoder.encode(': heartbeat\n\n'));
              } catch (error) {
                logger.debug('workspace-routes: heartbeat enqueue failed', {
                  sessionId,
                  error: error instanceof Error ? error.message : String(error),
                });
                clearInterval(heartbeat);
                abortCtrl.abort();
              }
            }, 25_000);

            abortCtrl.signal.addEventListener('abort', () => { clearInterval(heartbeat); }, { once: true });
          },
          cancel() { abortCtrl.abort(); },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        });
      },
    )
    .post(
      '/:id/sessions/:sessionId/abort',
      async (ctx) => {
        if (!coordinator) {
          ctx.set.status = 503;
          return { success: false as const, error: { code: 'SERVICE_UNAVAILABLE', message: 'Coordinator not configured' } };
        }

        const user = getNginxUser(ctx);
        const workspaceId = ctx.params.id;
        const sessionId = ctx.params.sessionId;
        const result = await coordinator.abortSession({
          sessionId,
          workspaceId,
          userId: user.id,
          tenantId: user.organizationId,
        });
        if (!result.ok) {
          const { code } = result.error;
          if (code === 'NOT_FOUND') { ctx.set.status = 404; return { success: false as const, error: { code, message: 'Session not found' } }; }
          if (code === 'OWNER_MISMATCH') { ctx.set.status = 403; return { success: false as const, error: { code: 'FORBIDDEN', message: 'Not your session' } }; }
          if (code === 'REDIS_UNAVAILABLE') { ctx.set.status = 503; return { success: false as const, error: { code, message: 'Session store unavailable' } }; }
          ctx.set.status = 502;
          return { success: false as const, error: { code, message: coordinatorErrorMessage(result.error) } };
        }
        return { success: true as const };
      },
      { response: { 200: WsSuccessSchema } },
    )
    .delete(
      '/:id/sessions/:sessionId',
      async (ctx) => {
        if (!coordinator) {
          ctx.set.status = 503;
          return { success: false as const, error: { code: 'SERVICE_UNAVAILABLE', message: 'Coordinator not configured' } };
        }

        const user = getNginxUser(ctx);
        const workspaceId = ctx.params.id;
        const sessionId = ctx.params.sessionId;
        const result = await coordinator.closeSession({
          sessionId,
          workspaceId,
          userId: user.id,
          tenantId: user.organizationId,
        });
        if (!result.ok) {
          const { code } = result.error;
          if (code === 'OWNER_MISMATCH') { ctx.set.status = 403; return { success: false as const, error: { code: 'FORBIDDEN', message: 'Not your session' } }; }
          if (code === 'REDIS_UNAVAILABLE') { ctx.set.status = 503; return { success: false as const, error: { code, message: 'Session store unavailable' } }; }
          ctx.set.status = 502;
          return { success: false as const, error: { code, message: coordinatorErrorMessage(result.error) } };
        }
        return { success: true as const };
      },
      { response: { 200: WsSuccessSchema } },
    )
    .get(
      '/:id/exec',
      async (ctx) => {
        const user = getNginxUser(ctx);
        const workspaceId = ctx.params.id;
        const cmd = asString(ctx.query.command) || '';
        if (!workspaceId || !cmd) {
          ctx.set.status = 400;
          return { success: false as const, error: { code: 'VALIDATION_ERROR', message: 'command is required' } };
        }
        const info = await wm.getWorkspace(workspaceId);
        if (!info) {
          ctx.set.status = 404;
          return { success: false as const, error: { code: 'NOT_FOUND', message: 'Workspace not found' } };
        }
        if (info.userId !== user.id) {
          ctx.set.status = 403;
          return { success: false as const, error: { code: 'FORBIDDEN', message: 'Not your workspace' } };
        }
        const result = await wm.execInWorkspace(workspaceId, cmd);
        return { success: result.exitCode === 0 as const, data: result };
      },
      {
        query: t.Object({ command: t.Optional(t.String()) }),
        response: {
          200: t.Object({ success: t.Boolean(), data: t.Object({ stdout: t.String(), stderr: t.String(), exitCode: t.Number() }) }),
          400: WsErrorSchema,
        },
      },
    );
}
