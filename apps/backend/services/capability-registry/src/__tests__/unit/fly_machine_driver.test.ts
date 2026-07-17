import { describe, expect, it, vi } from 'vitest';
import { FlyMachineDriver, FlyMachineDriverError } from '../../services/execution_mesh/fly_machine_driver.js';
import type { FlyMachineDriverConfig, FlyMachineDriverDeps } from '../../services/execution_mesh/fly_machine_driver.js';

const APP = 'test-app';
const POLICY_NAME = `codespace-${APP}`;
const POLICY_ID = 'pol-123456';
const IMAGE = 'registry.fly.io/exec-node@sha256:abc123deadbeef000000000000000000000000000000000000000000000000ab';
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----\n${'A'.repeat(320)}\n-----END PUBLIC KEY-----`;
const VOLUME = { id: 'vol_abc', name: 'workspace-s1', size_gb: 10, region: 'iad', encrypted: true, state: 'created' };
const MACHINE = { id: 'mach_xyz', name: 'coding-s1', state: 'started', region: 'iad', created_at: '2026-01-01T00:00:00Z' };

const DESIRED_BODY = {
  name: POLICY_NAME,
  selector: { metadata: { runtime: 'codespace' } },
  rules: [{
    action: 'allow',
    direction: 'egress',
    ports: [
      { protocol: 'udp', port: 53 },
      { protocol: 'tcp', port: 53 },
      { protocol: 'tcp', port: 443 },
    ],
  }],
};

function policyWithId(overrides: { rules?: typeof DESIRED_BODY.rules } = {}) {
  return { id: POLICY_ID, ...DESIRED_BODY, ...overrides };
}

function response(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  });
}

function cfg(overrides: Partial<FlyMachineDriverConfig> = {}): FlyMachineDriverConfig {
  return {
    appName: APP,
    image: IMAGE,
    primaryRegion: 'iad',
    apiToken: 'token',
    maxAttempts: 1,
    requestTimeoutMs: 5_000,
    ...overrides,
  };
}

function driver(fetchMock: ReturnType<typeof vi.fn>, overrides: Partial<FlyMachineDriverConfig> = {}): FlyMachineDriver {
  const deps: FlyMachineDriverDeps = {
    fetch: fetchMock as unknown as typeof globalThis.fetch,
    nowMs: () => 1_000,
    sleep: vi.fn().mockResolvedValue(undefined),
    random: () => 0,
  };
  return new FlyMachineDriver(cfg(overrides), deps);
}

function successfulFetch(): ReturnType<typeof vi.fn> {
  return vi.fn()
    .mockResolvedValueOnce(response([policyWithId()]))
    .mockResolvedValueOnce(response(VOLUME))
    .mockResolvedValueOnce(response(MACHINE))
    .mockResolvedValueOnce(response(undefined, 204));
}

describe('FlyMachineDriver construction', () => {
  it('requires a digest-pinned image', () => {
    expect(() => new FlyMachineDriver(cfg({ image: 'image:latest' }))).toThrow('digest-pinned');
  });

  it('requires API credentials and safe app/region names', () => {
    expect(() => new FlyMachineDriver(cfg({ apiToken: '' }))).toThrow('apiToken');
    expect(() => new FlyMachineDriver(cfg({ appName: 'bad app' }))).toThrow('appName');
    expect(() => new FlyMachineDriver(cfg({ primaryRegion: 'bad region' }))).toThrow('primaryRegion');
  });
});

describe('FlyMachineDriver provisionWorkspace', () => {
  it('ensures network policy before creating a volume or machine', async () => {
    const fetchMock = successfulFetch();
    const result = await driver(fetchMock).provisionWorkspace({ sessionId: 's1', codingNodePublicKeyPem: PUBLIC_KEY });

    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls).toEqual([
      `https://api.machines.dev/v1/apps/${APP}/network_policies`,
      `https://api.machines.dev/v1/apps/${APP}/volumes`,
      `https://api.machines.dev/v1/apps/${APP}/machines`,
      `https://api.machines.dev/v1/apps/${APP}/machines/mach_xyz/wait?state=started&timeout=120`,
    ]);
    expect(result).toMatchObject({ machineId: 'mach_xyz', volumeId: 'vol_abc' });
    expect(result.baseUrl).toContain('.internal');
  });

  it('sends a private machine configuration with the public verification key only', async () => {
    const fetchMock = successfulFetch();
    await driver(fetchMock).provisionWorkspace({ sessionId: 's1', codingNodePublicKeyPem: PUBLIC_KEY });

    const machineInit = fetchMock.mock.calls[2][1] as RequestInit;
    const payload = JSON.parse(String(machineInit.body)) as Record<string, unknown>;
    const machineConfig = payload.config as Record<string, unknown>;
    const env = machineConfig.env as Record<string, string>;
    expect(env.CODING_NODE_JWT_PUBLIC_KEY_PEM).toBe(PUBLIC_KEY);
    expect(JSON.stringify(payload)).not.toMatch(/PRIVATE KEY|FLY_API_TOKEN|GITHUB_APP_PRIVATE_KEY/);
    expect(machineConfig.services).toBeUndefined();
    expect(machineConfig.restart).toEqual({ policy: 'no' });
  });

  it('machines get runtime=codespace in metadata', async () => {
    const fetchMock = successfulFetch();
    await driver(fetchMock).provisionWorkspace({ sessionId: 's1', codingNodePublicKeyPem: PUBLIC_KEY });
    const machineInit = fetchMock.mock.calls[2][1] as RequestInit;
    const payload = JSON.parse(String(machineInit.body)) as Record<string, unknown>;
    const meta = (payload.config as Record<string, unknown>).metadata as Record<string, string>;
    expect(meta['runtime']).toBe('codespace');
  });

  it('does not create a volume when policy establishment fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ error: 'denied' }, 403));
    const failure = await driver(fetchMock).provisionWorkspace({ sessionId: 's1', codingNodePublicKeyPem: PUBLIC_KEY }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(FlyMachineDriverError);
    expect((failure as FlyMachineDriverError).code).toBe('NETWORK_POLICY_FAILED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deletes the volume if machine creation fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([policyWithId()]))
      .mockResolvedValueOnce(response(VOLUME))
      .mockResolvedValueOnce(response({ error: 'failed' }, 500))
      .mockResolvedValueOnce(response(undefined, 204));
    const failure = await driver(fetchMock).provisionWorkspace({ sessionId: 's1', codingNodePublicKeyPem: PUBLIC_KEY }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(FlyMachineDriverError);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('/volumes/vol_abc'))).toBe(true);
  });
});

describe('ensureNetworkPolicy (idempotent, official API shape)', () => {
  it('POSTs to create a policy when none exists (empty list)', async () => {
    const createdPolicy = policyWithId();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(createdPolicy));
    const result = await driver(fetchMock).ensureNetworkPolicy();
    expect(fetchMock.mock.calls[0][0]).toContain('/network_policies');
    expect(fetchMock.mock.calls[0][1]?.method ?? 'GET').toBe('GET');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
    expect(result.name).toBe(POLICY_NAME);
  });

  it('skips POST when policy already exists with matching rules', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response([policyWithId()]));
    const result = await driver(fetchMock).ensureNetworkPolicy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.name).toBe(POLICY_NAME);
  });

  it('updates via POST with id when policy exists but rules differ', async () => {
    const old = policyWithId({ rules: [{ action: 'allow', direction: 'egress', ports: [{ protocol: 'tcp', port: 80 }] }] });
    const updatedPolicy = policyWithId();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([old]))
      .mockResolvedValueOnce(response(updatedPolicy));
    await driver(fetchMock).ensureNetworkPolicy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const postBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(postBody.id).toBe(POLICY_ID);
    expect(postBody.rules).toStrictEqual(DESIRED_BODY.rules);
  });

  it('does NOT invent a deny action — only allow rules are sent', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(policyWithId()));
    await driver(fetchMock).ensureNetworkPolicy();
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string) as { rules: Array<{ action: string }> };
    for (const rule of body.rules) {
      expect(rule.action).toBe('allow');
    }
  });

  it('payload uses direction+ports shape, not sources — no invented deny', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(policyWithId()));
    await driver(fetchMock).ensureNetworkPolicy();
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const rule = body.rules[0] as { action: string; direction: string; ports: Array<{ protocol: string; port: number }> };
    expect(rule.direction).toBe('egress');
    expect(rule.ports.every((p: { protocol: string; port: number }) => typeof p.port === 'number')).toBe(true);
    expect('sources' in rule).toBe(false);
    expect('deny' in body).toBe(false);
  });

  it('selector targets runtime=codespace metadata', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(policyWithId()));
    await driver(fetchMock).ensureNetworkPolicy();
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body.selector?.metadata?.runtime).toBe('codespace');
  });
});
