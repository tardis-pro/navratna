import { logger } from '@uaip/utils';
import { WorkspaceManager, type WorkspaceConfig } from '../services/workspace_manager_service.js';
import {
  CodingAgentExecutor,
  type CreateCodingSessionOptions,
  type LLMCredential,
  type CodingAgentEvent,
} from '../services/coding_agent_executor_service.js';

interface WorkspaceRouteContext {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, unknown>;
  request?: {
    headers?: { get?: (name: string) => string | null };
    signal?: AbortSignal;
  };
  set?: { status?: number };
}

interface WorkspaceRouteGroup {
  get: (
    path: string,
    handler: (ctx: WorkspaceRouteContext) => Promise<unknown> | unknown
  ) => WorkspaceRouteGroup;
  post: (
    path: string,
    handler: (ctx: WorkspaceRouteContext) => Promise<unknown> | unknown
  ) => WorkspaceRouteGroup;
  delete: (
    path: string,
    handler: (ctx: WorkspaceRouteContext) => Promise<unknown> | unknown
  ) => WorkspaceRouteGroup;
}

interface WorkspaceRouteApp {
  group: (
    path: string,
    handler: (group: WorkspaceRouteGroup) => WorkspaceRouteGroup
  ) => WorkspaceRouteApp;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function getHeader(headers: unknown, name: string): string | undefined {
  const h = headers as Record<string, unknown> | undefined;
  const v = h?.[name] ?? h?.[name.toLowerCase()];
  return typeof v === 'string' ? v : undefined;
}

export function registerWorkspaceRoutes(
  app: unknown,
  workspaceManager?: WorkspaceManager,
  codingAgentExecutor?: CodingAgentExecutor
) {
  const wm = workspaceManager ?? WorkspaceManager.getInstance();
  const executor = codingAgentExecutor ?? CodingAgentExecutor.getInstance(wm);

  logger.info('Registering workspace routes');

  const a = app as WorkspaceRouteApp;
  return a.group('/api/v1/workspaces', (g: WorkspaceRouteGroup) =>
    g
      .post('/', async ({ body, set }) => {
        const b = asRecord(body);
        const cfg: WorkspaceConfig = {
          workspaceId: asString(b.workspaceId) || `ws_${Date.now()}`,
          projectId: asString(b.projectId) || 'unknown',
          userId: asString(b.userId) || 'unknown',
          githubRepo: asString(b.githubRepo) || '',
          githubCloneUrl: asString(b.githubCloneUrl) || '',
          githubToken: asString(b.githubToken) || '',
          branchName: asString(b.branchName),
        };

        if (!cfg.githubRepo || !cfg.githubCloneUrl || !cfg.githubToken) {
          set.status = 400;
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'githubRepo, githubCloneUrl, githubToken are required',
            },
          };
        }

        const info = await wm.provisionWorkspace(cfg);
        return { success: true, data: info };
      })
      .get('/', async () => ({ success: true, data: wm.listWorkspaces() }))
      .get('/:id', async ({ params, set }) => {
        const id = asString(params?.id) || '';
        const info = await wm.getWorkspace(id);
        if (!info) {
          set.status = 404;
          return { success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found' } };
        }
        return { success: true, data: info };
      })
      .delete('/:id', async ({ params }) => {
        const id = asString(params?.id) || '';
        await wm.destroyWorkspace(id);
        return { success: true };
      })
      .post('/:id/sessions', async ({ params, body, set }) => {
        const workspaceId = asString(params?.id) || '';
        const b = asRecord(body);

        const sessionId = asString(b.sessionId) || `sess_${Date.now()}`;
        const userId = asString(b.userId) || 'unknown';
        const projectId = asString(b.projectId) || 'unknown';

        const llmCredentialsRaw = Array.isArray(b.llmCredentials) ? b.llmCredentials : [];
        const llmCredentials: LLMCredential[] = llmCredentialsRaw
          .map((x) => asRecord(x))
          .map((x) => {
            const type: LLMCredential['type'] = x.type === 'oauth' ? 'oauth' : 'api_key';
            return {
              provider: asString(x.provider) || '',
              type,
              apiKey: asString(x.apiKey),
              accessToken: asString(x.accessToken),
              refreshToken: asString(x.refreshToken),
            };
          })
          .filter((c) => Boolean(c.provider));

        if (!workspaceId) {
          set.status = 400;
          return {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'workspaceId is required' },
          };
        }

        const opts: CreateCodingSessionOptions = {
          sessionId,
          workspaceId,
          projectId,
          userId,
          llmCredentials,
          systemPromptAdditions: asString(b.systemPromptAdditions),
          continuePreviousSession: b.continuePreviousSession === true,
        };

        const result = await executor.createSession(opts);
        return { success: true, data: result };
      })
      .post('/:id/sessions/:sessionId/prompt', async (ctx: WorkspaceRouteContext) => {
        const workspaceId = asString(ctx.params?.id) || '';
        const sessionId = asString(ctx.params?.sessionId) || '';
        const b = asRecord(ctx.body);
        const message = asString(b.message) || asString(b.prompt) || '';

        if (!workspaceId || !sessionId || !message) {
          if (ctx.set) {
            ctx.set.status = 400;
          }
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'workspaceId, sessionId, message are required',
            },
          };
        }

        const accept =
          getHeader(ctx.headers, 'accept') || ctx.request?.headers?.get?.('accept') || '';
        const wantsSse =
          accept.includes('text/event-stream') || String(ctx.query?.stream || '') === 'true';

        if (!wantsSse) {
          await executor.prompt(sessionId, message);
          return { success: true };
        }

        const encoder = new TextEncoder();
        let closed = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const write = (data: string) => controller.enqueue(encoder.encode(data));

            const handler = (event: CodingAgentEvent) => {
              if (closed) return;
              write(`event: ${event.type}\n`);
              write(`data: ${JSON.stringify(event)}\n\n`);

              if (event.type === 'agent_end' || event.type === 'error') {
                cleanup();
                controller.close();
              }
            };

            const cleanup = () => {
              if (closed) return;
              closed = true;
              executor.off(`session:${sessionId}:event`, handler);
              if (timeout) clearTimeout(timeout);
            };

            executor.on(`session:${sessionId}:event`, handler);
            write('event: ready\n');
            write(`data: ${JSON.stringify({ sessionId })}\n\n`);

            executor
              .prompt(sessionId, message)
              .catch((error: unknown) => {
                write('event: error\n');
                write(
                  `data: ${JSON.stringify({
                    sessionId,
                    error: error instanceof Error ? error.message : String(error),
                  })}\n\n`
                );
                cleanup();
                controller.close();
              })
              .finally(() => {
                timeout = setTimeout(() => {
                  if (closed) return;
                  write('event: timeout\n');
                  write(`data: ${JSON.stringify({ sessionId })}\n\n`);
                  cleanup();
                  controller.close();
                }, 60_000);
              });

            const signal: AbortSignal | undefined = ctx.request?.signal;
            signal?.addEventListener?.('abort', () => {
              cleanup();
              try {
                controller.close();
              } catch {}
            });
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        });
      })
      .post('/:id/sessions/:sessionId/abort', async ({ params }) => {
        const sessionId = asString(params?.sessionId) || '';
        await executor.abort(sessionId);
        return { success: true };
      })
      .delete('/:id/sessions/:sessionId', async ({ params }) => {
        const sessionId = asString(params?.sessionId) || '';
        await executor.closeSession(sessionId);
        return { success: true };
      })
      // Persistent SSE stream: GET /:id/sessions/:sessionId/events
      // CodingSessionPage connects here via EventSource and receives all agent events
      .get('/:id/sessions/:sessionId/events', (ctx: WorkspaceRouteContext) => {
        const sessionId = asString(ctx.params?.sessionId) || '';
        if (!sessionId) {
          if (ctx.set) {
            ctx.set.status = 400;
          }
          return {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'sessionId required' },
          };
        }

        const encoder = new TextEncoder();
        let closed = false;

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const write = (data: string) => controller.enqueue(encoder.encode(data));

            const handler = (event: CodingAgentEvent) => {
              if (closed) return;
              write(`event: ${event.type}\n`);
              write(`data: ${JSON.stringify(event)}\n\n`);
              if (event.type === 'agent_end' || event.type === 'error') {
                cleanup();
                try {
                  controller.close();
                } catch {}
              }
            };

            const cleanup = () => {
              if (closed) return;
              closed = true;
              executor.off(`session:${sessionId}:event`, handler);
            };

            executor.on(`session:${sessionId}:event`, handler);
            // Send a heartbeat every 25s to keep the connection alive
            const heartbeat = setInterval(() => {
              if (closed) {
                clearInterval(heartbeat);
                return;
              }
              try {
                write(': heartbeat\n\n');
              } catch {
                cleanup();
                clearInterval(heartbeat);
              }
            }, 25_000);

            write('event: connected\n');
            write(
              `data: ${JSON.stringify({ sessionId, active: executor.isSessionActive(sessionId) })}\n\n`
            );

            const signal: AbortSignal | undefined = ctx.request?.signal;
            signal?.addEventListener?.('abort', () => {
              cleanup();
              clearInterval(heartbeat);
              try {
                controller.close();
              } catch {}
            });
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        });
      })
      .get('/:id/exec', async ({ params, query, body, set }) => {
        const workspaceId = asString(params?.id) || '';
        const cmd = asString(asRecord(body).command) || asString(query?.command) || '';
        if (!workspaceId || !cmd) {
          set.status = 400;
          return {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'command is required' },
          };
        }
        const result = await wm.execInWorkspace(workspaceId, cmd);
        return { success: result.exitCode === 0, data: result };
      })
  );
}
