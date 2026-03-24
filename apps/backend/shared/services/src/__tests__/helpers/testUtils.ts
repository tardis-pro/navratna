// Jest is globally available
import { Repository, DataSource } from 'typeorm';
import { DatabaseService } from '../../database/DatabaseService';
import { EventBusService } from '../../eventBusService';

export namespace TestUtils {
  export function createMockRepository<T>(): jest.Mocked<Repository<T>> {
    return {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      findBy: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: {} as unknown as EntityManager,
      metadata: {} as unknown as EntityMetadata,
      target: {} as unknown as EntityTarget<unknown>,
      query: jest.fn(),
      clear: jest.fn(),
      increment: jest.fn(),
      decrement: jest.fn(),
      sum: jest.fn(),
      average: jest.fn(),
      minimum: jest.fn(),
      maximum: jest.fn(),
      findAndCount: jest.fn(),
      findAndCountBy: jest.fn(),
      findOneOrFail: jest.fn(),
      findOneByOrFail: jest.fn(),
      countBy: jest.fn(),
      sumBy: jest.fn(),
      averageBy: jest.fn(),
      minimumBy: jest.fn(),
      maximumBy: jest.fn(),
      exist: jest.fn(),
      existsBy: jest.fn(),
      softDelete: jest.fn(),
      softRemove: jest.fn(),
      recover: jest.fn(),
      restore: jest.fn(),
      insert: jest.fn(),
      upsert: jest.fn(),
      preload: jest.fn(),
      merge: jest.fn(),
      getId: jest.fn(),
      hasId: jest.fn(),
      reload: jest.fn(),
    } as jest.Mocked<Repository<T>>;
  }

  export function createMockDataSource(): jest.Mocked<DataSource> {
    return {
      initialize: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      isInitialized: true,
      synchronize: jest.fn().mockResolvedValue(undefined),
      dropDatabase: jest.fn().mockResolvedValue(undefined),
      runMigrations: jest.fn().mockResolvedValue([]),
      undoLastMigration: jest.fn().mockResolvedValue(undefined),
      showMigrations: jest.fn().mockResolvedValue(false),
      hasMetadata: jest.fn().mockReturnValue(true),
      getRepository: jest.fn().mockImplementation(() => TestUtils.createMockRepository()),
      getTreeRepository: jest.fn(),
      getMongoRepository: jest.fn(),
      createQueryBuilder: jest.fn(),
      createQueryRunner: jest.fn(),
      manager: {} as unknown as EntityManager,
      options: {} as unknown as never,
      logger: {} as unknown as never,
      migrations: [],
      subscribers: [],
      entityMetadatas: [],
      driver: {} as unknown as never,
      relationLoader: {} as unknown as never,
      relationIdLoader: {} as unknown as never,
      entityMetadataValidator: {} as unknown as never,
      queryResultCache: {} as unknown as never,
      namingStrategy: {} as unknown as never,
      metadataTableName: 'migrations',
      migrationsTableName: 'migrations',
      metadataColumnsCache: new Map(),
      relationCountColumnsCache: new Map(),
      relationIdColumnsCache: new Map(),
      selectQueryBuilder: {} as unknown as never,
      isConnected: true,
      name: 'test',
      sqljsManager: {} as unknown as never,
      setOptions: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      transaction: jest.fn().mockImplementation(async (fn) => await fn({})),
    } as unknown as never;
  }

  export function createMockDatabaseService(): jest.Mocked<DatabaseService> {
    return {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      isInitialized: jest.fn().mockReturnValue(true),
      seedDatabase: jest.fn().mockResolvedValue(undefined),
      users: TestUtils.createMockRepository(),
      refreshTokens: TestUtils.createMockRepository(),
      passwordResetTokens: TestUtils.createMockRepository(),
      audit: TestUtils.createMockRepository(),
      tools: TestUtils.createMockRepository(),
      toolExecutions: TestUtils.createMockRepository(),
      toolUsage: TestUtils.createMockRepository(),
      operations: TestUtils.createMockRepository(),
      operationStates: TestUtils.createMockRepository(),
      operationCheckpoints: TestUtils.createMockRepository(),
      stepResults: TestUtils.createMockRepository(),
      agents: TestUtils.createMockRepository(),
      securityPolicies: TestUtils.createMockRepository(),
      approvalWorkflows: TestUtils.createMockRepository(),
      approvalDecisions: TestUtils.createMockRepository(),
      capabilities: TestUtils.createMockRepository(),
      llmProviders: TestUtils.createMockRepository(),
      userLLMProviders: TestUtils.createMockRepository(),
      getInstance: jest.fn(),
      transaction: jest.fn().mockImplementation(async (fn) => await fn({})),
    } as unknown as never;
  }

  export function createMockEventBusService(): jest.Mocked<EventBusService> {
    return {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      createChannel: jest.fn().mockResolvedValue({}),
      isConnected: jest.fn().mockReturnValue(true),
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as never;
  }

  export async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  export function generateRandomString(length: number = 10): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  export function generateRandomEmail(): string {
    return `test.${generateRandomString(8)}@example.com`;
  }

  export function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c == 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  export function createMockLogger() {
    return {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  }

  export function expectError(
    fn: () => unknown,
    expectedErrorType?: new (...args: unknown[]) => Error
  ): void {
    expect(fn).toThrow();
    if (expectedErrorType) {
      expect(fn).toThrow(expectedErrorType);
    }
  }

  export async function expectAsyncError(
    fn: () => Promise<unknown>,
    expectedErrorType?: new (...args: unknown[]) => Error
  ): Promise<void> {
    await expect(fn()).rejects.toThrow();
    if (expectedErrorType) {
      await expect(fn()).rejects.toThrow(expectedErrorType);
    }
  }
}

export const mockDatabaseService = TestUtils.createMockDatabaseService();
export const mockEventBusService = TestUtils.createMockEventBusService();
