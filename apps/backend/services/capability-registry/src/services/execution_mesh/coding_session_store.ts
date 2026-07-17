import { z } from 'zod';
import { logger } from '@uaip/utils';
import {
  CodingSessionShadowSchema,
  CodingSessionStateSchema,
} from '@uaip/types';
import type { CodingSessionShadow, CodingSessionState } from '@uaip/types';

export type { CodingSessionShadow };

export type RedisClient = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, expiryMode: 'EX', time: number) => Promise<string | null>;
  del: (...keys: string[]) => Promise<number>;
  eval: (script: string, numkeys: number, ...args: string[]) => Promise<unknown>;
};

export type StoreError =
  | { code: 'REDIS_UNAVAILABLE'; message: string }
  | { code: 'NOT_FOUND'; sessionId: string }
  | { code: 'OWNER_MISMATCH'; sessionId: string }
  | { code: 'CORRUPT_RECORD'; sessionId: string; detail: string };

export type StoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: StoreError };

export type CodingSessionScope = {
  userId: string;
  workspaceId: string;
  tenantId: string;
};

const SESSION_TTL_S = 86_400;
const IDEMPOTENCY_TTL_S = 600;

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEM_KEY_RE = /^[\x20-\x7E]{1,256}$/;

function assertSessionId(id: string): void {
  if (!SESSION_ID_RE.test(id)) throw new Error(`Invalid sessionId: ${id.slice(0, 40)}`);
}
function assertIdempotencyKey(key: string): void {
  if (!IDEM_KEY_RE.test(key)) throw new Error('Invalid idempotencyKey');
}

const CLAIM_LUA = `
local shadow_key  = KEYS[1]
local idem_key    = KEYS[2]
local from_state  = ARGV[1]
local to_state    = ARGV[2]
local idem_val    = ARGV[3]
local shadow_ttl  = tonumber(ARGV[4])
local idem_ttl    = tonumber(ARGV[5])
local now_ms      = tonumber(ARGV[6])
local expected_user   = ARGV[7]
local expected_ws     = ARGV[8]
local expected_tenant = ARGV[9]

local raw = redis.call('GET', shadow_key)
if not raw then return {'not_found'} end

local ok, obj = pcall(cjson.decode, raw)
if not ok or type(obj) ~= 'table' then return {'corrupt'} end
if type(obj.shadow) ~= 'table'    then return {'corrupt'} end

if obj.shadow.userId ~= expected_user or obj.shadow.workspaceId ~= expected_ws or obj.shadow.tenantId ~= expected_tenant then
  return {'owner_mismatch'}
end

local existing_idem = redis.call('GET', idem_key)
if existing_idem then
  if existing_idem == 'pending'   then return {'pending_duplicate'} end
  if existing_idem == 'completed' then return {'completed_duplicate'} end
end

if obj.shadow.state ~= from_state then return {'busy', obj.shadow.state} end

obj.shadow.state                 = to_state
obj.shadow.activeIdempotencyKey  = idem_val
obj.shadow.updatedAt             = now_ms

redis.call('SET', shadow_key, cjson.encode(obj), 'EX', shadow_ttl)
redis.call('SET', idem_key, 'pending', 'EX', idem_ttl)
return {'accepted'}
`;

const ROLLBACK_LUA = `
local shadow_key = KEYS[1]
local idem_key   = KEYS[2]
local expected   = ARGV[1]
local shadow_ttl = tonumber(ARGV[2])
local now_ms     = tonumber(ARGV[3])
local expected_user   = ARGV[4]
local expected_ws     = ARGV[5]
local expected_tenant = ARGV[6]

local raw = redis.call('GET', shadow_key)
if not raw then return {'not_found'} end

local ok, obj = pcall(cjson.decode, raw)
if not ok or type(obj) ~= 'table' or type(obj.shadow) ~= 'table' then return {'corrupt'} end

if obj.shadow.userId ~= expected_user or obj.shadow.workspaceId ~= expected_ws or obj.shadow.tenantId ~= expected_tenant then
  return {'owner_mismatch'}
end

if expected ~= '' and obj.shadow.activeIdempotencyKey ~= expected then return {'key_mismatch'} end

obj.shadow.state                 = 'READY'
obj.shadow.activeIdempotencyKey  = nil
obj.shadow.updatedAt             = now_ms

redis.call('SET', shadow_key, cjson.encode(obj), 'EX', shadow_ttl)
if expected ~= '' then redis.call('DEL', idem_key) end
return {'ok'}
`;

const COMPLETE_ACTIVE_LUA = `
local shadow_key = KEYS[1]
local next_state = ARGV[1]
local shadow_ttl = tonumber(ARGV[2])
local idem_ttl   = tonumber(ARGV[3])
local now_ms     = tonumber(ARGV[4])
local expected_user   = ARGV[5]
local expected_ws     = ARGV[6]
local expected_tenant = ARGV[7]

local raw = redis.call('GET', shadow_key)
if not raw then return {'not_found'} end

local ok, obj = pcall(cjson.decode, raw)
if not ok or type(obj) ~= 'table' or type(obj.shadow) ~= 'table' then return {'corrupt'} end

if obj.shadow.userId ~= expected_user or obj.shadow.workspaceId ~= expected_ws or obj.shadow.tenantId ~= expected_tenant then
  return {'owner_mismatch'}
end

local active_key = obj.shadow.activeIdempotencyKey
obj.shadow.state                 = next_state
obj.shadow.activeIdempotencyKey  = nil
obj.shadow.updatedAt             = now_ms

redis.call('SET', shadow_key, cjson.encode(obj), 'EX', shadow_ttl)

if active_key and type(active_key) == 'string' and #active_key > 0 then
  local sid = string.match(shadow_key, 'coding:session:shadow:(.*)')
  if sid then
    redis.call('SET', 'coding:session:idem:' .. sid .. ':' .. active_key, 'completed', 'EX', idem_ttl)
  end
end

return {'ok', active_key or ''}
`;

const UPDATE_EVENT_LUA = `
local shadow_key    = KEYS[1]
local expected_user = ARGV[1]
local expected_ws   = ARGV[2]
local expected_tenant = ARGV[3]
local last_event_id = ARGV[4]
local shadow_ttl    = tonumber(ARGV[5])
local now_ms        = tonumber(ARGV[6])

local raw = redis.call('GET', shadow_key)
if not raw then return {'not_found'} end

local ok, obj = pcall(cjson.decode, raw)
if not ok or type(obj) ~= 'table' or type(obj.shadow) ~= 'table' then return {'corrupt'} end

if obj.shadow.userId ~= expected_user    then return {'owner_mismatch'} end
if obj.shadow.workspaceId ~= expected_ws then return {'owner_mismatch'} end
if obj.shadow.tenantId ~= expected_tenant then return {'owner_mismatch'} end

obj.shadow.lastEventId = last_event_id
obj.shadow.updatedAt   = now_ms

redis.call('SET', shadow_key, cjson.encode(obj), 'EX', shadow_ttl)
return {'ok'}
`;

const COMPLETE_IDEM_LUA = `
local idem_key = KEYS[1]
local ttl_s    = tonumber(ARGV[1])
redis.call('SET', idem_key, 'completed', 'EX', ttl_s)
return 1
`;

const ShadowEnvelopeSchema = z.object({
  shadow: z.record(z.unknown()),
});

export class CodingSessionStore {
  private readonly redis: RedisClient;
  private readonly nowMs: () => number;

  constructor(opts: { redis: RedisClient; nowMs?: () => number }) {
    this.redis = opts.redis;
    this.nowMs = opts.nowMs ?? (() => Date.now());
  }

  private shadowKey(sessionId: string): string {
    return `coding:session:shadow:${sessionId}`;
  }

  private idemKey(sessionId: string, idempotencyKey: string): string {
    return `coding:session:idem:${sessionId}:${idempotencyKey}`;
  }

  async put(shadow: CodingSessionShadow): Promise<StoreResult<void>> {
    const validated = CodingSessionShadowSchema.safeParse(shadow);
    if (!validated.success) {
      return { ok: false, error: { code: 'CORRUPT_RECORD', sessionId: shadow.sessionId ?? '', detail: `put validation: ${validated.error.message}` } };
    }
    const envelope = {
      shadow: validated.data as unknown as Record<string, unknown>,
    };
    let result: string | null;
    try {
      result = await this.redis.set(this.shadowKey(shadow.sessionId ?? ''), JSON.stringify(envelope), 'EX', SESSION_TTL_S);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('coding-session-store: redis set failed', { sessionId: shadow.sessionId, error: msg });
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: msg } };
    }
    if (result !== 'OK') {
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: `SET returned ${String(result)}` } };
    }
    return { ok: true, value: undefined };
  }

  private async get(sessionId: string, userId: string): Promise<StoreResult<CodingSessionShadow>> {
    let raw: string | null;
    try {
      raw = await this.redis.get(this.shadowKey(sessionId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('coding-session-store: redis get failed', { sessionId, error: msg });
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: msg } };
    }
    if (raw === null) return { ok: false, error: { code: 'NOT_FOUND', sessionId } };

    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch {
      return { ok: false, error: { code: 'CORRUPT_RECORD', sessionId, detail: 'JSON parse failed' } };
    }

    const envResult = ShadowEnvelopeSchema.safeParse(parsed);
    if (!envResult.success) {
      return { ok: false, error: { code: 'CORRUPT_RECORD', sessionId, detail: `envelope schema: ${envResult.error.message}` } };
    }

    const shadowResult = CodingSessionShadowSchema.safeParse(envResult.data.shadow);
    if (!shadowResult.success) {
      return { ok: false, error: { code: 'CORRUPT_RECORD', sessionId, detail: `shadow schema: ${shadowResult.error.message}` } };
    }

    const shadow = shadowResult.data;
    if (shadow.userId !== userId) return { ok: false, error: { code: 'OWNER_MISMATCH', sessionId } };

    return { ok: true, value: shadow };
  }

  async getScoped(sessionId: string, scope: CodingSessionScope): Promise<StoreResult<CodingSessionShadow>> {
    const result = await this.get(sessionId, scope.userId);
    if (!result.ok) return result;
    const shadow = result.value;
    if (shadow.workspaceId !== scope.workspaceId || shadow.tenantId !== scope.tenantId) {
      return { ok: false, error: { code: 'OWNER_MISMATCH', sessionId } };
    }
    return result;
  }

  private async delete(sessionId: string, userId: string): Promise<StoreResult<void>> {
    const check = await this.get(sessionId, userId);
    if (!check.ok) {
      if (check.error.code === 'NOT_FOUND') return { ok: true, value: undefined };
      return check;
    }
    try {
      await this.redis.del(this.shadowKey(sessionId));
      return { ok: true, value: undefined };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('coding-session-store: redis del failed', { sessionId, error: msg });
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: msg } };
    }
  }

  async deleteScoped(sessionId: string, scope: CodingSessionScope): Promise<StoreResult<void>> {
    const check = await this.getScoped(sessionId, scope);
    if (!check.ok) {
      if (check.error.code === 'NOT_FOUND') return { ok: true, value: undefined };
      return check;
    }
    try {
      await this.redis.del(this.shadowKey(sessionId));
      return { ok: true, value: undefined };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('coding-session-store: scoped redis del failed', { sessionId, error: message });
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message } };
    }
  }

  private async updateState(sessionId: string, userId: string, state: CodingSessionState): Promise<StoreResult<void>> {
    const getResult = await this.get(sessionId, userId);
    if (!getResult.ok) return getResult;
    const updated: CodingSessionShadow = { ...getResult.value, state, updatedAt: this.nowMs() };
    return this.put(updated);
  }

  async updateLastEventId(sessionId: string, scope: CodingSessionScope, lastEventId: string): Promise<StoreResult<void>> {
    assertSessionId(sessionId);
    let raw: unknown;
    try {
      raw = await this.redis.eval(
        UPDATE_EVENT_LUA, 1,
        this.shadowKey(sessionId),
        scope.userId, scope.workspaceId, scope.tenantId, lastEventId,
        String(SESSION_TTL_S), String(this.nowMs()),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('coding-session-store: update-event lua failed', { sessionId, error: msg });
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: msg } };
    }
    if (!Array.isArray(raw)) return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: 'Unexpected update-event result' } };
    const code = raw[0];
    if (code === 'ok') return { ok: true, value: undefined };
    if (code === 'not_found') return { ok: false, error: { code: 'NOT_FOUND', sessionId } };
    if (code === 'owner_mismatch') return { ok: false, error: { code: 'OWNER_MISMATCH', sessionId } };
    if (code === 'corrupt') return { ok: false, error: { code: 'CORRUPT_RECORD', sessionId, detail: 'update-event lua saw corrupt shadow' } };
    return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: `Unknown update-event code: ${String(code)}` } };
  }

  async claimPrompt(opts: { sessionId: string; scope: CodingSessionScope; idempotencyKey: string }): Promise<StoreResult<
    | { status: 'accepted' }
    | { status: 'pending_duplicate' }
    | { status: 'completed_duplicate' }
    | { status: 'busy'; state: CodingSessionState }
    | { status: 'not_found' }
    | { status: 'owner_mismatch' }
  >> {
    const { sessionId, scope, idempotencyKey } = opts;
    assertIdempotencyKey(idempotencyKey);

    const getResult = await this.getScoped(sessionId, scope);
    if (!getResult.ok) {
      if (getResult.error.code === 'NOT_FOUND') return { ok: true, value: { status: 'not_found' } };
      if (getResult.error.code === 'OWNER_MISMATCH') return { ok: true, value: { status: 'owner_mismatch' } };
      return getResult;
    }

    let raw: unknown;
    try {
      raw = await this.redis.eval(
        CLAIM_LUA, 2,
        this.shadowKey(sessionId),
        this.idemKey(sessionId, idempotencyKey),
        'READY', 'PROMPTING',
        idempotencyKey,
        String(SESSION_TTL_S), String(IDEMPOTENCY_TTL_S),
        String(this.nowMs()),
        scope.userId, scope.workspaceId, scope.tenantId,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('coding-session-store: claim lua failed', { sessionId, error: msg });
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: msg } };
    }

    return this.parseLuaClaimResult(raw, sessionId);
  }

  async rollbackActivePrompt(opts: { sessionId: string; scope: CodingSessionScope; idempotencyKey: string }): Promise<StoreResult<void>> {
    const { sessionId, idempotencyKey } = opts;
    assertSessionId(sessionId);
    if (idempotencyKey) assertIdempotencyKey(idempotencyKey);

    let raw: unknown;
    try {
      raw = await this.redis.eval(
        ROLLBACK_LUA, 2,
        this.shadowKey(sessionId),
        idempotencyKey ? this.idemKey(sessionId, idempotencyKey) : '',
        idempotencyKey,
        String(SESSION_TTL_S), String(this.nowMs()),
        opts.scope.userId, opts.scope.workspaceId, opts.scope.tenantId,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('coding-session-store: rollback lua failed', { sessionId, error: msg });
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: msg } };
    }

    if (!Array.isArray(raw)) return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: 'Unexpected rollback result' } };
    const code = raw[0];
    if (code === 'ok' || code === 'not_found' || code === 'key_mismatch') return { ok: true, value: undefined };
    if (code === 'owner_mismatch') return { ok: false, error: { code: 'OWNER_MISMATCH', sessionId } };
    if (code === 'corrupt') return { ok: false, error: { code: 'CORRUPT_RECORD', sessionId, detail: 'Rollback lua saw corrupt shadow' } };
    return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: `Unknown rollback code: ${String(code)}` } };
  }

  async completeActivePrompt(opts: { sessionId: string; scope: CodingSessionScope; nextState: CodingSessionState }): Promise<StoreResult<void>> {
    const { sessionId } = opts;
    assertSessionId(sessionId);

    let raw: unknown;
    try {
      raw = await this.redis.eval(
        COMPLETE_ACTIVE_LUA, 1,
        this.shadowKey(sessionId),
        opts.nextState,
        String(SESSION_TTL_S), String(IDEMPOTENCY_TTL_S),
        String(this.nowMs()),
        opts.scope.userId, opts.scope.workspaceId, opts.scope.tenantId,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('coding-session-store: complete-active lua failed', { sessionId, error: msg });
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: msg } };
    }

    if (!Array.isArray(raw)) return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: 'Unexpected complete-active result' } };
    const code = raw[0];
    if (code === 'ok') return { ok: true, value: undefined };
    if (code === 'not_found') return { ok: false, error: { code: 'NOT_FOUND', sessionId } };
    if (code === 'owner_mismatch') return { ok: false, error: { code: 'OWNER_MISMATCH', sessionId } };
    if (code === 'corrupt') return { ok: false, error: { code: 'CORRUPT_RECORD', sessionId, detail: 'complete-active lua saw corrupt shadow' } };
    return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: `Unknown complete-active code: ${String(code)}` } };
  }

  async completeIdempotencyKey(sessionId: string, idempotencyKey: string): Promise<StoreResult<void>> {
    assertSessionId(sessionId);
    assertIdempotencyKey(idempotencyKey);
    try {
      await this.redis.eval(
        COMPLETE_IDEM_LUA, 1,
        this.idemKey(sessionId, idempotencyKey),
        String(IDEMPOTENCY_TTL_S),
      );
      return { ok: true, value: undefined };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('coding-session-store: complete-idem lua failed', { sessionId, error: msg });
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: msg } };
    }
  }

  private parseLuaClaimResult(raw: unknown, sessionId: string): StoreResult<
    | { status: 'accepted' }
    | { status: 'pending_duplicate' }
    | { status: 'completed_duplicate' }
    | { status: 'busy'; state: CodingSessionState }
    | { status: 'not_found' }
    | { status: 'owner_mismatch' }
  > {
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: 'Unexpected Lua claim result' } };
    }
    const code = raw[0];
    if (code === 'accepted') return { ok: true, value: { status: 'accepted' } };
    if (code === 'pending_duplicate') return { ok: true, value: { status: 'pending_duplicate' } };
    if (code === 'completed_duplicate') return { ok: true, value: { status: 'completed_duplicate' } };
    if (code === 'not_found') return { ok: true, value: { status: 'not_found' } };
    if (code === 'owner_mismatch') return { ok: true, value: { status: 'owner_mismatch' } };
    if (code === 'corrupt') return { ok: false, error: { code: 'CORRUPT_RECORD', sessionId, detail: 'Lua saw corrupt shadow' } };
    if (code === 'busy') {
      const stateRaw = raw[1];
      const stateResult = CodingSessionStateSchema.safeParse(stateRaw);
      const state: CodingSessionState = stateResult.success ? stateResult.data : 'ERROR';
      return { ok: true, value: { status: 'busy', state } };
    }
    return { ok: false, error: { code: 'REDIS_UNAVAILABLE', message: `Unknown Lua claim code: ${String(code)}` } };
  }
}
