import * as net from 'node:net';
import { lookup } from 'node:dns/promises';
import { domainToASCII, domainToUnicode } from 'node:url';
import { classifyAddress } from './ip_classifier.js';

const REQUIRED_PORT = 443;
const DEFAULT_MAX_HEADER_BYTES = 8 * 1024;
const DEFAULT_HEADER_TIMEOUT_MS = 2_500;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export type PhaseHostList = ReadonlySet<string> | ReadonlyArray<string>;
export type ResolveHost = (host: string) => Promise<readonly string[]>;

export type ParseOutcome =
  | { ok: true; host: string; port: number; consumedBytes: number }
  | { ok: false; code: 'NOT_CONNECT' | 'OVERSIZE' | 'BAD_PORT' | 'EMPTY_HOST' | 'INVALID_HOST' | 'CREDENTIALS' | 'IP_LITERAL' | 'MALFORMED'; reason: string };

export interface ProxyConfig {
  requiredPort?: number;
  maxHeaderBytes?: number;
  headerTimeoutMs?: number;
  connectTimeoutMs?: number;
  allowedHostsProvider?: (() => PhaseHostList | null) | null;
  resolveHost?: ResolveHost;
}

export const DEFAULT_PROXY_CONFIG: Required<Omit<ProxyConfig, 'allowedHostsProvider' | 'resolveHost'>> = {
  requiredPort: REQUIRED_PORT,
  maxHeaderBytes: DEFAULT_MAX_HEADER_BYTES,
  headerTimeoutMs: DEFAULT_HEADER_TIMEOUT_MS,
  connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
};

function containsForbiddenAscii(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

function isAscii(value: string): boolean {
  for (const char of value) {
    if (char.charCodeAt(0) > 0x7f) return false;
  }
  return true;
}

export function normalizeHostname(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  if (raw.length === 0) return { ok: false, reason: 'empty hostname' };
  if (raw.includes('@')) return { ok: false, reason: 'userinfo is forbidden' };
  if (raw.includes('%') || containsForbiddenAscii(raw)) return { ok: false, reason: 'encoded, whitespace, or control bytes' };
  if (net.isIP(raw) !== 0 || raw.includes(':') || /^[0-9.]+$/.test(raw)) return { ok: false, reason: 'IP literals are forbidden' };

  let hostname = raw.toLowerCase();
  if (hostname.endsWith('.')) hostname = hostname.slice(0, -1);
  if (hostname.length === 0 || hostname.length > 253 || hostname.startsWith('.') || hostname.endsWith('.') || hostname.includes('..')) {
    return { ok: false, reason: 'invalid hostname boundaries' };
  }
  if (!isAscii(hostname)) return { ok: false, reason: 'Unicode hostname must be supplied as canonical punycode' };

  const labels = hostname.split('.');
  for (const label of labels) {
    if (label.length === 0 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
      return { ok: false, reason: 'invalid DNS label' };
    }
    if (label.startsWith('xn--')) {
      const unicode = domainToUnicode(label);
      const canonical = domainToASCII(unicode).toLowerCase();
      if (unicode === label || canonical !== label) return { ok: false, reason: 'malformed or ambiguous punycode label' };
    }
  }
  return { ok: true, value: hostname };
}

export function parseConnectRequest(buf: Buffer, maxHeaderBytes = DEFAULT_MAX_HEADER_BYTES): ParseOutcome {
  if (buf.length > maxHeaderBytes) return { ok: false, code: 'OVERSIZE', reason: 'headers exceed byte limit' };
  const headerEnd = buf.indexOf('\r\n\r\n');
  if (headerEnd < 0) return { ok: false, code: 'MALFORMED', reason: 'incomplete headers' };
  const consumedBytes = headerEnd + 4;
  if (consumedBytes > maxHeaderBytes) return { ok: false, code: 'OVERSIZE', reason: 'headers exceed byte limit' };

  const text = buf.subarray(0, headerEnd).toString('utf8');
  if (text.includes('\ufffd') || text.includes('\n') && !text.includes('\r\n')) {
    return { ok: false, code: 'MALFORMED', reason: 'invalid header encoding' };
  }
  const lines = text.split('\r\n');
  const requestLine = lines.shift() ?? '';
  const tokens = requestLine.split(' ');
  if (tokens[0] !== 'CONNECT') return { ok: false, code: 'NOT_CONNECT', reason: 'only CONNECT is supported' };
  if (tokens.length !== 3 || tokens[2] !== 'HTTP/1.1') return { ok: false, code: 'MALFORMED', reason: 'request line must be CONNECT authority HTTP/1.1' };

  const target = tokens[1] ?? '';
  if (target.includes('://') || target.includes('/') || target.includes('?') || target.includes('#')) {
    return { ok: false, code: 'NOT_CONNECT', reason: 'absolute-form and path targets are forbidden' };
  }
  if (target.includes('@')) return { ok: false, code: 'CREDENTIALS', reason: 'userinfo is forbidden' };
  const separator = target.lastIndexOf(':');
  if (separator <= 0) return { ok: false, code: 'EMPTY_HOST', reason: 'authority must contain hostname and port' };
  const rawHost = target.slice(0, separator);
  const portText = target.slice(separator + 1);
  if (!/^\d{1,5}$/.test(portText)) return { ok: false, code: 'BAD_PORT', reason: 'port must be decimal' };
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return { ok: false, code: 'BAD_PORT', reason: 'port outside valid range' };

  const normalized = normalizeHostname(rawHost);
  if (!normalized.ok) {
    const code = net.isIP(rawHost) !== 0 || rawHost.includes(':') || /^[0-9.]+$/.test(rawHost) ? 'IP_LITERAL' : 'INVALID_HOST';
    return { ok: false, code, reason: normalized.reason };
  }

  let hostHeader: string | undefined;
  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) return { ok: false, code: 'MALFORMED', reason: 'obsolete header folding is forbidden' };
    const colon = line.indexOf(':');
    if (colon <= 0) return { ok: false, code: 'MALFORMED', reason: 'malformed header line' };
    const name = line.slice(0, colon);
    const value = line.slice(colon + 1).trim();
    if (!HEADER_NAME.test(name)) return { ok: false, code: 'MALFORMED', reason: 'invalid header name' };
    const lowerName = name.toLowerCase();
    if (lowerName === 'transfer-encoding' || lowerName === 'content-length') {
      return { ok: false, code: 'MALFORMED', reason: 'CONNECT request body framing is forbidden' };
    }
    if (lowerName === 'host') {
      if (hostHeader !== undefined) return { ok: false, code: 'MALFORMED', reason: 'duplicate Host header' };
      hostHeader = value;
    }
  }

  if (hostHeader !== undefined) {
    const hostWithoutPort = hostHeader.endsWith(`:${port}`) ? hostHeader.slice(0, -(String(port).length + 1)) : hostHeader;
    const normalizedHeader = normalizeHostname(hostWithoutPort);
    if (!normalizedHeader.ok || normalizedHeader.value !== normalized.value) {
      return { ok: false, code: 'MALFORMED', reason: 'Host header does not match CONNECT authority' };
    }
  }

  return { ok: true, host: normalized.value, port, consumedBytes };
}

async function defaultResolveHost(host: string): Promise<readonly string[]> {
  const records = await lookup(host, { all: true, verbatim: true });
  return [...new Set(records.filter((record) => record.family === 4 || record.family === 6).map((record) => record.address))];
}

export async function resolveAndClassify(host: string, resolver: ResolveHost = defaultResolveHost): Promise<{ ok: true; addresses: readonly string[] } | { ok: false; reason: string }> {
  let addresses: readonly string[];
  try {
    addresses = await resolver(host);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  if (addresses.length === 0) return { ok: false, reason: 'hostname has no addresses' };
  for (const address of addresses) {
    const classification = classifyAddress(address);
    if (classification.kind === 'blocked') return { ok: false, reason: `blocked address class ${classification.cidr}` };
  }
  return { ok: true, addresses };
}

export function isAllowedHost(host: string, allowlist: PhaseHostList | null): boolean {
  if (allowlist === null) return false;
  for (const entry of allowlist) {
    if (entry === host) return true;
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(2);
      if (suffix.length > 0 && host.endsWith(`.${suffix}`)) return true;
    }
  }
  return false;
}

export class ConnectProxy {
  private readonly config: Required<Omit<ProxyConfig, 'allowedHostsProvider' | 'resolveHost'>> & {
    allowedHostsProvider: (() => PhaseHostList | null) | null;
    resolveHost: ResolveHost;
  };

  constructor(config: ProxyConfig = {}) {
    this.config = {
      requiredPort: config.requiredPort ?? DEFAULT_PROXY_CONFIG.requiredPort,
      maxHeaderBytes: config.maxHeaderBytes ?? DEFAULT_PROXY_CONFIG.maxHeaderBytes,
      headerTimeoutMs: config.headerTimeoutMs ?? DEFAULT_PROXY_CONFIG.headerTimeoutMs,
      connectTimeoutMs: config.connectTimeoutMs ?? DEFAULT_PROXY_CONFIG.connectTimeoutMs,
      allowedHostsProvider: config.allowedHostsProvider ?? null,
      resolveHost: config.resolveHost ?? defaultResolveHost,
    };
  }

  currentAllowedHosts(): PhaseHostList | null {
    return this.config.allowedHostsProvider?.() ?? null;
  }

  static sendReply(socket: net.Socket, status: number, reason: string): void {
    const body = reason;
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  listen(port: number, host = '127.0.0.1'): Promise<net.Server> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => { void this.handle(socket); });
      server.once('error', reject);
      server.listen(port, host, () => {
        server.removeListener('error', reject);
        resolve(server);
      });
    });
  }

  async handle(client: net.Socket): Promise<void> {
    const received = await this.readHeaders(client);
    if (!received.ok) {
      ConnectProxy.sendReply(client, received.status, received.reason);
      return;
    }
    const parsed = parseConnectRequest(received.buffer, this.config.maxHeaderBytes);
    if (!parsed.ok) {
      ConnectProxy.sendReply(client, parsed.code === 'OVERSIZE' ? 413 : 400, `bad-request:${parsed.code.toLowerCase()}`);
      return;
    }
    if (parsed.port !== this.config.requiredPort) {
      ConnectProxy.sendReply(client, 400, 'bad-request:port-not-443');
      return;
    }
    if (!isAllowedHost(parsed.host, this.currentAllowedHosts())) {
      ConnectProxy.sendReply(client, 403, 'forbidden:host-not-allowed');
      return;
    }

    const resolution = await resolveAndClassify(parsed.host, this.config.resolveHost);
    if (!resolution.ok) {
      ConnectProxy.sendReply(client, 403, 'forbidden:destination-address');
      return;
    }
    const destination = resolution.addresses[0];
    if (!destination) {
      ConnectProxy.sendReply(client, 502, 'bad-gateway:no-address');
      return;
    }

    const upstream = net.createConnection({ host: destination, port: parsed.port, family: net.isIP(destination) });
    const connectTimer = setTimeout(() => upstream.destroy(new Error('connect timeout')), this.config.connectTimeoutMs);
    upstream.once('error', () => {
      clearTimeout(connectTimer);
      if (!client.destroyed) ConnectProxy.sendReply(client, 502, 'bad-gateway:dial-failed');
    });
    upstream.once('connect', () => {
      clearTimeout(connectTimer);
      client.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: uaip-coding-proxy\r\n\r\n');
      const remainder = received.buffer.subarray(parsed.consumedBytes);
      if (remainder.length > 0) upstream.write(remainder);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    client.once('error', () => upstream.destroy());
    client.once('close', () => upstream.destroy());
    upstream.once('close', () => client.destroy());
  }

  private readHeaders(client: net.Socket): Promise<{ ok: true; buffer: Buffer } | { ok: false; status: number; reason: string }> {
    return new Promise((resolve) => {
      let buffer = Buffer.alloc(0);
      let settled = false;
      const finish = (result: { ok: true; buffer: Buffer } | { ok: false; status: number; reason: string }): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.removeListener('data', onData);
        client.removeListener('error', onError);
        client.pause();
        resolve(result);
      };
      const onData = (chunk: Buffer): void => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length > this.config.maxHeaderBytes) {
          finish({ ok: false, status: 413, reason: 'headers-too-large' });
          return;
        }
        if (buffer.indexOf('\r\n\r\n') >= 0) finish({ ok: true, buffer });
      };
      const onError = (): void => finish({ ok: false, status: 400, reason: 'socket-read-error' });
      const timer = setTimeout(() => finish({ ok: false, status: 408, reason: 'header-timeout' }), this.config.headerTimeoutMs);
      client.on('data', onData);
      client.once('error', onError);
      client.resume();
    });
  }
}
