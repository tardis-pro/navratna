import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../config.js';

const VALID_PUBLIC_PEM = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1\n-----END PUBLIC KEY-----';

function withEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { fn(); }
  finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('loadConfig', () => {
  it('loads valid config from env', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      PORT: '4000',
      SESSION_DIR: '/sessions',
      REPLAY_BUFFER_SIZE: '100',
      NODE_ID: 'node-abc',
      WORKSPACE_ROOT: '/workspace',
      COMPLETED_KEY_TTL_MS: '300000',
    }, () => {
      const config = loadConfig();
      expect(config.port).toBe(4000);
      expect(config.replayBufferSize).toBe(100);
      expect(config.workspaceRoot).toBe('/workspace');
      expect(config.completedKeyTtlMs).toBe(300000);
      expect(config.codingNodeJwtPublicKeyPem).toContain('BEGIN PUBLIC KEY');
    });
  });

  it('accepts any non-empty public PEM string in test environment (NODE_ENV=test)', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: 'test-key',
      PORT: '3009',
      SESSION_DIR: '/sessions',
      REPLAY_BUFFER_SIZE: '200',
      NODE_ID: 'node-test',
      WORKSPACE_ROOT: '/workspace',
      COMPLETED_KEY_TTL_MS: '600000',
    }, () => {
      expect(() => loadConfig()).not.toThrow();
    });
  });

  it('rejects empty CODING_NODE_JWT_PUBLIC_KEY_PEM', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: '',
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
    }, () => {
      expect(() => loadConfig()).toThrow();
    });
  });

  it('rejects relative SESSION_DIR', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      SESSION_DIR: 'relative/path',
      WORKSPACE_ROOT: '/workspace',
    }, () => {
      expect(() => loadConfig()).toThrow('absolute path');
    });
  });

  it('rejects relative WORKSPACE_ROOT', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: 'relative/workspace',
    }, () => {
      expect(() => loadConfig()).toThrow('absolute path');
    });
  });

  it('rejects port 0', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
      PORT: '0',
    }, () => {
      expect(() => loadConfig()).toThrow();
    });
  });

  it('rejects port > 65535', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
      PORT: '99999',
    }, () => {
      expect(() => loadConfig()).toThrow();
    });
  });

  it('rejects non-numeric port (NaN guard)', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
      PORT: 'notanumber',
    }, () => {
      expect(() => loadConfig()).toThrow();
    });
  });

  it('rejects partially numeric integer values', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
      PORT: '3009junk',
    }, () => {
      expect(() => loadConfig()).toThrow();
    });
  });

  it('defaults SESSION_DIR to /workspace/.navratna/sessions', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      SESSION_DIR: undefined,
      WORKSPACE_ROOT: '/workspace',
    }, () => {
      const config = loadConfig();
      expect(config.sessionDir).toBe('/workspace/.navratna/sessions');
    });
  });

  it('does not accept CODING_NODE_TOKEN in any form', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
    }, () => {
      const config = loadConfig();
      expect(config).not.toHaveProperty('codingNodeToken');
    });
  });

  it('defaults HOST to :: (all IPv6 interfaces)', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
      HOST: undefined,
    }, () => {
      const config = loadConfig();
      expect(config.host).toBe('::');
    });
  });

  it('accepts HOST=:: explicitly', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
      HOST: '::',
    }, () => {
      expect(() => loadConfig()).not.toThrow();
      expect(loadConfig().host).toBe('::');
    });
  });

  it('accepts HOST=fly-local-6pn', () => {
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: VALID_PUBLIC_PEM,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
      HOST: 'fly-local-6pn',
    }, () => {
      expect(() => loadConfig()).not.toThrow();
    });
  });

  it('rejects private key PEM in CODING_NODE_JWT_PUBLIC_KEY_PEM', () => {
    const privatePem = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSj\n-----END PRIVATE KEY-----';
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: privatePem,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
      NODE_ENV: 'production',
    }, () => {
      expect(() => loadConfig()).toThrow('must not contain a private key');
    });
  });

  it('rejects RSA private key PEM in CODING_NODE_JWT_PUBLIC_KEY_PEM', () => {
    const rsaPem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1\n-----END RSA PRIVATE KEY-----';
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: rsaPem,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
      NODE_ENV: 'production',
    }, () => {
      expect(() => loadConfig()).toThrow('must not contain a private key');
    });
  });

  it('rejects EC private key PEM in CODING_NODE_JWT_PUBLIC_KEY_PEM', () => {
    const ecPem = '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIBkg\n-----END EC PRIVATE KEY-----';
    withEnv({
      CODING_NODE_JWT_PUBLIC_KEY_PEM: ecPem,
      SESSION_DIR: '/sessions',
      WORKSPACE_ROOT: '/workspace',
      NODE_ENV: 'production',
    }, () => {
      expect(() => loadConfig()).toThrow('must not contain a private key');
    });
  });
});
