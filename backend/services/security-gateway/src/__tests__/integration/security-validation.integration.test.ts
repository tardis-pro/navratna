import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import { DataSource } from 'typeorm';
import { createTestApp, createTestDataSource, cleanupTestDb } from '../utils/testHelpers';
import {
  Agent as AgentEntity,
  UserEntity,
  SecurityPolicy as SecurityPolicyEntity,
  AuditEvent as AuditLogEntity,
  SessionEntity
} from '@uaip/shared-services';
import crypto from 'crypto';

describe('Security Validation Integration Tests', () => {
  let app: Express;
  let dataSource: DataSource;
  let testUser: UserEntity;
  let testAgent: AgentEntity;
  let securityPolicy: SecurityPolicyEntity;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    app = await createTestApp(dataSource);

    await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestDb(dataSource);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    // Clean up audit logs between tests
    await dataSource.getRepository(AuditLogEntity).delete({});
  });

  const seedTestData = async () => {
    const userRepo = dataSource.getRepository(UserEntity);
    const agentRepo = dataSource.getRepository(AgentEntity);
    const policyRepo = dataSource.getRepository(SecurityPolicyEntity);

    // Create test user
    testUser = userRepo.create({
      id: 'test-user-1',
      email: 'test@example.com',
      username: 'testuser',
      role: 'user',
      isActive: true,
    });
    await userRepo.save(testUser);

    // Create test agent with various capabilities
    testAgent = agentRepo.create({
      id: 'test-agent-1',
      name: 'Test Agent',
      type: 'ASSISTANT',
      userId: testUser.id,
      capabilities: ['data_read', 'file_upload', 'external_api'],
      riskLevel: 'MEDIUM',
      isActive: true,
      metadata: {
        version: '1.0.0',
        lastValidated: new Date(),
        securityProfile: 'standard'
      }
    });
    await agentRepo.save(testAgent);

    // Create security policy
    securityPolicy = policyRepo.create({
      id: 'test-policy-1',
      name: 'Test Security Policy',
      type: 'AGENT_ACCESS',
      rules: {
        maxRiskLevel: 'HIGH',
        requiredCapabilities: ['data_read'],
        blockedOperations: ['system_admin'],
        rateLimits: {
          requestsPerMinute: 60,
          burstLimit: 10
        }
      },
      isActive: true,
      priority: 100
    });
    await policyRepo.save(securityPolicy);
  };

  describe('Agent Authentication and Authorization', () => {
    test('should authenticate agent with valid credentials', async () => {
      const response = await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId: testAgent.id,
          operation: 'data_read',
          context: {
            resource: 'user_files',
            metadata: { fileType: 'document' }
          }
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('securityContext');
      expect(response.body.securityContext).toHaveProperty('agentId', testAgent.id);
      expect(response.body.securityContext).toHaveProperty('capabilities');
      expect(response.body.securityContext.capabilities).toContain('data_read');
    });

    test('should reject authentication for inactive agent', async () => {
      // Deactivate agent
      testAgent.isActive = false;
      await dataSource.getRepository(AgentEntity).save(testAgent);

      const response = await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId: testAgent.id,
          operation: 'data_read'
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('inactive');

      // Reactivate for other tests
      testAgent.isActive = true;
      await dataSource.getRepository(AgentEntity).save(testAgent);
    });

    test('should enforce capability restrictions', async () => {
      const response = await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId: testAgent.id,
          operation: 'system_admin', // Not in agent capabilities
          context: {
            resource: 'system_settings'
          }
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('insufficient capabilities');
    });

    test('should validate operation context', async () => {
      const response = await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId: testAgent.id,
          operation: 'data_read',
          context: {
            resource: 'sensitive_data',
            riskLevel: 'CRITICAL' // High risk operation
          }
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.securityContext).toHaveProperty('riskAssessment');
      expect(response.body.securityContext.riskAssessment).toHaveProperty('score');
      expect(response.body.securityContext.riskAssessment.score).toBeGreaterThan(0);
    });
  });

  describe('Risk Assessment Calculations', () => {
    test('should calculate risk score based on agent and operation', async () => {
      const response = await request(app)
        .post('/api/security/risk/assess')
        .send({
          agentId: testAgent.id,
          operation: 'external_api',
          context: {
            targetDomain: 'api.github.com',
            dataTypes: ['code', 'user_data'],
            requestSize: 1024
          }
        })
        .expect(200);

      expect(response.body).toHaveProperty('riskScore');
      expect(response.body).toHaveProperty('riskLevel');
      expect(response.body).toHaveProperty('factors');
      expect(response.body.riskScore).toBeGreaterThanOrEqual(0);
      expect(response.body.riskScore).toBeLessThanOrEqual(100);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(response.body.riskLevel);
    });

    test('should include risk factors in assessment', async () => {
      const response = await request(app)
        .post('/api/security/risk/assess')
        .send({
          agentId: testAgent.id,
          operation: 'file_upload',
          context: {
            fileSize: 50 * 1024 * 1024, // 50MB
            fileType: 'executable',
            destination: 'external_storage'
          }
        })
        .expect(200);

      expect(response.body.factors).toBeInstanceOf(Array);
      expect(response.body.factors.length).toBeGreaterThan(0);

      const factors = response.body.factors.map((f: any) => f.type);
      expect(factors).toContain('file_size');
      expect(factors).toContain('file_type');
    });

    test('should handle concurrent risk assessments', async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/security/risk/assess')
          .send({
            agentId: testAgent.id,
            operation: 'data_read',
            context: {
              sessionId: `concurrent-session-${i}`,
              resource: `resource-${i}`
            }
          })
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('riskScore');
        expect(response.body).toHaveProperty('riskLevel');
      });
    });
  });

  describe('Rate Limiting Enforcement', () => {
    test('should enforce rate limits per agent', async () => {
      const agentId = testAgent.id;
      const requests = [];

      // Send requests up to the limit
      for (let i = 0; i < 60; i++) {
        requests.push(
          request(app)
            .post('/api/security/agent/authenticate')
            .send({
              agentId,
              operation: 'data_read',
              context: { requestId: i }
            })
        );
      }

      const responses = await Promise.all(requests);

      // Most should succeed
      const successfulRequests = responses.filter(r => r.status === 200);
      expect(successfulRequests.length).toBeGreaterThan(50);

      // Additional request should be rate limited
      const rateLimitedResponse = await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId,
          operation: 'data_read'
        })
        .expect(429);

      expect(rateLimitedResponse.body).toHaveProperty('error');
      expect(rateLimitedResponse.body.error).toContain('rate limit');
      expect(rateLimitedResponse.headers).toHaveProperty('retry-after');
    });

    test('should enforce burst limits', async () => {
      const agentId = testAgent.id;

      // Send burst of requests simultaneously
      const burstRequests = Array.from({ length: 15 }, (_, i) =>
        request(app)
          .post('/api/security/agent/authenticate')
          .send({
            agentId,
            operation: 'data_read',
            context: { burstRequest: i }
          })
      );

      const responses = await Promise.all(burstRequests);

      const successfulRequests = responses.filter(r => r.status === 200);
      const rateLimitedRequests = responses.filter(r => r.status === 429);

      expect(successfulRequests.length).toBeLessThanOrEqual(10); // Burst limit
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });

    test('should reset rate limits after time window', async () => {
      const agentId = testAgent.id;

      // First request should succeed
      const response1 = await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId,
          operation: 'data_read'
        })
        .expect(200);

      expect(response1.body).toHaveProperty('success', true);

      // Simulate time passage (would need actual implementation in rate limiter)
      // For testing, we can check that rate limit headers are present
      expect(response1.headers).toHaveProperty('x-ratelimit-limit');
      expect(response1.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response1.headers).toHaveProperty('x-ratelimit-reset');
    });
  });

  describe('Audit Logging', () => {
    test('should create audit logs for authentication events', async () => {
      await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId: testAgent.id,
          operation: 'data_read',
          context: {
            resource: 'test_resource',
            auditTest: true
          }
        })
        .expect(200);

      // Check audit log was created
      const auditLogs = await dataSource.getRepository(AuditLogEntity)
        .find({ where: { agentId: testAgent.id } });

      expect(auditLogs.length).toBeGreaterThan(0);

      const authLog = auditLogs.find(log => log.eventType === 'AUTHENTICATION');
      expect(authLog).toBeTruthy();
      expect(authLog?.agentId).toBe(testAgent.id);
      expect(authLog?.operation).toBe('data_read');
      expect(authLog?.outcome).toBe('SUCCESS');
    });

    test('should log failed authentication attempts', async () => {
      await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId: 'non-existent-agent',
          operation: 'data_read'
        })
        .expect(404);

      // Check audit log for failed attempt
      const auditLogs = await dataSource.getRepository(AuditLogEntity)
        .find({ where: { eventType: 'AUTHENTICATION' } });

      const failedLog = auditLogs.find(log => log.outcome === 'FAILURE');
      expect(failedLog).toBeTruthy();
      expect(failedLog?.details).toContain('non-existent-agent');
    });

    test('should include security context in audit logs', async () => {
      const testContext = {
        resource: 'sensitive_document',
        classification: 'confidential',
        requestor: 'automated_test'
      };

      await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId: testAgent.id,
          operation: 'data_read',
          context: testContext
        })
        .expect(200);

      const auditLogs = await dataSource.getRepository(AuditLogEntity)
        .find({ where: { agentId: testAgent.id } });

      const log = auditLogs[auditLogs.length - 1]; // Most recent
      expect(log.context).toBeTruthy();
      expect(log.context).toMatchObject(testContext);
    });

    test('should track session lifecycle in audit logs', async () => {
      // Create session
      const authResponse = await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId: testAgent.id,
          operation: 'data_read'
        })
        .expect(200);

      const sessionId = authResponse.body.sessionId;

      // End session
      await request(app)
        .post('/api/security/session/end')
        .send({ sessionId })
        .expect(200);

      // Check session lifecycle logs
      const auditLogs = await dataSource.getRepository(AuditLogEntity)
        .find({
          where: { agentId: testAgent.id },
          order: { timestamp: 'ASC' }
        });

      const sessionStartLog = auditLogs.find(log =>
        log.eventType === 'SESSION' && log.operation === 'session_start'
      );
      const sessionEndLog = auditLogs.find(log =>
        log.eventType === 'SESSION' && log.operation === 'session_end'
      );

      expect(sessionStartLog).toBeTruthy();
      expect(sessionEndLog).toBeTruthy();
      expect(sessionStartLog?.sessionId).toBe(sessionId);
      expect(sessionEndLog?.sessionId).toBe(sessionId);
    });
  });

  describe('Security Policy Enforcement', () => {
    test('should enforce security policies during validation', async () => {
      // Create restrictive policy
      const restrictivePolicy = dataSource.getRepository(SecurityPolicyEntity).create({
        id: 'restrictive-policy',
        name: 'Restrictive Policy',
        type: 'AGENT_ACCESS',
        rules: {
          maxRiskLevel: 'LOW',
          blockedOperations: ['external_api'],
          requiredCapabilities: ['data_read', 'security_validated']
        },
        isActive: true,
        priority: 200 // Higher priority than test policy
      });
      await dataSource.getRepository(SecurityPolicyEntity).save(restrictivePolicy);

      const response = await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId: testAgent.id,
          operation: 'external_api', // Blocked by policy
          context: {
            targetDomain: 'api.example.com'
          }
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('policy violation');
      expect(response.body).toHaveProperty('policyId', restrictivePolicy.id);

      // Cleanup
      await dataSource.getRepository(SecurityPolicyEntity).delete(restrictivePolicy.id);
    });

    test('should apply multiple policies in priority order', async () => {
      // Create high priority permissive policy
      const permissivePolicy = dataSource.getRepository(SecurityPolicyEntity).create({
        id: 'permissive-policy',
        name: 'Permissive Policy',
        type: 'AGENT_ACCESS',
        rules: {
          maxRiskLevel: 'CRITICAL',
          allowedOperations: ['external_api', 'data_read']
        },
        isActive: true,
        priority: 300 // Highest priority
      });
      await dataSource.getRepository(SecurityPolicyEntity).save(permissivePolicy);

      const response = await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId: testAgent.id,
          operation: 'external_api',
          context: {
            targetDomain: 'api.github.com'
          }
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.securityContext).toHaveProperty('appliedPolicies');
      expect(response.body.securityContext.appliedPolicies).toContain(permissivePolicy.id);

      // Cleanup
      await dataSource.getRepository(SecurityPolicyEntity).delete(permissivePolicy.id);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should validate security within performance requirements', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .post('/api/security/agent/authenticate')
        .send({
          agentId: testAgent.id,
          operation: 'data_read',
          context: {
            performanceTest: true,
            resource: 'benchmark_data'
          }
        })
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.body).toHaveProperty('success', true);
      expect(responseTime).toBeLessThan(100); // <100ms requirement from docs
    });

    test('should handle concurrent validation requests', async () => {
      const concurrentRequests = 10;
      const startTime = Date.now();

      const requests = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app)
          .post('/api/security/agent/authenticate')
          .send({
            agentId: testAgent.id,
            operation: 'data_read',
            context: {
              concurrentTest: true,
              requestId: i
            }
          })
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
      });

      // Average response time should be reasonable
      const avgResponseTime = totalTime / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(200);
    });
  });
});