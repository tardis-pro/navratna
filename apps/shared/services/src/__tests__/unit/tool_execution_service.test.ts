/**
 * Unit tests for ToolExecutionService
 * Tests event publishing, idempotency key generation, and execution flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolExecutionService } from '../../tool_execution_service';
import { DatabaseService } from '../../database_service';
import { EventBusService } from '../../event_bus_service';
import { ToolExecutionStatus } from '@uaip/types';

// Mock dependencies
const mockDatabaseService = {
  tools: {
    createToolExecution: vi.fn(),
    getToolExecution: vi.fn(),
    updateToolExecution: vi.fn(),
  },
};

const mockEventBus = {
  publish: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
};

describe('ToolExecutionService', () => {
  let service: ToolExecutionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ToolExecutionService(
      mockDatabaseService as unknown as DatabaseService,
      mockEventBus as unknown as EventBusService
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('executeTool', () => {
    it('should create execution record and publish event', async () => {
      mockDatabaseService.tools.createToolExecution.mockResolvedValue(undefined);

      const result = await service.executeTool(
        'test-tool',
        'agent-123',
        { param1: 'value1' },
        { priority: 'high' }
      );

      expect(result.toolId).toBe('test-tool');
      expect(result.agentId).toBe('agent-123');
      expect(result.status).toBe(ToolExecutionStatus.PENDING);
      expect(result.metadata?.priority).toBe('high');
      expect(result.metadata?.idempotencyKey).toBeDefined();
      expect(result.metadata?.correlationId).toBeDefined();

      expect(mockDatabaseService.tools.createToolExecution).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'tool.execute.request',
        expect.objectContaining({
          toolId: 'test-tool',
          agentId: 'agent-123',
          parameters: { param1: 'value1' },
        }),
        expect.any(Object)
      );
    });

    it('should handle object-style parameters', async () => {
      mockDatabaseService.tools.createToolExecution.mockResolvedValue(undefined);

      const result = await service.executeTool({
        toolId: 'search-tool',
        operation: 'web-search',
        parameters: { query: 'test' },
        userId: 'user-456',
      });

      expect(result.toolId).toBe('search-tool');
      expect(result.agentId).toBe('user-456');
    });

    it('should handle errors gracefully', async () => {
      mockDatabaseService.tools.createToolExecution.mockRejectedValue(new Error('DB error'));

      await expect(service.executeTool('failing-tool', 'agent-1', {})).rejects.toThrow('DB error');
    });
  });

  describe('idempotency', () => {
    it('should generate consistent keys for same inputs', async () => {
      mockDatabaseService.tools.createToolExecution.mockResolvedValue(undefined);

      const r1 = await service.executeTool('tool-a', 'agent-1', { x: 1 });
      const r2 = await service.executeTool('tool-a', 'agent-1', { x: 1 });

      expect(r1.metadata?.idempotencyKey).toBe(r2.metadata?.idempotencyKey);
    });

    it('should generate different keys for different parameters', async () => {
      mockDatabaseService.tools.createToolExecution.mockResolvedValue(undefined);

      const r1 = await service.executeTool('tool-a', 'agent-1', { x: 1 });
      const r2 = await service.executeTool('tool-a', 'agent-1', { x: 2 });

      expect(r1.metadata?.idempotencyKey).not.toBe(r2.metadata?.idempotencyKey);
    });
  });

  describe('getExecution', () => {
    it('should return execution from database', async () => {
      const mockExecution = {
        id: 'exec-123',
        toolId: 'test-tool',
        status: ToolExecutionStatus.COMPLETED,
      };
      mockDatabaseService.tools.getToolExecution.mockResolvedValue(mockExecution);

      const result = await service.getExecution('exec-123');

      expect(result).toEqual(mockExecution);
    });

    it('should return null on error', async () => {
      mockDatabaseService.tools.getToolExecution.mockRejectedValue(new Error('Not found'));

      const result = await service.getExecution('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateExecution', () => {
    it('should update execution in database', async () => {
      mockDatabaseService.tools.updateToolExecution.mockResolvedValue(undefined);

      await service.updateExecution('exec-123', { status: ToolExecutionStatus.COMPLETED });

      expect(mockDatabaseService.tools.updateToolExecution).toHaveBeenCalledWith('exec-123', {
        result: undefined,
        error: undefined,
      });
    });
  });

  describe('cancelExecution', () => {
    it('should cancel execution', async () => {
      mockDatabaseService.tools.updateToolExecution.mockResolvedValue(undefined);

      await service.cancelExecution('exec-123');

      expect(mockDatabaseService.tools.updateToolExecution).toHaveBeenCalledWith(
        'exec-123',
        expect.objectContaining({ result: undefined, error: undefined })
      );
    });
  });
});
