import { z } from 'zod';
import { logger } from '@uaip/utils';
import { CODING_NODE_PORT } from '@uaip/types';

export type FlyMachineDriverErrorCode =
  | 'VOLUME_CREATE_FAILED'
  | 'MACHINE_CREATE_FAILED'
  | 'MACHINE_WAIT_TIMEOUT'
  | 'MACHINE_WAIT_FAILED'
  | 'SUSPEND_FAILED'
  | 'RESUME_FAILED'
  | 'DESTROY_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'CAPACITY_EXHAUSTED'
  | 'RESPONSE_PARSE_ERROR'
  | 'NETWORK_POLICY_FAILED';

export class FlyMachineDriverError extends Error {
  readonly code: FlyMachineDriverErrorCode;
  readonly httpStatus?: number;
  readonly cleanupError?: string;

  constructor(code: FlyMachineDriverErrorCode, message: string, httpStatus?: number, cleanupError?: string) {
    super(message);
    this.name = 'FlyMachineDriverError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.cleanupError = cleanupError;
  }
}

const FlyVolumeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  size_gb: z.number(),
  region: z.string(),
  encrypted: z.boolean(),
  state: z.string(),
});
export type FlyVolume = z.infer<typeof FlyVolumeSchema>;

const FlyMachineStateSchema = z.enum([
  'created', 'creating', 'starting', 'started', 'stopping', 'stopped', 'restarting',
  'suspending', 'suspended', 'updating', 'replacing', 'replaced',
  'migrated', 'destroying', 'destroyed', 'failed',
]);
export type FlyMachineState = z.infer<typeof FlyMachineStateSchema>;

const FlyMachineSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  state: FlyMachineStateSchema,
  region: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type FlyMachine = z.infer<typeof FlyMachineSchema>;

const FlyNetworkPortSchema = z.object({
  protocol: z.enum(['tcp', 'udp']),
  port: z.number().int().min(1).max(65535),
});
export type FlyNetworkPort = z.infer<typeof FlyNetworkPortSchema>;

export const FlyNetworkRuleSchema = z.object({
  action: z.literal('allow'),
  direction: z.enum(['ingress', 'egress']),
  ports: z.array(FlyNetworkPortSchema).min(1),
});
export type FlyNetworkRule = z.infer<typeof FlyNetworkRuleSchema>;

const FlyNetworkSelectorSchema = z.object({
  metadata: z.record(z.string(), z.string()),
});

export const FlyNetworkPolicySchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  selector: FlyNetworkSelectorSchema,
  rules: z.array(FlyNetworkRuleSchema).min(1),
});
export type FlyNetworkPolicy = z.infer<typeof FlyNetworkPolicySchema>;

export interface FlyMachineDriverDeps {
  fetch?: typeof globalThis.fetch;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface FlyMachineDriverConfig {
  apiBase?: string;
  appName: string;
  image: string;
  primaryRegion: string;
  fallbackRegions?: string[];
  apiToken: string;
  requestTimeoutMs?: number;
  maxAttempts?: number;
}

export interface WorkspaceProvisionResult {
  machineId: string;
  volumeId: string;
  region: string;
  baseUrl: string;
}

const MIN_PEM_LEN = 80;

export interface ReapResult {
  destroyedIds: string[];
  errors: Array<{ machineId: string; error: string }>;
}

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const SHA256_SUFFIX_RE = /@sha256:[0-9a-f]{64}$/i;
const HTTP_URL_RE = /^https?:\/\/.+/;
const DEFAULT_API_BASE = 'https://api.machines.dev/v1';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_JITTER_MS = 2_000;
const MAX_RETRY_AFTER_MS = 30_000;
const MACHINE_WAIT_TIMEOUT_SEC = 120;
const MAX_TOKEN_WAIT_MS = 10_000;

const TRANSIENT_5M: ReadonlySet<string> = new Set(['creating', 'starting', 'stopping', 'restarting', 'destroying', 'suspending']);
const SAFE_STATES: ReadonlySet<string> = new Set(['started', 'suspended', 'stopped', 'destroyed', 'failed', 'replaced', 'migrated']);
const REAP_5M_MS = 5 * 60 * 1_000;
const REAP_10M_MS = 10 * 60 * 1_000;

const CAPACITY_PHRASES = [
  'not enough capacity',
  'insufficient resources',
  "machine can't start at the moment",
];
const CAPACITY_STATUS = new Set([409, 422, 503]);

function assertSafeId(value: string, label: string): void {
  if (!value || !SAFE_ID_RE.test(value)) throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
}

function assertPositiveSafeInt(value: number, label: string, max?: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  if (max !== undefined && value > max) throw new Error(`${label} must be ≤ ${max}`);
}

function isCapacityError(status: number, body: string): boolean {
  if (!CAPACITY_STATUS.has(status)) return false;
  const lower = body.toLowerCase();
  return CAPACITY_PHRASES.some((p) => lower.includes(p));
}

class TokenBucket {
  private tokens: number;
  private lastMs: number;
  private readonly rate: number;
  private readonly burst: number;

  constructor(private readonly nowMs: () => number, ratePerSec: number, burst: number) {
    this.rate = ratePerSec / 1_000;
    this.burst = burst;
    this.tokens = burst;
    this.lastMs = nowMs();
  }

  private refill(): void {
    const now = this.nowMs();
    this.tokens = Math.min(this.burst, this.tokens + (now - this.lastMs) * this.rate);
    this.lastMs = now;
  }

  waitMs(): number {
    this.refill();
    if (this.tokens >= 1) { this.tokens -= 1; return 0; }
    return Math.ceil((1 - this.tokens) / this.rate);
  }

  consume(): void {
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }
}

export class FlyMachineDriver {
  private readonly apiBase: string;
  private readonly appName: string;
  private readonly image: string;
  private readonly primaryRegion: string;
  private readonly fallbackRegions: readonly string[];
  private readonly apiToken: string;
  private readonly requestTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly buckets = new Map<string, TokenBucket>();

  private readonly _fetch: typeof globalThis.fetch;
  private readonly _nowMs: () => number;
  private readonly _sleep: (ms: number) => Promise<void>;
  private readonly _random: () => number;

  constructor(cfg: FlyMachineDriverConfig, deps: FlyMachineDriverDeps = {}) {
    if (!cfg.apiToken) throw new Error('apiToken is required');
    if (!SHA256_SUFFIX_RE.test(cfg.image)) throw new Error('image must be digest-pinned (@sha256:<64 hex>)');
    assertSafeId(cfg.appName, 'appName');
    assertSafeId(cfg.primaryRegion, 'primaryRegion');
    for (const r of cfg.fallbackRegions ?? []) assertSafeId(r, 'fallbackRegion');
    if (cfg.apiBase !== undefined && !HTTP_URL_RE.test(cfg.apiBase)) throw new Error('apiBase must be http(s) URL');
    if (cfg.requestTimeoutMs !== undefined) assertPositiveSafeInt(cfg.requestTimeoutMs, 'requestTimeoutMs');
    if (cfg.maxAttempts !== undefined) assertPositiveSafeInt(cfg.maxAttempts, 'maxAttempts', 10);

    this.apiBase = (cfg.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, '');
    this.appName = cfg.appName;
    this.image = cfg.image;
    this.primaryRegion = cfg.primaryRegion;
    this.fallbackRegions = cfg.fallbackRegions ?? [];
    this.apiToken = cfg.apiToken;
    this.requestTimeoutMs = cfg.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.maxAttempts = cfg.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    this._fetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
    this._nowMs = deps.nowMs ?? (() => Date.now());
    this._sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this._random = deps.random ?? Math.random.bind(Math);
  }

  async provisionWorkspace(opts: {
    sessionId: string;
    codingNodePublicKeyPem: string;
    volumeSizeGb?: number;
  }): Promise<WorkspaceProvisionResult> {
    assertSafeId(opts.sessionId, 'sessionId');
    if (!opts.codingNodePublicKeyPem) throw new Error('codingNodePublicKeyPem is required');
    if (opts.codingNodePublicKeyPem.length < MIN_PEM_LEN) throw new Error('codingNodePublicKeyPem appears too short to be a valid PEM');
    if (opts.codingNodePublicKeyPem.includes('PRIVATE')) throw new Error('codingNodePublicKeyPem must not contain a private key');
    if (opts.volumeSizeGb !== undefined) assertPositiveSafeInt(opts.volumeSizeGb, 'volumeSizeGb', 500);

    await this.ensureNetworkPolicy();

    return this.provisionWithFallback([this.primaryRegion, ...this.fallbackRegions], opts);
  }

  async ensureNetworkPolicy(): Promise<FlyNetworkPolicy> {
    const name = `codespace-${this.appName}`;
    const desiredRules: FlyNetworkRule[] = [{
      action: 'allow',
      direction: 'egress',
      ports: [
        { protocol: 'udp', port: 53 },
        { protocol: 'tcp', port: 53 },
        { protocol: 'tcp', port: 443 },
      ],
    }];
    const desiredBody = {
      name,
      selector: { metadata: { runtime: 'codespace' } },
      rules: desiredRules,
    };

    let listRaw: unknown;
    try {
      listRaw = await this.callWithRetry('GET', `/apps/${this.appName}/network_policies`, undefined, `netpol:list`);
    } catch (err) {
      throw new FlyMachineDriverError('NETWORK_POLICY_FAILED',
        err instanceof Error ? err.message : String(err),
        err instanceof FlyMachineDriverError ? err.httpStatus : undefined);
    }

    const existing = z.array(FlyNetworkPolicySchema).safeParse(listRaw);
    if (!existing.success) {
      throw new FlyMachineDriverError('NETWORK_POLICY_FAILED', `network policy list parse: ${existing.error.message}`);
    }
    const same = existing.data.find((p) => p.name === name);

    if (same) {
      const matches = JSON.stringify({ selector: same.selector, rules: same.rules }) ===
        JSON.stringify({ selector: desiredBody.selector, rules: desiredRules });
      if (matches) return same;
      if (!same.id) {
        throw new FlyMachineDriverError('NETWORK_POLICY_FAILED', `network policy ${name} is missing id`);
      }
    }

    const writeBody = same ? { ...desiredBody, id: same.id } : desiredBody;
    let created: unknown;
    try {
      created = await this.callWithRetry('POST', `/apps/${this.appName}/network_policies`, writeBody, `netpol:write`);
    } catch (err) {
      throw new FlyMachineDriverError('NETWORK_POLICY_FAILED',
        err instanceof Error ? err.message : String(err),
        err instanceof FlyMachineDriverError ? err.httpStatus : undefined);
    }

    const parsed = FlyNetworkPolicySchema.safeParse(created);
    if (!parsed.success) {
      throw new FlyMachineDriverError('NETWORK_POLICY_FAILED', `network policy response: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  async suspendWorkspace(machineId: string): Promise<void> {
    assertSafeId(machineId, 'machineId');
    try {
      await this.callWithRetry('POST', `/apps/${this.appName}/machines/${machineId}/suspend`, undefined, `suspend:${machineId}`);
      await this.waitForState(machineId, 'suspended');
    } catch (err) {
      if (err instanceof FlyMachineDriverError && (
        err.code === 'MACHINE_WAIT_TIMEOUT' || err.code === 'MACHINE_WAIT_FAILED'
      )) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const status = err instanceof FlyMachineDriverError ? err.httpStatus : undefined;
      throw new FlyMachineDriverError('SUSPEND_FAILED', `suspend machine ${machineId}: ${msg}`, status);
    }
  }

  async resumeWorkspace(machineId: string): Promise<void> {
    assertSafeId(machineId, 'machineId');
    try {
      await this.callWithRetry('POST', `/apps/${this.appName}/machines/${machineId}/start`, undefined, `resume:${machineId}`);
      await this.waitForState(machineId, 'started');
    } catch (err) {
      if (err instanceof FlyMachineDriverError && (
        err.code === 'MACHINE_WAIT_TIMEOUT' || err.code === 'MACHINE_WAIT_FAILED'
      )) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const status = err instanceof FlyMachineDriverError ? err.httpStatus : undefined;
      throw new FlyMachineDriverError('RESUME_FAILED', `resume machine ${machineId}: ${msg}`, status);
    }
  }

  async destroyWorkspace(machineId: string, volumeId: string): Promise<void> {
    assertSafeId(machineId, 'machineId');
    assertSafeId(volumeId, 'volumeId');
    await this.deleteMachine(machineId);
    await this.deleteVolume(volumeId);
  }

  async reapWedged(): Promise<ReapResult> {
    await this.throttle('reap:list');
    const raw = await this.callOnce('GET', `/apps/${this.appName}/machines`);
    const parsed = z.array(z.object({
      id: z.string().min(1), name: z.string(), state: z.string(),
      region: z.string(), created_at: z.string(), updated_at: z.string().optional(),
    })).safeParse(raw);
    if (!parsed.success) {
      throw new FlyMachineDriverError('RESPONSE_PARSE_ERROR', `machine list parse failed: ${parsed.error.message}`);
    }

    const now = this._nowMs();
    const wedged = parsed.data.filter((m) => {
      if (SAFE_STATES.has(m.state)) return false;
      if (!TRANSIENT_5M.has(m.state) && m.state !== 'updating') return false;
      const age = now - new Date(m.updated_at ?? m.created_at).getTime();
      const threshold = m.state === 'updating' ? REAP_10M_MS : REAP_5M_MS;
      if (age < threshold) return false;
      logger.warn('fly-machine-driver: reaping wedged machine', { machineId: m.id, state: m.state, age });
      return true;
    });

    const results = await Promise.allSettled(wedged.map((m) => this.deleteMachine(m.id).then(() => m.id)));
    const destroyedIds: string[] = [];
    const errors: Array<{ machineId: string; error: string }> = [];
    results.forEach((r, i) => {
      const machineId = wedged[i]!.id;
      if (r.status === 'fulfilled') { destroyedIds.push(machineId); return; }
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      errors.push({ machineId, error: msg });
      logger.error('fly-machine-driver: reap failed', { machineId, error: msg });
    });
    return { destroyedIds, errors };
  }

  static buildBaseUrl(machineId: string, appName: string): string {
    return `http://${machineId}.vm.${appName}.internal:${CODING_NODE_PORT}`;
  }

  private async provisionWithFallback(
    regions: string[],
    opts: { sessionId: string; codingNodePublicKeyPem: string; volumeSizeGb?: number },
  ): Promise<WorkspaceProvisionResult> {
    const [region, ...remaining] = regions;
    if (!region) {
      throw new FlyMachineDriverError('CAPACITY_EXHAUSTED', `No regions available for session ${opts.sessionId}`);
    }
    try {
      return await this.provisionInRegion(region, opts);
    } catch (err) {
      if (err instanceof FlyMachineDriverError && err.code === 'CAPACITY_EXHAUSTED') {
        logger.warn('fly-machine-driver: capacity exhausted, trying next region', { region, remaining });
        return this.provisionWithFallback(remaining, opts);
      }
      throw err;
    }
  }

  private async provisionInRegion(
    region: string,
    opts: { sessionId: string; codingNodePublicKeyPem: string; volumeSizeGb?: number },
  ): Promise<WorkspaceProvisionResult> {
    const volume = await this.createVolume(region, opts.sessionId, opts.volumeSizeGb ?? 10);

    let machine: FlyMachine;
    try {
      machine = await this.createMachine(region, volume.id, opts.sessionId, opts.codingNodePublicKeyPem);
    } catch (err) {
      const cleanupErr = await this.deleteVolume(volume.id).then(() => undefined, (e: unknown) => String(e));
      const base = err instanceof FlyMachineDriverError ? err : new FlyMachineDriverError('MACHINE_CREATE_FAILED', String(err));
      throw new FlyMachineDriverError(base.code, base.message, base.httpStatus, cleanupErr ?? undefined);
    }

    try {
      await this.waitForState(machine.id, 'started');
    } catch (waitErr) {
      const machineClean = await this.deleteMachine(machine.id).then(() => undefined, (e: unknown) => String(e));
      const volClean = await this.deleteVolume(volume.id).then(() => undefined, (e: unknown) => String(e));
      const cleanupDetail = [machineClean, volClean].filter(Boolean).join('; ');
      const base = waitErr instanceof FlyMachineDriverError ? waitErr : new FlyMachineDriverError('MACHINE_WAIT_FAILED', String(waitErr));
      throw new FlyMachineDriverError(base.code, base.message, base.httpStatus, cleanupDetail || undefined);
    }

    const baseUrl = FlyMachineDriver.buildBaseUrl(machine.id, this.appName);
    logger.info('fly-machine-driver: workspace provisioned', { machineId: machine.id, volumeId: volume.id, region });
    return { machineId: machine.id, volumeId: volume.id, region, baseUrl };
  }

  private async createVolume(region: string, sessionId: string, sizeGb: number): Promise<FlyVolume> {
    const body = {
      name: `workspace-${sessionId}`.slice(0, 50),
      size_gb: sizeGb,
      region,
      encrypted: true,
      snapshot_retention: 5,
      compute: { cpu_kind: 'performance', cpus: 2, memory_mb: 2048 },
    };
    let raw: unknown;
    try {
      raw = await this.callWithRetry('POST', `/apps/${this.appName}/volumes`, body, `create-volume:${region}`);
    } catch (err) {
      if (isPassThrough(err)) throw err;
      throw new FlyMachineDriverError('VOLUME_CREATE_FAILED',
        err instanceof Error ? err.message : String(err),
        err instanceof FlyMachineDriverError ? err.httpStatus : undefined);
    }
    const parsed = FlyVolumeSchema.safeParse(raw);
    if (!parsed.success) {
      throw new FlyMachineDriverError('RESPONSE_PARSE_ERROR', `volume response: ${parsed.error.message}`);
    }
    logger.info('fly-machine-driver: volume created', { volumeId: parsed.data.id, region });
    return parsed.data;
  }

  private async createMachine(
    region: string, volumeId: string, sessionId: string, codingNodePublicKeyPem: string,
  ): Promise<FlyMachine> {
    const body = {
      name: `coding-${sessionId}`.slice(0, 63),
      region,
      config: {
        image: this.image,
        guest: { cpu_kind: 'performance', cpus: 2, memory_mb: 2048 },
        swap_size_mb: 0,
        mounts: [{ volume: volumeId, path: '/workspace' }],
        env: {
          FLY_APP_NAME: this.appName,
          CODING_SESSION_ID: sessionId,
          CODING_NODE_JWT_PUBLIC_KEY_PEM: codingNodePublicKeyPem,
          HOST: '::',
        },
        metadata: { session_id: sessionId, runtime: 'codespace', isolation_version: '1' },
        restart: { policy: 'no' },
      },
    };
    let raw: unknown;
    try {
      raw = await this.callWithRetry('POST', `/apps/${this.appName}/machines`, body, `create-machine:${region}`);
    } catch (err) {
      if (isPassThrough(err)) throw err;
      throw new FlyMachineDriverError('MACHINE_CREATE_FAILED',
        err instanceof Error ? err.message : String(err),
        err instanceof FlyMachineDriverError ? err.httpStatus : undefined);
    }
    const parsed = FlyMachineSchema.safeParse(raw);
    if (!parsed.success) {
      throw new FlyMachineDriverError('RESPONSE_PARSE_ERROR', `machine response: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  private async waitForState(machineId: string, state: 'started' | 'suspended'): Promise<void> {
    await this.throttle(`wait:${machineId}`);
    const path = `/apps/${this.appName}/machines/${machineId}/wait?state=${state}&timeout=${MACHINE_WAIT_TIMEOUT_SEC}`;
    const clientMs = (MACHINE_WAIT_TIMEOUT_SEC + 5) * 1_000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), clientMs);
    try {
      const resp = await this.rawFetch('GET', path, undefined, ctrl.signal);
      if (resp.status === 408) {
        throw new FlyMachineDriverError('MACHINE_WAIT_TIMEOUT', `machine ${machineId} did not reach ${state} in ${MACHINE_WAIT_TIMEOUT_SEC}s`);
      }
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new FlyMachineDriverError('MACHINE_WAIT_FAILED', `wait ${resp.status}: ${body}`, resp.status);
      }
    } catch (err) {
      if (err instanceof FlyMachineDriverError) throw err;
      throw new FlyMachineDriverError('MACHINE_WAIT_FAILED', `wait error: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async deleteMachine(machineId: string): Promise<void> {
    await this.throttle(`destroy-machine:${machineId}`);
    const resp = await this.rawFetch('DELETE', `/apps/${this.appName}/machines/${machineId}?force=true`);
    if (resp.status === 404) return;
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new FlyMachineDriverError('DESTROY_FAILED', `DELETE machine ${machineId} → ${resp.status}: ${body}`, resp.status);
    }
  }

  private async deleteVolume(volumeId: string): Promise<void> {
    await this.throttle(`destroy-volume:${volumeId}`);
    const resp = await this.rawFetch('DELETE', `/apps/${this.appName}/volumes/${volumeId}`);
    if (resp.status === 404) return;
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new FlyMachineDriverError('DESTROY_FAILED', `DELETE volume ${volumeId} → ${resp.status}: ${body}`, resp.status);
    }
  }

  private async callOnce(method: string, path: string, body?: unknown): Promise<unknown> {
    const resp = await this.rawFetch(method, path, body);
    return this.parseResponse(method, path, resp);
  }

  private async callWithRetry(
    method: string, path: string, body: unknown, bucketKey: string, attempt = 1,
  ): Promise<unknown> {
    await this.throttle(bucketKey);

    let resp: Response;
    try {
      resp = await this.rawFetch(method, path, body);
    } catch (err) {
      if (attempt >= this.maxAttempts) throw err;
      await this._sleep(500 * attempt + this.jitterMs());
      return this.callWithRetry(method, path, body, bucketKey, attempt + 1);
    }

    if (resp.status === 429) {
      if (attempt >= this.maxAttempts) {
        throw new FlyMachineDriverError('RATE_LIMIT_EXCEEDED', `429 after ${attempt} attempts on ${path}`, 429);
      }
      const raw = parseFloat(resp.headers.get('Retry-After') ?? '1');
      const waitMs = Math.min(raw * 1_000, MAX_RETRY_AFTER_MS) + this.jitterMs();
      logger.warn('fly-machine-driver: 429 rate limited', { path, attempt, waitMs });
      await this._sleep(waitMs);
      return this.callWithRetry(method, path, body, bucketKey, attempt + 1);
    }

    if (resp.status >= 500 || resp.status === 409 || resp.status === 422) {
      const bodyText = await resp.text().catch(() => '');
      if (isCapacityError(resp.status, bodyText)) {
        throw new FlyMachineDriverError('CAPACITY_EXHAUSTED', `capacity: ${bodyText}`, resp.status);
      }
      if (attempt >= this.maxAttempts || (resp.status >= 400 && resp.status < 500)) {
        throw new FlyMachineDriverError('RESPONSE_PARSE_ERROR', `${method} ${path} → ${resp.status}: ${bodyText}`, resp.status);
      }
      await this._sleep(500 * attempt + this.jitterMs());
      return this.callWithRetry(method, path, body, bucketKey, attempt + 1);
    }

    return this.parseResponse(method, path, resp);
  }

  private async parseResponse(method: string, path: string, resp: Response): Promise<unknown> {
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (isCapacityError(resp.status, text)) {
        throw new FlyMachineDriverError('CAPACITY_EXHAUSTED', `capacity: ${text}`, resp.status);
      }
      throw new FlyMachineDriverError('RESPONSE_PARSE_ERROR', `${method} ${path} → ${resp.status}: ${text}`, resp.status);
    }
    if (resp.status === 204) return undefined;
    const text = await resp.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new FlyMachineDriverError('RESPONSE_PARSE_ERROR', `non-JSON from ${method} ${path}: ${text.slice(0, 200)}`);
    }
  }

  private async rawFetch(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
    const url = `${this.apiBase}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.requestTimeoutMs);
    const combined = signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([ctrl.signal, signal])
      : ctrl.signal;
    try {
      return await this._fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: combined,
      });
    } catch (err) {
      throw new FlyMachineDriverError('RESPONSE_PARSE_ERROR', `network error ${method} ${path}: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async throttle(key: string): Promise<void> {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this._nowMs, 1, 3);
      this.buckets.set(key, bucket);
    }
    const waitMs = bucket.waitMs();
    if (waitMs > MAX_TOKEN_WAIT_MS) {
      throw new FlyMachineDriverError('RATE_LIMIT_EXCEEDED', `throttle wait too long for ${key}: ${waitMs}ms`);
    }
    if (waitMs > 0) {
      await this._sleep(waitMs);
      bucket.consume();
    }
  }

  private jitterMs(): number {
    return Math.floor(this._random() * MAX_JITTER_MS);
  }
}

function isPassThrough(err: unknown): boolean {
  return err instanceof FlyMachineDriverError && (
    err.code === 'CAPACITY_EXHAUSTED' || err.code === 'RATE_LIMIT_EXCEEDED'
  );
}
