import { Pool } from 'pg';
import type { AnyElysia } from 'elysia';
import { createApp } from '../../app.js';
import {
  UserEntity,
  Agent as AgentEntity,
  SecurityPolicy as SecurityPolicyEntity,
  OAuthProviderEntity,
  AuditEvent as AuditLogEntity,
} from '@uaip/shared-services';

/**
 * Create a test pg Pool for integration tests
 */
export async function createTestDataSource(): Promise<Pool> {
  const pool = new Pool({
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    user: process.env.TEST_DB_USERNAME || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
    database: process.env.TEST_DB_NAME || 'council_test',
  });

  // Verify connection
  const client = await pool.connect();
  client.release();
  return pool;
}

/**
 * Create a test app
 */
export async function createTestApp(_pool?: Pool): Promise<AnyElysia> {
  process.env.NODE_ENV = 'test';

  const app = await createApp({
    redis: createMockRedis(),
  });

  return app;
}

/**
 * Clean up test database using raw SQL truncate
 */
export async function cleanupTestDb(pool: Pool): Promise<void> {
  const tables = [
    'audit_events',
    'sessions',
    'agent_oauth_connections',
    'oauth_states',
    'oauth_providers',
    'security_policies',
    'agents',
    'users',
  ];

  await Promise.allSettled(tables.map((table) => pool.query(`DELETE FROM "${table}"`)));
  await pool.end();
}

/**
 * Create mock Redis client for testing
 */
export function createMockRedis() {
  const store = new Map<string, string>();
  const expiry = new Map<string, number>();

  return {
    get: vi.fn(async (key: string) => {
      const exp = expiry.get(key);
      if (exp && Date.now() > exp) {
        store.delete(key);
        expiry.delete(key);
        return null;
      }
      return store.get(key) || null;
    }),

    set: vi.fn(async (key: string, value: string, mode?: string, duration?: number) => {
      store.set(key, value);
      if (mode === 'EX' && duration) {
        expiry.set(key, Date.now() + duration * 1000);
      }
      return 'OK';
    }),

    setex: vi.fn(async (key: string, seconds: number, value: string) => {
      store.set(key, value);
      expiry.set(key, Date.now() + seconds * 1000);
      return 'OK';
    }),

    del: vi.fn(async (key: string) => {
      const deleted = store.has(key) ? 1 : 0;
      store.delete(key);
      expiry.delete(key);
      return deleted;
    }),

    exists: vi.fn(async (key: string) => {
      const exp = expiry.get(key);
      if (exp && Date.now() > exp) {
        store.delete(key);
        expiry.delete(key);
        return 0;
      }
      return store.has(key) ? 1 : 0;
    }),

    incr: vi.fn(async (key: string) => {
      const current = parseInt(store.get(key) || '0');
      const newValue = current + 1;
      store.set(key, newValue.toString());
      return newValue;
    }),

    expire: vi.fn(async (key: string, seconds: number) => {
      if (store.has(key)) {
        expiry.set(key, Date.now() + seconds * 1000);
        return 1;
      }
      return 0;
    }),

    ttl: vi.fn(async (key: string) => {
      const exp = expiry.get(key);
      if (!exp) return -1;
      const remaining = Math.ceil((exp - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    }),

    disconnect: vi.fn(async () => {
      store.clear();
      expiry.clear();
    }),
  };
}

/**
 * Create test user entity
 */
export function createTestUser(overrides: Partial<UserEntity> = {}): UserEntity {
  // @ts-expect-error — test mock: partial stub satisfies UserEntity for unit testing
  return {
    id: 'test-user-' + Math.random().toString(36).substr(2, 9),
    email: 'test@example.com',
    username: 'testuser',
    role: 'user',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create test agent entity
 */
export function createTestAgent(userId: string, overrides: Partial<AgentEntity> = {}): AgentEntity {
  // @ts-expect-error — test mock: partial stub satisfies AgentEntity for unit testing
  return {
    id: 'test-agent-' + Math.random().toString(36).substr(2, 9),
    name: 'Test Agent',
    type: 'ASSISTANT',
    userId,
    capabilities: ['data_read', 'file_upload'],
    riskLevel: 'MEDIUM',
    isActive: true,
    metadata: {
      version: '1.0.0',
      lastValidated: new Date(),
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create test security policy entity
 */
export function createTestSecurityPolicy(
  overrides: Partial<SecurityPolicyEntity> = {}
): SecurityPolicyEntity {
  // @ts-expect-error — test mock: partial stub satisfies SecurityPolicyEntity for unit testing
  return {
    id: 'test-policy-' + Math.random().toString(36).substr(2, 9),
    name: 'Test Security Policy',
    type: 'AGENT_ACCESS',
    rules: {
      maxRiskLevel: 'HIGH',
      requiredCapabilities: ['data_read'],
      rateLimits: {
        requestsPerMinute: 60,
        burstLimit: 10,
      },
    },
    isActive: true,
    priority: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create test OAuth provider entity
 */
export function createTestOAuthProvider(
  overrides: Partial<OAuthProviderEntity> = {}
): OAuthProviderEntity {
  // @ts-expect-error — test mock: partial stub satisfies OAuthProviderEntity for unit testing
  return {
    id: 'test-provider-' + Math.random().toString(36).substr(2, 9),
    name: 'Test Provider',
    type: 'github',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    authorizationEndpoint: 'https://api.provider.com/oauth/authorize',
    tokenEndpoint: 'https://api.provider.com/oauth/token',
    userInfoEndpoint: 'https://api.provider.com/user',
    scope: 'read:user',
    isActive: true,
    securityConfig: {
      requiresPKCE: true,
      tokenEncryption: true,
      rateLimiting: {
        requestsPerMinute: 60,
        burstLimit: 10,
      },
    },
    agentConfig: {
      allowedCapabilities: ['github_read', 'github_write'],
      maxConnections: 5,
      tokenRefreshEnabled: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Wait for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate random test data
 */
export function generateTestId(prefix = 'test'): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create test JWT token for authentication
 */
export function createTestJWT(payload: unknown = {}): string {
  // In a real implementation, this would use a proper JWT library
  // For testing, we'll create a simple base64 encoded payload
  const header = { alg: 'HS256', typ: 'JWT' };
  const defaultPayload = {
    userId: 'test-user-1',
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    ...payload,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(defaultPayload)).toString('base64url');
  const signature = 'test-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Assert that an audit log entry exists with the given criteria
 */
export async function assertAuditLogExists(
  pool: Pool,
  criteria: Partial<AuditLogEntity>
): Promise<AuditLogEntity> {
  const keys = Object.keys(criteria);
  const values = Object.values(criteria);
  const where = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ');
  const result = await pool.query(
    `SELECT * FROM "audit_events" ${where ? `WHERE ${where}` : ''} LIMIT 1`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error(`Audit log not found with criteria: ${JSON.stringify(criteria)}`);
  }

  // @ts-expect-error — pg query result row is unknown; AuditLogEntity shape is guaranteed by the SQL query
  return result.rows[0] as AuditLogEntity;
}

export async function countAuditLogs(
  pool: Pool,
  criteria: Partial<AuditLogEntity>
): Promise<number> {
  const keys = Object.keys(criteria);
  const values = Object.values(criteria);
  const where = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ');
  const result = await pool.query(
    `SELECT COUNT(*)::int as cnt FROM "audit_events" ${where ? `WHERE ${where}` : ''}`,
    values
  );
  return result.rows[0]?.cnt ?? 0;
}
