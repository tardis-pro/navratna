// Jest is globally available
import { TestUtils } from '../helpers/testUtils';

export class ServiceMockFactory {
  static createMockRedisService() {
    return {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      keys: jest.fn(),
      flushdb: jest.fn(),
      incr: jest.fn(),
      decr: jest.fn(),
      hget: jest.fn(),
      hset: jest.fn(),
      hdel: jest.fn(),
      hgetall: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      smembers: jest.fn(),
      sismember: jest.fn(),
      lpush: jest.fn(),
      rpush: jest.fn(),
      lpop: jest.fn(),
      rpop: jest.fn(),
      llen: jest.fn(),
      lrange: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      disconnect: jest.fn(),
      connect: jest.fn(),
      ping: jest.fn(),
    };
  }

  static createMockNeo4jService() {
    return {
      driver: {
        session: jest.fn().mockReturnValue({
          run: jest.fn(),
          close: jest.fn(),
          readTransaction: jest.fn(),
          writeTransaction: jest.fn(),
        }),
        close: jest.fn(),
        verifyConnectivity: jest.fn(),
      },
      query: jest.fn(),
      createNode: jest.fn(),
      updateNode: jest.fn(),
      deleteNode: jest.fn(),
      createRelationship: jest.fn(),
      deleteRelationship: jest.fn(),
      findNodes: jest.fn(),
      findRelationships: jest.fn(),
      close: jest.fn(),
    };
  }

  static createMockLLMService() {
    return {
      generateCompletion: jest.fn().mockResolvedValue({
        content: 'Mock AI response',
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      }),
      generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      listModels: jest.fn().mockResolvedValue(['gpt-4', 'gpt-3.5-turbo']),
      validateModel: jest.fn().mockReturnValue(true),
      getModelInfo: jest.fn().mockReturnValue({
        id: 'gpt-4',
        name: 'GPT-4',
        maxTokens: 8192,
        supportsFunctions: true
      }),
    };
  }

  static createMockQueueService() {
    return {
      connect: jest.fn(),
      disconnect: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      createQueue: jest.fn(),
      deleteQueue: jest.fn(),
      purgeQueue: jest.fn(),
      getQueueInfo: jest.fn(),
      ack: jest.fn(),
      nack: jest.fn(),
      reject: jest.fn(),
    };
  }

  static createMockSecurityService() {
    return {
      hashPassword: jest.fn().mockResolvedValue('hashed_password'),
      comparePassword: jest.fn().mockResolvedValue(true),
      generateToken: jest.fn().mockReturnValue('mock_token'),
      verifyToken: jest.fn().mockReturnValue({ userId: TestUtils.generateUUID() }),
      encryptSensitiveData: jest.fn().mockReturnValue('encrypted_data'),
      decryptSensitiveData: jest.fn().mockReturnValue('decrypted_data'),
      validateSecurityLevel: jest.fn().mockReturnValue(true),
      auditSecurityEvent: jest.fn(),
    };
  }

  static createMockNotificationService() {
    return {
      sendEmail: jest.fn(),
      sendSMS: jest.fn(),
      sendPushNotification: jest.fn(),
      createNotification: jest.fn(),
      markAsRead: jest.fn(),
      getNotifications: jest.fn(),
      deleteNotification: jest.fn(),
    };
  }

  static createMockFileService() {
    return {
      uploadFile: jest.fn(),
      downloadFile: jest.fn(),
      deleteFile: jest.fn(),
      getFileMetadata: jest.fn(),
      generateSignedUrl: jest.fn(),
      listFiles: jest.fn(),
      moveFile: jest.fn(),
      copyFile: jest.fn(),
    };
  }

  static createMockMetricsService() {
    return {
      recordMetric: jest.fn(),
      incrementCounter: jest.fn(),
      recordGauge: jest.fn(),
      recordHistogram: jest.fn(),
      recordTimer: jest.fn(),
      getMetrics: jest.fn(),
      resetMetrics: jest.fn(),
    };
  }

  static createMockCacheService() {
    return {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      has: jest.fn(),
      keys: jest.fn(),
      size: jest.fn(),
      invalidatePattern: jest.fn(),
      setWithTTL: jest.fn(),
      getTTL: jest.fn(),
    };
  }

  static createMockConfigService() {
    return {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      getAll: jest.fn(),
      reload: jest.fn(),
      validate: jest.fn(),
      watch: jest.fn(),
      unwatch: jest.fn(),
    };
  }

  static createMockHealthService() {
    return {
      checkHealth: jest.fn().mockResolvedValue({
        status: 'healthy',
        checks: {
          database: 'healthy',
          redis: 'healthy',
          queue: 'healthy',
        },
        timestamp: new Date().toISOString(),
      }),
      checkComponent: jest.fn(),
      registerHealthCheck: jest.fn(),
      unregisterHealthCheck: jest.fn(),
    };
  }

  static createMockSchedulerService() {
    return {
      scheduleJob: jest.fn(),
      cancelJob: jest.fn(),
      pauseJob: jest.fn(),
      resumeJob: jest.fn(),
      listJobs: jest.fn(),
      getJobStatus: jest.fn(),
      runJobNow: jest.fn(),
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