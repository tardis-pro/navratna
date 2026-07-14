import Elysia, { t } from 'elysia';
import { logger } from '@uaip/utils';
import type { CodingSessionEvent } from '@uaip/types';
import { requireJwtClaims } from '../auth/jwt_auth.js';
import type { SessionRegistry } from '../session/session_registry.js';

const SSE_CONTENT_TYPE = 'text/event-stream; charset=utf-8';
const HEARTBEAT_INTERVAL_MS = 15_000;
const BACKPRESSURE_CLOSE_THRESHOLD = 0;
const encoder = new TextEncoder();

// Strict integer-suffix pattern: rejects trailing junk like "session-1abc".
const LAST_EVENT_ID_RE = /^(.+)-(\d+)$/;

function toSseFrame(event: CodingSessionEvent): Uint8Array {
  const seq = event.seq ?? 0;
  const sessionId = event.sessionId ?? '';
  return encoder.encode(`id: ${sessionId}-${seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

function heartbeatFrame(): Uint8Array {
  return encoder.encode(': heartbeat\n\n');
}

function parseLastEventId(header: string | null | undefined, sessionId: string): number | undefined {
  if (!header) return undefined;
  const m = LAST_EVENT_ID_RE.exec(header);
  if (!m) return undefined;
  if (m[1] !== sessionId) return undefined;
  return parseInt(m[2]!, 10);
}

export function createEventsRoutes(registry: SessionRegistry) {
  return new Elysia().get(
    '/sessions/:id/events',
    async ({ params, request, set }) => {
      let claims;
      try {
        claims = await requireJwtClaims(request);
      } catch {
        set.status = 401;
        return new Response(JSON.stringify({ error: 'Invalid or expired JWT' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (claims.sessionId !== params.id) {
        set.status = 403;
        return new Response(JSON.stringify({ error: 'JWT sessionId does not match path' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const session = registry.get(params.id);
      if (!session) {
        set.status = 404;
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const lastEventIdHeader = request.headers.get('last-event-id');
      const afterSeq = parseLastEventId(lastEventIdHeader, params.id);

      logger.debug('exec-node-coding: SSE connection', { sessionId: params.id, afterSeq });

      let unsubscribe: (() => void) | null = null;
      let heartbeatHandle: ReturnType<typeof setInterval> | null = null;

      function cleanup(): void {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        if (heartbeatHandle) { clearInterval(heartbeatHandle); heartbeatHandle = null; }
      }

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          if (afterSeq !== undefined) {
            session.replaySince(afterSeq, (evt) => { controller.enqueue(toSseFrame(evt)); });
          } else {
            session.replayAll((evt) => { controller.enqueue(toSseFrame(evt)); });
          }

          unsubscribe = session.subscribe((evt: CodingSessionEvent) => {
            if (
              controller.desiredSize !== null &&
              controller.desiredSize <= BACKPRESSURE_CLOSE_THRESHOLD
            ) {
              logger.warn('exec-node-coding: SSE backpressure limit — closing stream', {
                sessionId: params.id,
              });
              cleanup();
              controller.close();
              return;
            }
            controller.enqueue(toSseFrame(evt));
          });

          heartbeatHandle = setInterval(() => {
            // Obey backpressure on heartbeats too.
            if (
              controller.desiredSize !== null &&
              controller.desiredSize <= BACKPRESSURE_CLOSE_THRESHOLD
            ) {
              cleanup();
              controller.close();
              return;
            }
            controller.enqueue(heartbeatFrame());
          }, HEARTBEAT_INTERVAL_MS);
        },

        cancel() {
          cleanup();
          logger.debug('exec-node-coding: SSE client disconnected', { sessionId: params.id });
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': SSE_CONTENT_TYPE,
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    },
    { params: t.Object({ id: t.String() }) }
  );
}
