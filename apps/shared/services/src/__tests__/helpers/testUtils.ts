// Jest is globally available
import { DatabaseService } from '../../database/DatabaseService';
import { EventBusService } from '../../eventBusService';

interface MockRepository<T = unknown> {
  find: jest.Mock;
  findOne: jest.Mock;
  findOneBy: jest.Mock;
  findBy: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  remove: jest.Mock;
  count: jest.Mock;
  createQueryBuilder: jest.Mock;
  query: jest.Mock;
  clear: jest.Mock;
  insert: jest.Mock;
  upsert: jest.Mock;
  reload: jest.Mock;
  _entity?: T;
}

interface MockPool {
  query: jest.Mock;
  connect: jest.Mock;
  end: jest.Mock;
}

export namespace TestUtils {
  export function createMockRepository<T>(): MockRepository<T> {
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
      query: jest.fn(),
      clear: jest.fn(),
      insert: jest.fn(),
      upsert: jest.fn(),
      reload: jest.fn(),
    };
  }

  export function createMockPool(): MockPool {
    return {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
      end: jest.fn().mockResolvedValue(undefined),
    };
  }

  export function createMockDataSource(): MockPool {
    return TestUtils.createMockPool();
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
