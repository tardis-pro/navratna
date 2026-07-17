import { z } from 'zod';
import { CODING_NODE_PORT } from '@uaip/types';

const ENV_MODE = process.env['NODE_ENV'];
const IS_TEST = ENV_MODE === 'test';

const PUBLIC_PEM_PREFIX = '-----BEGIN PUBLIC KEY-----';
const PRIVATE_PEM_MARKERS = ['-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN EC PRIVATE KEY-----'];

/**
 * Permitted values for HOST.
 * `::` binds all IPv6 interfaces (dual-stack where OS supports it).
 * `fdaa:0:...` style addresses are Fly 6PN addresses; we allow any `fdaa:`-prefixed address.
 * `fly-local-6pn` is resolved by Fly's internal DNS to the machine's 6PN address.
 */
const ALLOWED_HOST_RE = /^(::|fly-local-6pn|fdaa:[0-9a-f:]+)$/i;

const ConfigSchema = z.object({
  codingNodeJwtPublicKeyPem: z.string().min(1)
    .refine(
      (v) => IS_TEST || v.includes(PUBLIC_PEM_PREFIX),
      'CODING_NODE_JWT_PUBLIC_KEY_PEM must be a PEM-encoded SPKI public key',
    )
    .refine(
      (v) => !PRIVATE_PEM_MARKERS.some((marker) => v.includes(marker)),
      'CODING_NODE_JWT_PUBLIC_KEY_PEM must not contain a private key',
    ),
  port: z.number().int().min(1).max(65535),
  /**
   * Hostname/IP to bind. Default `::` binds all IPv6 interfaces (loopback + 6PN).
   * Production must use `::` or a Fly 6PN address — never a public IPv4 address.
   * Only enforced in non-test environments.
   */
  host: z.string().min(1).refine(
    (v) => IS_TEST || ALLOWED_HOST_RE.test(v),
    'HOST must be "::", "fly-local-6pn", or a fdaa: Fly 6PN address — public IPv4 is not permitted',
  ),
  sessionDir: z.string().regex(/^\//, 'SESSION_DIR must be an absolute path'),
  replayBufferSize: z.number().int().positive(),
  nodeId: z.string().min(1).regex(/^[a-zA-Z0-9_-]{1,128}$/, 'NODE_ID must be a safe identifier'),
  workspaceRoot: z.string().regex(/^\//, 'WORKSPACE_ROOT must be an absolute path'),
  completedKeyTtlMs: z.number().int().positive(),
});

export type CodingNodeConfig = z.infer<typeof ConfigSchema>;

function parseHost(raw: string | undefined): string {
  return raw?.trim() || '::';
}

function parsePort(raw: string | undefined, def: number): number {
  if (!raw) return def;
  return parseInteger(raw, 'PORT');
}

function parseInt10(raw: string | undefined, def: number, name: string): number {
  if (!raw) return def;
  return parseInteger(raw, name);
}

function parseInteger(raw: string, name: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid ${name}: "${raw}" is not an integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid ${name}: "${raw}" is outside the safe integer range`);
  }
  return value;
}

export function loadConfig(): CodingNodeConfig {
  const raw = {
    codingNodeJwtPublicKeyPem: process.env['CODING_NODE_JWT_PUBLIC_KEY_PEM'] ?? '',
    port: parsePort(process.env['PORT'], CODING_NODE_PORT),
    host: parseHost(process.env['HOST']),
    sessionDir: process.env['SESSION_DIR'] ?? '/workspace/.navratna/sessions',
    replayBufferSize: parseInt10(process.env['REPLAY_BUFFER_SIZE'], 200, 'REPLAY_BUFFER_SIZE'),
    nodeId: process.env['NODE_ID'] ?? `coding-node-${process.pid}`,
    workspaceRoot: process.env['WORKSPACE_ROOT'] ?? '/workspace',
    completedKeyTtlMs: parseInt10(process.env['COMPLETED_KEY_TTL_MS'], 600_000, 'COMPLETED_KEY_TTL_MS'),
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Configuration error:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }

  return result.data;
}
