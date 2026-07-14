import { z } from 'zod';
/* oxlint-disable no-await-in-loop -- SSE frames must be consumed and delivered in wire order. */
import { logger } from '@uaip/utils';
import {
  CodingSessionEventSchema,
  CreateCodingSessionRequestSchema,
  CodingSessionVerificationSchema,
  CodingEgressPhaseRequestSchema,
  CodingEgressPhaseResponseSchema,
} from '@uaip/types';
import type {
  CodingSessionEvent,
  CreateCodingSessionRequest,
  CodingSessionVerification,
  CodingEgressPhaseRequest,
  CodingEgressPhaseResponse,
} from '@uaip/types';

export type { CodingSessionEvent, CreateCodingSessionRequest, CodingSessionVerification, CodingEgressPhaseRequest, CodingEgressPhaseResponse };

const JSON_TIMEOUT_MS = 15_000;
const SSE_UNFRAMED_BUFFER_MAX = 64 * 1024;

export type NodeClientError =
  | { code: 'NODE_UNREACHABLE'; message: string }
  | { code: 'NODE_AUTH_FAILED'; status: number }
  | { code: 'NODE_NOT_FOUND'; sessionId: string }
  | { code: 'NODE_CONFLICT'; detail: string }
  | { code: 'NODE_ERROR'; status: number; body: string }
  | { code: 'RESPONSE_PARSE_ERROR'; detail: string };

export type NodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: NodeClientError };

export type NodeFetch = typeof globalThis.fetch;

const NodeSessionResponseSchema = z.object({
  sessionId: z.string().min(1),
  state: z.string().min(1),
});
type NodeSessionResponse = z.infer<typeof NodeSessionResponseSchema>;

const NodePromptResponseSchema = z.object({
  sessionId: z.string().min(1),
  state: z.string().min(1),
});

const NodeAbortResponseSchema = z.object({
  sessionId: z.string().min(1),
  state: z.string().min(1),
});

function redactCredentials(value: unknown, secrets: readonly string[], seen = new Set<unknown>()): unknown {
  if (secrets.length === 0) return value;
  if (typeof value === 'string') {
    let r = value;
    for (const s of secrets) {
      if (s.length > 0) r = r.split(s).join('[REDACTED]');
    }
    return r;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return value.map((item) => redactCredentials(item, secrets, seen));
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactCredentials(v, secrets, seen);
    }
    return out;
  }
  return value;
}

class SseParser {
  private buf = '';
  private frame: { id?: string; event?: string; dataParts: string[] } = { dataParts: [] };

  feed(chunk: string): Array<{ id?: string; event?: string; data: string }> {
    if (this.buf.length + chunk.length > SSE_UNFRAMED_BUFFER_MAX) {
      throw new Error(`SSE unframed buffer exceeded ${SSE_UNFRAMED_BUFFER_MAX} bytes`);
    }
    this.buf += chunk;
    const frames: Array<{ id?: string; event?: string; data: string }> = [];

    while (true) {
      const cr = this.buf.indexOf('\r\n');
      const lf = this.buf.indexOf('\n');
      if (cr === -1 && lf === -1) break;

      const isCr = cr !== -1 && (lf === -1 || cr < lf);
      const lineEnd = isCr ? cr : lf;
      const line = this.buf.slice(0, lineEnd);
      this.buf = this.buf.slice(lineEnd + (isCr ? 2 : 1));

      if (line === '' || line === '\r') {
        if (this.frame.dataParts.length > 0) {
          const data = this.frame.dataParts.join('\n');
          frames.push({
            id: this.frame.id,
            event: this.frame.event,
            data: data.endsWith('\n') ? data.slice(0, -1) : data,
          });
        }
        this.frame = { dataParts: [] };
      } else if (line.startsWith(':')) {
        // comment
      } else {
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const val = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'id') this.frame.id = val;
        else if (field === 'event') this.frame.event = val;
        else if (field === 'data') this.frame.dataParts.push(val);
      }
    }
    return frames;
  }
}

export type StreamEventsOpts = {
  baseUrl: string;
  token: string;
  sessionId: string;
  lastEventId?: string;
  signal: AbortSignal;
  credentialSecrets: readonly string[];
  onEvent: (parsed: CodingSessionEvent) => void | Promise<void>;
  onEnd?: () => void;
  onError: (err: NodeClientError) => void;
};

export class CodingNodeClient {
  private readonly fetch: NodeFetch;

  constructor(opts: { fetch?: NodeFetch } = {}) {
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async createSession(
    baseUrl: string,
    nodeToken: string,
    req: CreateCodingSessionRequest,
  ): Promise<NodeResult<NodeSessionResponse>> {
    return this.jsonPost(baseUrl, nodeToken, '/sessions', CreateCodingSessionRequestSchema.parse(req), NodeSessionResponseSchema);
  }

  async prompt(
    baseUrl: string,
    nodeToken: string,
    sessionId: string,
    message: string,
    idempotencyKey: string,
  ): Promise<NodeResult<{ sessionId: string; state: string }>> {
    return this.jsonPost(baseUrl, nodeToken, `/sessions/${sessionId}/prompt`, { message, idempotencyKey }, NodePromptResponseSchema);
  }

  async abort(
    baseUrl: string,
    nodeToken: string,
    sessionId: string,
  ): Promise<NodeResult<{ sessionId: string; state: string }>> {
    return this.jsonPost(baseUrl, nodeToken, `/sessions/${sessionId}/abort`, {}, NodeAbortResponseSchema);
  }

  async close(
    baseUrl: string,
    nodeToken: string,
    sessionId: string,
  ): Promise<NodeResult<void>> {
    return this.jsonDelete(baseUrl, nodeToken, `/sessions/${sessionId}`);
  }

  async verify(
    baseUrl: string,
    nodeToken: string,
    sessionId: string,
  ): Promise<NodeResult<CodingSessionVerification>> {
    return this.jsonGet(baseUrl, nodeToken, `/sessions/${sessionId}/verify`, CodingSessionVerificationSchema);
  }

  async refreshGithubCredential(
    baseUrl: string,
    nodeToken: string,
    sessionId: string,
    credential: { token: string; expiresAt: string },
  ): Promise<NodeResult<void>> {
    const RefreshResponseSchema = z.object({ sessionId: z.string().min(1) });
    const result = await this.jsonPost(
      baseUrl,
      nodeToken,
      `/sessions/${sessionId}/credentials/github`,
      credential,
      RefreshResponseSchema,
    );
    if (!result.ok) return result;
    return { ok: true, value: undefined };
  }

  async setEgressPhase(
    baseUrl: string,
    nodeToken: string,
    request: CodingEgressPhaseRequest,
  ): Promise<NodeResult<CodingEgressPhaseResponse>> {
    return this.jsonPost(
      baseUrl,
      nodeToken,
      '/phase',
      CodingEgressPhaseRequestSchema.parse(request),
      CodingEgressPhaseResponseSchema,
    );
  }

  streamEvents(opts: StreamEventsOpts): Promise<void> {
    const { baseUrl, token, sessionId, lastEventId, signal, credentialSecrets, onEvent, onEnd, onError } = opts;

    let endCalled = false;
    const callOnEnd = (): void => {
      if (!endCalled) {
        endCalled = true;
        onEnd?.();
      }
    };

    const run = async (): Promise<void> => {
      const encodedSessionId = encodeURIComponent(sessionId);
      const url = `${baseUrl}/sessions/${encodedSessionId}/events`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      };
      if (lastEventId != null) headers['Last-Event-ID'] = lastEventId;

      let resp: Response;
      try {
        resp = await this.fetch(url, { headers, signal });
      } catch (err) {
        if (signal.aborted) { callOnEnd(); return; }
        onError({ code: 'NODE_UNREACHABLE', message: err instanceof Error ? err.message : String(err) });
        callOnEnd();
        return;
      }

      if (resp.status === 401 || resp.status === 403) {
        onError({ code: 'NODE_AUTH_FAILED', status: resp.status });
        callOnEnd();
        return;
      }
      if (resp.status === 404) {
        onError({ code: 'NODE_NOT_FOUND', sessionId });
        callOnEnd();
        return;
      }
      if (resp.status !== 200) {
        onError({ code: 'NODE_ERROR', status: resp.status, body: '' });
        callOnEnd();
        return;
      }

      if (!resp.body) {
        onError({ code: 'NODE_UNREACHABLE', message: 'no response body' });
        callOnEnd();
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseParser();

      const cleanup = (): void => {
        reader.cancel().catch((error: unknown) => {
          logger.debug('coding-node-client: reader cancel after close failed', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
        callOnEnd();
      };

      if (signal.aborted) { cleanup(); return; }
      signal.addEventListener('abort', cleanup, { once: true });

      try {
        while (true) {
          let result: ReadableStreamReadResult<Uint8Array>;
          try {
            result = await reader.read();
          } catch (err) {
            if (!signal.aborted) {
              onError({ code: 'NODE_UNREACHABLE', message: `read error: ${err instanceof Error ? err.message : String(err)}` });
            }
            break;
          }

          if (result.done) break;

          let text: string;
          try {
            text = decoder.decode(result.value, { stream: true });
          } catch {
            onError({ code: 'NODE_UNREACHABLE', message: 'decode error' });
            break;
          }

          let frames: Array<{ id?: string; event?: string; data: string }>;
          try {
            frames = parser.feed(text);
          } catch (err) {
            onError({ code: 'NODE_UNREACHABLE', message: `SSE buffer overflow: ${err instanceof Error ? err.message : String(err)}` });
            break;
          }

          for (const frame of frames) {
            if (!frame.data) continue;

            let parsed: unknown;
            try {
              parsed = JSON.parse(frame.data);
            } catch {
              logger.warn('coding-node-client: non-JSON SSE data', { sessionId });
              continue;
            }

            const validated = CodingSessionEventSchema.safeParse(parsed);
            if (!validated.success) {
              logger.warn('coding-node-client: SSE event failed schema', { sessionId, error: validated.error.message.slice(0, 200) });
              continue;
            }

            if (validated.data.sessionId !== sessionId) {
              logger.warn('coding-node-client: SSE event session mismatch', { sessionId });
              continue;
            }
            if (frame.id && validated.data.id !== frame.id) {
              logger.warn('coding-node-client: SSE frame id mismatch', { sessionId });
              continue;
            }

            const redactedResult = CodingSessionEventSchema.safeParse(
              redactCredentials(validated.data, credentialSecrets),
            );
            if (!redactedResult.success) {
              logger.warn('coding-node-client: redacted event failed schema', { sessionId });
              continue;
            }

            try {
              await onEvent(redactedResult.data);
            } catch (err) {
              logger.warn('coding-node-client: onEvent threw, aborting', { sessionId, error: err instanceof Error ? err.message : String(err) });
              await reader.cancel();
              return;
            }
          }
        }
      } finally {
        signal.removeEventListener('abort', cleanup);
        cleanup();
      }
    };

    return run();
  }

  private async jsonPost<T>(
    baseUrl: string,
    nodeToken: string,
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<NodeResult<T>> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => { ctrl.abort(); }, JSON_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await this.fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nodeToken}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      return { ok: false, error: { code: 'NODE_UNREACHABLE', message: err instanceof Error ? err.message : String(err) } };
    }
    clearTimeout(timeout);
    return this.parseJsonResponse(resp, schema);
  }

  private async jsonGet<T>(
    baseUrl: string,
    nodeToken: string,
    path: string,
    schema: z.ZodType<T>,
  ): Promise<NodeResult<T>> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => { ctrl.abort(); }, JSON_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await this.fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${nodeToken}` },
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      return { ok: false, error: { code: 'NODE_UNREACHABLE', message: err instanceof Error ? err.message : String(err) } };
    }
    clearTimeout(timeout);
    return this.parseJsonResponse(resp, schema);
  }

  private async jsonDelete(
    baseUrl: string,
    nodeToken: string,
    path: string,
  ): Promise<NodeResult<void>> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => { ctrl.abort(); }, JSON_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await this.fetch(`${baseUrl}${path}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${nodeToken}` },
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      return { ok: false, error: { code: 'NODE_UNREACHABLE', message: err instanceof Error ? err.message : String(err) } };
    }
    clearTimeout(timeout);
    if (resp.status === 401 || resp.status === 403) return { ok: false, error: { code: 'NODE_AUTH_FAILED', status: resp.status } };
    if (resp.status === 404) return { ok: true, value: undefined };
    if (resp.status < 200 || resp.status >= 300) {
      const b = await resp.text().catch(() => '');
      return { ok: false, error: { code: 'NODE_ERROR', status: resp.status, body: b } };
    }
    return { ok: true, value: undefined };
  }

  private async parseJsonResponse<T>(resp: Response, schema: z.ZodType<T>): Promise<NodeResult<T>> {
    if (resp.status === 401 || resp.status === 403) return { ok: false, error: { code: 'NODE_AUTH_FAILED', status: resp.status } };
    if (resp.status === 404) return { ok: false, error: { code: 'NODE_NOT_FOUND', sessionId: 'unknown' } };
    if (resp.status === 409) {
      const b = await resp.text().catch(() => '');
      return { ok: false, error: { code: 'NODE_CONFLICT', detail: b.slice(0, 200) } };
    }
    if (resp.status < 200 || resp.status >= 300) {
      const b = await resp.text().catch(() => '');
      return { ok: false, error: { code: 'NODE_ERROR', status: resp.status, body: b.slice(0, 200) } };
    }
    let raw: unknown;
    try {
      raw = await resp.json();
    } catch (err) {
      return { ok: false, error: { code: 'RESPONSE_PARSE_ERROR', detail: `JSON: ${err instanceof Error ? err.message : String(err)}` } };
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: { code: 'RESPONSE_PARSE_ERROR', detail: `Schema: ${parsed.error.message.slice(0, 200)}` } };
    }
    return { ok: true, value: parsed.data };
  }
}
