import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  randomBytes,
} from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import type { GitHubCredential } from '@uaip/types';

/* oxlint-disable no-await-in-loop -- lease polling must observe each prior Redis result before sleeping again. */

const GITHUB_API_VERSION = '2026-03-10';
const APP_JWT_ALG = 'RS256';
const APP_JWT_LIFETIME_S = 540;
const APP_JWT_CLOCK_SKEW_S = 60;
const IAT_SAFETY_WINDOW_S = 120;
const LEASE_TTL_MS = 30_000;
const LEASE_POLL_MS = 250;
const LEASE_MAX_POLLS = 140;
const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

const PositiveDecimalSchema = z.string().regex(/^[1-9]\d*$/);
const RepositoryFullNameSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/);
const IatResponseSchema = z.object({
  token: z.string().min(1),
  expires_at: z.string().datetime({ offset: true }),
});
const CachedEntrySchema = z.object({
  encryptedToken: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
});
const InstallationResponseSchema = z.object({
  account: z.object({ login: z.string().min(1).max(255) }),
});
const RepositoryResponseSchema = z.object({
  id: z.number().int().positive(),
  full_name: RepositoryFullNameSchema,
});

export type BrokerError =
  | { code: 'INVALID_BINDING'; message: string }
  | { code: 'UNSAFE_REPO_ID'; message: string }
  | { code: 'GITHUB_API_ERROR'; status: number; message: string }
  | { code: 'GITHUB_RESPONSE_INVALID'; message: string }
  | { code: 'REDIS_ERROR'; message: string }
  | { code: 'CRYPTO_ERROR'; message: string }
  | { code: 'LEASE_TIMEOUT'; message: string };

export type BrokerResult<T> = { ok: true; value: T } | { ok: false; error: BrokerError };

export type BrokerRedisClient = {
  get(key: string): Promise<string | null>;
  setEx(key: string, value: string, seconds: number): Promise<string | null>;
  setNxPx(key: string, value: string, milliseconds: number): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  eval(script: string, numkeys: number, ...args: string[]): Promise<unknown>;
};

export type InstallationBinding = {
  installationId: string;
  repositoryId: string;
  repositoryFullName: string;
  userId: string;
  tenantId: string;
  projectId: string;
};

export type BrokerDeps = {
  redis: BrokerRedisClient;
  appId: string;
  privateKeyPem: string;
  encryptionKeyHex: string;
  fetch?: typeof globalThis.fetch;
  nowSeconds?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type VerifiedInstallationBinding = {
  accountLogin: string;
};

const DELETE_LEASE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseEncryptionKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('GITHUB_IAT_ENCRYPTION_KEY must be exactly 64 hexadecimal characters');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== AES_KEY_BYTES) throw new Error('Invalid GitHub IAT encryption key length');
  return key;
}

function normalizePrivateKey(privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem.trim());
  const exported = key.export({ type: 'pkcs8', format: 'pem' });
  return typeof exported === 'string' ? exported : exported.toString('utf8');
}

function encryptToken(token: string, key: Buffer, aad: string): string {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function decryptToken(encoded: string, key: Buffer, aad: string): string {
  const payload = Buffer.from(encoded, 'base64url');
  if (payload.length <= GCM_IV_BYTES + GCM_TAG_BYTES) throw new Error('Encrypted token payload is truncated');
  const iv = payload.subarray(0, GCM_IV_BYTES);
  const tag = payload.subarray(GCM_IV_BYTES, GCM_IV_BYTES + GCM_TAG_BYTES);
  const encrypted = payload.subarray(GCM_IV_BYTES + GCM_TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class GitHubAppTokenBroker {
  private readonly encryptionKey: Buffer;
  private readonly privateKeyPem: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly nowSeconds: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private signingKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;

  constructor(private readonly deps: BrokerDeps) {
    if (!PositiveDecimalSchema.safeParse(deps.appId).success) throw new Error('GITHUB_APP_ID must be a positive decimal string');
    this.encryptionKey = parseEncryptionKey(deps.encryptionKeyHex);
    this.privateKeyPem = normalizePrivateKey(deps.privateKeyPem);
    this.fetchFn = deps.fetch ?? globalThis.fetch.bind(globalThis);
    this.nowSeconds = deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
    this.sleep = deps.sleep ?? defaultSleep;
  }

  async mintInstallationToken(binding: InstallationBinding): Promise<BrokerResult<GitHubCredential>> {
    const validated = this.validateBinding(binding);
    if (!validated.ok) return validated;
    const repositoryNumber = Number(binding.repositoryId);
    if (!Number.isSafeInteger(repositoryNumber)) {
      return { ok: false, error: { code: 'UNSAFE_REPO_ID', message: 'GitHub repository ID exceeds the REST safe-integer range' } };
    }

    const cacheKey = this.cacheKey(binding);
    const leaseKey = this.leaseKey(binding);
    const cached = await this.readCache(cacheKey, binding);
    if (!cached.ok) return cached;
    if (cached.value) return { ok: true, value: cached.value };

    const leaseOwner = randomBytes(16).toString('hex');
    const lease = await this.acquireLease(leaseKey, leaseOwner);
    if (!lease.ok) return lease;
    if (!lease.value) return this.waitForWinner(cacheKey, binding);

    try {
      const secondRead = await this.readCache(cacheKey, binding);
      if (!secondRead.ok) return secondRead;
      if (secondRead.value) return { ok: true, value: secondRead.value };
      return await this.mintAndCache(binding, repositoryNumber, cacheKey);
    } finally {
      await this.releaseLease(leaseKey, leaseOwner);
    }
  }

  async verifyInstallationBinding(binding: InstallationBinding): Promise<BrokerResult<VerifiedInstallationBinding>> {
    const validated = this.validateBinding(binding);
    if (!validated.ok) return validated;
    let appJwt: string;
    try {
      appJwt = await this.mintAppJwt();
    } catch (error) {
      return { ok: false, error: { code: 'CRYPTO_ERROR', message: errorMessage(error) } };
    }

    const installation = await this.fetchJson(
      `https://api.github.com/app/installations/${binding.installationId}`,
      appJwt,
      InstallationResponseSchema,
    );
    if (!installation.ok) return installation;

    const credential = await this.mintInstallationToken(binding);
    if (!credential.ok) return credential;
    const repository = await this.fetchJson(
      `https://api.github.com/repositories/${binding.repositoryId}`,
      credential.value.token,
      RepositoryResponseSchema,
    );
    if (!repository.ok) return repository;
    if (String(repository.value.id) !== binding.repositoryId || repository.value.full_name !== binding.repositoryFullName) {
      return { ok: false, error: { code: 'INVALID_BINDING', message: 'GitHub repository identity does not match the requested binding' } };
    }
    return { ok: true, value: { accountLogin: installation.value.account.login } };
  }

  async revokeCachedInstallationToken(binding: Pick<InstallationBinding, 'installationId' | 'repositoryId' | 'repositoryFullName'>): Promise<void> {
    const fullBinding: InstallationBinding = {
      ...binding,
      userId: 'revocation',
      tenantId: 'revocation',
      projectId: 'revocation',
    };
    const cacheKey = this.cacheKey(fullBinding);
    const cached = await this.readCache(cacheKey, fullBinding);
    await this.deps.redis.del(cacheKey);
    if (!cached.ok || !cached.value) return;
    try {
      await this.fetchFn('https://api.github.com/installation/token', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${cached.value.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
      });
    } catch (error) {
      logger.debug('github-app-broker: cached IAT revocation failed', { error: errorMessage(error) });
    }
  }

  private validateBinding(binding: InstallationBinding): BrokerResult<null> {
    if (!PositiveDecimalSchema.safeParse(binding.installationId).success) {
      return { ok: false, error: { code: 'INVALID_BINDING', message: 'Installation ID is invalid' } };
    }
    if (!PositiveDecimalSchema.safeParse(binding.repositoryId).success) {
      return { ok: false, error: { code: 'UNSAFE_REPO_ID', message: 'Repository ID is invalid' } };
    }
    if (!RepositoryFullNameSchema.safeParse(binding.repositoryFullName).success) {
      return { ok: false, error: { code: 'INVALID_BINDING', message: 'Repository full name is invalid' } };
    }
    return { ok: true, value: null };
  }

  private cacheKey(binding: Pick<InstallationBinding, 'installationId' | 'repositoryId'>): string {
    return `gh_iat:${binding.installationId}:${binding.repositoryId}`;
  }

  private leaseKey(binding: Pick<InstallationBinding, 'installationId' | 'repositoryId'>): string {
    return `gh_iat_lease:${binding.installationId}:${binding.repositoryId}`;
  }

  private aad(binding: Pick<InstallationBinding, 'installationId' | 'repositoryId'>): string {
    return `gh_iat:${this.deps.appId}:${binding.installationId}:${binding.repositoryId}`;
  }

  private async signingKeyValue(): Promise<Awaited<ReturnType<typeof importPKCS8>>> {
    if (!this.signingKey) this.signingKey = await importPKCS8(this.privateKeyPem, APP_JWT_ALG);
    return this.signingKey;
  }

  private async mintAppJwt(): Promise<string> {
    const now = this.nowSeconds();
    return new SignJWT({})
      .setProtectedHeader({ alg: APP_JWT_ALG })
      .setIssuer(this.deps.appId)
      .setIssuedAt(now - APP_JWT_CLOCK_SKEW_S)
      .setExpirationTime(now - APP_JWT_CLOCK_SKEW_S + APP_JWT_LIFETIME_S)
      .sign(await this.signingKeyValue());
  }

  private async readCache(cacheKey: string, binding: Pick<InstallationBinding, 'installationId' | 'repositoryId' | 'repositoryFullName'>): Promise<BrokerResult<GitHubCredential | null>> {
    let raw: string | null;
    try {
      raw = await this.deps.redis.get(cacheKey);
    } catch (error) {
      return { ok: false, error: { code: 'REDIS_ERROR', message: errorMessage(error) } };
    }
    if (!raw) return { ok: true, value: null };
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch (error) {
      return { ok: false, error: { code: 'CRYPTO_ERROR', message: `Cached GitHub credential JSON is invalid: ${errorMessage(error)}` } };
    }
    const parsed = CachedEntrySchema.safeParse(decoded);
    if (!parsed.success) return { ok: false, error: { code: 'CRYPTO_ERROR', message: 'Cached GitHub credential is invalid' } };
    try {
      const remaining = Math.floor(new Date(parsed.data.expiresAt).getTime() / 1000) - this.nowSeconds();
      if (remaining <= IAT_SAFETY_WINDOW_S) return { ok: true, value: null };
      return {
        ok: true,
        value: {
          token: decryptToken(parsed.data.encryptedToken, this.encryptionKey, this.aad(binding)),
          expiresAt: parsed.data.expiresAt,
          repositoryFullName: binding.repositoryFullName,
          cloneUrl: `https://github.com/${binding.repositoryFullName}.git`,
        },
      };
    } catch (error) {
      return { ok: false, error: { code: 'CRYPTO_ERROR', message: errorMessage(error) } };
    }
  }

  private async acquireLease(leaseKey: string, owner: string): Promise<BrokerResult<boolean>> {
    try {
      const result = await this.deps.redis.setNxPx(leaseKey, owner, LEASE_TTL_MS);
      return { ok: true, value: result === 'OK' };
    } catch (error) {
      return { ok: false, error: { code: 'REDIS_ERROR', message: errorMessage(error) } };
    }
  }

  private async releaseLease(leaseKey: string, owner: string): Promise<void> {
    try {
      await this.deps.redis.eval(DELETE_LEASE_LUA, 1, leaseKey, owner);
    } catch (error) {
      logger.warn('github-app-broker: lease release failed', { error: errorMessage(error) });
    }
  }

  private async waitForWinner(cacheKey: string, binding: InstallationBinding): Promise<BrokerResult<GitHubCredential>> {
    for (let poll = 0; poll < LEASE_MAX_POLLS; poll += 1) {
      await this.sleep(LEASE_POLL_MS);
      const cached = await this.readCache(cacheKey, binding);
      if (!cached.ok) return cached;
      if (cached.value) return { ok: true, value: cached.value };
    }
    return { ok: false, error: { code: 'LEASE_TIMEOUT', message: 'Timed out waiting for GitHub credential mint lease' } };
  }

  private async mintAndCache(binding: InstallationBinding, repositoryNumber: number, cacheKey: string): Promise<BrokerResult<GitHubCredential>> {
    let appJwt: string;
    try {
      appJwt = await this.mintAppJwt();
    } catch (error) {
      return { ok: false, error: { code: 'CRYPTO_ERROR', message: errorMessage(error) } };
    }

    let response: Response;
    try {
      response = await this.fetchFn(`https://api.github.com/app/installations/${binding.installationId}/access_tokens`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${appJwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repository_ids: [repositoryNumber],
          permissions: { contents: 'write', pull_requests: 'write', metadata: 'read', checks: 'read' },
        }),
      });
    } catch (error) {
      return { ok: false, error: { code: 'GITHUB_API_ERROR', status: 0, message: errorMessage(error) } };
    }
    if (!response.ok) {
      return { ok: false, error: { code: 'GITHUB_API_ERROR', status: response.status, message: `GitHub IAT mint failed with status ${response.status}` } };
    }

    const parsed = IatResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false, error: { code: 'GITHUB_RESPONSE_INVALID', message: 'GitHub IAT response schema is invalid' } };
    }
    const remainingSeconds = Math.floor(new Date(parsed.data.expires_at).getTime() / 1000) - this.nowSeconds();
    if (remainingSeconds <= IAT_SAFETY_WINDOW_S) {
      return { ok: false, error: { code: 'GITHUB_RESPONSE_INVALID', message: 'GitHub IAT is already expired or too close to expiry' } };
    }

    const cacheValue = JSON.stringify({
      encryptedToken: encryptToken(parsed.data.token, this.encryptionKey, this.aad(binding)),
      expiresAt: parsed.data.expires_at,
    });
    try {
      const result = await this.deps.redis.setEx(cacheKey, cacheValue, remainingSeconds - IAT_SAFETY_WINDOW_S);
      if (result !== 'OK') return { ok: false, error: { code: 'REDIS_ERROR', message: 'Redis rejected GitHub credential cache write' } };
    } catch (error) {
      return { ok: false, error: { code: 'REDIS_ERROR', message: errorMessage(error) } };
    }

    return {
      ok: true,
      value: {
        token: parsed.data.token,
        expiresAt: parsed.data.expires_at,
        repositoryFullName: binding.repositoryFullName,
        cloneUrl: `https://github.com/${binding.repositoryFullName}.git`,
      },
    };
  }

  private async fetchJson<T>(
    url: string,
    bearer: string,
    schema: z.ZodType<T>,
  ): Promise<BrokerResult<T>> {
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: {
          Authorization: `Bearer ${bearer}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
      });
    } catch (error) {
      return { ok: false, error: { code: 'GITHUB_API_ERROR', status: 0, message: errorMessage(error) } };
    }
    if (!response.ok) {
      return { ok: false, error: { code: 'GITHUB_API_ERROR', status: response.status, message: `GitHub verification failed with status ${response.status}` } };
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false, error: { code: 'GITHUB_RESPONSE_INVALID', message: 'GitHub verification response schema is invalid' } };
    }
    return { ok: true, value: parsed.data };
  }
}
