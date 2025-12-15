import {
  Debate,
  DebateRound,
  Argument,
  Vote,
  Stance,
  ConsensusResult,
  DebateConfig,
  DEFAULT_DEBATE_CONFIG,
  DEBATE_ARGUMENT_PROMPT,
  DEBATE_VOTE_PROMPT,
} from '@uaip/types';
import { EventBusService } from '../eventBusService.js';
import { logger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';

// Regex for parsing debate outputs
const ARGUMENT_REGEX = /\[ARGUMENT\s+stance="(\w+)"\]([\s\S]*?)\[\/ARGUMENT\]/;
const VOTE_REGEX = /\[VOTE\s+stance="(\w+)"\]([\s\S]*?)\[\/VOTE\]/;

export class DebateOrchestratorService {
  private static instance: DebateOrchestratorService;
  private eventBus: EventBusService;
  private activeDebates: Map<string, Debate> = new Map();
  private config: DebateConfig;

  private constructor() {
    this.eventBus = EventBusService.getInstance();
    this.config = DEFAULT_DEBATE_CONFIG;
    this.setupEventHandlers();
  }

  static getInstance(): DebateOrchestratorService {
    if (!DebateOrchestratorService.instance) {
      DebateOrchestratorService.instance = new DebateOrchestratorService();
    }
    return DebateOrchestratorService.instance;
  }

  private setupEventHandlers(): void {
    // Listen for debate-related events
    this.eventBus.subscribe('debate.argument.submitted', async (event) => {
      const data = event.data as { debateId: string; agentId: string; content: string };
      await this.handleArgumentSubmission(data);
    });

    this.eventBus.subscribe('debate.vote.submitted', async (event) => {
      const data = event.data as { debateId: string; agentId: string; content: string };
      await this.handleVoteSubmission(data);
    });
  }

  /**
   * Configure debate settings
   */
  configure(config: Partial<DebateConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Start a new debate
   */
  async startDebate(
    topic: string,
    proposition: string,
    participants: string[],
    discussionId?: string,
    config?: Partial<DebateConfig>
  ): Promise<Debate> {
    const effectiveConfig = { ...this.config, ...config };

    const debate: Debate = {
      id: uuidv4(),
      topic,
      proposition,
      discussionId,
      participants,
      status: 'active',
      rounds: [
        {
          roundNumber: 1,
          arguments: [],
          phase: 'opening',
        },
      ],
      votes: [],
      startedAt: Date.now(),
    };

    this.activeDebates.set(debate.id, debate);

    // Emit debate started event
    await this.eventBus.publish('debate.started', {
      debateId: debate.id,
      topic,
      proposition,
      participants,
      discussionId,
    });

    logger.info('Debate started', {
      debateId: debate.id,
      topic,
      participantCount: participants.length,
    });

    // Trigger opening arguments from all participants
    await this.requestArgumentsFromParticipants(debate, 'opening');

    return debate;
  }

  /**
   * Request arguments from all participants
   */
  private async requestArgumentsFromParticipants(debate: Debate, phase: string): Promise<void> {
    const previousArguments = this.getAllArguments(debate);

    for (const agentId of debate.participants) {
      const prompt = this.buildArgumentPrompt(debate, agentId, phase, previousArguments);

      await this.eventBus.publish('debate.argument.request', {
        debateId: debate.id,
        agentId,
        phase,
        prompt,
        systemPrompt: DEBATE_ARGUMENT_PROMPT,
      });
    }
  }

  /**
   * Build argument prompt with context
   */
  private buildArgumentPrompt(
    debate: Debate,
    agentId: string,
    phase: string,
    previousArguments: Argument[]
  ): string {
    let prompt = `Debate Topic: ${debate.topic}\n`;
    prompt += `Proposition: ${debate.proposition}\n`;
    prompt += `Phase: ${phase}\n\n`;

    if (previousArguments.length > 0) {
      prompt += 'Previous arguments:\n';
      previousArguments.forEach((arg, i) => {
        prompt += `${i + 1}. [${arg.stance.toUpperCase()}] ${arg.claim}\n`;
        prompt += `   Evidence: ${arg.evidence.join('; ')}\n`;
        prompt += `   Confidence: ${arg.confidence}\n\n`;
      });
    }

    if (phase === 'rebuttal') {
      prompt += '\nAddress the strongest opposing arguments in your rebuttal.';
    } else if (phase === 'closing') {
      prompt += '\nSummarize your position considering all arguments presented.';
    }

    return prompt;
  }

  /**
   * Handle argument submission
   */
  private async handleArgumentSubmission(event: {
    debateId: string;
    agentId: string;
    content: string;
  }): Promise<void> {
    const debate = this.activeDebates.get(event.debateId);
    if (!debate) {
      logger.warn('Debate not found for argument submission', { debateId: event.debateId });
      return;
    }

    const argument = this.parseArgument(event.content, event.agentId);
    if (!argument) {
      logger.warn('Failed to parse argument', { agentId: event.agentId });
      return;
    }

    const currentRound = debate.rounds[debate.rounds.length - 1];
    currentRound.arguments.push(argument);

    // Emit argument added event
    await this.eventBus.publish('debate.argument.added', {
      debateId: debate.id,
      argument,
    });

    // Check if all participants have submitted
    const allSubmitted = debate.participants.every((p) =>
      currentRound.arguments.some((a) => a.agentId === p)
    );

    if (allSubmitted) {
      await this.advanceDebate(debate);
    }
  }

  /**
   * Parse argument from LLM output
   */
  private parseArgument(content: string, agentId: string): Argument | null {
    const match = ARGUMENT_REGEX.exec(content);
    if (!match) return null;

    const [, stance, body] = match;

    const claimMatch = body.match(/Claim:\s*(.+?)(?=Evidence:|$)/s);
    const evidenceMatch = body.match(/Evidence:\s*([\s\S]*?)(?=Reasoning:|$)/);
    const reasoningMatch = body.match(/Reasoning:\s*(.+?)(?=Confidence:|$)/s);
    const confidenceMatch = body.match(/Confidence:\s*([\d.]+)/);

    const evidence = evidenceMatch
      ? evidenceMatch[1]
          .split('\n')
          .map((e) => e.replace(/^-\s*/, '').trim())
          .filter(Boolean)
      : [];

    return {
      id: uuidv4(),
      agentId,
      stance: stance as Stance,
      claim: claimMatch?.[1]?.trim() || '',
      evidence,
      reasoning: reasoningMatch?.[1]?.trim() || '',
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
      rebuttals: [],
      timestamp: Date.now(),
    };
  }

  /**
   * Advance debate to next phase/round
   */
  private async advanceDebate(debate: Debate): Promise<void> {
    const currentRound = debate.rounds[debate.rounds.length - 1];

    if (currentRound.phase === 'opening') {
      currentRound.phase = 'rebuttal';
      await this.requestArgumentsFromParticipants(debate, 'rebuttal');
    } else if (currentRound.phase === 'rebuttal') {
      if (debate.rounds.length < this.config.maxRounds) {
        // Start new round
        debate.rounds.push({
          roundNumber: debate.rounds.length + 1,
          arguments: [],
          phase: 'opening',
        });
        await this.requestArgumentsFromParticipants(debate, 'opening');
      } else {
        // Move to voting
        currentRound.phase = 'voting';
        debate.status = 'voting';
        await this.requestVotes(debate);
      }
    }
  }

  /**
   * Request votes from all participants
   */
  private async requestVotes(debate: Debate): Promise<void> {
    const allArguments = this.getAllArguments(debate);
    const summary = this.buildArgumentSummary(allArguments);

    for (const agentId of debate.participants) {
      await this.eventBus.publish('debate.vote.request', {
        debateId: debate.id,
        agentId,
        prompt: `${summary}\n\nBased on all arguments, cast your vote on the proposition: "${debate.proposition}"`,
        systemPrompt: DEBATE_VOTE_PROMPT,
      });
    }
  }

  /**
   * Handle vote submission
   */
  private async handleVoteSubmission(event: {
    debateId: string;
    agentId: string;
    content: string;
  }): Promise<void> {
    const debate = this.activeDebates.get(event.debateId);
    if (!debate) return;

    const vote = this.parseVote(event.content, event.agentId);
    if (!vote) return;

    debate.votes.push(vote);

    await this.eventBus.publish('debate.vote.added', {
      debateId: debate.id,
      vote,
    });

    // Check if all votes are in
    if (debate.votes.length >= debate.participants.length) {
      await this.concludeDebate(debate);
    }
  }

  /**
   * Parse vote from LLM output
   */
  private parseVote(content: string, agentId: string): Vote | null {
    const match = VOTE_REGEX.exec(content);
    if (!match) return null;

    const [, stance, body] = match;
    const reasoningMatch = body.match(/Reasoning:\s*(.+?)(?=Confidence:|$)/s);
    const confidenceMatch = body.match(/Confidence:\s*([\d.]+)/);

    return {
      agentId,
      stance: stance as Stance,
      weight: 1, // Could be modified by expertise weighting
      reasoning: reasoningMatch?.[1]?.trim(),
      timestamp: Date.now(),
    };
  }

  /**
   * Conclude debate and calculate consensus
   */
  private async concludeDebate(debate: Debate): Promise<void> {
    const consensus = this.calculateConsensus(debate.votes);

    debate.consensus = {
      reached: consensus.reached,
      stance: consensus.stance,
      confidence: consensus.confidence,
      dissent: debate.votes.filter((v) => v.stance !== consensus.stance).map((v) => v.agentId),
    };

    debate.status = consensus.deadlock ? 'deadlocked' : 'concluded';
    debate.concludedAt = Date.now();

    // Calculate metadata
    const allArguments = this.getAllArguments(debate);
    debate.metadata = {
      totalArguments: allArguments.length,
      totalRebuttals: allArguments.filter((a) => a.rebuttals.length > 0).length,
      avgConfidence:
        allArguments.length > 0
          ? allArguments.reduce((s, a) => s + a.confidence, 0) / allArguments.length
          : 0,
      participationRate:
        debate.votes.filter((v) => v.stance !== 'abstain').length / debate.participants.length,
    };

    await this.eventBus.publish('debate.concluded', {
      debateId: debate.id,
      consensus,
      metadata: debate.metadata,
    });

    logger.info('Debate concluded', {
      debateId: debate.id,
      consensusReached: consensus.reached,
      stance: consensus.stance,
      confidence: consensus.confidence,
    });
  }

  /**
   * Calculate consensus from votes
   */
  calculateConsensus(votes: Vote[]): ConsensusResult {
    const validVotes = votes.filter((v) => v.stance !== 'abstain');
    const totalWeight = validVotes.reduce((sum, v) => sum + v.weight, 0);

    const stanceCounts: Record<Stance, number> = {
      support: 0,
      oppose: 0,
      neutral: 0,
      abstain: 0,
    };

    validVotes.forEach((v) => {
      stanceCounts[v.stance] += v.weight;
    });

    const supportPct = totalWeight > 0 ? stanceCounts.support / totalWeight : 0;
    const opposePct = totalWeight > 0 ? stanceCounts.oppose / totalWeight : 0;
    const neutralPct = totalWeight > 0 ? stanceCounts.neutral / totalWeight : 0;

    // Determine winning stance
    let winningStance: Stance = 'neutral';
    let maxPct = 0;

    if (supportPct > maxPct) {
      maxPct = supportPct;
      winningStance = 'support';
    }
    if (opposePct > maxPct) {
      maxPct = opposePct;
      winningStance = 'oppose';
    }
    if (neutralPct > maxPct) {
      maxPct = neutralPct;
      winningStance = 'neutral';
    }

    const reached = maxPct >= this.config.consensusThreshold;
    const unanimity = maxPct === 1;
    const strongConsensus = maxPct >= 0.75;
    const weakConsensus = maxPct >= 0.5 && maxPct < 0.75;
    const deadlock = maxPct < 0.5 || (supportPct > 0.4 && opposePct > 0.4);

    return {
      reached,
      stance: winningStance,
      supportPercentage: supportPct,
      opposePercentage: opposePct,
      neutralPercentage: neutralPct,
      confidence: maxPct,
      unanimity,
      strongConsensus,
      weakConsensus,
      deadlock,
    };
  }

  /**
   * Get all arguments from all rounds
   */
  private getAllArguments(debate: Debate): Argument[] {
    return debate.rounds.flatMap((r) => r.arguments);
  }

  /**
   * Build summary of all arguments
   */
  private buildArgumentSummary(arguments_: Argument[]): string {
    const support = arguments_.filter((a) => a.stance === 'support');
    const oppose = arguments_.filter((a) => a.stance === 'oppose');

    let summary = 'Arguments FOR the proposition:\n';
    support.forEach((a, i) => {
      summary += `${i + 1}. ${a.claim} (confidence: ${a.confidence})\n`;
    });

    summary += '\nArguments AGAINST the proposition:\n';
    oppose.forEach((a, i) => {
      summary += `${i + 1}. ${a.claim} (confidence: ${a.confidence})\n`;
    });

    return summary;
  }

  /**
   * Get active debate
   */
  getDebate(debateId: string): Debate | undefined {
    return this.activeDebates.get(debateId);
  }

  /**
   * List active debates
   */
  listActiveDebates(): Debate[] {
    return Array.from(this.activeDebates.values()).filter(
      (d) => d.status === 'active' || d.status === 'voting'
    );
  }

  /**
   * Submit an argument to a debate manually (for external API use)
   */
  async submitArgument(
    debateId: string,
    agentId: string,
    content: string
  ): Promise<Argument | null> {
    const debate = this.activeDebates.get(debateId);
    if (!debate || debate.status !== 'active') {
      return null;
    }

    await this.handleArgumentSubmission({ debateId, agentId, content });
    const currentRound = debate.rounds[debate.rounds.length - 1];
    return currentRound.arguments.find((a) => a.agentId === agentId) || null;
  }

  /**
   * Submit a vote to a debate manually (for external API use)
   */
  async submitVote(debateId: string, agentId: string, content: string): Promise<Vote | null> {
    const debate = this.activeDebates.get(debateId);
    if (!debate || debate.status !== 'voting') {
      return null;
    }

    await this.handleVoteSubmission({ debateId, agentId, content });
    return debate.votes.find((v) => v.agentId === agentId) || null;
  }
}
