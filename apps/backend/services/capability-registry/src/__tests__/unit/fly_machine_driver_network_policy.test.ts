import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FlyMachineDriver,
  FlyMachineDriverError,
} from '../../services/execution_mesh/fly_machine_driver.js';
import type {
  FlyMachineDriverConfig,
} from '../../services/execution_mesh/fly_machine_driver.js';

const APP = 'test-app';
const TOKEN = 'tok_test';
const IMAGE = 'registry.fly.io/exec-node@sha256:abc123deadbeef000000000000000000000000000000000000000000000000ab';
const REGION = 'iad';
const POLICY_NAME = `codespace-${APP}`;
const POLICY_ID = 'pol-abc123';

function cfg(overrides: Partial<FlyMachineDriverConfig> = {}): FlyMachineDriverConfig {
  return { appName: APP, image: IMAGE, primaryRegion: REGION, apiToken: TOKEN, maxAttempts: 1, requestTimeoutMs: 5_000, ...overrides };
}
function driver(fetchMock: ReturnType<typeof vi.fn>): FlyMachineDriver {
  return new FlyMachineDriver(cfg(), {
    fetch: fetchMock as unknown as typeof globalThis.fetch,
    nowMs: () => 1_000_000,
    sleep: vi.fn().mockResolvedValue(undefined),
    random: () => 0,
  });
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const TEST_PUBLIC_PEM = `-----BEGIN PUBLIC KEY-----\n${'A'.repeat(320)}\n-----END PUBLIC KEY-----`;

const DESIRED_RULES = [{
  action: 'allow',
  direction: 'egress',
  ports: [
    { protocol: 'udp', port: 53 },
    { protocol: 'tcp', port: 53 },
    { protocol: 'tcp', port: 443 },
  ],
}];

function matchingPolicy() {
  return { id: POLICY_ID, name: POLICY_NAME, selector: { metadata: { runtime: 'codespace' } }, rules: DESIRED_RULES };
}

describe('provisionWorkspace — calls ensureNetworkPolicy first', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const VOLUME = { id: 'vol_abc', name: 'ws-s1', size_gb: 10, region: REGION, encrypted: true, state: 'created' };
  const MACHINE = { id: 'mach_xyz', name: 'coding-s1', state: 'started', region: REGION, created_at: '2026-01-01T00:00:00Z' };

  beforeEach(() => { fetchMock = vi.fn(); });

  it('hits /network_policies before creating volume', async () => {
    fetchMock
      .mockResolvedValueOnce(json([matchingPolicy()]))
      .mockResolvedValueOnce(json(VOLUME))
      .mockResolvedValueOnce(json(MACHINE))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await driver(fetchMock).provisionWorkspace({ sessionId: 's1', codingNodePublicKeyPem: TEST_PUBLIC_PEM });

    const urls = fetchMock.mock.calls.map((c: Parameters<typeof fetch>) => String(c[0]));
    const netpolIdx = urls.findIndex((u) => u.includes('/network_policies'));
    const volumeIdx = urls.findIndex((u) => u.includes('/volumes'));
    const machineIdx = urls.findIndex((u) => u.includes('/machines'));
    expect(netpolIdx).toBeGreaterThanOrEqual(0);
    expect(netpolIdx).toBeLessThan(volumeIdx);
    expect(volumeIdx).toBeLessThan(machineIdx);
  });

  it('throws NETWORK_POLICY_FAILED and never calls /volumes', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'unauthorized' }, 403));
    const err = await driver(fetchMock)
      .provisionWorkspace({ sessionId: 's1', codingNodePublicKeyPem: TEST_PUBLIC_PEM })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FlyMachineDriverError);
    expect((err as FlyMachineDriverError).code).toBe('NETWORK_POLICY_FAILED');
    const urls = fetchMock.mock.calls.map((c: Parameters<typeof fetch>) => String(c[0]));
    expect(urls.every((u: string) => !u.includes('/volumes'))).toBe(true);
  });
});

describe('ensureNetworkPolicy', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); });

  it('creates a policy when none exists', async () => {
    fetchMock
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json(matchingPolicy()));

    await driver(fetchMock).ensureNetworkPolicy();

    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body.name).toBe(POLICY_NAME);
    expect(body.selector?.metadata?.runtime).toBe('codespace');
    expect(body.rules).toStrictEqual(DESIRED_RULES);
    expect(JSON.stringify(body)).not.toContain('deny');
    expect(JSON.stringify(body)).not.toContain('sources');
  });

  it('skips POST when matching policy already exists (idempotent)', async () => {
    fetchMock.mockResolvedValueOnce(json([matchingPolicy()]));
    await driver(fetchMock).ensureNetworkPolicy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-upserts via POST when rules differ', async () => {
    const old = { ...matchingPolicy(), rules: [{ action: 'allow', direction: 'egress', ports: [{ protocol: 'tcp', port: 80 }] }] };
    fetchMock
      .mockResolvedValueOnce(json([old]))
      .mockResolvedValueOnce(json(matchingPolicy()));
    await driver(fetchMock).ensureNetworkPolicy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body.id).toBe(POLICY_ID);
  });

  it('does NOT invent a deny action in any rule', async () => {
    fetchMock
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json(matchingPolicy()));
    await driver(fetchMock).ensureNetworkPolicy();
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    for (const rule of body.rules as Array<{ action: string }>) {
      expect(rule.action).toBe('allow');
    }
  });
});
