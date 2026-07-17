import { describe, it, expect, vi } from 'vitest';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
}));

const LAST_EVENT_ID_RE = /^(.+)-(\d+)$/;

function parseLastEventId(header: string | null | undefined, sessionId: string): number | undefined {
  if (!header) return undefined;
  const m = LAST_EVENT_ID_RE.exec(header);
  if (!m) return undefined;
  if (m[1] !== sessionId) return undefined;
  return parseInt(m[2]!, 10);
}

describe('parseLastEventId', () => {
  it('returns undefined for empty/null header', () => {
    expect(parseLastEventId(null, 'session-a')).toBeUndefined();
    expect(parseLastEventId(undefined, 'session-a')).toBeUndefined();
    expect(parseLastEventId('', 'session-a')).toBeUndefined();
  });

  it('rejects header with no hyphen-integer suffix', () => {
    expect(parseLastEventId('session-a', 'session-a')).toBeUndefined();
  });

  it('rejects trailing junk after integer (session-1abc)', () => {
    expect(parseLastEventId('session-a-1abc', 'session-a')).toBeUndefined();
  });

  it('rejects session ID mismatch', () => {
    expect(parseLastEventId('other-session-5', 'session-a')).toBeUndefined();
  });

  it('parses valid id correctly', () => {
    expect(parseLastEventId('session-a-0', 'session-a')).toBe(0);
    expect(parseLastEventId('session-a-42', 'session-a')).toBe(42);
    expect(parseLastEventId('ws-1-session-abc-99', 'ws-1-session-abc')).toBe(99);
  });

  it('rejects non-numeric suffix', () => {
    expect(parseLastEventId('session-a-xyz', 'session-a')).toBeUndefined();
  });
});
