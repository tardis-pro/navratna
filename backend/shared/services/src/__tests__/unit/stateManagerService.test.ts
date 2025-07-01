import { StateManagerService, StateUpdateOptions } from '../../stateManagerService.js';
import { DatabaseService } from '../../databaseService.js';
import { OperationState, Checkpoint } from '@uaip/types';
import { CheckpointType } from '@uaip/types';

// Mock Redis client
const mockRedis = {
  setex: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  expire: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  ttl: jest.fn().mockResolvedValue(-1),
  info: jest.fn().mockResolvedValue('keyspace_hits:100\r\nkeyspace_misses:20\r\n'),
  quit: jest.fn().mockResolvedValue('OK'),
  on: jest.fn()
};

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

// Mock config
jest.mock('@uaip/config', () => ({
  config: {
    getRedisConfig: jest.fn().mockReturnValue({
      host: 'localhost',
      port: 6379,
      password: null,
      db: 0,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableOfflineQueue: false
    }),
    getStateConfig: jest.fn().mockReturnValue({
      compressionEnabled: true,
      maxCheckpointSize: 1048576 // 1MB
    })
  }
}));

// Mock DatabaseService
const createMockDatabaseService = () => ({
  saveOperationState: jest.fn().mockResolvedValue(undefined),
  getOperationState: jest.fn().mockResolvedValue(null),
  updateOperationState: jest.fn().mockResolvedValue(undefined),
  saveCheckpoint: jest.fn().mockResolvedValue(undefined),
  getCheckpoint: jest.fn().mockResolvedValue(null),
  listCheckpoints: jest.fn().mockResolvedValue([]),
  deleteOldOperationStates: jest.fn().mockResolvedValue(5),
  getStateStatistics: jest.fn().mockResolvedValue({
    totalOperations: 100,
    activeOperations: 15,
    totalCheckpoints: 50,
    averageStateSize: 2048
  }),
  healthCheck: jest.fn().mockResolvedValue({
    status: 'healthy',
    details: {
      connected: true,
      totalConnections: 1,
      idleConnections: 0,
      waitingConnections: 0,
      responseTime: 5
    }
  })
});

describe('StateManagerService', () => {
  let service: StateManagerService;
  let mockDatabaseService: ReturnType<typeof createMockDatabaseService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabaseService = createMockDatabaseService();
    service = new StateManagerService(mockDatabaseService as any);
  });

  describe('Service Initialization', () => {
    it('should initialize successfully with Redis and database connections', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(StateManagerService);
    });

    it('should set up Redis event listeners during construction', () => {
      expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('ready', expect.any(Function));
    });
  });

  describe('Operation State Management', () => {
    const mockOperationId = 'test-operation-123';
    const mockOperationState: OperationState = {
      operationId: mockOperationId,
      currentStep: 'step-1',
      completedSteps: ['step-0'],
      failedSteps: [],
      variables: { userId: 'user-123', config: 'test' },
      checkpoints: ['checkpoint-1'],
      lastUpdated: new Date()
    };

    describe('initializeOperationState', () => {
      it('should initialize operation state in both cache and database', async () => {
        await service.initializeOperationState(mockOperationId, mockOperationState);

        // Verify Redis cache storage
        expect(mockRedis.setex).toHaveBeenCalledWith(
          `operation:state:${mockOperationId}`,
          3600,
          JSON.stringify(mockOperationState)
        );

        // Verify database storage
        expect(mockDatabaseService.saveOperationState).toHaveBeenCalledWith(
          mockOperationId,
          mockOperationState
        );
      });

      it('should validate operation state before storing', async () => {
        const invalidState = {
          operationId: '',
          completedSteps: 'not-an-array', // Invalid type
          failedSteps: [],
          variables: null, // Invalid type
          checkpoints: []
        };

        await expect(service.initializeOperationState(mockOperationId, invalidState as any))
          .rejects.toThrow();
      });

      it('should handle Redis storage errors gracefully', async () => {
        mockRedis.setex.mockRejectedValueOnce(new Error('Redis connection failed'));

        await expect(service.initializeOperationState(mockOperationId, mockOperationState))
          .rejects.toThrow('Failed to initialize operation state');
      });
    });

    describe('getOperationState', () => {
      it('should retrieve state from Redis cache first', async () => {
        mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockOperationState));

        const result = await service.getOperationState(mockOperationId);

        expect(mockRedis.get).toHaveBeenCalledWith(`operation:state:${mockOperationId}`);
        expect(result).toEqual(mockOperationState);
        expect(mockDatabaseService.getOperationState).not.toHaveBeenCalled();
      });

      it('should fallback to database when cache miss occurs', async () => {
        mockRedis.get.mockResolvedValueOnce(null);
        mockDatabaseService.getOperationState.mockResolvedValueOnce(mockOperationState);

        const result = await service.getOperationState(mockOperationId);

        expect(mockRedis.get).toHaveBeenCalledWith(`operation:state:${mockOperationId}`);
        expect(mockDatabaseService.getOperationState).toHaveBeenCalledWith(mockOperationId);
        expect(result).toEqual(mockOperationState);

        // Should cache the result for future requests
        expect(mockRedis.setex).toHaveBeenCalledWith(
          `operation:state:${mockOperationId}`,
          3600,
          JSON.stringify(mockOperationState)
        );
      });

      it('should return null when state not found anywhere', async () => {
        mockRedis.get.mockResolvedValueOnce(null);
        mockDatabaseService.getOperationState.mockResolvedValueOnce(null);

        const result = await service.getOperationState(mockOperationId);

        expect(result).toBeNull();
      });

      it('should handle malformed JSON in cache gracefully', async () => {
        mockRedis.get.mockResolvedValueOnce('invalid-json{');

        const result = await service.getOperationState(mockOperationId);

        expect(result).toBeNull();
      });
    });

    describe('updateOperationState', () => {
      const updateOptions: StateUpdateOptions = {
        currentStep: 'step-2',
        completedSteps: ['step-0', 'step-1'],
        variables: { userId: 'user-123', newValue: 'updated' }
      };

      beforeEach(() => {
        mockRedis.get.mockResolvedValue(JSON.stringify(mockOperationState));
      });

      it('should merge updates with existing state', async () => {
        await service.updateOperationState(mockOperationId, updateOptions);

        const expectedUpdatedState = {
          ...mockOperationState,
          currentStep: 'step-2',
          completedSteps: ['step-0', 'step-1'],
          variables: { ...mockOperationState.variables, newValue: 'updated' },
          lastUpdated: expect.any(Date)
        };

        expect(mockRedis.setex).toHaveBeenCalledWith(
          `operation:state:${mockOperationId}`,
          3600,
          JSON.stringify(expectedUpdatedState)
        );

        expect(mockDatabaseService.updateOperationState).toHaveBeenCalledWith(
          mockOperationId,
          expectedUpdatedState,
          updateOptions
        );
      });

      it('should create automatic checkpoint for significant changes', async () => {
        const significantUpdate: StateUpdateOptions = {
          status: 'completed',
          completedSteps: ['step-0', 'step-1', 'step-2']
        };

        await service.updateOperationState(mockOperationId, significantUpdate);

        expect(mockDatabaseService.saveCheckpoint).toHaveBeenCalled();
      });

      it('should throw error when operation not found', async () => {
        mockRedis.get.mockResolvedValueOnce(null);
        mockDatabaseService.getOperationState.mockResolvedValueOnce(null);

        await expect(service.updateOperationState(mockOperationId, updateOptions))
          .rejects.toThrow(`Operation state not found for ${mockOperationId}`);
      });
    });
  });

  describe('Checkpoint Management', () => {
    const mockCheckpoint: Checkpoint = {
      id: 'checkpoint-123',
      stepId: 'step-1',
      type: 'state_snapshot' as any,
      data: {
        timestamp: new Date(),
        version: '1.0',
        operationState: {
          operationId: 'test-op',
          currentStep: 'step-1',
          completedSteps: ['step-0'],
          failedSteps: [],
          variables: {},
          checkpoints: [],
          lastUpdated: new Date()
        }
      },
      timestamp: new Date()
    };

    describe('saveCheckpoint', () => {
      it('should save checkpoint to both Redis and database', async () => {
        await service.saveCheckpoint('test-op', mockCheckpoint);

        // Verify Redis storage
        expect(mockRedis.setex).toHaveBeenCalledWith(
          `operation:checkpoint:test-op:${mockCheckpoint.id}`,
          3600,
          JSON.stringify(mockCheckpoint)
        );

        // Verify database storage
        expect(mockDatabaseService.saveCheckpoint).toHaveBeenCalledWith('test-op', mockCheckpoint);
      });

      it('should validate checkpoint size before saving', async () => {
        const largeCheckpoint = {
          ...mockCheckpoint,
          data: {
            ...mockCheckpoint.data,
            largeData: 'x'.repeat(2000000) // 2MB of data
          }
        };

        await expect(service.saveCheckpoint('test-op', largeCheckpoint))
          .rejects.toThrow('Checkpoint size');
      });

      it('should compress checkpoint when compression is enabled', async () => {
        await service.saveCheckpoint('test-op', mockCheckpoint);

        // Verify that compression flag is added
        const savedCheckpoint = JSON.parse(mockRedis.setex.mock.calls[0][2]);
        expect(savedCheckpoint.data.compressed).toBe(true);
      });

      it('should require checkpoint ID', async () => {
        const checkpointWithoutId = { ...mockCheckpoint, id: undefined };

        await expect(service.saveCheckpoint('test-op', checkpointWithoutId as any))
          .rejects.toThrow('Checkpoint ID is required');
      });
    });

    describe('getCheckpoint', () => {
      it('should retrieve checkpoint from Redis cache first', async () => {
        mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockCheckpoint));

        const result = await service.getCheckpoint('test-op', 'checkpoint-123');

        expect(mockRedis.get).toHaveBeenCalledWith('operation:checkpoint:test-op:checkpoint-123');
        expect(result).toEqual(mockCheckpoint);
      });

      it('should fallback to database when cache miss', async () => {
        mockRedis.get.mockResolvedValueOnce(null);
        mockDatabaseService.getCheckpoint.mockResolvedValueOnce(mockCheckpoint);

        const result = await service.getCheckpoint('test-op', 'checkpoint-123');

        expect(mockDatabaseService.getCheckpoint).toHaveBeenCalledWith('test-op', 'checkpoint-123');
        expect(result).toEqual(mockCheckpoint);

        // Should cache the result
        expect(mockRedis.setex).toHaveBeenCalledWith(
          'operation:checkpoint:test-op:checkpoint-123',
          3600,
          JSON.stringify(mockCheckpoint)
        );
      });

      it('should decompress checkpoint when compression flag is present', async () => {
        const compressedCheckpoint = {
          ...mockCheckpoint,
          data: { ...mockCheckpoint.data, compressed: true }
        };
        mockRedis.get.mockResolvedValueOnce(JSON.stringify(compressedCheckpoint));

        const result = await service.getCheckpoint('test-op', 'checkpoint-123');

        // Should return decompressed checkpoint without compression flag
        expect(result?.data).not.toHaveProperty('compressed');
      });
    });

    describe('listCheckpoints', () => {
      it('should retrieve checkpoints from database and sort by timestamp', async () => {
        const checkpoints = [
          { ...mockCheckpoint, id: 'cp1', timestamp: new Date('2023-01-01') },
          { ...mockCheckpoint, id: 'cp2', timestamp: new Date('2023-01-02') }
        ];
        mockDatabaseService.listCheckpoints.mockResolvedValueOnce(checkpoints);

        const result = await service.listCheckpoints('test-op');

        expect(mockDatabaseService.listCheckpoints).toHaveBeenCalledWith('test-op');
        expect(result).toEqual(checkpoints);
      });
    });

    describe('restoreFromCheckpoint', () => {
      beforeEach(() => {
        mockRedis.get.mockResolvedValue(JSON.stringify(mockCheckpoint));
      });

      it('should restore operation state from checkpoint', async () => {
        const result = await service.restoreFromCheckpoint('test-op', 'checkpoint-123');

        expect(result).toEqual(mockCheckpoint.data.operationState);
        
        // Should update both cache and database
        expect(mockRedis.setex).toHaveBeenCalledWith(
          'operation:state:test-op',
          3600,
          JSON.stringify(mockCheckpoint.data.operationState)
        );

        expect(mockDatabaseService.updateOperationState).toHaveBeenCalledWith(
          'test-op',
          mockCheckpoint.data.operationState,
          {
            metadata: {
              restoredFromCheckpoint: 'checkpoint-123',
              restoredAt: expect.any(Date)
            }
          }
        );
      });

      it('should throw error when checkpoint not found', async () => {
        mockRedis.get.mockResolvedValueOnce(null);
        mockDatabaseService.getCheckpoint.mockResolvedValueOnce(null);

        await expect(service.restoreFromCheckpoint('test-op', 'missing-checkpoint'))
          .rejects.toThrow('Checkpoint missing-checkpoint not found');
      });

      it('should validate checkpoint contains operation state', async () => {
        const invalidCheckpoint = {
          ...mockCheckpoint,
          data: { timestamp: new Date(), version: '1.0' } // Missing operationState
        };
        mockRedis.get.mockResolvedValueOnce(JSON.stringify(invalidCheckpoint));

        await expect(service.restoreFromCheckpoint('test-op', 'checkpoint-123'))
          .rejects.toThrow('does not contain operation state');
      });
    });
  });

  describe('Cleanup and Maintenance', () => {
    describe('cleanupOldStates', () => {
      it('should clean up old states from database and expire cache keys', async () => {
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        mockRedis.keys.mockResolvedValueOnce(['operation:state:op1', 'operation:state:op2']);
        mockRedis.ttl.mockResolvedValueOnce(-1).mockResolvedValueOnce(3600);

        await service.cleanupOldStates(maxAge);

        // Should delete old states from database
        expect(mockDatabaseService.deleteOldOperationStates).toHaveBeenCalledWith(
          expect.any(Date)
        );

        // Should set expiration on cache keys without TTL
        expect(mockRedis.expire).toHaveBeenCalledWith('operation:state:op1', 3600);
        expect(mockRedis.expire).not.toHaveBeenCalledWith('operation:state:op2');
      });

      it('should use default maxAge when not provided', async () => {
        await service.cleanupOldStates();

        expect(mockDatabaseService.deleteOldOperationStates).toHaveBeenCalledWith(
          expect.any(Date)
        );
      });
    });

    describe('getStateStatistics', () => {
      it('should return comprehensive state statistics', async () => {
        const result = await service.getStateStatistics();

        expect(result).toEqual({
          totalOperations: 100,
          activeOperations: 15,
          totalCheckpoints: 50,
          cacheHitRate: 100 / (100 + 20), // Based on mocked Redis info
          averageStateSize: 2048
        });

        expect(mockDatabaseService.getStateStatistics).toHaveBeenCalled();
        expect(mockRedis.info).toHaveBeenCalledWith('stats');
      });

      it('should handle zero cache operations gracefully', async () => {
        mockRedis.info.mockResolvedValueOnce('keyspace_hits:0\r\nkeyspace_misses:0\r\n');

        const result = await service.getStateStatistics();

        expect(result.cacheHitRate).toBe(0);
      });
    });
  });

  describe('Health Check', () => {
    it('should return comprehensive health status', async () => {
      const result = await service.healthCheck();

      expect(result).toEqual({
        redis: true,
        database: true,
        overall: true
      });

      expect(mockDatabaseService.healthCheck).toHaveBeenCalled();
    });

    it('should return false overall status when any component is unhealthy', async () => {
      mockDatabaseService.healthCheck.mockResolvedValueOnce({
        status: 'unhealthy',
        details: { connected: false }
      });

      const result = await service.healthCheck();

      expect(result).toEqual({
        redis: true,
        database: false,
        overall: false
      });
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup Redis connection gracefully', async () => {
      await service.cleanup();

      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockRedis.quit.mockRejectedValueOnce(new Error('Connection already closed'));

      await expect(service.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('Cache Performance', () => {
    it('should handle high-frequency state updates efficiently', async () => {
      // Setup initial state
      mockRedis.get.mockResolvedValue(JSON.stringify({
        operationId: 'high-freq-op',
        currentStep: 'step-0',
        completedSteps: [],
        failedSteps: [],
        variables: {},
        checkpoints: [],
        lastUpdated: new Date()
      }));

      // Perform multiple rapid updates
      const updates = Array.from({ length: 10 }, (_, i) => 
        service.updateOperationState('high-freq-op', {
          currentStep: `step-${i}`,
          variables: { counter: i }
        })
      );

      await Promise.all(updates);

      // Should cache efficiently
      expect(mockRedis.setex).toHaveBeenCalledTimes(10);
      expect(mockDatabaseService.updateOperationState).toHaveBeenCalledTimes(10);
    });

    it('should handle concurrent checkpoint operations safely', async () => {
      const baseCheckpoint: Checkpoint = {
        id: 'checkpoint-base',
        stepId: 'step-base',
        type: 'state_snapshot' as any,
        data: {
          timestamp: new Date(),
          version: '1.0',
          operationState: {
            operationId: 'test-op',
            currentStep: 'step-1',
            completedSteps: [],
            failedSteps: [],
            variables: {},
            checkpoints: [],
            lastUpdated: new Date()
          }
        },
        timestamp: new Date()
      };

      const checkpoints = Array.from({ length: 5 }, (_, i) => ({
        ...baseCheckpoint,
        id: `checkpoint-${i}`,
        stepId: `step-${i}`
      }));

      const saveOperations = checkpoints.map(cp => 
        service.saveCheckpoint('test-op', cp)
      );

      await Promise.all(saveOperations);

      expect(mockRedis.setex).toHaveBeenCalledTimes(5);
      expect(mockDatabaseService.saveCheckpoint).toHaveBeenCalledTimes(5);
    });
  });

  describe('Error Resilience', () => {
    it('should continue operating when Redis is temporarily unavailable', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis timeout'));
      mockDatabaseService.getOperationState.mockResolvedValueOnce({
        operationId: 'test-op',
        currentStep: 'step-1',
        completedSteps: [],
        failedSteps: [],
        variables: {},
        checkpoints: [],
        lastUpdated: new Date()
      });

      const result = await service.getOperationState('test-op');

      expect(result).toBeDefined();
      expect(mockDatabaseService.getOperationState).toHaveBeenCalled();
    });

    it('should handle database failures gracefully during state operations', async () => {
      mockDatabaseService.saveOperationState.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.initializeOperationState('test-op', {
        operationId: 'test-op',
        currentStep: 'step-1',
        completedSteps: [],
        failedSteps: [],
        variables: {},
        checkpoints: [],
        lastUpdated: new Date()
      })).rejects.toThrow('Failed to initialize operation state');
    });
  });
});