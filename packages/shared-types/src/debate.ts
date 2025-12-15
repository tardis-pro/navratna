import { z } from 'zod';

// Argument stance
export const StanceSchema = z.enum(['support', 'oppose', 'neutral', 'abstain']);
export type Stance = z.infer<typeof StanceSchema>;

// Argument structure
export const ArgumentSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  stance: StanceSchema,
  claim: z.string(),
  evidence: z.array(z.string()),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  rebuttals: z.array(z.string()).default([]), // IDs of arguments this rebuts
  timestamp: z.number(),
});

export type Argument = z.infer<typeof ArgumentSchema>;

// Vote structure
export const VoteSchema = z.object({
  agentId: z.string(),
  stance: StanceSchema,
  weight: z.number().min(0).max(1).default(1), // Expertise-weighted voting
  reasoning: z.string().optional(),
  timestamp: z.number(),
});

export type Vote = z.infer<typeof VoteSchema>;

// Debate round
export const DebateRoundSchema = z.object({
  roundNumber: z.number(),
  arguments: z.array(ArgumentSchema),
  phase: z.enum(['opening', 'rebuttal', 'closing', 'voting']),
});

export type DebateRound = z.infer<typeof DebateRoundSchema>;

// Full debate structure
export const DebateSchema = z.object({
  id: z.string(),
  topic: z.string(),
  proposition: z.string(), // The statement being debated
  discussionId: z.string().optional(),
  participants: z.array(z.string()), // Agent IDs
  status: z.enum(['active', 'voting', 'concluded', 'deadlocked']),
  rounds: z.array(DebateRoundSchema),
  votes: z.array(VoteSchema),
  consensus: z
    .object({
      reached: z.boolean(),
      stance: StanceSchema.optional(),
      confidence: z.number().min(0).max(1),
      dissent: z.array(z.string()), // Agent IDs that dissented
    })
    .optional(),
  startedAt: z.number(),
  concludedAt: z.number().optional(),
  metadata: z
    .object({
      totalArguments: z.number(),
      totalRebuttals: z.number(),
      avgConfidence: z.number(),
      participationRate: z.number(),
    })
    .optional(),
});

export type Debate = z.infer<typeof DebateSchema>;

// Consensus calculation result
export const ConsensusResultSchema = z.object({
  reached: z.boolean(),
  stance: StanceSchema,
  supportPercentage: z.number(),
  opposePercentage: z.number(),
  neutralPercentage: z.number(),
  confidence: z.number(),
  unanimity: z.boolean(),
  strongConsensus: z.boolean(), // >75% agreement
  weakConsensus: z.boolean(), // 50-75% agreement
  deadlock: z.boolean(), // No clear majority
});

export type ConsensusResult = z.infer<typeof ConsensusResultSchema>;

// Debate configuration
export interface DebateConfig {
  maxRounds: number;
  maxArgumentsPerRound: number;
  consensusThreshold: number; // Percentage needed for consensus
  requireEvidence: boolean;
  allowAbstention: boolean;
  weightByExpertise: boolean;
}

export const DEFAULT_DEBATE_CONFIG: DebateConfig = {
  maxRounds: 3,
  maxArgumentsPerRound: 2,
  consensusThreshold: 0.66, // 2/3 majority
  requireEvidence: true,
  allowAbstention: true,
  weightByExpertise: true,
};

// Debate prompts
export const DEBATE_ARGUMENT_PROMPT = `You are participating in a structured debate. Present your argument clearly.

Format your response as:
[ARGUMENT stance="<support|oppose|neutral>"]
Claim: <your main point in one sentence>
Evidence:
- <supporting fact or data>
- <another piece of evidence>
Reasoning: <logical connection between evidence and claim>
Confidence: <0.0-1.0>
[/ARGUMENT]

Rules:
1. Base arguments on evidence
2. Address counter-arguments if rebutting
3. Be concise but thorough
4. Acknowledge uncertainty`;

export const DEBATE_VOTE_PROMPT = `Based on all arguments presented, cast your vote.

Format:
[VOTE stance="<support|oppose|neutral|abstain>"]
Reasoning: <brief explanation of your decision>
Confidence: <0.0-1.0>
[/VOTE]

Consider:
1. Quality of evidence presented
2. Logical soundness of arguments
3. How well rebuttals addressed concerns
4. Your own expertise in the topic`;
