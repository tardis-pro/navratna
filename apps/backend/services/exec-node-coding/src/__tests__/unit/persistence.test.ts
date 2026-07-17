import { describe, it, expect, afterEach, vi } from 'vitest';
import type { AgentSessionEventListener } from '@mariozechner/pi-coding-agent';
vi.unmock('node:fs');
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CodingSession, PersistenceError } from '../../session/coding_session.js';

describe('CodingSession — filesystem persistence', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
    vi.restoreAllMocks();
  });

  function makeTmpSession(dir: string, id = 'persist-test'): CodingSession {
    return new CodingSession({
      id,
      workspaceId: 'ws-persist',
      projectId: 'proj-persist',
      userId: 'user-persist',
      tenantId: 'tenant-persist',
      repositoryId: '11111111',
      sessionFile: path.join(dir, `${id}.jsonl`),
      manifestPath: path.join(dir, `${id}.manifest.json`),
      eventTailPath: path.join(dir, `${id}.events.jsonl`),
      replayBufferSize: 10,
    });
  }

  it('writes manifest.json atomically on state transition', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-persist-'));
    dirs.push(dir);
    const s = makeTmpSession(dir);
    s.transition('READY');
    const manifestPath = path.join(dir, 'persist-test.manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { state: string; sessionId: string };
    expect(manifest.state).toBe('READY');
    expect(manifest.sessionId).toBe('persist-test');
  });

  it('appends event to events.jsonl', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-persist-'));
    dirs.push(dir);
    const s = makeTmpSession(dir);
    s.transition('READY');
    s.transition('PROMPTING');
    const tailPath = path.join(dir, 'persist-test.events.jsonl');
    expect(fs.existsSync(tailPath)).toBe(true);
    const lines = fs.readFileSync(tailPath, 'utf-8').split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const first = JSON.parse(lines[0]!) as { type: string };
    expect(first.type).toBe('state_changed');
  });

  it('no .tmp file remains after successful manifest write', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-persist-'));
    dirs.push(dir);
    const s = makeTmpSession(dir, 'p');
    s.transition('READY');
    expect(fs.existsSync(path.join(dir, 'p.manifest.json.tmp'))).toBe(false);
  });

  it('throws PersistenceError when manifest directory is unwritable', () => {
    if (process.getuid?.() === 0) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-persist-'));
    dirs.push(dir);
    fs.chmodSync(dir, 0o444);
    const s = makeTmpSession(dir, 'unwritable');
    expect(() => s.transition('READY')).toThrow(PersistenceError);
    fs.chmodSync(dir, 0o755);
  });

  it('loads replay buffer from existing event tail on loadReplayFromEventTail', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-persist-'));
    dirs.push(dir);
    const tailPath = path.join(dir, 'recover-test.events.jsonl');
    const e1 = { id: 'recover-test-1', seq: 1, sessionId: 'recover-test', timestamp: Date.now(), type: 'state_changed', payload: { from: 'CREATING', to: 'READY' } };
    const e2 = { id: 'recover-test-2', seq: 2, sessionId: 'recover-test', timestamp: Date.now(), type: 'message_update', payload: {} };
    fs.writeFileSync(tailPath, JSON.stringify(e1) + '\n' + JSON.stringify(e2) + '\n');

    const s = new CodingSession({
      id: 'recover-test',
      workspaceId: 'ws', projectId: 'p', userId: 'u', tenantId: 't', repositoryId: '11111111',
      sessionFile: path.join(dir, 'recover-test.jsonl'),
      manifestPath: path.join(dir, 'recover-test.manifest.json'),
      eventTailPath: tailPath,
      replayBufferSize: 200,
    });

    s.loadReplayFromEventTail();
    expect(s.lastEventSeq).toBe(2);
    const replayed: Array<{ seq: number }> = [];
    s.replayAll((e) => replayed.push(e as { seq: number }));
    expect(replayed.length).toBe(2);
    expect(replayed[0]?.seq).toBe(1);
    expect(replayed[1]?.seq).toBe(2);
  });
});

describe('CodingSession — recovery with real files', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
    vi.restoreAllMocks();
  });

  it('restores session state and replays events on genuine restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-restart-'));
    dirs.push(dir);

    const id = 'restart-session';
    const sessionFile = path.join(dir, `${id}.jsonl`);
    const manifestPath = path.join(dir, `${id}.manifest.json`);
    const eventTailPath = path.join(dir, `${id}.events.jsonl`);

    const s1 = new CodingSession({
      id, workspaceId: 'ws-1', projectId: 'p', userId: 'u', tenantId: 't', repositoryId: '11111111',
      sessionFile, manifestPath, eventTailPath, replayBufferSize: 200,
    });
    s1.transition('READY');
    s1.transition('PROMPTING');

    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(eventTailPath)).toBe(true);

    const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { state: string; lastEventSeq: number };
    expect(manifestRaw.state).toBe('PROMPTING');
    expect(manifestRaw.lastEventSeq).toBe(2);

    const s2 = new CodingSession({
      id, workspaceId: 'ws-1', projectId: 'p', userId: 'u', tenantId: 't', repositoryId: '11111111',
      sessionFile, manifestPath, eventTailPath, replayBufferSize: 200,
    });

    const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    s2.restoreFromManifest(rawManifest);
    expect(s2.wasInterrupted()).toBe(true);

    s2.loadReplayFromEventTail();
    expect(s2.lastEventSeq).toBe(2);

    const replayed: Array<{ type: string }> = [];
    s2.replayAll((e) => replayed.push(e as { type: string }));
    expect(replayed.length).toBe(2);
    expect(replayed[0]?.type).toBe('state_changed');
  });

  it('skips corrupt lines in event tail without throwing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-corrupt-'));
    dirs.push(dir);

    const tailPath = path.join(dir, 'corrupt.events.jsonl');
    const good = { id: 'corrupt-1', seq: 1, sessionId: 'corrupt', timestamp: Date.now(), type: 'state_changed', payload: { from: 'CREATING', to: 'READY' } };
    fs.writeFileSync(tailPath, `{broken json\n${JSON.stringify(good)}\nnot-json-at-all\n`);

    const s = new CodingSession({
      id: 'corrupt', workspaceId: 'ws', projectId: 'p', userId: 'u', tenantId: 't', repositoryId: '11111111',
      sessionFile: path.join(dir, 'c.jsonl'),
      manifestPath: path.join(dir, 'c.manifest.json'),
      eventTailPath: tailPath,
      replayBufferSize: 200,
    });

    expect(() => s.loadReplayFromEventTail()).not.toThrow();
    expect(s.lastEventSeq).toBe(1);

    const replayed: Array<{ seq: number }> = [];
    s.replayAll((e) => replayed.push(e as { seq: number }));
    expect(replayed.length).toBe(1);
    expect(replayed[0]?.seq).toBe(1);
  });

  it('skips events from other sessions in event tail', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-other-'));
    dirs.push(dir);

    const tailPath = path.join(dir, 'other.events.jsonl');
    const mine = { id: 'mine-1', seq: 1, sessionId: 'mine', timestamp: Date.now(), type: 'state_changed', payload: { from: 'CREATING', to: 'READY' } };
    const theirs = { id: 'theirs-1', seq: 1, sessionId: 'theirs', timestamp: Date.now(), type: 'state_changed', payload: { from: 'CREATING', to: 'READY' } };
    fs.writeFileSync(tailPath, `${JSON.stringify(mine)}\n${JSON.stringify(theirs)}\n`);

    const s = new CodingSession({
      id: 'mine', workspaceId: 'ws', projectId: 'p', userId: 'u', tenantId: 't', repositoryId: '11111111',
      sessionFile: path.join(dir, 'm.jsonl'),
      manifestPath: path.join(dir, 'm.manifest.json'),
      eventTailPath: tailPath,
      replayBufferSize: 200,
    });

    s.loadReplayFromEventTail();

    const replayed: Array<{ sessionId: string }> = [];
    s.replayAll((e) => replayed.push(e as { sessionId: string }));
    expect(replayed.length).toBe(1);
    expect(replayed[0]?.sessionId).toBe('mine');
  });

  it('tokens are never written to event tail (redaction)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-redact-'));
    dirs.push(dir);

    const SECRET = 'actual-secret-api-key-do-not-log';

    const s = new CodingSession({
      id: 'redact-persist',
      workspaceId: 'ws', projectId: 'p', userId: 'u', tenantId: 't', repositoryId: '11111111',
      sessionFile: path.join(dir, 'r.jsonl'),
      manifestPath: path.join(dir, 'r.manifest.json'),
      eventTailPath: path.join(dir, 'r.events.jsonl'),
      replayBufferSize: 200,
      credentialSecrets: [SECRET],
    });
    s.transition('READY');

    const eventCapture: unknown[] = [];
    s.subscribe((e) => eventCapture.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    const fakePi = {
      prompt: async () => {},
      abort: async () => {},
      abortBash: () => {},
      isBashRunning: false,
      subscribe: (l: AgentSessionEventListener) => {
        capturedListener = l;
        return () => {};
      },
    };

    s.attachPiSession(fakePi);
    capturedListener?.({ type: 'message_update', content: `Result computed using key ${SECRET}` } as unknown as Parameters<AgentSessionEventListener>[0]);

    const tailContent = fs.readFileSync(path.join(dir, 'r.events.jsonl'), 'utf-8');
    expect(tailContent).not.toContain(SECRET);
    expect(tailContent).toContain('[REDACTED]');

    const sseContent = JSON.stringify(eventCapture);
    expect(sseContent).not.toContain(SECRET);
  });
});
