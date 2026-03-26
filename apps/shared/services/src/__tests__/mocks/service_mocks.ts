// Jest is globally available
import { TestUtils } from '../helpers/test_utils';

export namespace ServiceMockFactory {
  export function createMockRedisService() {
    return {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
      keys: vi.fn(),
      flushdb: vi.fn(),
      incr: vi.fn(),
      decr: vi.fn(),
      hget: vi.fn(),
      hset: vi.fn(),
      hdel: vi.fn(),
      hgetall: vi.fn(),
      sadd: vi.fn(),
      srem: vi.fn(),
      smembers: vi.fn(),
      sismember: vi.fn(),
      lpush: vi.fn(),
      rpush: vi.fn(),
      lpop: vi.fn(),
      rpop: vi.fn(),
      llen: vi.fn(),
      lrange: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(),
      ping: vi.fn(),
    };
  }

  export function createMockNeo4jService() {
    return {
      driver: {
        session: vi.fn().mockReturnValue({
          run: vi.fn(),
          close: vi.fn(),
          readTransaction: vi.fn(),
          writeTransaction: vi.fn(),
        }),
        close: vi.fn(),
        verifyConnectivity: vi.fn(),
      },
      query: vi.fn(),
      createNode: vi.fn(),
      updateNode: vi.fn(),
      deleteNode: vi.fn(),
      createRelationship: vi.fn(),
      deleteRelationship: vi.fn(),
      findNodes: vi.fn(),
      findRelationships: vi.fn(),
      close: vi.fn(),
    };
  }

  export function createMockLLMService() {
    return {
      generateCompletion: vi.fn().mockResolvedValue({
        content: 'Mock AI response',
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      listModels: vi.fn().mockResolvedValue(['gpt-4', 'gpt-3.5-turbo']),
      validateModel: vi.fn().mockReturnValue(true),
      getModelInfo: vi.fn().mockReturnValue({
        id: 'gpt-4',
        name: 'GPT-4',
        maxTokens: 8192,
        supportsFunctions: true,
      }),
    };
  }

  export function createMockQueueService() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      createQueue: vi.fn(),
      deleteQueue: vi.fn(),
      purgeQueue: vi.fn(),
      getQueueInfo: vi.fn(),
      ack: vi.fn(),
      nack: vi.fn(),
      reject: vi.fn(),
    };
  }

  export function createMockSecurityService() {
    return {
      hashPassword: vi.fn().mockResolvedValue('hashed_password'),
      comparePassword: vi.fn().mockResolvedValue(true),
      generateToken: vi.fn().mockReturnValue('mock_token'),
      verifyToken: vi.fn().mockReturnValue({ userId: TestUtils.generateUUID() }),
      encryptSensitiveData: vi.fn().mockReturnValue('encrypted_data'),
      decryptSensitiveData: vi.fn().mockReturnValue('decrypted_data'),
      validateSecurityLevel: vi.fn().mockReturnValue(true),
      auditSecurityEvent: vi.fn(),
    };
  }

  export function createMockNotificationService() {
    return {
      sendEmail: vi.fn(),
      sendSMS: vi.fn(),
      sendPushNotification: vi.fn(),
      createNotification: vi.fn(),
      markAsRead: vi.fn(),
      getNotifications: vi.fn(),
      deleteNotification: vi.fn(),
    };
  }

  export function createMockFileService() {
    return {
      uploadFile: vi.fn(),
      downloadFile: vi.fn(),
      deleteFile: vi.fn(),
      getFileMetadata: vi.fn(),
      generateSignedUrl: vi.fn(),
      listFiles: vi.fn(),
      moveFile: vi.fn(),
      copyFile: vi.fn(),
    };
  }

  export function createMockMetricsService() {
    return {
      recordMetric: vi.fn(),
      incrementCounter: vi.fn(),
      recordGauge: vi.fn(),
      recordHistogram: vi.fn(),
      recordTimer: vi.fn(),
      getMetrics: vi.fn(),
      resetMetrics: vi.fn(),
    };
  }

  export function createMockCacheService() {
    return {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(),
      keys: vi.fn(),
      size: vi.fn(),
      invalidatePattern: vi.fn(),
      setWithTTL: vi.fn(),
      getTTL: vi.fn(),
    };
  }

  export function createMockConfigService() {
    return {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      getAll: vi.fn(),
      reload: vi.fn(),
      validate: vi.fn(),
      watch: vi.fn(),
      unwatch: vi.fn(),
    };
  }

  export function createMockHealthService() {
    return {
      checkHealth: vi.fn().mockResolvedValue({
        status: 'healthy',
        checks: {
          database: 'healthy',
          redis: 'healthy',
          queue: 'healthy',
        },
        timestamp: new Date().toISOString(),
      }),
      checkComponent: vi.fn(),
      registerHealthCheck: vi.fn(),
      unregisterHealthCheck: vi.fn(),
    };
  }

  export function createMockSchedulerService() {
    return {
      scheduleJob: vi.fn(),
      cancelJob: vi.fn(),
      pauseJob: vi.fn(),
      resumeJob: vi.fn(),
      listJobs: vi.fn(),
      getJobStatus: vi.fn(),
      runJobNow: vi.fn(),
    };
  }
}

// Pre-created instances for common use
export const mockRedisService = ServiceMockFactory.createMockRedisService();
export const mockNeo4jService = ServiceMockFactory.createMockNeo4jService();
export const mockLLMService = ServiceMockFactory.createMockLLMService();
export const mockQueueService = ServiceMockFactory.createMockQueueService();
export const mockSecurityService = ServiceMockFactory.createMockSecurityService();
export const mockNotificationService = ServiceMockFactory.createMockNotificationService();
export const mockFileService = ServiceMockFactory.createMockFileService();
export const mockMetricsService = ServiceMockFactory.createMockMetricsService();
export const mockCacheService = ServiceMockFactory.createMockCacheService();
export const mockConfigService = ServiceMockFactory.createMockConfigService();
export const mockHealthService = ServiceMockFactory.createMockHealthService();
export const mockSchedulerService = ServiceMockFactory.createMockSchedulerService();
