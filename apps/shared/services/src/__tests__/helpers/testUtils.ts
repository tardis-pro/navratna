import type { Mock, Mocked } from 'vitest';
import { DatabaseService } from '../../database/DatabaseService';
import { EventBusService } from '../../eventBusService';

interface MockRepository<T = unknown> {
  find: Mock;
  findOne: Mock;
  findOneBy: Mock;
  findBy: Mock;
  save: Mock;
  create: Mock;
  update: Mock;
  delete: Mock;
  remove: Mock;
  count: Mock;
  createQueryBuilder: Mock;
  query: Mock;
  clear: Mock;
  insert: Mock;
  upsert: Mock;
  reload: Mock;
  _entity?: T;
}

interface MockPool {
  query: Mock;
  connect: Mock;
  end: Mock;
}

export namespace TestUtils {
  export function createMockRepository<T>(): MockRepository<T> {
    return {
      find: vi.fn(),
      findOne: vi.fn(),
      findOneBy: vi.fn(),
      findBy: vi.fn(),
      save: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      remove: vi.fn(),
      count: vi.fn(),
      createQueryBuilder: vi.fn(),
      query: vi.fn(),
      clear: vi.fn(),
      insert: vi.fn(),
      upsert: vi.fn(),
      reload: vi.fn(),
    };
  }

  export function createMockPool(): MockPool {
    return {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
      end: vi.fn().mockResolvedValue(undefined),
    };
  }

  export function createMockDataSource(): MockPool {
    return TestUtils.createMockPool();
  }

  export function createMockDatabaseService(): Mocked<DatabaseService> {
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      isInitialized: vi.fn().mockReturnValue(true),
      seedDatabase: vi.fn().mockResolvedValue(undefined),
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
      getInstance: vi.fn(),
      transaction: vi.fn().mockImplementation(async (fn) => await fn({})),
    } as unknown as never;
  }

  export function createMockEventBusService(): Mocked<EventBusService> {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      createChannel: vi.fn().mockResolvedValue({}),
      isConnected: vi.fn().mockReturnValue(true),
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
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
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
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
