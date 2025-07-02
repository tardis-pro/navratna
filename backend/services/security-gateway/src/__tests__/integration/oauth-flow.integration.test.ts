import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import { DataSource } from 'typeorm';
import { createTestApp, createTestDataSource, cleanupTestDb } from '../utils/testHelpers';
import {
  OAuthProviderEntity,
  Agent as AgentEntity,
  UserEntity,
  AgentOAuthConnectionEntity,
  OAuthStateEntity
} from '@uaip/shared-services';
import crypto from 'crypto';

describe('OAuth Flow Integration Tests', () => {
  let app: Express;
  let dataSource: DataSource;
  let testUser: UserEntity;
  let testAgent: AgentEntity;
  let githubProvider: OAuthProviderEntity;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    app = await createTestApp(dataSource);

    // Seed test data
    await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestDb(dataSource);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    // Clean up OAuth states and connections between tests
    await dataSource.getRepository(OAuthStateEntity).delete({});
    await dataSource.getRepository(AgentOAuthConnectionEntity).delete({});
  });

  afterEach(async () => {
    // Additional cleanup if needed
  });

  const seedTestData = async () => {
    const userRepo = dataSource.getRepository(UserEntity);
    const agentRepo = dataSource.getRepository(AgentEntity);
    const providerRepo = dataSource.getRepository(OAuthProviderEntity);

    // Create test user
    testUser = userRepo.create({
      id: 'test-user-1',
      email: 'test@example.com',
      username: 'testuser',
      role: 'user',
      isActive: true,
    });
    await userRepo.save(testUser);

    // Create test agent
    testAgent = agentRepo.create({
      id: 'test-agent-1',
      name: 'Test Agent',
      type: 'ASSISTANT',
      userId: testUser.id,
      capabilities: ['github_read', 'github_write'],
      isActive: true,
    });
    await agentRepo.save(testAgent);

    // Create GitHub OAuth provider
    githubProvider = providerRepo.create({
      id: 'github-provider-1',
      name: 'GitHub',
      type: 'github',
      clientId: 'test-github-client-id',
      clientSecret: 'test-github-client-secret',
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      userInfoEndpoint: 'https://api.github.com/user',
      scope: 'read:user,repo',
      isActive: true,
      securityConfig: {
        requiresPKCE: true,
        tokenEncryption: true,
        rateLimiting: {
          requestsPerMinute: 60,
          burstLimit: 10
        }
      },
      agentConfig: {
        allowedCapabilities: ['github_read', 'github_write', 'github_admin'],
        maxConnections: 5,
        tokenRefreshEnabled: true
      }
    });
    await providerRepo.save(githubProvider);
  };

  describe('OAuth Authorization Flow', () => {
    test('should initiate OAuth authorization flow with PKCE', async () => {
      const response = await request(app)
        .post('/api/oauth/authorize')
        .send({
          providerId: githubProvider.id,
          agentId: testAgent.id,
          capabilities: ['github_read'],
          redirectUri: 'http://localhost:3000/oauth/callback'
        })
        .expect(200);

      expect(response.body).toHaveProperty('authorizationUrl');
      expect(response.body).toHaveProperty('state');
      expect(response.body.authorizationUrl).toContain('github.com/login/oauth/authorize');
      expect(response.body.authorizationUrl).toContain('code_challenge');
      expect(response.body.authorizationUrl).toContain('code_challenge_method=S256');

      // Verify state was stored in database
      const oauthState = await dataSource.getRepository(OAuthStateEntity)
        .findOne({ where: { state: response.body.state } });

      expect(oauthState).toBeTruthy();
      expect(oauthState?.agentId).toBe(testAgent.id);
      expect(oauthState?.providerId).toBe(githubProvider.id);
      expect(oauthState?.codeVerifier).toBeTruthy();
    });

    test('should handle OAuth callback with valid authorization code', async () => {
      // First initiate OAuth flow
      const authResponse = await request(app)
        .post('/api/oauth/authorize')
        .send({
          providerId: githubProvider.id,
          agentId: testAgent.id,
          capabilities: ['github_read'],
          redirectUri: 'http://localhost:3000/oauth/callback'
        });

      const { state } = authResponse.body;

      // Mock successful OAuth callback
      const response = await request(app)
        .post('/api/oauth/callback')
        .send({
          code: 'mock-authorization-code',
          state: state,
          providerId: githubProvider.id
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('connectionId');
      expect(response.body).toHaveProperty('agentId', testAgent.id);

      // Verify OAuth connection was created
      const connection = await dataSource.getRepository(AgentOAuthConnectionEntity)
        .findOne({ where: { agentId: testAgent.id, providerId: githubProvider.id } });

      expect(connection).toBeTruthy();
      expect(connection?.capabilities).toContain('github_read');
      expect(connection?.isActive).toBe(true);
    });

    test('should reject callback with invalid state', async () => {
      const response = await request(app)
        .post('/api/oauth/callback')
        .send({
          code: 'mock-authorization-code',
          state: 'invalid-state',
          providerId: githubProvider.id
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid or expired OAuth state');
    });

    test('should handle OAuth callback errors', async () => {
      // First initiate OAuth flow
      const authResponse = await request(app)
        .post('/api/oauth/authorize')
        .send({
          providerId: githubProvider.id,
          agentId: testAgent.id,
          capabilities: ['github_read'],
          redirectUri: 'http://localhost:3000/oauth/callback'
        });

      const { state } = authResponse.body;

      const response = await request(app)
        .post('/api/oauth/callback')
        .send({
          error: 'access_denied',
          error_description: 'User denied authorization',
          state: state
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('access_denied');
    });
  });

  describe('Agent OAuth Authentication', () => {
    let oauthConnection: AgentOAuthConnectionEntity;

    beforeEach(async () => {
      // Create OAuth connection for tests
      const connectionRepo = dataSource.getRepository(AgentOAuthConnectionEntity);
      oauthConnection = connectionRepo.create({
        id: crypto.randomUUID(),
        agentId: testAgent.id,
        providerId: githubProvider.id,
        accessToken: 'encrypted-access-token',
        refreshToken: 'encrypted-refresh-token',
        capabilities: ['github_read', 'github_write'],
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
        lastUsedAt: new Date(),
        usageStats: {
          totalRequests: 0,
          requestsThisHour: 0,
          requestsToday: 0,
          lastReset: new Date()
        }
      });
      await connectionRepo.save(oauthConnection);
    });

    test('should authenticate agent with OAuth provider', async () => {
      const response = await request(app)
        .post('/api/oauth/agent/authenticate')
        .send({
          agentId: testAgent.id,
          providerId: githubProvider.id,
          operation: 'github_read_repos'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('connectionId', oauthConnection.id);
      expect(response.body).toHaveProperty('capabilities');
      expect(response.body.capabilities).toContain('github_read');
    });

    test('should reject authentication for inactive connection', async () => {
      // Deactivate connection
      oauthConnection.isActive = false;
      await dataSource.getRepository(AgentOAuthConnectionEntity).save(oauthConnection);

      const response = await request(app)
        .post('/api/oauth/agent/authenticate')
        .send({
          agentId: testAgent.id,
          providerId: githubProvider.id,
          operation: 'github_read_repos'
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('inactive');
    });

    test('should enforce capability restrictions', async () => {
      const response = await request(app)
        .post('/api/oauth/agent/authenticate')
        .send({
          agentId: testAgent.id,
          providerId: githubProvider.id,
          operation: 'github_admin_delete_repo'  // Not in allowed capabilities
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('insufficient capabilities');
    });
  });

  describe('Token Management', () => {
    let oauthConnection: AgentOAuthConnectionEntity;

    beforeEach(async () => {
      const connectionRepo = dataSource.getRepository(AgentOAuthConnectionEntity);
      oauthConnection = connectionRepo.create({
        id: crypto.randomUUID(),
        agentId: testAgent.id,
        providerId: githubProvider.id,
        accessToken: 'encrypted-access-token',
        refreshToken: 'encrypted-refresh-token',
        capabilities: ['github_read'],
        isActive: true,
        expiresAt: new Date(Date.now() - 1000), // Expired token
        lastUsedAt: new Date(),
        usageStats: {
          totalRequests: 0,
          requestsThisHour: 0,
          requestsToday: 0,
          lastReset: new Date()
        }
      });
      await connectionRepo.save(oauthConnection);
    });

    test('should refresh expired tokens automatically', async () => {
      const response = await request(app)
        .post('/api/oauth/agent/authenticate')
        .send({
          agentId: testAgent.id,
          providerId: githubProvider.id,
          operation: 'github_read_repos'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('tokenRefreshed', true);

      // Verify token was updated in database
      const updatedConnection = await dataSource.getRepository(AgentOAuthConnectionEntity)
        .findOne({ where: { id: oauthConnection.id } });

      expect(updatedConnection?.expiresAt).toBeInstanceOf(Date);
      expect(updatedConnection?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Rate Limiting and Usage Tracking', () => {
    let oauthConnection: AgentOAuthConnectionEntity;

    beforeEach(async () => {
      const connectionRepo = dataSource.getRepository(AgentOAuthConnectionEntity);
      oauthConnection = connectionRepo.create({
        id: crypto.randomUUID(),
        agentId: testAgent.id,
        providerId: githubProvider.id,
        accessToken: 'encrypted-access-token',
        capabilities: ['github_read'],
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000),
        lastUsedAt: new Date(),
        usageStats: {
          totalRequests: 59, // Near rate limit
          requestsThisHour: 59,
          requestsToday: 59,
          lastReset: new Date()
        }
      });
      await connectionRepo.save(oauthConnection);
    });

    test('should enforce rate limiting', async () => {
      // First request should succeed
      const response1 = await request(app)
        .post('/api/oauth/agent/authenticate')
        .send({
          agentId: testAgent.id,
          providerId: githubProvider.id,
          operation: 'github_read_repos'
        })
        .expect(200);

      expect(response1.body).toHaveProperty('success', true);

      // Second request should be rate limited
      const response2 = await request(app)
        .post('/api/oauth/agent/authenticate')
        .send({
          agentId: testAgent.id,
          providerId: githubProvider.id,
          operation: 'github_read_repos'
        })
        .expect(429);

      expect(response2.body).toHaveProperty('error');
      expect(response2.body.error).toContain('rate limit');
    });

    test('should track usage statistics', async () => {
      await request(app)
        .post('/api/oauth/agent/authenticate')
        .send({
          agentId: testAgent.id,
          providerId: githubProvider.id,
          operation: 'github_read_repos'
        })
        .expect(200);

      // Verify usage stats were updated
      const updatedConnection = await dataSource.getRepository(AgentOAuthConnectionEntity)
        .findOne({ where: { id: oauthConnection.id } });

      expect(updatedConnection?.usageStats.totalRequests).toBe(60);
      expect(updatedConnection?.usageStats.requestsThisHour).toBe(60);
      expect(updatedConnection?.lastUsedAt).toBeInstanceOf(Date);
    });
  });

  describe('Connection Management', () => {
    test('should list agent OAuth connections', async () => {
      // Create test connection
      const connectionRepo = dataSource.getRepository(AgentOAuthConnectionEntity);
      const connection = connectionRepo.create({
        id: crypto.randomUUID(),
        agentId: testAgent.id,
        providerId: githubProvider.id,
        accessToken: 'encrypted-access-token',
        capabilities: ['github_read'],
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000),
        lastUsedAt: new Date(),
        usageStats: {
          totalRequests: 10,
          requestsThisHour: 5,
          requestsToday: 10,
          lastReset: new Date()
        }
      });
      await connectionRepo.save(connection);

      const response = await request(app)
        .get(`/api/oauth/agent/${testAgent.id}/connections`)
        .expect(200);

      expect(response.body).toHaveProperty('connections');
      expect(response.body.connections).toHaveLength(1);
      expect(response.body.connections[0]).toHaveProperty('providerId', githubProvider.id);
      expect(response.body.connections[0]).toHaveProperty('capabilities');
      expect(response.body.connections[0]).not.toHaveProperty('accessToken'); // Should be filtered out
    });

    test('should revoke OAuth connection', async () => {
      // Create test connection
      const connectionRepo = dataSource.getRepository(AgentOAuthConnectionEntity);
      const connection = connectionRepo.create({
        id: crypto.randomUUID(),
        agentId: testAgent.id,
        providerId: githubProvider.id,
        accessToken: 'encrypted-access-token',
        capabilities: ['github_read'],
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000),
        lastUsedAt: new Date(),
        usageStats: {
          totalRequests: 0,
          requestsThisHour: 0,
          requestsToday: 0,
          lastReset: new Date()
        }
      });
      await connectionRepo.save(connection);

      const response = await request(app)
        .delete(`/api/oauth/agent/${testAgent.id}/connections/${githubProvider.id}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify connection was deactivated
      const updatedConnection = await connectionRepo.findOne({ where: { id: connection.id } });
      expect(updatedConnection?.isActive).toBe(false);
    });
  });
});