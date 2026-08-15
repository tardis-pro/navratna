import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@uaip/shared-services', () => ({
  getIntelligenceDb: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 'ki-uuid-1' }]),
      })),
    })),
  })),
  knowledgeItems: {},
  ServiceFactory: {
    getInstance: vi.fn(() => ({
      getToolGraphDatabase: vi.fn().mockResolvedValue({
        runQuery: vi.fn().mockResolvedValue({}),
      }),
    })),
  },
}));

vi.mock('@uaip/types', () => ({
  KnowledgeType: { REPO_CONTEXT: 'repo_context' },
  SourceType: { GIT_REPOSITORY: 'git_repository', FILE_SYSTEM: 'file_system' },
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
  },
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
  },
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, msg: string, public code?: string) { super(msg); }
  },
}));

vi.mock('../../services/ast_symbol_extractor.js', () => ({
  AstSymbolExtractor: vi.fn().mockImplementation(() => ({
    extractFromDirectory: vi.fn().mockResolvedValue({
      symbols: [],
      imports: [],
      fileCount: 0,
    }),
  })),
}));

vi.mock('../../services/semantic_index_service.js', () => ({
  SemanticIndexService: vi.fn().mockImplementation(() => ({
    indexSymbols: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../services/import_graph_service.js', () => ({
  ImportGraphService: vi.fn().mockImplementation(() => ({
    buildGraph: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue(Buffer.from('')),
  /**
   * Callback-shaped on purpose: the service does `promisify(execFile)` at module
   * load, so a plain resolved-value mock would not be promisifiable and the file
   * would fail to import rather than fail an assertion.
   *
   * Network git calls (clone/fetch/reset/clean) went from execSync to this, so
   * that an ingest no longer blocks the event loop for the length of a clone.
   */
  execFile: vi.fn((...args: unknown[]) => {
    const callback = args[args.length - 1];
    if (typeof callback === 'function') {
      (callback as (e: Error | null, stdout: string, stderr: string) => void)(null, '', '');
    }
  }),
}));

vi.mock('node:fs', () => {
  const actual = {
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    readFileSync: vi.fn().mockReturnValue(''),
    readdirSync: vi.fn().mockReturnValue([]),
    rmSync: vi.fn(),
  };
  return { ...actual, default: actual };
});

import { execFile } from 'node:child_process';
import { RepoIngestionService } from '../../services/repo_ingestion_service.js';
import { existsSync, statSync } from 'node:fs';

describe('RepoIngestionService', () => {
  let service: RepoIngestionService;

  beforeEach(() => {
    service = new RepoIngestionService();
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as never);
  });

  it('throws ValidationError for empty source', async () => {
    await expect(service.ingest('')).rejects.toThrow();
  });

  it('throws ValidationError for whitespace-only source', async () => {
    await expect(service.ingest('   ')).rejects.toThrow();
  });

  it('throws NotFoundError for non-existent local path', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await expect(service.ingest('/does/not/exist')).rejects.toThrow();
  });

  it('throws ValidationError for path pointing to a file not a directory', async () => {
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as never);
    await expect(service.ingest('/some/file.ts')).rejects.toThrow();
  });

  it('ingests a valid local directory and returns RepoContext', async () => {
    const result = await service.ingest('/valid/repo');
    expect(result).toBeDefined();
    expect(result.source).toBe('/valid/repo');
    expect(result.id).toBeTruthy();
    expect(result.knowledgeItemId).toBe('ki-uuid-1');
    expect(['brownfield', 'greenfield']).toContain(result.repoMode);
  });

  it('continues (layer2 is optional) even when AST extraction fails', async () => {
    const { AstSymbolExtractor } = await import('../../services/ast_symbol_extractor.js');
    vi.mocked(AstSymbolExtractor).mockImplementationOnce(() => ({
      extractFromDirectory: vi.fn().mockRejectedValue(new Error('tree-sitter unavailable')),
    }) as never);

    const result = await service.ingest('/valid/repo');
    expect(result).toBeDefined();
    expect(result.source).toBe('/valid/repo');
  });

  /**
   * How a remote repository is fetched.
   *
   * Three properties, each of which was a real defect before it was one of
   * these assertions: the clone must not block the event loop, the credential
   * must not be readable out of `ps`, and no shell may be involved.
   */
  describe('cloning a remote repository', () => {
    const TOKEN = 'gto_secret_clone_token';
    const REMOTE = 'https://git.tardis.local/bot-x/x.git';

    /** Every git invocation the service made, as (args, options) pairs. */
    const gitCalls = () =>
      vi.mocked(execFile).mock.calls as unknown as Array<[string, string[], Record<string, never>]>;

    it('runs git without a shell, passing arguments as an array', async () => {
      await service.ingest(REMOTE, { cloneToken: TOKEN });

      expect(gitCalls().length).toBeGreaterThan(0);
      // Asserted across EVERY invocation rather than the first: with a cached
      // checkout present the service refreshes (fetch/reset/clean) instead of
      // cloning, so which command runs first depends on disk state. The
      // property being pinned holds for all of them — a shell string is how a
      // path or URL becomes a metacharacter, and no shell is spawned here at
      // all, which is why shellQuote is not used on this path.
      for (const [command, args] of gitCalls()) {
        expect(command).toBe('git');
        expect(Array.isArray(args)).toBe(true);
      }
    });

    it('never puts the credential in argv, where any process could read it', async () => {
      await service.ingest(REMOTE, { cloneToken: TOKEN });

      for (const [, args] of gitCalls()) {
        expect(JSON.stringify(args)).not.toContain(TOKEN);
      }
    });

    it('passes the credential through the environment instead', async () => {
      await service.ingest(REMOTE, { cloneToken: TOKEN });

      const [, , options] = gitCalls()[0];
      const env = options.env as unknown as NodeJS.ProcessEnv;
      expect(env.GIT_CONFIG_VALUE_0).toBe(`Authorization: token ${TOKEN}`);
      expect(env.GIT_CONFIG_KEY_0).toBe('http.extraHeader');
    });

    it('points git at the homelab CA when one is configured', async () => {
      // Every remote here is signed by a private CA the container's default
      // bundle does not carry, so without this a clone fails at TLS before it
      // ever reaches authentication.
      process.env.TARDIS_CA_PATH = '/etc/tardis-ca/ca.crt';
      try {
        await service.ingest(REMOTE, { cloneToken: TOKEN });

        const [, , options] = gitCalls()[0];
        const env = options.env as unknown as NodeJS.ProcessEnv;
        expect(env.GIT_SSL_CAINFO).toBe('/etc/tardis-ca/ca.crt');
        // The tempting wrong fix: it would silence the same error by disabling
        // verification for every clone, public remotes included.
        expect(env.GIT_SSL_NO_VERIFY).toBeUndefined();
      } finally {
        delete process.env.TARDIS_CA_PATH;
      }
    });

    it('falls back to the system bundle when no CA is configured', async () => {
      await service.ingest(REMOTE, { cloneToken: TOKEN });

      const [, , options] = gitCalls()[0];
      const env = options.env as unknown as NodeJS.ProcessEnv;
      expect(env.GIT_SSL_CAINFO).toBeUndefined();
    });

    it('refuses to prompt for a username, so an uncredentialed clone fails instead of hanging', async () => {
      await service.ingest(REMOTE);

      const [, , options] = gitCalls()[0];
      const env = options.env as unknown as NodeJS.ProcessEnv;
      expect(env.GIT_TERMINAL_PROMPT).toBe('0');
      // No token supplied means no config is injected at all.
      expect(env.GIT_CONFIG_COUNT).toBeUndefined();
    });
  });

  it('propagates DB errors as thrown exceptions', async () => {
    const { getIntelligenceDb } = await import('@uaip/shared-services');
    vi.mocked(getIntelligenceDb).mockImplementationOnce(() => {
      throw new Error('Postgres unreachable');
    });

    await expect(service.ingest('/valid/repo')).rejects.toThrow('Postgres unreachable');
  });
});
