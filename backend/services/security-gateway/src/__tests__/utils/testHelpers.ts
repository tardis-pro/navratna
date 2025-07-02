import { DataSource } from 'typeorm';
import { Express } from 'express';
import { createApp } from '../../app';
import {
  UserEntity,
  Agent as AgentEntity,
  SecurityPolicy as SecurityPolicyEntity,
  OAuthProviderEntity,
  AgentOAuthConnectionEntity,
  OAuthStateEntity,
  AuditEvent as AuditLogEntity,
  SessionEntity
} from '@uaip/shared-services';

/**
 * Create a test DataSource for integration tests
 */
export async function createTestDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    username: process.env.TEST_DB_USERNAME || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
    database: process.env.TEST_DB_NAME || 'council_test',
    entities: [
      UserEntity,
      AgentEntity,
      SecurityPolicyEntity,
      OAuthProviderEntity,
      AgentOAuthConnectionEntity,
      OAuthStateEntity,
      AuditLogEntity,
      SessionEntity,
    ],
    synchronize: true, // Auto-create schema for tests
    dropSchema: true,  // Clean slate for each test run
    logging: false,    // Disable logging for cleaner test output
  });

  await dataSource.initialize();
  return dataSource;
}

/**
 * Create a test Express app with the given DataSource
 */
export async function createTestApp(dataSource: DataSource): Promise<Express> {
  // Override the database connection for testing
  process.env.NODE_ENV = 'test';

  const app = await createApp({
    dataSource,
    redis: createMockRedis(),
    rabbitmq: createMockRabbitMQ(),
  });

  return app;
}

/**
 * Clean up test database
 */
export async function cleanupTestDb(dataSource: DataSource): Promise<void> {
  const entities = [
    AuditLogEntity,
    SessionEntity,
    AgentOAuthConnectionEntity,
    OAuthStateEntity,
    OAuthProviderEntity,
    SecurityPolicyEntity,
    AgentEntity,
    UserEntity,
  ];

  for (const entity of entities) {
    await dataSource.getRepository(entity).delete({});
  }
}

/**
 * Create mock Redis client for testing
 */
export function createMockRedis() {
  const store = new Map<string, string>();
  const expiry = new Map<string, number>();

  return {
    get: jest.fn(async (key: string) => {
      const exp = expiry.get(key);
      if (exp && Date.now() > exp) {
        store.delete(key);
        expiry.delete(key);
        return null;
      }
      return store.get(key) || null;
    }),

    set: jest.fn(async (key: string, value: string, mode?: string, duration?: number) => {
      store.set(key, value);
      if (mode === 'EX' && duration) {
        expiry.set(key, Date.now() + duration * 1000);
      }
      return 'OK';
    }),

    setex: jest.fn(async (key: string, seconds: number, value: string) => {
      store.set(key, value);
      expiry.set(key, Date.now() + seconds * 1000);
      return 'OK';
    }),

    del: jest.fn(async (key: string) => {
      const deleted = store.has(key) ? 1 : 0;
      store.delete(key);
      expiry.delete(key);
      return deleted;
    }),

    exists: jest.fn(async (key: string) => {
      const exp = expiry.get(key);
      if (exp && Date.now() > exp) {
        store.delete(key);
        expiry.delete(key);
        return 0;
      }
      return store.has(key) ? 1 : 0;
    }),

    incr: jest.fn(async (key: string) => {
      const current = parseInt(store.get(key) || '0');
      const newValue = current + 1;
      store.set(key, newValue.toString());
      return newValue;
    }),

    expire: jest.fn(async (key: string, seconds: number) => {
      if (store.has(key)) {
        expiry.set(key, Date.now() + seconds * 1000);
        return 1;
      }
      return 0;
    }),

    ttl: jest.fn(async (key: string) => {
      const exp = expiry.get(key);
      if (!exp) return -1;
      const remaining = Math.ceil((exp - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    }),

    disconnect: jest.fn(async () => {
      store.clear();
      expiry.clear();
    }),
  };
}

/**
 * Create mock RabbitMQ client for testing
 */
export function createMockRabbitMQ() {
  const messageQueue = new Map<string, any[]>();
  const subscribers = new Map<string, Function[]>();

  return {
    connect: jest.fn(async () => ({})),

    publish: jest.fn(async (exchange: string, routingKey: string, message: any) => {
      const key = `${exchange}.${routingKey}`;
      if (!messageQueue.has(key)) {
        messageQueue.set(key, []);
      }
      messageQueue.get(key)!.push(message);

      // Notify subscribers
      const subs = subscribers.get(key) || [];
      subs.forEach(sub => sub(message));

      return true;
    }),

    subscribe: jest.fn(async (exchange: string, routingKey: string, callback: Function) => {
      const key = `${exchange}.${routingKey}`;
      if (!subscribers.has(key)) {
        subscribers.set(key, []);
      }
      subscribers.get(key)!.push(callback);

      // Send any queued messages
      const messages = messageQueue.get(key) || [];
      messages.forEach(msg => callback(msg));
      messageQueue.set(key, []); // Clear queue
    }),

    rpc: jest.fn(async (exchange: string, routingKey: string, message: any, timeout = 5000) => {
      // Simulate RPC response
      return {
        success: true,
        data: { echo: message },
        timestamp: new Date().toISOString(),
      };
    }),

    disconnect: jest.fn(async () => {
      messageQueue.clear();
      subscribers.clear();
    }),
  };
}

/**
 * Create test user entity
 */
export function createTestUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'test-user-' + Math.random().toString(36).substr(2, 9),
    email: 'test@example.com',
    username: 'testuser',
    role: 'user',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserEntity;
}

/**
 * Create test agent entity
 */
export function createTestAgent(userId: string, overrides: Partial<AgentEntity> = {}): AgentEntity {
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
  } as AgentEntity;
}

/**
 * Create test security policy entity
 */
export function createTestSecurityPolicy(overrides: Partial<SecurityPolicyEntity> = {}): SecurityPolicyEntity {
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
  } as SecurityPolicyEntity;
}

/**
 * Create test OAuth provider entity
 */
export function createTestOAuthProvider(overrides: Partial<OAuthProviderEntity> = {}): OAuthProviderEntity {
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
  } as OAuthProviderEntity;
}

/**
 * Wait for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
export function createTestJWT(payload: any = {}): string {
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
  dataSource: DataSource,
  criteria: Partial<AuditLogEntity>
): Promise<AuditLogEntity> {
  const auditLog = await dataSource.getRepository(AuditLogEntity)
    .findOne({ where: criteria });

  if (!auditLog) {
    throw new Error(`Audit log not found with criteria: ${JSON.stringify(criteria)}`);
  }

  return auditLog;
}

/**
 * Count audit logs matching the given criteria
 */
export async function countAuditLogs(
  dataSource: DataSource,
  criteria: Partial<AuditLogEntity>
): Promise<number> {
  return await dataSource.getRepository(AuditLogEntity)
    .count({ where: criteria });
}