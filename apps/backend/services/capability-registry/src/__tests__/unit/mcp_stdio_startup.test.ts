import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// @uaip/config throws FATAL at module-eval time when these are absent, and it is
// pulled in transitively. Set them before any dynamic import runs.
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.DELETION_HASH_SALT ??= 'test-deletion-hash-salt';

/**
 * A stdio MCP server can only complete its handshake if sendRequest is allowed
 * to write to the child process. sendRequest rejects any server that is not
 * already marked 'running', so the state has to be set before the handshake —
 * exactly as the HTTP branch already does.
 *
 * Live symptom before the fix:
 *   "Failed to initialize MCP connection for everything: Server everything is not running"
 * for every stdio server, so none could ever start.
 */

class FakeStdin extends EventEmitter {
  constructor(private readonly onLine: (line: string) => void) {
    super();
  }
  write(chunk: string): boolean {
    for (const line of chunk.split('\n')) {
      if (line.trim()) this.onLine(line);
    }
    return true;
  }
}

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin: FakeStdin;
  pid = 4242;
  killed = false;

  constructor() {
    super();
    this.stdin = new FakeStdin((line) => this.respond(line));
  }

  private respond(line: string): void {
    const request: unknown = JSON.parse(line);
    if (typeof request !== 'object' || request === null) return;
    const { id, method } = request as { id?: number; method?: string };
    if (id === undefined) return;

    if (method === 'initialize') {
      this.reply(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'FakeStdioMCP', version: '1.0.0' },
      });
      return;
    }

    if (method === 'tools/list') {
      this.reply(id, {
        tools: [{ name: 'echo', description: 'Echo back', inputSchema: { type: 'object' } }],
      });
      return;
    }

    this.reply(id, {});
  }

  private reply(id: number, result: unknown): void {
    setImmediate(() => {
      this.stdout.emit('data', Buffer.from(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`));
    });
  }

  kill(): boolean {
    this.killed = true;
    this.emit('exit', 0, null);
    return true;
  }
}

const spawnMock = vi.fn(() => new FakeChildProcess());

// mcp_client_service also promisifies exec/execFile at module scope, so the mock
// has to provide them or module evaluation fails before any test runs.
function makePromisifiable(): unknown {
  const fn = (
    _cmd: string,
    _args: unknown,
    cb?: (err: Error | null, out: { stdout: string; stderr: string }) => void
  ): void => {
    cb?.(null, { stdout: '', stderr: '' });
  };
  Reflect.set(fn, Symbol.for('nodejs.util.promisify.custom'), async () => ({
    stdout: '',
    stderr: '',
  }));
  return fn;
}

const childProcessMock = {
  spawn: spawnMock,
  exec: makePromisifiable(),
  execFile: makePromisifiable(),
};

vi.mock('child_process', () => childProcessMock);
vi.mock('node:child_process', () => childProcessMock);

describe('MCPClientService stdio startup', () => {
  beforeEach(() => {
    spawnMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('completes the handshake and discovers tools for a stdio server', async () => {
    const { MCPClientService } = await import('../../services/mcp_client_service.js');
    const service = MCPClientService.getInstance();

    const row: Record<string, unknown> = {
      id: 'srv-stdio',
      name: 'probe-stdio',
      command: 'bunx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
      env: null,
      workingDirectory: null,
      transportType: 'stdio',
      url: null,
      headers: null,
      enabled: true,
    };
    Reflect.set(service, 'mcpRepo', {
      getServerByName: async (): Promise<Record<string, unknown>> => row,
      getAllServers: async (): Promise<Record<string, unknown>[]> => [],
      createServer: async (): Promise<Record<string, unknown>> => row,
      updateServer: async (): Promise<Record<string, unknown>> => row,
      deleteServer: async (): Promise<void> => undefined,
    });

    await service.startServer('probe-stdio');

    const state = service.getServerStatus('probe-stdio');
    expect(
      state?.status,
      'a stdio server must reach running state, not die during the handshake'
    ).toBe('running');
    expect(state?.tools?.map((t) => t.name)).toContain('echo');

    await service.stopServer('probe-stdio');
  });
});
