import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Elysia } from 'elysia';

process.env.JWT_SECRET = 'test-secret-32-chars-long-enough';

vi.mock('@uaip/shared-services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/shared-services')>();
  return {
    ...actual,
    ParticipantManagementService: class {
      async backfillDiscussionPersonaIds() {}
    },
  };
});

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>();
  return {
    ...actual,
    isRecord: (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value),
  };
});

vi.mock('@uaip/middleware', () => ({
  withRequiredAuth: (app: Elysia) => app,
  withOptionalAuth: (app: Elysia) => app,
  withAdminGuard: (app: Elysia) => app,
  attachAuth: (app: Elysia) => app,
  requireAuth: (app: Elysia) => app,
  getNginxUser: () => ({ id: 'user-creator-1', email: 'test@example.com', role: 'admin' }),
}));

import { DiscussionOrchestrationService } from '../../services/discussion_orchestration_service.js';
import { DiscussionService, EventBusService } from '@uaip/shared-services';
import {
  DiscussionSchema,
  DiscussionStatus,
  TurnStrategy,
  DiscussionVisibility,
  type Discussion,
} from '@uaip/types';

describe('DiscussionOrchestrationService - Completion Event Emission', () => {
  const discussionId = 'disc-prd-123';
  const mockDiscussion: Discussion = DiscussionSchema.parse({
    id: discussionId,
    title: 'PRD Discussion Title',
    description: 'Discussion for PRD generation',
    topic: 'Product Specs',
    status: DiscussionStatus.ACTIVE,
    createdBy: 'user-creator-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    turnStrategy: {
      strategy: TurnStrategy.ROUND_ROBIN,
      config: { type: 'round_robin', skipInactive: true, maxSkips: 3 },
    },
    settings: {
      maxParticipants: 10,
      autoModeration: true,
      requireApproval: false,
      allowInvites: true,
      allowFileSharing: true,
      allowAnonymous: false,
      recordTranscript: true,
      enableAnalytics: true,
      turnTimeout: 30,
      responseTimeout: 30,
      moderationRules: [],
    },
    visibility: DiscussionVisibility.PRIVATE,
    organizationId: 'org-1',
    teamId: 'team-1',
    state: {
      messageCount: 5,
      activeParticipants: 0,
      phase: 'discussion',
      lastActivity: new Date(),
      currentTurn: { turnNumber: 2 },
      consensusLevel: 0,
      engagementScore: 0,
      topicDrift: 0,
      keyPoints: [],
      decisions: [],
      actionItems: [],
    },
    participants: [],
    metadata: {
      artifactConfig: {
        enabled: true,
        artifactType: 'prd',
        generateOnCompletion: true,
        requiresApproval: false,
        autoShare: true,
      },
    },
  });

  const publish = vi.fn(async () => undefined);
  const discussionService = Object.assign(Object.create(DiscussionService.prototype), {
    endDiscussion: vi.fn(async () => {
      mockDiscussion.status = DiscussionStatus.COMPLETED;
      return mockDiscussion;
    }),
    getDiscussion: vi.fn(async () => mockDiscussion),
    getDiscussionMessages: vi.fn(async () => []),
  });
  const eventBusService = Object.assign(Object.create(EventBusService.prototype), {
    publish,
  });
  let orchestrationService: DiscussionOrchestrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscussion.status = DiscussionStatus.ACTIVE;
    orchestrationService = new DiscussionOrchestrationService(
      discussionService,
      eventBusService
    );
  });

  it("emits discussion.completed with artifactType 'prd' and generateOnCompletion true", async () => {
    const result = await orchestrationService.stopDiscussion(
      discussionId,
      'user-creator-1'
    );

    expect(result.success).toBe(true);
    expect(publish).toHaveBeenCalledWith(
      'discussion.completed',
      expect.objectContaining({
        discussionId,
        artifactGeneration: expect.objectContaining({
          artifactType: 'prd',
          generateOnCompletion: true,
        }),
      })
    );

    await orchestrationService.cleanup();
  });
});
