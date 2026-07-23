import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscussionService } from '../../discussion_service';
import type { CreateDiscussionRequest } from '@uaip/types';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/event_bus';
import { PersonaService } from '../../persona_service';

describe('DiscussionService - Artifact Config Merge and Persistence', () => {
  const mockDatabaseService = Object.assign(Object.create(DatabaseService.prototype), {
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  });

  const mockEventBusService = Object.assign(Object.create(EventBusService.prototype), {
    publish: vi.fn(),
  });

  const mockPersonaService = Object.create(PersonaService.prototype);

  let service: DiscussionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DiscussionService({
      databaseService: mockDatabaseService,
      eventBusService: mockEventBusService,
      personaService: mockPersonaService,
    });
    mockDatabaseService.create.mockImplementation((_table: string, data: Record<string, unknown>) => ({
      ...data,
      id: 'discussion-test-id',
    }));
    mockDatabaseService.findById.mockResolvedValue({ id: 'agent-1', personaId: 'persona-1' });
    mockDatabaseService.findMany.mockResolvedValue([]);
    mockDatabaseService.update.mockResolvedValue({ id: 'discussion-test-id' });
  });

  it('merges artifactConfig, setting enabled and generateOnCompletion correctly when top-level overrides metadata', async () => {
    const request = {
      title: 'Test Discussion',
      topic: 'Test Topic',
      createdBy: '3b0923f1-d14f-4d43-9878-831dd4c800b4',
      initialParticipants: [{ agentId: '3b0923f1-d14f-4d43-9878-831dd4c800b5' }],
      metadata: {
        customField: 'hallo',
        artifactConfig: {
          enabled: true,
          artifactType: 'documentation' as const,
          generateOnCompletion: true,
          requiresApproval: false,
          metadata: {
            theme: 'dark',
          },
        },
      },
      artifactConfig: {
        enabled: true,
        artifactType: 'prd' as const,
        generateOnCompletion: true,
        requiresApproval: true,
        metadata: {
          scope: 'full',
        },
      },
    } satisfies CreateDiscussionRequest;

    const result = await service.createDiscussion(request);

    expect(result.metadata?.customField).toBe('hallo');
    expect(result.metadata?.artifactConfig).toEqual({
      enabled: true,
      generateOnCompletion: true,
      artifactType: 'prd',
      requiresApproval: true,
      autoShare: true,
      metadata: {
        theme: 'dark',
        scope: 'full',
      },
    });
  });

  it('keeps enabled: false if either top-level or metadata has enabled: false', async () => {
    const request1 = {
      title: 'Test Discussion',
      topic: 'Test Topic',
      createdBy: '3b0923f1-d14f-4d43-9878-831dd4c800b4',
      initialParticipants: [{ agentId: '3b0923f1-d14f-4d43-9878-831dd4c800b5' }],
      metadata: {
        artifactConfig: {
          enabled: true,
        },
      },
      artifactConfig: {
        enabled: false,
      },
    } satisfies CreateDiscussionRequest;

    const result1 = await service.createDiscussion(request1);
    expect(result1.metadata?.artifactConfig.enabled).toBe(false);

    const request2 = {
      title: 'Test Discussion 2',
      topic: 'Test Topic',
      createdBy: '3b0923f1-d14f-4d43-9878-831dd4c800b4',
      initialParticipants: [{ agentId: '3b0923f1-d14f-4d43-9878-831dd4c800b5' }],
      metadata: {
        artifactConfig: {
          enabled: false,
        },
      },
      artifactConfig: {
        enabled: true,
      },
    } satisfies CreateDiscussionRequest;

    const result2 = await service.createDiscussion(request2);
    expect(result2.metadata?.artifactConfig.enabled).toBe(false);
  });

  it('preserves generateOnCompletion: false if either side is false', async () => {
    const request1 = {
      title: 'Test Discussion',
      topic: 'Test Topic',
      createdBy: '3b0923f1-d14f-4d43-9878-831dd4c800b4',
      initialParticipants: [{ agentId: '3b0923f1-d14f-4d43-9878-831dd4c800b5' }],
      metadata: {
        artifactConfig: {
          generateOnCompletion: false,
        },
      },
      artifactConfig: {
        generateOnCompletion: true,
      },
    } satisfies CreateDiscussionRequest;

    const result1 = await service.createDiscussion(request1);
    expect(result1.metadata?.artifactConfig.generateOnCompletion).toBe(false);

    const request2 = {
      title: 'Test Discussion 2',
      topic: 'Test Topic',
      createdBy: '3b0923f1-d14f-4d43-9878-831dd4c800b4',
      initialParticipants: [{ agentId: '3b0923f1-d14f-4d43-9878-831dd4c800b5' }],
      metadata: {
        artifactConfig: {
          generateOnCompletion: true,
        },
      },
      artifactConfig: {
        generateOnCompletion: false,
      },
    } satisfies CreateDiscussionRequest;

    const result2 = await service.createDiscussion(request2);
    expect(result2.metadata?.artifactConfig.generateOnCompletion).toBe(false);
  });
});
