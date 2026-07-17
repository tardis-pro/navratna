// Tests for the CONNECT proxy parser, hostname normalisation, and the
// underlying allowlist enforcement.

import { describe, it, expect } from 'vitest';
import {
  normalizeHostname,
  parseConnectRequest,
  isAllowedHost,
  PhaseHostList,
} from '../../../egress/connect_proxy.js';

const SETUP_LIST: PhaseHostList = ['github.com', 'api.github.com'];
const AGENT_LIST: PhaseHostList = ['api.anthropic.com', 'api.openai.com'];

describe('normalizeHostname', () => {
  it('lower-cases', () => {
    expect(normalizeHostname('GitHub.Com')).toEqual({ ok: true, value: 'github.com' });
  });
  it('strips trailing dot', () => {
    expect(normalizeHostname('github.com.')).toEqual({ ok: true, value: 'github.com' });
  });
  it('rejects empty string', () => {
    expect(normalizeHostname('').ok).toBe(false);
  });
  it('rejects double dot', () => {
    expect(normalizeHostname('a..b.com').ok).toBe(false);
  });
  it('rejects leading dot', () => {
    expect(normalizeHostname('.foo.com').ok).toBe(false);
  });
  it('rejects non-ASCII without xn-- prefix', () => {
    expect(normalizeHostname('g\u00e9n\u00e9rique.com').ok).toBe(false);
  });
  it('rejects IP literal', () => {
    expect(normalizeHostname('1.2.3.4').ok).toBe(false);
  });
  it('rejects embedded NUL', () => {
    expect(normalizeHostname('foo\0bar.com').ok).toBe(false);
  });
  it('rejects userinfo', () => {
    expect(normalizeHostname('user:pass@gmail.com').ok).toBe(false);
  });
  it('rejects percent-encoded labels', () => {
    expect(normalizeHostname('a%2Eb.com').ok).toBe(false);
  });
  it('accepts xn-- form', () => {
    expect(normalizeHostname('xn--bcher-kva.example').ok).toBe(true);
  });
  it('accepts github.com exactly', () => {
    const r = normalizeHostname('github.com');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('github.com');
  });
});

describe('parseConnectRequest — happy + smuggling + edge', () => {
  it('parses CONNECT github.com:443', () => {
    const r = parseConnectRequest(Buffer.from('CONNECT github.com:443 HTTP/1.1\r\nHost: github.com\r\n\r\n'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.host).toBe('github.com');
      expect(r.port).toBe(443);
    }
  });

  it('rejects absolute-form GET (request smuggling)', () => {
    const r = parseConnectRequest(Buffer.from('GET http://evil.com/ HTTP/1.1\r\nHost: evil.com\r\n\r\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_CONNECT');
  });

  it('rejects absolute-form CONNECT', () => {
    const r = parseConnectRequest(Buffer.from('CONNECT http://evil.com:443 HTTP/1.1\r\n\r\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_CONNECT');
  });

  it('rejects plain HTTP GET', () => {
    const r = parseConnectRequest(Buffer.from('GET / HTTP/1.1\r\nHost: github.com\r\n\r\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_CONNECT');
  });

  it('rejects malformed (no \\r\\n\\r\\n) when buffer past size', () => {
    const big = Buffer.alloc(9000, 0x20);
    const r = parseConnectRequest(big);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code === 'OVERSIZE' || r.code === 'MALFORMED').toBe(true);
    }
  });

  it('rejects credentials in target', () => {
    const r = parseConnectRequest(Buffer.from('CONNECT user:pass@github.com:443 HTTP/1.1\r\n\r\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CREDENTIALS');
  });

  it('rejects IP literal in CONNECT target', () => {
    const r = parseConnectRequest(Buffer.from('CONNECT 1.2.3.4:443 HTTP/1.1\r\n\r\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code === 'INVALID_HOST' || r.code === 'IP_LITERAL').toBe(true);
    }
  });

  it('rejects empty host (no colon)', () => {
    const r = parseConnectRequest(Buffer.from('CONNECT :443 HTTP/1.1\r\n\r\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code === 'EMPTY_HOST' || r.code === 'INVALID_HOST').toBe(true);
  });

  it('rejects bad port', () => {
    const r = parseConnectRequest(Buffer.from('CONNECT github.com:99999 HTTP/1.1\r\n\r\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BAD_PORT');
  });

  it('rejects oversize prefix', () => {
    const padded = 'CONNECT github.com:443 HTTP/1.1\r\n' + 'a'.repeat(9000) + '\r\n\r\n';
    const r = parseConnectRequest(Buffer.from(padded));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code === 'OVERSIZE').toBe(true);
    }
  });

  it('suffix bypass (evilgithub.com) does NOT match github.com', () => {
    const r = parseConnectRequest(Buffer.from('CONNECT evilgithub.com:443 HTTP/1.1\r\n\r\n'));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`Expected a parsed CONNECT request, got ${r.code}`);
    expect(r.host).toBe('evilgithub.com');
    expect(isAllowedHost(r.host, SETUP_LIST)).toBe(false);
    expect(isAllowedHost(r.host, AGENT_LIST)).toBe(false);
  });
});

describe('isAllowedHost', () => {
  it('exact match in phase allowlist returns true', () => {
    expect(isAllowedHost('github.com', SETUP_LIST)).toBe(true);
    expect(isAllowedHost('api.anthropic.com', AGENT_LIST)).toBe(true);
  });
  it('different host returns false', () => {
    expect(isAllowedHost('evil.com', SETUP_LIST)).toBe(false);
    expect(isAllowedHost('github.com', AGENT_LIST)).toBe(false);
  });
  it('null allowlist returns false (default-deny)', () => {
    expect(isAllowedHost('github.com', null)).toBe(false);
  });
  it('Set-backed allowlist also works', () => {
    const set = new Set([...SETUP_LIST]);
    expect(isAllowedHost('github.com', set)).toBe(true);
    expect(isAllowedHost('api.anthropic.com', set)).toBe(false);
  });
});
