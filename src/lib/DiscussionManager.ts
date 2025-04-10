import { Message, AgentState } from '../types/agent';
import { DocumentContext } from '../types/document';
import { LLMService } from '../services/llm';

export interface DiscussionContext {
  topic: string;
  initialDocument?: string;
  maxRounds: number;
  currentRound: number;
  isActive: boolean;
  agents: Map<string, AgentState>;
  history: Message[];
}

export type TurnStrategy = 'round-robin' | 'moderated' | 'context-aware';

export interface DiscussionState {
  isRunning: boolean;
  currentSpeakerId: string | null;
  turnQueue: string[];
  messageHistory: Message[];
  lastError: string | null;
}

export interface IDiscussionManager {
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  addAgent: (agent: AgentState) => void;
  removeAgent: (agentId: string) => void;
  updateDocument: (document: DocumentContext | null) => void;
}

export class DiscussionManager implements IDiscussionManager {
  private context: DiscussionContext;
  private turnStrategy: TurnStrategy;
  private currentTurn: string | null;
  private moderatorId?: string;
  private state: DiscussionState;
  private agents: Record<string, AgentState>;
  private document: DocumentContext | null;
  private updateCallback: (state: DiscussionState) => void;
  private responseCallback: (agentId: string, response: string) => void;

  constructor(
    agents: Record<string, AgentState>,
    document: DocumentContext | null,
    updateCallback: (state: DiscussionState) => void,
    responseCallback: (agentId: string, response: string) => void
  ) {
    this.context = {
      topic: '',
      maxRounds: 3,
      currentRound: 0,
      isActive: false,
      agents: new Map(),
      history: []
    };
    this.turnStrategy = 'round-robin';
    this.currentTurn = null;
    this.agents = agents;
    this.document = document;
    this.updateCallback = updateCallback;
    this.responseCallback = responseCallback;
    this.state = {
      isRunning: false,
      currentSpeakerId: null,
      turnQueue: [],
      messageHistory: [],
      lastError: null,
    };
  }

  public addAgent(agent: AgentState): void {
    this.context.agents.set(agent.id, agent);
    this.agents[agent.id] = agent;
    if (this.state.isRunning) {
      this.state.turnQueue.push(agent.id);
    }
  }

  public removeAgent(agentId: string): void {
    this.context.agents.delete(agentId);
    delete this.agents[agentId];
    this.state.turnQueue = this.state.turnQueue.filter(id => id !== agentId);
    if (this.state.currentSpeakerId === agentId) {
      this.moveToNextTurn();
    }
  }

  public setModerator(agentId: string): void {
    if (!this.context.agents.has(agentId)) {
      throw new Error('Moderator must be a registered agent');
    }
    this.moderatorId = agentId;
  }

  public start(): void {
    if (Object.keys(this.agents).length < 2 || !this.document) {
      this.state.lastError = 'Cannot start discussion without at least 2 agents and a document';
      this.updateCallback(this.state);
      return;
    }

    this.state.isRunning = true;
    this.state.lastError = null;
    this.state.turnQueue = Object.keys(this.agents);
    this.moveToNextTurn();
  }

  public stop(): void {
    this.context.isActive = false;
    this.currentTurn = null;
  }

  public addMessage(agentId: string, content: string): void {
    if (!this.context.isActive) {
      throw new Error('Discussion is not active');
    }
    if (agentId !== this.currentTurn && agentId !== this.moderatorId) {
      throw new Error('Not this agent\'s turn to speak');
    }

    const message: Message = {
      id: Date.now().toString(),
      content,
      sender: agentId,
      timestamp: new Date(),
      type: 'response'
    };

    this.context.history.push(message);
    this.progressDiscussion();
  }

  private progressDiscussion(): void {
    if (this.turnStrategy === 'moderated' && this.moderatorId) {
      // In moderated mode, always go back to moderator after each message
      this.currentTurn = this.moderatorId;
    } else {
      this.determineNextTurn();
    }
  }

  private determineNextTurn(): void {
    if (!this.context.isActive) return;

    switch (this.turnStrategy) {
      case 'round-robin':
        this.handleRoundRobinTurn();
        break;
      case 'context-aware':
        this.handleContextAwareTurn();
        break;
      case 'moderated':
        this.handleModeratedTurn();
        break;
    }
  }

  private handleRoundRobinTurn(): void {
    const agents = Array.from(this.context.agents.keys())
      .filter(id => id !== this.moderatorId);

    if (!this.currentTurn) {
      // Start with first agent
      this.currentTurn = agents[0];
      return;
    }

    const currentIndex = agents.indexOf(this.currentTurn);
    if (currentIndex === agents.length - 1) {
      // End of round
      this.context.currentRound++;
      if (this.context.currentRound >= this.context.maxRounds) {
        this.stop();
        return;
      }
      this.currentTurn = agents[0];
    } else {
      this.currentTurn = agents[currentIndex + 1];
    }
  }

  private handleContextAwareTurn(): void {
    // Implement more sophisticated turn-taking based on context
    // For now, fall back to round-robin
    this.handleRoundRobinTurn();
  }

  private handleModeratedTurn(): void {
    if (!this.moderatorId) {
      throw new Error('Moderated discussions require a moderator');
    }
    // Always set turn to moderator who will then decide next speaker
    this.currentTurn = this.moderatorId;
  }

  public getCurrentTurn(): string | null {
    return this.currentTurn;
  }

  public getContext(): DiscussionContext {
    return { ...this.context };
  }

  public getHistory(): Message[] {
    return [...this.context.history];
  }

  public setInitialDocument(document: string): void {
    this.context.initialDocument = document;
  }

  private async handleAgentTurn(agentId: string) {
    const agent = this.agents[agentId];
    if (!agent) return;

    try {
      // Generate response
      const response = await LLMService.generateResponse(
        agent,
        this.document,
        this.state.messageHistory
      );

      if (response.error) {
        throw new Error(response.error);
      }

      // Create new message
      const message: Message = {
        id: crypto.randomUUID(),
        content: response.content,
        sender: agent.name,
        timestamp: new Date(),
        type: 'response',
      };

      // Update history
      this.state.messageHistory.push(message);
      
      // Notify of response
      this.responseCallback(agentId, response.content);

      // Move to next turn if discussion is still running
      if (this.state.isRunning) {
        this.moveToNextTurn();
      }
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : 'Unknown error';
      this.state.isRunning = false;
      this.updateCallback(this.state);
    }
  }

  public pause(): void {
    this.state.isRunning = false;
    this.updateCallback(this.state);
  }

  public resume(): void {
    if (this.state.currentSpeakerId) {
      this.state.isRunning = true;
      this.handleAgentTurn(this.state.currentSpeakerId);
    } else {
      this.start();
    }
  }

  public reset(): void {
    this.state = {
      isRunning: false,
      currentSpeakerId: null,
      turnQueue: [],
      messageHistory: [],
      lastError: null,
    };
    this.updateCallback(this.state);
  }

  public updateDocument(document: DocumentContext | null): void {
    this.document = document;
  }

  private moveToNextTurn() {
    // Remove current speaker from queue
    if (this.state.currentSpeakerId) {
      this.state.turnQueue = this.state.turnQueue.filter(id => id !== this.state.currentSpeakerId);
    }

    // If queue is empty, refill it with all agents except current speaker
    if (this.state.turnQueue.length === 0) {
      this.state.turnQueue = Object.keys(this.agents).filter(
        id => id !== this.state.currentSpeakerId
      );
    }

    // Get next speaker
    const nextSpeakerId = this.state.turnQueue[0];
    this.state.currentSpeakerId = nextSpeakerId;

    // Update state
    this.updateCallback(this.state);

    // Start next turn
    if (nextSpeakerId) {
      this.handleAgentTurn(nextSpeakerId);
    }
  }
} 