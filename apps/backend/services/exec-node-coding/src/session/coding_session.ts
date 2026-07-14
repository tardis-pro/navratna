import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '@uaip/utils';
import {
  CodingSessionEventSchema,
  CodingSessionManifestSchema,
  CodingSessionStateSchema,
} from '@uaip/types';
import type {
  CodingSessionEvent,
  CodingSessionManifest,
  CodingSessionState,
} from '@uaip/types';
import type { AgentSessionEventListener } from '@mariozechner/pi-coding-agent';
import { ReplayBuffer } from '../sse/replay_buffer.js';
import type { PiAgentSession } from './pi_loader.js';
import { extractKnownTestEvent, extractToolReceipt } from './receipt_extractor.js';
import type { ExtractedTestEvent } from './receipt_extractor.js';

type SseSubscriber = (event: CodingSessionEvent) => void;

const VALID_TRANSITIONS: Record<CodingSessionState, CodingSessionState[]> = {
  CREATING: ['READY', 'ERROR', 'CLOSED'],
  READY: ['PROMPTING', 'ABORTING', 'CLOSED', 'ERROR'],
  PROMPTING: ['STREAMING', 'ABORTING', 'READY', 'ERROR'],
  STREAMING: ['READY', 'ABORTING', 'ERROR'],
  ABORTING: ['READY', 'ERROR', 'CLOSED'],
  SUSPENDED_HOT: ['RESUMING', 'CLOSED', 'ERROR'],
  RESUMING: ['READY', 'ERROR'],
  ERROR: ['CLOSED'],
  CLOSED: [],
};

const INTERRUPTED_STATES: Set<CodingSessionState> = new Set([
  'PROMPTING', 'STREAMING', 'ABORTING',
]);

type CompletedKeyEntry = { acceptedAt: number };
type ProvisionStage = 'queued' | 'booting' | 'cloning' | 'installing' | 'ready';
type Clock = () => number;

function redactSecrets(value: unknown, secrets: readonly string[], seen = new Set<unknown>()): unknown {
  if (secrets.length === 0) return value;
  if (typeof value === 'string') {
    let result = value;
    for (const s of secrets) {
      result = result.split(s).join('[REDACTED]');
    }
    return result;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return value.map((item) => redactSecrets(item, secrets, seen));
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = redactSecrets(v, secrets, seen);
    }
    return result;
  }
  return value;
}

export class CodingSession {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly repositoryId: string;

  private _state: CodingSessionState;
  private _sessionFile: string;
  private _lastEventSeq: number;
  private _activeIdempotencyKey: string | undefined;
  private readonly _completedKeys = new Map<string, CompletedKeyEntry>();
  private readonly _completedKeyTtlMs: number;
  private _createdAt: number;
  private _updatedAt: number;
  private readonly _manifestPath: string;
  private readonly _eventTailPath: string;
  private readonly _replayBuffer: ReplayBuffer;
  private readonly _subscribers: Set<SseSubscriber> = new Set();
  private readonly _credentialSecrets: string[];
  private readonly _clock: Clock;
  private _turnStartedAt: number | null = null;
  private _timeToFirstTokenMs: number | undefined;
  private _piSession: PiAgentSession | null = null;
  private _piUnsubscribe: (() => void) | null = null;

  constructor(options: {
    id: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    tenantId: string;
    repositoryId: string;
    sessionFile: string;
    manifestPath: string;
    eventTailPath: string;
    replayBufferSize: number;
    completedKeyTtlMs?: number;
    credentialSecrets?: readonly string[];
    clock?: Clock;
  }) {
    this.id = options.id;
    this.workspaceId = options.workspaceId;
    this.projectId = options.projectId;
    this.userId = options.userId;
    this.tenantId = options.tenantId;
    this.repositoryId = options.repositoryId;
    this._state = 'CREATING';
    this._sessionFile = options.sessionFile;
    this._manifestPath = options.manifestPath;
    this._eventTailPath = options.eventTailPath;
    this._clock = options.clock ?? (() => Date.now());
    this._createdAt = this._clock();
    this._updatedAt = this._clock();
    this._replayBuffer = new ReplayBuffer(options.replayBufferSize);
    this._completedKeyTtlMs = options.completedKeyTtlMs ?? 600_000;
    this._lastEventSeq = 0;
    this._credentialSecrets = (options.credentialSecrets ?? []).filter((s) => s.length > 0);
  }

  get state(): CodingSessionState { return this._state; }
  get sessionFile(): string { return this._sessionFile; }
  get lastEventSeq(): number { return this._lastEventSeq; }
  get activeIdempotencyKey(): string | undefined { return this._activeIdempotencyKey; }

  rotateGithubCredential(newToken: string, expiresAt: string): void {
    if (!newToken || newToken.length === 0) {
      throw new Error('newToken must not be empty');
    }
    const expiryMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiryMs) || expiryMs <= this._clock()) {
      throw new Error('GitHub credential expiry must be in the future');
    }
    this._credentialSecrets.push(newToken);
  }

  restoreFromManifest(raw: unknown): void {
    const parsed = CodingSessionManifestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Corrupt manifest: ${parsed.error.message}`);
    }
    const m = parsed.data;
    const stateResult = CodingSessionStateSchema.safeParse(m.state);
    if (
      typeof m.sessionId !== 'string' ||
      typeof m.workspaceId !== 'string' ||
      typeof m.projectId !== 'string' ||
      typeof m.userId !== 'string' ||
      typeof m.tenantId !== 'string' ||
      typeof m.sessionFile !== 'string' ||
      typeof m.lastEventSeq !== 'number' ||
      typeof m.createdAt !== 'number' ||
      typeof m.updatedAt !== 'number' ||
      !stateResult.success
    ) {
      throw new Error('Corrupt manifest: required fields are missing');
    }
    if (m.sessionId !== this.id) {
      throw new Error(`Manifest session mismatch: expected ${this.id}, got ${m.sessionId}`);
    }
    if (m.workspaceId !== this.workspaceId) {
      throw new Error(`Manifest workspace mismatch`);
    }
    if (m.projectId !== this.projectId || m.userId !== this.userId || m.tenantId !== this.tenantId || m.repositoryId !== this.repositoryId) {
      throw new Error('Manifest identity mismatch');
    }
    if (path.resolve(m.sessionFile) !== path.resolve(this._sessionFile)) {
      throw new Error('Manifest session file mismatch');
    }
    this._createdAt = m.createdAt;
    this._updatedAt = m.updatedAt;
    if (m.lastEventSeq > this._lastEventSeq) {
      this._lastEventSeq = m.lastEventSeq;
    }
    this._sessionFile = m.sessionFile;
    this._state = stateResult.data;
  }

  loadReplayFromEventTail(): boolean {
    if (!fs.existsSync(this._eventTailPath)) return false;
    const text = fs.readFileSync(this._eventTailPath, 'utf-8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(trimmed);
      } catch {
        logger.warn('exec-node-coding: skipping corrupt event-tail line', { sessionId: this.id });
        continue;
      }
      const result = CodingSessionEventSchema.safeParse(raw);
      if (!result.success) {
        logger.warn('exec-node-coding: skipping invalid event in tail', { sessionId: this.id });
        continue;
      }
      const evt = result.data;
      if (evt.sessionId !== this.id) continue;
      const seq = evt.seq ?? 0;
      if (seq > this._lastEventSeq) this._lastEventSeq = seq;
      this._replayBuffer.push({ id: `${this.id}-${seq}`, seq, event: evt });
    }
    return true;
  }

  attachPiSession(piSession: PiAgentSession): void {
    this._piSession = piSession;
    const listener: AgentSessionEventListener = (raw) => { this._handlePiEvent(raw); };
    this._piUnsubscribe = piSession.subscribe(listener);
  }

  updateSessionFile(sessionFile: string): void {
    this._sessionFile = sessionFile;
  }

  transition(to: CodingSessionState): void {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid state transition ${this._state} → ${to} for session ${this.id}`);
    }
    const from = this._state;
    this._state = to;
    this._updatedAt = this._clock();
    this._emitStateChanged(from, to);
  }

  checkIdempotency(idempotencyKey: string): 'pending' | 'completed' | 'new' {
    if (this._activeIdempotencyKey === idempotencyKey) return 'pending';
    const entry = this._completedKeys.get(idempotencyKey);
    if (entry) {
      if (this._clock() - entry.acceptedAt < this._completedKeyTtlMs) return 'completed';
      this._completedKeys.delete(idempotencyKey);
    }
    return 'new';
  }

  async sendPrompt(message: string, idempotencyKey: string): Promise<{ alreadyCompleted: boolean }> {
    const status = this.checkIdempotency(idempotencyKey);
    if (status === 'pending') throw new ConflictError(`Idempotency key already active: ${idempotencyKey}`);
    if (status === 'completed') return { alreadyCompleted: true };

    if (this._state !== 'READY') {
      throw new Error(`Session ${this.id} is not READY (state=${this._state}); cannot prompt`);
    }
    if (!this._piSession) throw new Error(`Session ${this.id} has no attached pi session`);

    this._activeIdempotencyKey = idempotencyKey;
    this.transition('PROMPTING');

    try {
      await this._piSession.prompt(message);
    } catch (err) {
      logger.error('exec-node-coding: prompt error', {
        sessionId: this.id,
        error: err instanceof Error ? err.message : String(err),
      });
      this._activeIdempotencyKey = undefined;
      this.transition('ERROR');
      throw err;
    }

    return { alreadyCompleted: false };
  }

  _markKeyCompleted(key: string): void {
    this._completedKeys.set(key, { acceptedAt: this._clock() });
    this._evictExpiredKeys();
  }

  private _evictExpiredKeys(): void {
    const now = this._clock();
    for (const [k, v] of this._completedKeys) {
      if (now - v.acceptedAt >= this._completedKeyTtlMs) this._completedKeys.delete(k);
    }
  }

  async abort(): Promise<void> {
    if (this._state === 'CLOSED') return;
    if (!this._piSession) return;

    this.transition('ABORTING');
    const key = this._activeIdempotencyKey;
    this._activeIdempotencyKey = undefined;

    const errors: Error[] = [];

    // Attempt abortBash independently so abort() can still run even if abortBash throws.
    try {
      this._piSession.abortBash();
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
      logger.error('exec-node-coding: abortBash failed', {
        sessionId: this.id,
        error: errors[errors.length - 1]!.message,
      });
    }

    try {
      await this._piSession.abort();
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
      logger.error('exec-node-coding: abort failed', {
        sessionId: this.id,
        error: errors[errors.length - 1]!.message,
      });
    }

    const bashStillRunning =
      'isBashRunning' in this._piSession && this._piSession.isBashRunning === true;

    this._emitSessionAborted(key);

    if (errors.length > 0 || bashStillRunning) {
      const msg = errors.map((e) => e.message).join('; ') || 'bash still running after abort';
      this.transition('ERROR');
      throw new AbortError(`Abort failed for session ${this.id}: ${msg}`);
    }

    this.transition('READY');
  }

  async close(reason?: string): Promise<void> {
    if (this._state === 'CLOSED') return;

    if (this._piUnsubscribe) {
      this._piUnsubscribe();
      this._piUnsubscribe = null;
    }

    this._emitSessionClosed(reason);
    this.transition('CLOSED');
    this._piSession = null;
    this._subscribers.clear();
    this._persistManifest();
  }

  wasInterrupted(): boolean {
    return INTERRUPTED_STATES.has(this._state);
  }

  beginResume(): void {
    this._state = 'RESUMING';
  }

  emitSessionRecovered(sessionFile: string, interruptedTurn: boolean): void {
    const seq = ++this._lastEventSeq;
    const event: CodingSessionEvent = {
      id: `${this.id}-${seq}`, seq, sessionId: this.id, timestamp: this._clock(),
      type: 'session_recovered', payload: { sessionFile, interruptedTurn },
    };
    this._fanOut(event, seq);
  }

  emitSessionCreated(sessionFile: string): void {
    const seq = ++this._lastEventSeq;
    const event: CodingSessionEvent = {
      id: `${this.id}-${seq}`, seq, sessionId: this.id, timestamp: this._clock(),
      type: 'session_created', payload: { sessionFile },
    };
    this._fanOut(event, seq);
  }

  emitProvision(stage: ProvisionStage, detail?: string): void {
    const seq = ++this._lastEventSeq;
    const base = { id: `${this.id}-${seq}`, seq, sessionId: this.id, timestamp: this._clock() };
    const payload = { stage, detail };
    const event = this._buildProvisionEvent(stage, base, payload);
    this._fanOut(event, seq);
  }

  private _buildProvisionEvent(
    stage: ProvisionStage,
    base: { id: string; seq: number; sessionId: string; timestamp: number },
    payload: { stage: ProvisionStage; detail?: string },
  ): CodingSessionEvent {
    switch (stage) {
      case 'queued': return { ...base, type: 'provision_queued', payload };
      case 'booting': return { ...base, type: 'provision_booting', payload };
      case 'cloning': return { ...base, type: 'provision_cloning', payload };
      case 'installing': return { ...base, type: 'provision_installing', payload };
      case 'ready': return { ...base, type: 'provision_ready', payload };
    }
  }

  emitProvisionLifecycle(stages: ProvisionStage[]): void {
    for (const stage of stages) this.emitProvision(stage);
  }

  emitBackpressureTerminalEvent(droppedAfterSeq: number): void {
    const seq = ++this._lastEventSeq;
    const event: CodingSessionEvent = {
      id: `${this.id}-${seq}`, seq, sessionId: this.id, timestamp: this._clock(),
      type: 'backpressure', payload: { droppedAfterSeq },
    };
    this._fanOut(event, seq);
  }

  buildBackpressureEvent(): CodingSessionEvent {
    const droppedAfterSeq = this._lastEventSeq;
    const seq = ++this._lastEventSeq;
    const event: CodingSessionEvent = {
      id: `${this.id}-${seq}`, seq, sessionId: this.id, timestamp: this._clock(),
      type: 'backpressure', payload: { droppedAfterSeq },
    };
    this._fanOut(event, seq);
    return event;
  }

  subscribe(fn: SseSubscriber): () => void {
    this._subscribers.add(fn);
    return () => { this._subscribers.delete(fn); };
  }

  replaySince(afterSeq: number, fn: SseSubscriber): void {
    for (const entry of this._replayBuffer.since(afterSeq)) fn(entry.event);
  }

  replayAll(fn: SseSubscriber): void {
    for (const entry of this._replayBuffer.all()) fn(entry.event);
  }

  manifest(): CodingSessionManifest {
    return {
      sessionId: this.id,
      workspaceId: this.workspaceId,
      projectId: this.projectId,
      userId: this.userId,
      tenantId: this.tenantId,
      repositoryId: this.repositoryId,
      state: this._state,
      sessionFile: this._sessionFile,
      lastEventSeq: this._lastEventSeq,
      activeIdempotencyKey: this._activeIdempotencyKey,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }

  private _handlePiEvent(raw: Record<string, unknown>): void {
    const safeEvent = redactSecrets(raw, this._credentialSecrets);
    if (safeEvent === null || typeof safeEvent !== 'object' || Array.isArray(safeEvent)) {
      logger.warn('exec-node-coding: ignoring non-object pi event', { sessionId: this.id });
      return;
    }
    const redacted = Object.fromEntries(Object.entries(safeEvent));
    const type = typeof redacted['type'] === 'string' ? redacted['type'] : 'unknown';
    const now = this._clock();

    if (type === 'agent_start') {
      if (this._state === 'PROMPTING') this.transition('STREAMING');
    } else if (type === 'turn_start') {
      this._turnStartedAt = now;
      this._timeToFirstTokenMs = undefined;
    } else if (type === 'message_update') {
      this._captureFirstToken(redacted, now);
    } else if (type === 'agent_end') {
      if (this._state === 'STREAMING' || this._state === 'ABORTING') {
        const key = this._activeIdempotencyKey;
        this._activeIdempotencyKey = undefined;
        if (key) this._markKeyCompleted(key);
        if (this._state !== 'ABORTING') this.transition('READY');
      }
    }

    const knownTestEvent = extractKnownTestEvent(redacted);
    if (knownTestEvent !== null) {
      this._emitExtractedTestEvent(knownTestEvent);
      return;
    }

    const seq = ++this._lastEventSeq;
    const event = this._buildEvent(type, redacted, seq, now);
    this._fanOut(event, seq);

    if (type === 'tool_execution_end') {
      const extraction = extractToolReceipt(redacted);
      if (extraction?.receipt) this._emitReceipt(extraction.receipt);
      for (const testEvent of extraction?.testEvents ?? []) this._emitExtractedTestEvent(testEvent);
    }

    if (type === 'agent_end') {
      this._turnStartedAt = null;
      this._timeToFirstTokenMs = undefined;
    }
  }

  private _buildEvent(type: string, raw: Record<string, unknown>, seq: number, now: number): CodingSessionEvent {
    const id = `${this.id}-${seq}`;
    const sessionId = this.id;
    const timestamp = now;

    switch (type) {
      case 'agent_start':
        return { id, seq, sessionId, timestamp, type: 'agent_start', payload: raw };
      case 'turn_start':
        return { id, seq, sessionId, timestamp, type: 'turn_start', payload: raw };
      case 'message_update':
        return { id, seq, sessionId, timestamp, type: 'message_update', payload: raw };
      case 'message_end':
        return { id, seq, sessionId, timestamp, type: 'message_end', payload: raw };
      case 'tool_execution_start':
        return { id, seq, sessionId, timestamp, type: 'tool_execution_start', payload: raw };
      case 'tool_execution_update':
        return { id, seq, sessionId, timestamp, type: 'tool_execution_update', payload: raw };
      case 'tool_execution_end':
        return { id, seq, sessionId, timestamp, type: 'tool_execution_end', payload: raw };
      case 'turn_end':
        return { id, seq, sessionId, timestamp, type: 'turn_end', payload: raw };
      case 'agent_end': {
        const turnDurationMs = this._turnStartedAt === null ? 0 : Math.max(0, now - this._turnStartedAt);
        return {
          id, seq, sessionId, timestamp, type: 'agent_end',
          payload: { event: raw, turnDurationMs, timeToFirstTokenMs: this._timeToFirstTokenMs },
        };
      }
      default:
        logger.warn('exec-node-coding: unknown pi event type', { sessionId, upstreamType: type });
        return {
          id, seq, sessionId, timestamp, type: 'error',
          payload: { code: 'UNKNOWN_EVENT', message: 'Unsupported upstream event was ignored', recoverable: true },
        };
    }
  }

  private _captureFirstToken(raw: Record<string, unknown>, now: number): void {
    if (this._turnStartedAt === null || this._timeToFirstTokenMs !== undefined) return;
    const nested = raw['assistantMessageEvent'];
    const nestedDelta = nested !== null && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)['delta']
      : undefined;
    const delta = raw['delta'] ?? raw['contentDelta'] ?? nestedDelta;
    if (typeof delta === 'string' && delta.trim().length > 0) {
      this._timeToFirstTokenMs = Math.max(0, now - this._turnStartedAt);
    }
  }

  private _emitReceipt(receipt: Extract<CodingSessionEvent, { type: 'receipt' }>['payload']): void {
    const seq = ++this._lastEventSeq;
    this._fanOut({
      id: `${this.id}-${seq}`, seq, sessionId: this.id, timestamp: this._clock(),
      type: 'receipt', payload: receipt,
    }, seq);
  }

  private _emitExtractedTestEvent(extracted: ExtractedTestEvent): void {
    const seq = ++this._lastEventSeq;
    const base = { id: `${this.id}-${seq}`, seq, sessionId: this.id, timestamp: this._clock() };
    let event: CodingSessionEvent;
    if (extracted.type === 'test_run_start') {
      event = { ...base, type: 'test_run_start', payload: extracted.payload };
    } else if (extracted.type === 'test_case_result') {
      event = { ...base, type: 'test_case_result', payload: extracted.payload };
    } else {
      event = { ...base, type: 'test_run_end', payload: extracted.payload };
    }
    this._fanOut(event, seq);
  }

  private _emitStateChanged(from: CodingSessionState, to: CodingSessionState): void {
    const seq = ++this._lastEventSeq;
    const event: CodingSessionEvent = {
      id: `${this.id}-${seq}`, seq, sessionId: this.id, timestamp: this._clock(),
      type: 'state_changed', payload: { from, to },
    };
    this._fanOut(event, seq);
  }

  private _emitSessionAborted(idempotencyKey: string | undefined): void {
    const seq = ++this._lastEventSeq;
    const event: CodingSessionEvent = {
      id: `${this.id}-${seq}`, seq, sessionId: this.id, timestamp: this._clock(),
      type: 'session_aborted', payload: { idempotencyKey },
    };
    this._fanOut(event, seq);
  }

  private _emitSessionClosed(reason: string | undefined): void {
    const seq = ++this._lastEventSeq;
    const event: CodingSessionEvent = {
      id: `${this.id}-${seq}`, seq, sessionId: this.id, timestamp: this._clock(),
      type: 'session_closed', payload: { reason },
    };
    this._fanOut(event, seq);
  }

  private _fanOut(event: CodingSessionEvent, seq: number): void {
    this._persistEventTail(event);
    this._persistManifest();
    this._replayBuffer.push({ id: `${this.id}-${seq}`, seq, event });
    for (const sub of this._subscribers) {
      try {
        sub(event);
      } catch (err) {
        logger.warn('exec-node-coding: SSE subscriber error', {
          sessionId: this.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private _persistManifest(): void {
    const manifest = this.manifest();
    const tmp = `${this._manifestPath}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this._manifestPath), { recursive: true });
      // Atomic write: write to .tmp then rename to avoid partial reads.
      fs.writeFileSync(tmp, JSON.stringify(manifest), 'utf-8');
      fs.renameSync(tmp, this._manifestPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('exec-node-coding: manifest persist failed — moving session to ERROR', {
        sessionId: this.id, error: msg,
      });
      if (this._state !== 'CLOSED' && this._state !== 'ERROR') {
        this._state = 'ERROR';
      }
      throw new PersistenceError(`Manifest write failed: ${msg}`);
    }
  }

  private _persistEventTail(event: CodingSessionEvent): void {
    try {
      fs.mkdirSync(path.dirname(this._eventTailPath), { recursive: true });
      fs.appendFileSync(this._eventTailPath, JSON.stringify(event) + '\n', 'utf-8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('exec-node-coding: event tail append failed — moving session to ERROR', {
        sessionId: this.id, error: msg,
      });
      if (this._state !== 'CLOSED' && this._state !== 'ERROR') {
        this._state = 'ERROR';
      }
      throw new PersistenceError(`Event tail write failed: ${msg}`);
    }
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = 'IDEMPOTENCY_CONFLICT';
  constructor(message: string) { super(message); this.name = 'ConflictError'; }
}

export class AbortError extends Error {
  readonly statusCode = 500;
  readonly code = 'ABORT_FAILED';
  constructor(message: string) { super(message); this.name = 'AbortError'; }
}

export class PersistenceError extends Error {
  readonly statusCode = 500;
  readonly code = 'PERSISTENCE_FAILED';
  constructor(message: string) { super(message); this.name = 'PersistenceError'; }
}
