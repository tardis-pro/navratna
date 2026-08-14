import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalAllowlistService } from '../../whatsapp/approval_allowlist_service.js';

/**
 * The approval allowlist is the ONLY thing standing between a WhatsApp message and a
 * real-world operation being approved. It must be explicit: an unlisted jid always
 * resolves to null, and an empty/absent WHATSAPP_APPROVER_ALLOWLIST authorises nobody —
 * there is no "empty means allow anyone" fallback. Seeding must also be idempotent and
 * must never clobber an approver an admin provisioned at runtime.
 */

const ALLOWLIST_PREFIX = 'whatsapp:approval:allowlist:';
const ENV_SOURCE = 'env:WHATSAPP_APPROVER_ALLOWLIST';

/** Minimal in-memory Redis covering only what the service uses. */
function makeRedisStub(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    mget: vi.fn(async (...keys: string[]) => keys.map((k) => store.get(k) ?? null)),
    scan: vi.fn(async (_cursor: string, _match: string, pattern: string) => {
      const prefix = pattern.replace(/\*$/, '');
      return ['0', [...store.keys()].filter((k) => k.startsWith(prefix))] as [string, string[]];
    }),
  };
}

type RedisStub = ReturnType<typeof makeRedisStub>;

function makeService(redis: RedisStub): ApprovalAllowlistService {
  // The service only ever touches get/set/del/mget/scan.
  return new ApprovalAllowlistService(redis as unknown as import('ioredis').Redis);
}

describe('ApprovalAllowlistService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WHATSAPP_APPROVER_ALLOWLIST;
  });

  it('normalises "+91 98123-45678" style seed entries into full JIDs', async () => {
    process.env.WHATSAPP_APPROVER_ALLOWLIST = '+91 98123-45678:user-abc';
    const redis = makeRedisStub();

    const svc = makeService(redis);

    await expect(svc.resolveApprover('919812345678@s.whatsapp.net')).resolves.toEqual({
      userId: 'user-abc',
    });
    expect([...redis.store.keys()]).toEqual([`${ALLOWLIST_PREFIX}919812345678@s.whatsapp.net`]);
  });

  it('accepts entries that already carry a full JID, splitting on the last colon', async () => {
    process.env.WHATSAPP_APPROVER_ALLOWLIST =
      '919812345678@s.whatsapp.net:user-abc, 447700900123@s.whatsapp.net:user-def';
    const svc = makeService(makeRedisStub());

    await expect(svc.resolveApprover('919812345678@s.whatsapp.net')).resolves.toEqual({
      userId: 'user-abc',
    });
    await expect(svc.resolveApprover('447700900123@s.whatsapp.net')).resolves.toEqual({
      userId: 'user-def',
    });
  });

  it('resolves an unlisted jid to null', async () => {
    process.env.WHATSAPP_APPROVER_ALLOWLIST = '919812345678@s.whatsapp.net:user-abc';
    const svc = makeService(makeRedisStub());

    await expect(svc.resolveApprover('919999999999@s.whatsapp.net')).resolves.toBeNull();
  });

  it('authorises nobody when the env var is empty or absent', async () => {
    process.env.WHATSAPP_APPROVER_ALLOWLIST = '';
    const emptyVar = makeService(makeRedisStub());
    await expect(emptyVar.resolveApprover('919812345678@s.whatsapp.net')).resolves.toBeNull();
    await expect(emptyVar.list()).resolves.toEqual([]);

    delete process.env.WHATSAPP_APPROVER_ALLOWLIST;
    const absentVar = makeService(makeRedisStub());
    await expect(absentVar.resolveApprover('919812345678@s.whatsapp.net')).resolves.toBeNull();
    await expect(absentVar.list()).resolves.toEqual([]);
  });

  it('ignores malformed seed entries rather than provisioning garbage', async () => {
    process.env.WHATSAPP_APPROVER_ALLOWLIST = 'no-separator, :orphan-user, 919812345678:,,';
    const svc = makeService(makeRedisStub());

    await expect(svc.list()).resolves.toEqual([]);
  });

  it('seeds idempotently — a second run over an unchanged env writes nothing new', async () => {
    process.env.WHATSAPP_APPROVER_ALLOWLIST = '919812345678@s.whatsapp.net:user-abc';
    const redis = makeRedisStub();

    await makeService(redis).list();
    const afterFirst = new Map(redis.store);
    redis.set.mockClear();

    await makeService(redis).list();

    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.store).toEqual(afterFirst);
  });

  it('never clobbers an approver an admin added at runtime', async () => {
    process.env.WHATSAPP_APPROVER_ALLOWLIST = '919812345678@s.whatsapp.net:user-from-env';
    const redis = makeRedisStub();

    const svc = makeService(redis);
    await svc.add('919812345678@s.whatsapp.net', 'user-from-admin', 'admin-1');

    // A restart re-runs seeding against the same Redis.
    const restarted = makeService(redis);
    await expect(restarted.resolveApprover('919812345678@s.whatsapp.net')).resolves.toEqual({
      userId: 'user-from-admin',
    });
  });

  it('revokes an env-seeded approver once they are dropped from the env var', async () => {
    process.env.WHATSAPP_APPROVER_ALLOWLIST =
      '919812345678@s.whatsapp.net:user-abc,447700900123@s.whatsapp.net:user-def';
    const redis = makeRedisStub();
    await makeService(redis).list();

    process.env.WHATSAPP_APPROVER_ALLOWLIST = '919812345678@s.whatsapp.net:user-abc';
    const restarted = makeService(redis);

    await expect(restarted.resolveApprover('447700900123@s.whatsapp.net')).resolves.toBeNull();
    await expect(restarted.resolveApprover('919812345678@s.whatsapp.net')).resolves.toEqual({
      userId: 'user-abc',
    });
  });

  it('updates an env-seeded approver whose userId changed in the env var', async () => {
    process.env.WHATSAPP_APPROVER_ALLOWLIST = '919812345678@s.whatsapp.net:user-old';
    const redis = makeRedisStub();
    await makeService(redis).list();

    process.env.WHATSAPP_APPROVER_ALLOWLIST = '919812345678@s.whatsapp.net:user-new';
    const restarted = makeService(redis);

    await expect(restarted.resolveApprover('919812345678@s.whatsapp.net')).resolves.toEqual({
      userId: 'user-new',
    });
  });

  it('remove() revokes an approver, including via an unnormalised jid', async () => {
    process.env.WHATSAPP_APPROVER_ALLOWLIST = '919812345678@s.whatsapp.net:user-abc';
    const svc = makeService(makeRedisStub());

    await svc.remove('+91 98123-45678');

    await expect(svc.resolveApprover('919812345678@s.whatsapp.net')).resolves.toBeNull();
  });

  it('list() reports provenance so seeded and admin-added entries are distinguishable', async () => {
    process.env.WHATSAPP_APPROVER_ALLOWLIST = '919812345678@s.whatsapp.net:user-abc';
    const svc = makeService(makeRedisStub());
    await svc.add('447700900123', 'user-def', 'admin-1');

    const entries = await svc.list();

    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.jid === '919812345678@s.whatsapp.net')?.addedBy).toBe(ENV_SOURCE);
    expect(entries.find((e) => e.jid === '447700900123@s.whatsapp.net')?.addedBy).toBe('admin-1');
  });

  it('resolves to null when the stored entry is corrupt rather than trusting it', async () => {
    const redis = makeRedisStub({
      [`${ALLOWLIST_PREFIX}919812345678@s.whatsapp.net`]: '{not json',
      [`${ALLOWLIST_PREFIX}447700900123@s.whatsapp.net`]: '{"addedAt":"x","addedBy":"y"}',
    });
    const svc = makeService(redis);

    await expect(svc.resolveApprover('919812345678@s.whatsapp.net')).resolves.toBeNull();
    await expect(svc.resolveApprover('447700900123@s.whatsapp.net')).resolves.toBeNull();
  });
});
