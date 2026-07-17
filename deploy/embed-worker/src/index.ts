/**
 * Navratna Embeddings worker — Cloudflare Workers AI behind an OpenAI-compatible
 * /embed endpoint.
 *
 *   POST /embed   { input: string | string[], model?: string }
 *     -> guarded by  X-Embed-Auth === env.EMBED_SECRET  (403 otherwise)
 *     -> returns OpenAI-compatible:
 *          { object:"list",
 *            data:[{ object:"embedding", index, embedding:number[] }],
 *            model, usage:{} }
 *
 *   GET  /health  -> 200 { status:"healthy", ... }
 *
 * The backend's env-driven embedding service (EMBEDDINGS_URL -> this worker's
 * /embed) POSTs the same body it would send OpenAI and parses the same response
 * shape, so nothing downstream changes — only the vectors' origin (and their
 * dimension) does.
 *
 * Model: @cf/baai/bge-large-en-v1.5 — the highest-quality English embedding
 * model on Workers AI. It emits 1024-dim vectors. Workers AI returns
 * { shape:[n,1024], data:number[][] }; we map data[i] -> data[i].embedding.
 * Set the Qdrant collection / EMBEDDINGS_DIM to 1024 to match.
 */

const DEFAULT_MODEL = '@cf/baai/bge-large-en-v1.5';

interface Env {
  AI: {
    run(
      model: string,
      inputs: { text: string[] }
    ): Promise<{ shape: number[]; data: number[][] }>;
  };
  EMBED_SECRET: string;
}

interface EmbedRequestBody {
  input: string | string[];
  model?: string;
}

interface OpenAIEmbeddingItem {
  object: 'embedding';
  index: number;
  embedding: number[];
}

interface OpenAIEmbeddingResponse {
  object: 'list';
  data: OpenAIEmbeddingItem[];
  model: string;
  usage: Record<string, number>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Normalize the OpenAI-style `input` to a non-empty string[]. */
function toInputs(input: unknown): string[] | null {
  if (typeof input === 'string') {
    return input.length > 0 ? [input] : null;
  }
  if (Array.isArray(input) && input.length > 0 && input.every((s) => typeof s === 'string')) {
    return input as string[];
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
      return Response.json({ status: 'healthy', model: DEFAULT_MODEL, ts: new Date().toISOString() });
    }

    if (url.pathname !== '/embed') {
      return Response.json({ error: 'Not Found' }, { status: 404 });
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
    }

    // Shared-secret guard (mirrors exec-worker's reverse edge-auth pattern).
    const provided = request.headers.get('X-Embed-Auth');
    if (!env.EMBED_SECRET || provided !== env.EMBED_SECRET) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!isRecord(body)) {
      return Response.json({ error: 'Malformed request body' }, { status: 400 });
    }

    const inputs = toInputs((body as EmbedRequestBody).input);
    if (!inputs) {
      return Response.json(
        { error: 'Field "input" must be a non-empty string or string[]' },
        { status: 400 }
      );
    }

    const model = typeof (body as EmbedRequestBody).model === 'string' && (body as EmbedRequestBody).model
      ? (body as EmbedRequestBody).model as string
      : DEFAULT_MODEL;

    try {
      // Workers AI returns { shape:[n, dim], data:number[][] } for bge models.
      const res = await env.AI.run(model, { text: inputs });
      const vectors = Array.isArray(res?.data) ? res.data : [];

      const data: OpenAIEmbeddingItem[] = vectors.map((embedding, index) => ({
        object: 'embedding',
        index,
        embedding,
      }));

      const response: OpenAIEmbeddingResponse = {
        object: 'list',
        data,
        model,
        usage: {},
      };
      return Response.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: `Embedding generation failed: ${message}` }, { status: 500 });
    }
  },
};
