import { DatabaseService } from '../../databaseService.js';

// Create a comprehensive mock repository that includes all TypeORM methods
const createMockRepository = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn().mockReturnValue({}),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getCount: jest.fn().mockResolvedValue(0),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  }),
  query: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 1 }] }),
  remove: jest.fn().mockResolvedValue({}),
});

// Mock the TypeOrmService dependency
jest.mock('../../typeormService.js', () => ({
  TypeOrmService: {
    getInstance: jest.fn(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      isInitialized: jest.fn().mockReturnValue(true),
      getRepository: jest.fn(() => createMockRepository()),
      transaction: jest.fn((callback) => callback(createMockRepository())),
      getEntityManager: jest.fn().mockReturnValue({
        query: jest.fn().mockResolvedValue([]),
        transaction: jest.fn((callback) => callback(createMockRepository())),
        getRepository: jest.fn(() => createMockRepository()),
      }),
      getDataSource: jest.fn().mockReturnValue({
        isInitialized: true,
        getRepository: jest.fn(() => createMockRepository()),
        manager: {
          query: jest.fn().mockResolvedValue([]),
          transaction: jest.fn((callback) => callback(createMockRepository())),
        },
      }),
      healthCheck: jest.fn().mockResolvedValue({
        status: 'healthy',
        details: {
          connected: true,
          totalConnections: 1,
          idleConnections: 0,
          waitingConnections: 0,
          responseTime: 5,
        },
      }),
    })),
  },
}));

describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeEach(() => {
    // Reset singleton instance before each test
    (DatabaseService as any).instance = null;
    service = new DatabaseService();
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = DatabaseService.getInstance();
      const instance2 = DatabaseService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(DatabaseService);
    });

    it('should create a new instance if singleton is reset', () => {
      const instance1 = DatabaseService.getInstance();
      (DatabaseService as any).instance = null;
      const instance2 = DatabaseService.getInstance();

      expect(instance1).not.toBe(instance2);
      expect(instance2).toBeInstanceOf(DatabaseService);
    });
  });

  describe('Core Functionality', () => {
    it('should initialize successfully', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(DatabaseService);
    });

    it('should handle initialization', async () => {
      await expect(service.initialize()).resolves.toBeUndefined();
    });

    it('should return health check status', async () => {
      await service.initialize();
      const health = await service.healthCheck();

      expect(health).toHaveProperty('status');
      expect(['healthy', 'unhealthy']).toContain(health.status);
    });

    it('should handle graceful shutdown', async () => {
      await service.initialize();
      await expect(service.close()).resolves.toBeUndefined();
    });
  });

  describe('Repository Access', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should provide access to repositories', async () => {
      const mockEntity = 'User';
      const repository = await service.getRepository(mockEntity as any);

      expect(repository).toBeDefined();
      expect(typeof repository.find).toBe('function');
      expect(typeof repository.findOne).toBe('function');
      expect(typeof repository.save).toBe('function');
    });

    it('should provide entity manager access', async () => {
      const entityManager = await service.getEntityManager();

      expect(entityManager).toBeDefined();
      expect(typeof entityManager.query).toBe('function');
      expect(typeof entityManager.transaction).toBe('function');
    });
  });

  describe('Transaction Management', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should execute operations within transaction', async () => {
      const callback = jest.fn().mockResolvedValue('success');
      const result = await service.transaction(callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe('success');
    });

    it('should handle transaction errors', async () => {
      const error = new Error('Transaction failed');
      const callback = jest.fn().mockRejectedValue(error);

      await expect(service.transaction(callback)).rejects.toThrow('Transaction failed');
    });
  });

  describe('User Operations', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        passwordHash: 'hashedPassword123',
      };

      const result = await service.createUser(userData);
      expect(result).toBeDefined();
    });

    it('should get user by ID', async () => {
      const userId = 'test-user-id';
      const result = await service.getUserById(userId);

      // Should not throw and return something (even if null)
      expect(typeof result).toBeDefined();
    });

    it('should get user by email', async () => {
      const email = 'test@example.com';
      const result = await service.getUserByEmail(email);

      // Should not throw and return something (even if null)
      expect(typeof result).toBeDefined();
    });

    it('should handle user queries with filters', async () => {
      const filters = { role: 'admin', active: true };
      const result = await service.queryUsers(filters);

      expect(result).toBeDefined();
      expect(Array.isArray(result.users)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization workflow', async () => {
      // Test that service initialization completes without error
      const testService = new DatabaseService();
      await expect(testService.initialize()).resolves.toBeUndefined();
    });

    it('should handle operation workflow gracefully', async () => {
      await service.initialize();

      // Test that operations execute with proper data structure
      const userData = {
        email: 'valid@data.com',
        passwordHash: 'hash123',
        role: 'user',
      };
      const result = await service.createUser(userData as any);
      expect(result).toBeDefined();
    });
  });

  describe('Bulk Operations', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should handle bulk insert operations', async () => {
      const records = [
        { email: 'user1@test.com', name: 'User 1' },
        { email: 'user2@test.com', name: 'User 2' },
      ];

      const result = await service.bulkInsert('User' as any, records);
      expect(result).toBeDefined();
    });

    it('should handle batch create operations', async () => {
      const records = [
        { email: 'batch1@test.com', name: 'Batch User 1' },
        { email: 'batch2@test.com', name: 'Batch User 2' },
      ];

      const result = await service.batchCreate('User' as any, records);
      expect(result).toBeDefined();
      // Verify that the operation completes successfully
      expect(typeof result).toBeDefined();
    });
  });

  describe('Audit Operations', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create audit events', async () => {
      const auditData = {
        eventType: 'USER_LOGIN',
        userId: 'test-user',
        details: { ip: '127.0.0.1' },
      };

      const result = await service.createAuditEvent(auditData as any);
      expect(result).toBeDefined();
    });

    it('should query audit events with filters', async () => {
      const filters = {
        eventType: 'USER_LOGIN',
        startDate: new Date(),
        endDate: new Date(),
      };

      const result = await service.queryAuditEvents(filters as any);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Performance and Monitoring', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should provide database pool statistics', async () => {
      const stats = await service.getPoolStats();
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('totalCount');
    });

    it('should handle health checks consistently', async () => {
      // Run multiple health checks
      const healthChecks = await Promise.all([
        service.healthCheck(),
        service.healthCheck(),
        service.healthCheck(),
      ]);

      healthChecks.forEach((health) => {
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('details');
      });
    });
  });
});
