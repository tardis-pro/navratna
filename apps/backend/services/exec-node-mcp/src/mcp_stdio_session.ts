// exec-node-mcp — MCP JSON-RPC 2.0 client over a child process's stdio.
//
// This is the same protocol mcp_client_service.ts speaks to stdio MCP servers
// (initialize -> initialized notification -> tools/list -> tools/call), factored
// into a compact, dependency-free session that drives the stdio of a Docker
// container instead of a gateway-local child process. mcp_client_service is left
// untouched; only the KNOWLEDGE is reused (spec §3.2 / §4).

import type { Readable, Writable } from 'node:stream';

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isJsonRpcResponse(v: unknown): v is JsonRpcResponse {
  return isRecord(v) && v.jsonrpc === '2.0' && (('result' in v) || ('error' in v));
}

const PROTOCOL_VERSION = '2024-11-05';

/**
 * Speaks MCP over a container's stdin/stdout. One session == one server process.
 * Newline-delimited JSON, matching mcp_client_service's framing.
 */
export class McpStdioSession {
  private nextId = 0;
  private buffer = '';
  private pending = new Map<
    string | number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private initialized = false;
  private closed = false;

  constructor(
    private readonly stdout: Readable,
    private readonly stdin: Writable,
    private readonly onLog: (line: string) => void = () => {}
  ) {
    this.stdout.on('data', (chunk: Buffer | string) => this.onData(chunk.toString()));
  }

  private onData(text: string): void {
    this.buffer += text;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        this.onLog(`stdout(non-json): ${line}`);
        continue;
      }
      if (isJsonRpcResponse(parsed)) {
        this.settle(parsed);
      }
      // Notifications from the server are ignored for a single request/response call.
    }
  }

  private settle(res: JsonRpcResponse): void {
    const p = this.pending.get(res.id);
    if (!p) return;
    this.pending.delete(res.id);
    clearTimeout(p.timer);
    if (res.error) {
      p.reject(new Error(`MCP error ${res.error.code}: ${res.error.message}`));
    } else {
      p.resolve(res.result);
    }
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('MCP session closed'));
    const id = ++this.nextId;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.stdin.write(payload, (err) => {
        if (err) {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }

  private notify(method: string, params?: unknown): void {
    if (this.closed) return;
    this.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  /** MCP handshake. Safe to call once; no-op thereafter. */
  async initialize(timeoutMs: number): Promise<void> {
    if (this.initialized) return;
    await this.request(
      'initialize',
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { roots: { listChanged: true }, sampling: {} },
        clientInfo: { name: 'UAIP-ExecNodeMCP', version: '1.0.0' },
      },
      timeoutMs
    );
    this.notify('initialized');
    this.initialized = true;
  }

  /** Invoke a tool: `tools/call` -> returns the raw MCP result. */
  callTool(name: string, args: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args }, timeoutMs);
  }

  dispose(): void {
    this.closed = true;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('MCP session disposed'));
    }
    this.pending.clear();
  }
}
