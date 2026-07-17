import { describe, it, expect, vi, beforeAll } from 'vitest';
import { exportPKCS8, generateKeyPair } from 'jose';
import { GitHubAppTokenBroker } from '../../services/execution_mesh/github_app_token_broker.js';
import type { BrokerRedisClient, InstallationBinding } from '../../services/execution_mesh/github_app_token_broker.js';

const TEST_APP_ID = '123456';
const TEST_KEY_HEX = 'a'.repeat(64);
const FAKE_EXPIRES_AT = new Date(Date.now() + 3600_000).toISOString();
const FAKE_TOKEN = 'ghs_test_token_value_1234567890abcdef';
let privateKeyPem: string;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { modulusLength: 2048 });
  privateKeyPem = await exportPKCS8(pair.privateKey);
});

const BASE_BINDING: InstallationBinding = {
  installationId: '98765432',
  repositoryId: '111222333',
  repositoryFullName: 'acme/my-repo',
  userId: '00000000-0000-0000-0000-000000000001',
  tenantId: 'tenant-1',
  projectId: 'proj-1',
};

function makeRedis(overrides: Partial<BrokerRedisClient> = {}): BrokerRedisClient {
  return {
    get: vi.fn().mockResolvedValue(null),
    setEx: vi.fn().mockResolvedValue('OK'),
    setNxPx: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(1),
    ...overrides,
  } as unknown as BrokerRedisClient;
}

function makeSuccessfulFetch(token: string = FAKE_TOKEN, expiresAt: string = FAKE_EXPIRES_AT): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ token, expires_at: expiresAt }),
    text: async () => '',
  }) as unknown as typeof globalThis.fetch;
}

function makeBroker(overrides: {
  redis?: BrokerRedisClient;
  fetch?: typeof globalThis.fetch;
  nowSeconds?: () => number;
  sleep?: (ms: number) => Promise<void>;
} = {}): GitHubAppTokenBroker {
  return new GitHubAppTokenBroker({
    redis: overrides.redis ?? makeRedis(),
    appId: TEST_APP_ID,
    privateKeyPem,
    encryptionKeyHex: TEST_KEY_HEX,
    fetch: overrides.fetch ?? makeSuccessfulFetch(),
    nowSeconds: overrides.nowSeconds,
    sleep: overrides.sleep ?? vi.fn().mockResolvedValue(undefined),
  });
}

describe('GitHubAppTokenBroker', () => {
  describe('mintInstallationToken — unsafe repo ID rejected', () => {
    it('rejects repo ID 0', async () => {
      const broker = makeBroker();
      const result = await broker.mintInstallationToken({ ...BASE_BINDING, repositoryId: '0' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNSAFE_REPO_ID');
    });

    it('rejects repo ID exceeding Number.MAX_SAFE_INTEGER', async () => {
      const broker = makeBroker();
      const unsafeId = String(Number.MAX_SAFE_INTEGER + 1);
      const result = await broker.mintInstallationToken({ ...BASE_BINDING, repositoryId: unsafeId });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNSAFE_REPO_ID');
    });
  });

  describe('mintInstallationToken — exact GitHub API call', () => {
    it('sends correct headers and body to GitHub', async () => {
      const fetchFn = makeSuccessfulFetch();
      const broker = makeBroker({ fetch: fetchFn });
      const result = await broker.mintInstallationToken(BASE_BINDING);
      expect(result.ok).toBe(true);

      expect(fetchFn).toHaveBeenCalledOnce();
      const [url, opts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`https://api.github.com/app/installations/${BASE_BINDING.installationId}/access_tokens`);
      expect(opts.method).toBe('POST');
      expect((opts.headers as Record<string, string>)['X-GitHub-Api-Version']).toBe('2026-03-10');
      expect((opts.headers as Record<string, string>)['Accept']).toBe('application/vnd.github+json');

      const requestBody = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(requestBody.repository_ids).toEqual([Number(BASE_BINDING.repositoryId)]);
      expect(requestBody.permissions).toMatchObject({ contents: 'write', pull_requests: 'write' });
    });

    it('does not include token in GitHub API URL', async () => {
      const fetchFn = makeSuccessfulFetch();
      const broker = makeBroker({ fetch: fetchFn });
      await broker.mintInstallationToken(BASE_BINDING);
      const [url] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
      expect(url).not.toContain(FAKE_TOKEN);
    });
  });

  describe('mintInstallationToken — GitHub error', () => {
    it('returns GITHUB_API_ERROR on non-OK response', async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
        json: async () => ({}),
      }) as unknown as typeof globalThis.fetch;
      const broker = makeBroker({ fetch: fetchFn });
      const result = await broker.mintInstallationToken(BASE_BINDING);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('GITHUB_API_ERROR');
    });

    it('returns GITHUB_RESPONSE_INVALID on bad response schema', async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ not_a_token: 'oops' }),
        text: async () => '',
      }) as unknown as typeof globalThis.fetch;
      const broker = makeBroker({ fetch: fetchFn });
      const result = await broker.mintInstallationToken(BASE_BINDING);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('GITHUB_RESPONSE_INVALID');
    });
  });

  describe('encrypted Redis — no plaintext token', () => {
    it('stores encrypted ciphertext, not the raw token', async () => {
      const redisData: Record<string, string> = {};
      const redis = makeRedis({
        get: vi.fn((k: string) => Promise.resolve(redisData[k] ?? null)),
        setEx: vi.fn((k: string, v: string) => {
          redisData[k] = v;
          return Promise.resolve('OK');
        }),
      });

      const broker = makeBroker({ redis });
      await broker.mintInstallationToken(BASE_BINDING);

      for (const value of Object.values(redisData)) {
        expect(value).not.toContain(FAKE_TOKEN);
        expect(value).not.toContain(TEST_APP_ID);
      }
    });
  });

  describe('concurrent requests — one mint, lease winner reads cache', () => {
    it('only calls GitHub once for 20 concurrent requests', async () => {
      const fetchFn = makeSuccessfulFetch();
      let leaseHolder: string | null = null;
      let cacheValue: string | null = null;

      const redis: BrokerRedisClient = {
        get: vi.fn((key: string) => {
          if (key.startsWith('gh_iat:')) return Promise.resolve(cacheValue);
          if (key.startsWith('gh_iat_lease:')) return Promise.resolve(leaseHolder);
          return Promise.resolve(null);
        }),
        setEx: vi.fn((key: string, value: string) => {
          if (key.startsWith('gh_iat:')) {
            cacheValue = value;
            leaseHolder = null;
          }
          return Promise.resolve('OK');
        }),
        setNxPx: vi.fn((_key: string, value: string) => {
          if (leaseHolder !== null) return Promise.resolve(null);
          leaseHolder = value;
          return Promise.resolve('OK');
        }),
        del: vi.fn().mockResolvedValue(1),
        eval: vi.fn().mockImplementation((_script: string, _n: number, key: string) => {
          if (key.startsWith('gh_iat_lease:')) leaseHolder = null;
          return Promise.resolve(1);
        }),
      };

      const sleep = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
      const broker = makeBroker({ redis, fetch: fetchFn, sleep });

      const results = await Promise.all(
        Array.from({ length: 20 }, () => broker.mintInstallationToken(BASE_BINDING))
      );

      const successes = results.filter((r) => r.ok);
      expect(successes).toHaveLength(20);
      expect(fetchFn).toHaveBeenCalledOnce();
    });
  });

  describe('Redis failures — fail closed', () => {
    it('does not mint when cache read fails', async () => {
      const fetchFn = makeSuccessfulFetch();
      const redis = makeRedis({ get: vi.fn().mockRejectedValue(new Error('redis offline')) });
      const result = await makeBroker({ redis, fetch: fetchFn }).mintInstallationToken(BASE_BINDING);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('REDIS_ERROR');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('does not return a minted token when encrypted cache write fails', async () => {
      const redis = makeRedis({ setEx: vi.fn().mockRejectedValue(new Error('redis write failed')) });
      const result = await makeBroker({ redis }).mintInstallationToken(BASE_BINDING);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('REDIS_ERROR');
    });
  });

  describe('bad GitHub expires_at — fail closed', () => {
    it('returns error on non-datetime expires_at', async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ token: FAKE_TOKEN, expires_at: 'not-a-date' }),
        text: async () => '',
      }) as unknown as typeof globalThis.fetch;
      const broker = makeBroker({ fetch: fetchFn });
      const result = await broker.mintInstallationToken(BASE_BINDING);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('GITHUB_RESPONSE_INVALID');
    });

    it('rejects a correctly formatted timestamp that is already expired', async () => {
      const expired = new Date(Date.now() - 60_000).toISOString();
      const result = await makeBroker({ fetch: makeSuccessfulFetch(FAKE_TOKEN, expired) }).mintInstallationToken(BASE_BINDING);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('GITHUB_RESPONSE_INVALID');
    });
  });
});
