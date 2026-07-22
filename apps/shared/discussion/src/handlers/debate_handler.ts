import { Server } from 'socket.io';
import { DebateOrchestratorService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/infra/event_bus';
import { logger } from '@uaip/utils';
import {
  ArgumentSchema,
  VoteSchema,
  ConsensusResultSchema,
  type Argument,
  type Vote,
  type ConsensusResult,
} from '@uaip/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseArgument(value: unknown): Argument | null {
  const parsed = ArgumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseVote(value: unknown): Vote | null {
  const parsed = VoteSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseConsensus(value: unknown): ConsensusResult | null {
  const parsed = ConsensusResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class DebateHandler {
  private io: Server;
  private eventBus: EventBusService;
  private debateOrchestrator: DebateOrchestratorService;

  constructor(io: Server, eventBus: EventBusService) {
    this.io = io;
    this.eventBus = eventBus;
    this.debateOrchestrator = DebateOrchestratorService.getInstance();
    this.setupEventSubscriptions();
  }

  private setupEventSubscriptions(): void {
    // Broadcast debate events to WebSocket clients
    this.eventBus.subscribe('debate.started', async (event) => {
      const raw = event.data;
      if (!isRecord(raw)) return;
      const data = raw;
      const discussionId = typeof data['discussionId'] === 'string' ? data['discussionId'] : undefined;
      this.broadcastToDiscussion(discussionId, 'debate:started', data);
    });

    this.eventBus.subscribe('debate.argument.added', async (event) => {
      const raw = event.data;
      if (!isRecord(raw)) return;
      const data = raw;
      const argument = parseArgument(data['argument']);
      if (!argument) {
        logger.warn('Invalid debate argument payload ignored', { data });
        return;
      }
      const debateId = typeof data['debateId'] === 'string' ? data['debateId'] : '';
      const debate = this.debateOrchestrator.getDebate(debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:argument', {
          ...data,
          argument,
        });
      }
    });

    this.eventBus.subscribe('debate.vote.added', async (event) => {
      const raw = event.data;
      if (!isRecord(raw)) return;
      const data = raw;
      const vote = parseVote(data['vote']);
      if (!vote) {
        logger.warn('Invalid debate vote payload ignored', { data });
        return;
      }
      const debateId = typeof data['debateId'] === 'string' ? data['debateId'] : '';
      const debate = this.debateOrchestrator.getDebate(debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:vote', {
          ...data,
          vote,
        });
      }
    });

    this.eventBus.subscribe('debate.concluded', async (event) => {
      const raw = event.data;
      if (!isRecord(raw)) return;
      const data = raw;
      const debateId = typeof data['debateId'] === 'string' ? data['debateId'] : '';
      const consensus = parseConsensus(data['consensus']);
      if (!consensus) {
        logger.warn('Invalid debate consensus payload ignored', { data });
        return;
      }
      const debate = this.debateOrchestrator.getDebate(debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:concluded', {
          debateId,
          consensus,
          metadata: data['metadata'],
        });
      }
    });

    // Handle debate argument requests - route to agents
    this.eventBus.subscribe('debate.argument.request', async (event) => {
      const raw = event.data;
      if (!isRecord(raw)) return;
      const data = raw;
      await this.eventBus.publish('agent.discussion.participate', {
        agentId: typeof data['agentId'] === 'string' ? data['agentId'] : '',
        discussionId: typeof data['debateId'] === 'string' ? data['debateId'] : '',
        prompt: typeof data['prompt'] === 'string' ? data['prompt'] : '',
        systemPrompt: typeof data['systemPrompt'] === 'string' ? data['systemPrompt'] : '',
        responseType: 'debate_argument',
      });
    });

    // Handle debate vote requests
    this.eventBus.subscribe('debate.vote.request', async (event) => {
      const raw = event.data;
      if (!isRecord(raw)) return;
      const data = raw;
      await this.eventBus.publish('agent.discussion.participate', {
        agentId: typeof data['agentId'] === 'string' ? data['agentId'] : '',
        discussionId: typeof data['debateId'] === 'string' ? data['debateId'] : '',
        prompt: typeof data['prompt'] === 'string' ? data['prompt'] : '',
        systemPrompt: typeof data['systemPrompt'] === 'string' ? data['systemPrompt'] : '',
        responseType: 'debate_vote',
      });
    });

    logger.info('Debate event subscriptions initialized');
  }

  private broadcastToDiscussion(
    discussionId: string | undefined,
    event: string,
    data: unknown
  ): void {
    if (!discussionId) return;
    this.io.to(`discussion:${discussionId}`).emit(event, data);
  }

  /**
   * Start a debate within a discussion
   */
  async startDebateInDiscussion(
    discussionId: string,
    topic: string,
    proposition: string,
    participants: string[]
  ): Promise<string> {
    const debate = await this.debateOrchestrator.startDebate(
      topic,
      proposition,
      participants,
      discussionId
    );

    return debate.id;
  }

  /**
   * Get debate status
   */
  getDebateStatus(debateId: string) {
    return this.debateOrchestrator.getDebate(debateId);
  }

  /**
   * List active debates for a discussion
   */
  listDebatesForDiscussion(discussionId: string) {
    return this.debateOrchestrator
      .listActiveDebates()
      .filter((d) => d.discussionId === discussionId);
  }
}
