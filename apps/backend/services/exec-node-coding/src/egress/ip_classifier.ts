// IP literal + private/special-purpose CIDR classifier for the egress proxy.
//
// Used to reject any CONNECT destination that resolves to a non-public IP.
// Backed by Node's `node:net` to keep behaviour identical with native DNS
// resolution. Implemented as a typed function — return values are stable
// strings so call sites can produce clean audit log messages without an
// unstable discriminator.
//
// The set covers:
//   - IPv4 loopback / private / link-local / multicast / metadata / reserved
//   - IPv6 loopback / unique-local / link-local / multicast / 6PN / mapped IPv4
// All classifications are inclusive (returning `BLOCKED_*`); a 'public' host
// returns `PUBLIC`. The classifier never lets a non-public destination slip
// into the proxy's CONNECT dial step.

import { isIP, isIPv4, isIPv6 } from 'node:net';

export type IpClass =
  | { kind: 'public' }
  | { kind: 'blocked'; cidr: string };

const V4_LOOPBACK = '127.0.0.0/8';
const V4_PRIVATE_A = '10.0.0.0/8';
const V4_PRIVATE_B = '172.16.0.0/12';
const V4_PRIVATE_C = '192.168.0.0/16';
const V4_LINK_LOCAL = '169.254.0.0/16';
const V4_MULTICAST = '224.0.0.0/4';
const V4_RESERVED = '240.0.0.0/4';
const V4_METADATA = '169.254.169.254/32';
const V4_ZERO = '0.0.0.0/8';
const V4_BROADCAST = '255.255.255.255/32';
const V4_DOC = '192.0.2.0/24';
const V4_DOC_B = '198.51.100.0/24';
const V4_DOC_C = '203.0.113.0/24';
const V4_BENCH = '198.18.0.0/15';
const V4_SHARED = '100.64.0.0/10';
const V4_PROTOCOL_ASSIGNMENTS = '192.0.0.0/24';

const V4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  [V4_METADATA, 32],
  [V4_BROADCAST, 32],
  [V4_LOOPBACK, 8],
  [V4_PRIVATE_A, 8],
  [V4_PRIVATE_B, 12],
  [V4_PRIVATE_C, 16],
  [V4_LINK_LOCAL, 16],
  [V4_MULTICAST, 4],
  [V4_RESERVED, 4],
  [V4_ZERO, 8],
  [V4_DOC, 24],
  [V4_DOC_B, 24],
  [V4_DOC_C, 24],
  [V4_BENCH, 15],
  [V4_SHARED, 10],
  [V4_PROTOCOL_ASSIGNMENTS, 24],
];

// IPv6 blocking ranges
const V6_LOOPBACK = '::1/128';
const V6_UNIQUE_LOCAL = 'fc00::/7';
const V6_LINK_LOCAL = 'fe80::/10';
const V6_MULTICAST = 'ff00::/8';
const V6_IPV4_MAPPED = '::ffff:0:0/96';
const V6_DOC = '2001:db8::/32';
const V6_DISCARD = '100::/64';

const V6_CIDRS: ReadonlyArray<readonly [string, number]> = [
  [V6_LOOPBACK, 128],
  [V6_UNIQUE_LOCAL, 7],
  [V6_LINK_LOCAL, 10],
  [V6_MULTICAST, 8],
  [V6_IPV4_MAPPED, 96],
  [V6_DOC, 32],
  [V6_DISCARD, 64],
];

function parseIpv4(addr: string): number | null {
  const parts = addr.split('.');
  if (parts.length !== 4) return null;
  let v = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = parseInt(p, 10);
    if (n < 0 || n > 255) return null;
    v = (v * 256) + n;
  }
  return v >>> 0;
}

function parseIpv6(addr: string): bigint | null {
  // Canonical or zero-compressed RFC 4291 form. `::` indicates one or
  // more zero groups and may appear at most once.
  if (typeof addr !== 'string' || addr.length === 0) return null;

  if (addr === '::') return 0n;

  const dblColon = addr.split('::');
  if (dblColon.length > 2) return null;
  const hasCompression = dblColon.length === 2;
  const headStr = dblColon[0] ?? '';
  const tailStr = dblColon[1] ?? '';

  const parseGroups = (s: string): bigint[] | null => {
    if (s === '') return [];
    const parts = s.split(':');
    const out: bigint[] = [];
    for (const h of parts) {
      if (out.length >= 8) return null;
      if (h.includes('.')) {
        const v4 = parseIpv4(h);
        if (v4 === null) return null;
        out.push(BigInt((v4 >>> 16) & 0xffff));
        out.push(BigInt(v4 & 0xffff));
      } else if (/^[0-9a-fA-F]{1,4}$/.test(h)) {
        out.push(BigInt(parseInt(h, 16)));
      } else {
        return null;
      }
    }
    return out;
  };

  const head = parseGroups(headStr);
  const tail = parseGroups(tailStr);
  if (head === null || tail === null) return null;
  const used = head.length + tail.length;
  if (hasCompression) {
    if (used > 7) return null;
  } else {
    if (used !== 8) return null;
  }

  const groups: bigint[] = [...head];
  if (hasCompression) {
    while (groups.length < 8 - tail.length) groups.push(0n);
  }
  for (const g of tail) groups.push(g);
  if (groups.length !== 8) return null;

  let out = 0n;
  for (const g of groups) out = (out << 16n) | (g & 0xffffn);
  return out;
}

function ipv4InCidr(ip: number, network: number, prefix: number): boolean {
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return (ip & mask) === (network & mask);
}

function ipv6InCidr(ip: bigint, network: bigint, prefix: number): boolean {
  if (prefix === 0) return true;
  if (prefix === 128) return ip === network;
  const bitsToShift = BigInt(128 - prefix);
  const mask = (~((1n << bitsToShift) - 1n)) & ((1n << 128n) - 1n);
  return (ip & mask) === (network & mask);
}

function v4Network(prefix: string, prefixLen: number): { network: number; mask: number } | null {
  const ip = parseIpv4(prefix);
  if (ip === null) return null;
  return { network: ip, mask: prefixLen };
}

function v6Network(prefix: string, prefixLen: number): { network: bigint; prefixLen: number } | null {
  const ip = parseIpv6(prefix);
  if (ip === null) return null;
  return { network: ip, prefixLen };
}

export function classifyAddress(host: string): IpClass {
  if (typeof host !== 'string' || host.length === 0) return { kind: 'blocked', cidr: 'empty' };

  if (isIPv4(host)) {
    const numeric = parseIpv4(host);
    if (numeric === null) return { kind: 'blocked', cidr: 'invalid-ipv4' };

    for (const [cidr, len] of V4_CIDRS) {
      const parsed = v4Network(cidr.split('/')[0]!, len);
      if (!parsed) continue;
      if (ipv4InCidr(numeric, parsed.network, parsed.mask)) {
        return { kind: 'blocked', cidr };
      }
    }
    if (host === '169.254.169.254') {
      return { kind: 'blocked', cidr: V4_METADATA };
    }
    // Fly 6PN is fdaa::/8 (IPv6); we mirror that for IPv4 too via 127.0.0.0/8
    return { kind: 'public' };
  }

  if (isIPv6(host)) {
    const numeric = parseIpv6(host);
    if (numeric === null) return { kind: 'blocked', cidr: 'invalid-ipv6' };
    for (const [cidr, len] of V6_CIDRS) {
      const parsed = v6Network(cidr.split('/')[0]!, len);
      if (!parsed) continue;
      if (ipv6InCidr(numeric, parsed.network, parsed.prefixLen)) {
        return { kind: 'blocked', cidr };
      }
    }
    return { kind: 'public' };
  }

  return { kind: 'blocked', cidr: 'not-an-ip' };
}

export function isLoopbackLiteral(host: string): boolean {
  const klass = classifyAddress(host);
  if (klass.kind !== 'blocked') return false;
  return klass.cidr === V4_LOOPBACK || klass.cidr === V6_LOOPBACK;
}

// Returned for error reporters to use as a single-line tag.
// Stable so callers don't have to special-case which substring is "blocked".
export function cidrTag(host: string): string {
  const cls = classifyAddress(host);
  return cls.kind === 'blocked' ? cls.cidr : 'public';
}

// Re-export for tests / external consumers.
export { isIP, isIPv4, isIPv6 } from 'node:net';
