/**
 * Navratna Execution Mesh — Cloudflare exec-worker (the "light" tier).
 *
 * The data-plane node for `runtime: 'worker'` (spec 11 §3.1). A request-scoped
 * V8 isolate — it holds NO Redis/BullMQ subscription. The scheduler in
 * capability-registry statically registers it as `worker-cf` and dispatches to
 * it by HTTP fetch:
 *
 *     POST /exec   { correlationId, toolId, params, ctx, sandbox, ... }   (an
 *                  ExecutionRequestEnvelope — see @uaip/types)
 *     -> guarded by  X-Edge-Auth === env.EXEC_WORKER_SECRET  (403 otherwise)
 *     -> returns an ExecutionResultEnvelope-shaped body:
 *          { correlationId, ok, output?, error?, metrics:{ nodeId, durationMs } }
 *
 * This is the REVERSE of the edge API gateway's trust pattern: the gateway
 * INJECTS X-Edge-Auth so the Fly backends trust it; here the worker TRUSTS
 * requests bearing the shared secret.
 *
 * What it runs:
 *   - pure-JS tools ported (Workers-compatible, no node built-ins) from
 *     capability-registry/base_tool_executor.ts: math-calculator, text-analysis,
 *     time-utility, id-generator, web-search (real `fetch`). `file-reader` is
 *     deliberately NOT here — a Worker has no filesystem, so it stays native.
 *   - an HTTP / streamable-http MCP proxy: for `mcp-*` tools it makes the MCP
 *     JSON-RPC `tools/call` over `fetch` to the server URL carried in
 *     `sandbox.httpUrl` and returns the result.
 *
 * NOTE (intentional duplication): base_tool_executor.ts stays the NATIVE source
 * of truth; this file RE-IMPLEMENTS the same pure-JS logic for the V8 isolate
 * runtime (no node imports). Keep the two in sync conceptually.
 */

const NODE_ID = 'worker-cf';

interface Env {
  EXEC_WORKER_SECRET: string;
}

// --- wire contract (structural; mirrors @uaip/types execution_mesh) ---------

interface ExecutionSandboxPolicy {
  httpUrl?: string;
  [key: string]: unknown;
}

interface ExecutionRequestEnvelope {
  correlationId: string;
  toolId: string;
  params: Record<string, unknown>;
  ctx?: { userId?: string; tenant?: string; scopedToken?: string };
  sandbox?: ExecutionSandboxPolicy;
  deadlineMs?: number;
}

interface ExecutionResultEnvelope {
  correlationId: string;
  ok: boolean;
  output?: unknown;
  error?: string;
  metrics: { nodeId: string; durationMs: number; [k: string]: unknown };
}

class ToolError extends Error {}

// --- helpers ----------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function ok(env: ExecutionRequestEnvelope, output: unknown, startedAt: number): ExecutionResultEnvelope {
  return {
    correlationId: env.correlationId,
    ok: true,
    output,
    metrics: { nodeId: NODE_ID, durationMs: Date.now() - startedAt },
  };
}

function fail(
  env: ExecutionRequestEnvelope,
  code: string,
  message: string,
  startedAt: number
): ExecutionResultEnvelope {
  return {
    correlationId: env.correlationId,
    ok: false,
    error: `${code}: ${message}`,
    metrics: { nodeId: NODE_ID, durationMs: Date.now() - startedAt, code },
  };
}

// ===========================================================================
// Pure-JS tools — ported from base_tool_executor.ts (Workers-compatible)
// ===========================================================================

function executeMathCalculator(parameters: unknown): unknown {
  const p = asRecord(parameters);
  const operation = asString(p.operation);
  const operands = Array.isArray(p.operands) ? p.operands.map((n) => Number(n)) : [];

  if (!operation) throw new ToolError('Math calculator requires operation and operands array');

  let result: number;
  switch (operation.toLowerCase()) {
    case 'add':
    case 'addition':
      result = operands.reduce((sum, num) => sum + num, 0);
      break;
    case 'subtract':
    case 'subtraction':
      result = operands.reduce((diff, num, i) => (i === 0 ? num : diff - num));
      break;
    case 'multiply':
    case 'multiplication':
      result = operands.reduce((product, num) => product * num, 1);
      break;
    case 'divide':
    case 'division':
      result = operands.reduce((quotient, num, i) => {
        if (i === 0) return num;
        if (num === 0) throw new ToolError('Division by zero');
        return quotient / num;
      });
      break;
    case 'power':
      if (operands.length !== 2) throw new ToolError('Power operation requires exactly 2 operands');
      result = Math.pow(operands[0], operands[1]);
      break;
    case 'sqrt':
      if (operands.length !== 1) throw new ToolError('Square root operation requires exactly 1 operand');
      if (operands[0] < 0) throw new ToolError('Cannot calculate square root of negative number');
      result = Math.sqrt(operands[0]);
      break;
    case 'sin':
      if (operands.length !== 1) throw new ToolError('Sine operation requires exactly 1 operand');
      result = Math.sin(operands[0]);
      break;
    case 'cos':
      if (operands.length !== 1) throw new ToolError('Cosine operation requires exactly 1 operand');
      result = Math.cos(operands[0]);
      break;
    case 'tan':
      if (operands.length !== 1) throw new ToolError('Tangent operation requires exactly 1 operand');
      result = Math.tan(operands[0]);
      break;
    default:
      throw new ToolError(`Unsupported math operation: ${operation}`);
  }

  return { operation, operands, result, timestamp: new Date().toISOString() };
}

function countSyllables(word: string): number {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function getReadingLevel(fleschScore: number): string {
  if (fleschScore >= 90) return 'Very Easy';
  if (fleschScore >= 80) return 'Easy';
  if (fleschScore >= 70) return 'Fairly Easy';
  if (fleschScore >= 60) return 'Standard';
  if (fleschScore >= 50) return 'Fairly Difficult';
  if (fleschScore >= 30) return 'Difficult';
  return 'Very Difficult';
}

function executeTextAnalysis(parameters: unknown): unknown {
  const p = asRecord(parameters);
  const text = asString(p.text);
  const analysisType = asString(p.analysisType) ?? 'all';

  if (!text) throw new ToolError('Text analysis requires a text string');

  const results: Record<string, unknown> = {
    originalText: text,
    timestamp: new Date().toISOString(),
  };

  if (analysisType === 'all' || analysisType === 'basic') {
    results.basic = {
      characterCount: text.length,
      wordCount: text.trim().split(/\s+/).filter((w) => w.length > 0).length,
      sentenceCount: text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length,
      paragraphCount: text.split(/\n\s*\n/).filter((para) => para.trim().length > 0).length,
    };
  }

  if (analysisType === 'all' || analysisType === 'sentiment') {
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'like', 'happy', 'joy'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'sad', 'angry', 'disappointed'];
    const words = text.toLowerCase().split(/\s+/);
    const positiveCount = words.filter((w) => positiveWords.includes(w)).length;
    const negativeCount = words.filter((w) => negativeWords.includes(w)).length;
    let sentiment = 'neutral';
    if (positiveCount > negativeCount) sentiment = 'positive';
    else if (negativeCount > positiveCount) sentiment = 'negative';
    results.sentiment = {
      overall: sentiment,
      positiveWords: positiveCount,
      negativeWords: negativeCount,
      score: (positiveCount - negativeCount) / Math.max(words.length, 1),
    };
  }

  if (analysisType === 'all' || analysisType === 'keywords') {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'];
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.includes(w));
    const wordFreq: Record<string, number> = {};
    words.forEach((w) => {
      wordFreq[w] = (wordFreq[w] ?? 0) + 1;
    });
    results.keywords = Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));
  }

  if (analysisType === 'all' || analysisType === 'readability') {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    const syllables = words.reduce((count, w) => count + countSyllables(w), 0);
    const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
    const avgSyllablesPerWord = syllables / Math.max(words.length, 1);
    const fleschScore = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
    results.readability = {
      averageWordsPerSentence: avgWordsPerSentence,
      averageSyllablesPerWord: avgSyllablesPerWord,
      fleschReadingEase: Math.max(0, Math.min(100, fleschScore)),
      readingLevel: getReadingLevel(fleschScore),
    };
  }

  return results;
}

function formatDate(date: Date, format: string): string {
  switch (format.toLowerCase()) {
    case 'iso':
      return date.toISOString();
    case 'date':
      return date.toDateString();
    case 'time':
      return date.toTimeString();
    case 'locale':
      return date.toLocaleString();
    case 'short':
      return date.toLocaleDateString();
    default:
      return date.toISOString();
  }
}

function addTimeUnit(date: Date, amount: number, unit: string): Date {
  const result = new Date(date);
  switch (unit.toLowerCase()) {
    case 'milliseconds':
    case 'ms':
      result.setMilliseconds(result.getMilliseconds() + amount);
      break;
    case 'seconds':
    case 's':
      result.setSeconds(result.getSeconds() + amount);
      break;
    case 'minutes':
    case 'm':
      result.setMinutes(result.getMinutes() + amount);
      break;
    case 'hours':
    case 'h':
      result.setHours(result.getHours() + amount);
      break;
    case 'days':
    case 'd':
      result.setDate(result.getDate() + amount);
      break;
    case 'weeks':
    case 'w':
      result.setDate(result.getDate() + amount * 7);
      break;
    case 'months':
      result.setMonth(result.getMonth() + amount);
      break;
    case 'years':
    case 'y':
      result.setFullYear(result.getFullYear() + amount);
      break;
    default:
      throw new ToolError(`Unsupported time unit: ${unit}`);
  }
  return result;
}

function executeTimeUtility(parameters: unknown): unknown {
  const p = asRecord(parameters);
  const operation = asString(p.operation);
  const timezone = asString(p.timezone) ?? 'UTC';
  const format = asString(p.format) ?? 'ISO';

  const now = new Date();
  const results: Record<string, unknown> = { operation, timestamp: now.toISOString() };

  switch (operation?.toLowerCase()) {
    case 'current':
      results.current = {
        iso: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
        formatted: formatDate(now, format),
        timezone,
      };
      break;
    case 'parse': {
      const dateString = asString(p.dateString);
      if (!dateString) throw new ToolError('Parse operation requires dateString parameter');
      const parsed = new Date(dateString);
      if (isNaN(parsed.getTime())) throw new ToolError('Invalid date string');
      results.parsed = {
        iso: parsed.toISOString(),
        unix: Math.floor(parsed.getTime() / 1000),
        formatted: formatDate(parsed, format),
      };
      break;
    }
    case 'add':
    case 'subtract': {
      const amount = typeof p.amount === 'number' ? p.amount : Number(p.amount);
      const unit = asString(p.unit);
      const date = asString(p.date) ?? now.toISOString();
      if (!amount || !unit) throw new ToolError('Add/subtract operations require amount and unit parameters');
      const baseDate = new Date(date);
      if (isNaN(baseDate.getTime())) throw new ToolError('Invalid base date');
      const multiplier = operation === 'subtract' ? -1 : 1;
      const resultDate = addTimeUnit(baseDate, amount * multiplier, unit);
      results.result = {
        iso: resultDate.toISOString(),
        unix: Math.floor(resultDate.getTime() / 1000),
        formatted: formatDate(resultDate, format),
      };
      break;
    }
    case 'diff': {
      const startDate = asString(p.startDate);
      const endDate = asString(p.endDate);
      if (!startDate || !endDate) throw new ToolError('Diff operation requires startDate and endDate parameters');
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new ToolError('Invalid date(s)');
      const diffMs = end.getTime() - start.getTime();
      results.difference = {
        milliseconds: diffMs,
        seconds: Math.floor(diffMs / 1000),
        minutes: Math.floor(diffMs / (1000 * 60)),
        hours: Math.floor(diffMs / (1000 * 60 * 60)),
        days: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
      };
      break;
    }
    default:
      throw new ToolError(`Unsupported time operation: ${operation}`);
  }

  return results;
}

function executeIdGenerator(parameters: unknown): unknown {
  const p = asRecord(parameters);
  const count = typeof p.count === 'number' ? p.count : 1;
  const type = asString(p.type) ?? 'sequential';
  const min = typeof p.min === 'number' ? p.min : 1;
  const max = typeof p.max === 'number' ? p.max : 1000000;

  if (count < 1 || count > 100) throw new ToolError('Count must be between 1 and 100');

  const ids: number[] = [];
  switch (type) {
    case 'sequential': {
      const baseId = Date.now() % 1000000;
      for (let i = 0; i < count; i++) ids.push(baseId + i);
      break;
    }
    case 'random':
      for (let i = 0; i < count; i++) ids.push(Math.floor(Math.random() * (max - min + 1)) + min);
      break;
    case 'timestamp':
      for (let i = 0; i < count; i++) ids.push(Date.now() + i);
      break;
    default:
      throw new ToolError(`Unsupported ID type: ${type}. Supported types: sequential, random, timestamp`);
  }

  return {
    ids,
    count: ids.length,
    type,
    range: type === 'random' ? { min, max } : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * web-search — the worker tier runs this as a real `fetch` (spec §3.1: "an
 * authenticated fetch + a transform"), using DuckDuckGo's public Instant Answer
 * API (no auth/key). The native base_tool_executor version is a static stub; the
 * worker upgrades it to a live call while keeping a compatible result shape.
 */
async function executeWebSearch(parameters: unknown): Promise<unknown> {
  const p = asRecord(parameters);
  const query = asString(p.query);
  const maxResults = typeof p.maxResults === 'number' ? p.maxResults : 10;
  const language = asString(p.language) ?? 'en';

  if (!query) throw new ToolError('Web search requires query parameter');

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new ToolError(`Web search upstream error: HTTP ${resp.status}`);
  const data = asRecord(await resp.json());

  const results: Array<{ title: string; url: string; snippet: string; domain: string }> = [];
  const abstractUrl = asString(data.AbstractURL);
  const abstractText = asString(data.AbstractText);
  if (abstractUrl && abstractText) {
    results.push({
      title: asString(data.Heading) ?? query,
      url: abstractUrl,
      snippet: abstractText,
      domain: safeDomain(abstractUrl),
    });
  }
  const related = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
  for (const topic of related) {
    const t = asRecord(topic);
    const firstUrl = asString(t.FirstURL);
    const textVal = asString(t.Text);
    if (firstUrl && textVal) {
      results.push({
        title: textVal.split(' - ')[0] ?? textVal,
        url: firstUrl,
        snippet: textVal,
        domain: safeDomain(firstUrl),
      });
    }
    if (results.length >= maxResults) break;
  }

  return {
    query,
    results: results.slice(0, maxResults),
    totalResults: results.length,
    language,
    provider: 'duckduckgo',
    timestamp: new Date().toISOString(),
  };
}

function safeDomain(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
}

// ===========================================================================
// HTTP / streamable-http MCP proxy
// ===========================================================================

/** `mcp-<server>-<tool>` -> { serverName, toolName }, or null if not an MCP id. */
function parseMcpToolId(toolId: string): { serverName: string; toolName: string } | null {
  const parts = toolId.split('-');
  if (parts.length < 3 || parts[0] !== 'mcp') return null;
  return { serverName: parts[1], toolName: parts.slice(2).join('-') };
}

/** Minimal SSE reader: return the last JSON `data:` line's parsed value. */
function parseSse(body: string): unknown {
  let last: unknown;
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      last = JSON.parse(payload);
    } catch {
      // ignore non-JSON keepalive frames
    }
  }
  return last;
}

async function proxyMcpTool(env: ExecutionRequestEnvelope): Promise<unknown> {
  const parsed = parseMcpToolId(env.toolId);
  if (!parsed) throw new ToolError(`Not an MCP tool id: ${env.toolId}`);

  const httpUrl = env.sandbox?.httpUrl;
  if (!httpUrl) throw new ToolError(`No MCP server URL (sandbox.httpUrl) for ${env.toolId}`);

  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name: parsed.toolName, arguments: env.params },
  };

  // A scoped, short-lived per-call token (spec §4) is forwarded as a bearer when
  // the control plane mints one; today ctx.scopedToken is a Phase-2 stub.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  const scoped = env.ctx?.scopedToken;
  if (scoped && scoped !== 'system') headers.Authorization = `Bearer ${scoped}`;

  const resp = await fetch(httpUrl, { method: 'POST', headers, body: JSON.stringify(request) });
  if (!resp.ok) throw new ToolError(`MCP HTTP ${resp.status} ${resp.statusText}`);

  const contentType = resp.headers.get('content-type') || '';
  let rpc: unknown;
  if (contentType.includes('text/event-stream')) {
    rpc = parseSse(await resp.text());
  } else {
    rpc = await resp.json();
  }

  const rpcRec = asRecord(rpc);
  if (isRecord(rpcRec.error)) {
    const errRec = rpcRec.error;
    throw new ToolError(`${asString(errRec.message) ?? 'MCP error'} (${String(errRec.code ?? '')})`);
  }

  // Mirror base_tool_executor.executeMCPTool result envelope for parity.
  return {
    toolId: env.toolId,
    serverName: parsed.serverName,
    toolName: parsed.toolName,
    parameters: env.params,
    result: rpcRec.result ?? rpc,
    protocol: 'mcp',
    executionTime: Date.now(),
    success: true,
  };
}

// ===========================================================================
// Dispatch + fetch handler
// ===========================================================================

async function runTool(env: ExecutionRequestEnvelope): Promise<unknown> {
  switch (env.toolId) {
    case 'math-calculator':
      return executeMathCalculator(env.params);
    case 'text-analysis':
      return executeTextAnalysis(env.params);
    case 'time-utility':
      return executeTimeUtility(env.params);
    case 'id-generator':
      return executeIdGenerator(env.params);
    case 'web-search':
      return executeWebSearch(env.params);
    default:
      if (env.toolId.startsWith('mcp-')) return proxyMcpTool(env);
      throw new ToolError(`Tool not runnable on worker tier: ${env.toolId}`);
  }
}

function toEnvelope(data: unknown): ExecutionRequestEnvelope | null {
  if (!isRecord(data)) return null;
  if (typeof data.correlationId !== 'string' || typeof data.toolId !== 'string') return null;
  if (!isRecord(data.params)) return null;
  return data as unknown as ExecutionRequestEnvelope;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
      return Response.json({ status: 'healthy', node: NODE_ID, ts: new Date().toISOString() });
    }

    if (url.pathname !== '/exec') {
      return Response.json({ error: 'Not Found' }, { status: 404 });
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
    }

    // Reverse edge-auth: trust only requests bearing the shared secret.
    const provided = request.headers.get('X-Edge-Auth');
    if (!env.EXEC_WORKER_SECRET || provided !== env.EXEC_WORKER_SECRET) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const envelope = toEnvelope(body);
    if (!envelope) {
      return Response.json({ error: 'Malformed ExecutionRequestEnvelope' }, { status: 400 });
    }

    const startedAt = Date.now();
    try {
      const output = await runTool(envelope);
      return Response.json(ok(envelope, output, startedAt) satisfies ExecutionResultEnvelope);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof ToolError ? 'TOOL_ERROR' : 'NODE_ERROR';
      // Tool/proxy failures are a well-formed { ok:false } result (HTTP 200), not
      // a transport error — the scheduler surfaces the typed error to the caller.
      return Response.json(fail(envelope, code, message, startedAt) satisfies ExecutionResultEnvelope);
    }
  },
};
