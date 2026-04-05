import { Server } from 'socket.io';
import { DebateOrchestratorService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/infra/event_bus';
import { logger } from '@uaip/utils';
import { Argument, Vote, ConsensusResult } from '@uaip/types';

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
      if (typeof raw !== 'object' || raw === null) return;
      const data = raw as Record<string, unknown>;
      const discussionId = typeof data['discussionId'] === 'string' ? data['discussionId'] : undefined;
      this.broadcastToDiscussion(discussionId, 'debate:started', data);
    });

    this.eventBus.subscribe('debate.argument.added', async (event) => {
      const raw = event.data;
      if (typeof raw !== 'object' || raw === null) return;
      const data = raw as Record<string, unknown>;
      const debateId = typeof data['debateId'] === 'string' ? data['debateId'] : '';
      const debate = this.debateOrchestrator.getDebate(debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:argument', data);
      }
    });

    this.eventBus.subscribe('debate.vote.added', async (event) => {
      const raw = event.data;
      if (typeof raw !== 'object' || raw === null) return;
      const data = raw as Record<string, unknown>;
      const debateId = typeof data['debateId'] === 'string' ? data['debateId'] : '';
      const debate = this.debateOrchestrator.getDebate(debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:vote', data);
      }
    });

    this.eventBus.subscribe('debate.concluded', async (event) => {
      const raw = event.data;
      if (typeof raw !== 'object' || raw === null) return;
      const data = raw as Record<string, unknown>;
      const debateId = typeof data['debateId'] === 'string' ? data['debateId'] : '';
      const debate = this.debateOrchestrator.getDebate(debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:concluded', {
          debateId,
          consensus: data['consensus'],
          metadata: data['metadata'],
        });
      }
    });

    // Handle debate argument requests - route to agents
    this.eventBus.subscribe('debate.argument.request', async (event) => {
      const raw = event.data;
      if (typeof raw !== 'object' || raw === null) return;
      const data = raw as Record<string, unknown>;
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
      if (typeof raw !== 'object' || raw === null) return;
      const data = raw as Record<string, unknown>;
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
