import { Server } from 'socket.io';
import { EventBusService, DebateOrchestratorService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';

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
    // Define event data types
    interface DebateStartedData {
      debateId: string;
      discussionId?: string;
      topic: string;
      proposition: string;
      participants: string[];
    }

    interface DebateArgumentData {
      debateId: string;
      argument: unknown;
    }

    interface DebateVoteData {
      debateId: string;
      vote: unknown;
    }

    interface DebateConcludedData {
      debateId: string;
      consensus: unknown;
      metadata: unknown;
    }

    interface DebateRequestData {
      debateId: string;
      agentId: string;
      prompt: string;
      systemPrompt: string;
    }

    // Broadcast debate events to WebSocket clients
    this.eventBus.subscribe('debate.started', async (event) => {
      const data = event.data as DebateStartedData;
      this.broadcastToDiscussion(data.discussionId, 'debate:started', data);
    });

    this.eventBus.subscribe('debate.argument.added', async (event) => {
      const data = event.data as DebateArgumentData;
      const debate = this.debateOrchestrator.getDebate(data.debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:argument', data);
      }
    });

    this.eventBus.subscribe('debate.vote.added', async (event) => {
      const data = event.data as DebateVoteData;
      const debate = this.debateOrchestrator.getDebate(data.debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:vote', data);
      }
    });

    this.eventBus.subscribe('debate.concluded', async (event) => {
      const data = event.data as DebateConcludedData;
      const debate = this.debateOrchestrator.getDebate(data.debateId);
      if (debate?.discussionId) {
        this.broadcastToDiscussion(debate.discussionId, 'debate:concluded', {
          debateId: data.debateId,
          consensus: data.consensus,
          metadata: data.metadata,
        });
      }
    });

    // Handle debate argument requests - route to agents
    this.eventBus.subscribe('debate.argument.request', async (event) => {
      const data = event.data as DebateRequestData;
      await this.eventBus.publish('agent.discussion.participate', {
        agentId: data.agentId,
        discussionId: data.debateId,
        prompt: data.prompt,
        systemPrompt: data.systemPrompt,
        responseType: 'debate_argument',
      });
    });

    // Handle debate vote requests
    this.eventBus.subscribe('debate.vote.request', async (event) => {
      const data = event.data as DebateRequestData;
      await this.eventBus.publish('agent.discussion.participate', {
        agentId: data.agentId,
        discussionId: data.debateId,
        prompt: data.prompt,
        systemPrompt: data.systemPrompt,
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
