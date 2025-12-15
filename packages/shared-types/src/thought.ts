import { z } from 'zod';

// Thought step types for chain-of-thought reasoning
export const ThoughtTypeSchema = z.enum([
  'observation',    // What the agent notices/perceives
  'hypothesis',     // Tentative explanation or theory
  'reasoning',      // Logical deduction or inference
  'conclusion',     // Final determination
  'uncertainty',    // Explicit acknowledgment of unknowns
  'question',       // Questions for clarification or exploration
  'critique',       // Self-evaluation of reasoning
  'refinement',     // Improvement to previous thought
]);

export type ThoughtType = z.infer<typeof ThoughtTypeSchema>;

// Individual thought step interface (defined first for recursive schema)
export interface ThoughtStep {
  id: string;
  type: ThoughtType;
  content: string;
  confidence: number;
  timestamp: number;
  dependencies: string[];
  alternatives?: ThoughtStep[];
  metadata?: Record<string, unknown>;
}

// Individual thought step schema
export const ThoughtStepSchema: z.ZodType<ThoughtStep> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: ThoughtTypeSchema,
    content: z.string(),
    confidence: z.number().min(0).max(1),
    timestamp: z.number(),
    dependencies: z.array(z.string()),
    alternatives: z.array(ThoughtStepSchema).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
) as z.ZodType<ThoughtStep>;

// Complete thought chain
export const ThoughtChainSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  conversationId: z.string().optional(),
  startedAt: z.number(),
  completedAt: z.number().optional(),
  status: z.enum(['thinking', 'concluded', 'abandoned', 'paused']),
  steps: z.array(ThoughtStepSchema),
  finalConclusion: z.string().optional(),
  overallConfidence: z.number().min(0).max(1).optional(),
  metadata: z.object({
    totalSteps: z.number(),
    branchCount: z.number(),
    uncertaintyCount: z.number(),
    refinementCount: z.number(),
  }).optional(),
});

export type ThoughtChain = z.infer<typeof ThoughtChainSchema>;

// Streaming thought event
export const ThoughtStreamEventSchema = z.object({
  chainId: z.string(),
  step: ThoughtStepSchema,
  chainProgress: z.object({
    currentStep: z.number(),
    estimatedTotal: z.number().optional(),
    confidence: z.number(),
  }),
});

export type ThoughtStreamEvent = z.infer<typeof ThoughtStreamEventSchema>;

// Thought streaming configuration
export interface ThoughtStreamingConfig {
  showReasoning: boolean;        // Show reasoning steps to user
  showUncertainties: boolean;    // Show uncertainty acknowledgments
  collapseIntermediateSteps: boolean;  // Collapse intermediate reasoning
  minConfidenceToShow: number;   // Minimum confidence for display
}

// Prompt template for structured thinking
export const THOUGHT_SYSTEM_PROMPT = `You are a reasoning agent that thinks step-by-step. Structure your thinking as follows:

For each thought, output in this format:
[THOUGHT type="<type>" confidence="<0.0-1.0>"]
<your thought content>
[/THOUGHT]

Types:
- observation: What you notice about the input/context
- hypothesis: Your tentative explanation or approach
- reasoning: Your logical deduction
- uncertainty: What you're unsure about (be explicit!)
- question: Questions that would help clarify
- critique: Self-evaluation of your reasoning
- conclusion: Your final answer

Rules:
1. Start with observations
2. Form hypotheses before reasoning
3. Always acknowledge uncertainties
4. Critique your own reasoning
5. Only conclude when confidence > 0.7

Example:
[THOUGHT type="observation" confidence="0.9"]
The user is asking about implementing a cache system.
[/THOUGHT]

[THOUGHT type="uncertainty" confidence="0.4"]
I'm not sure about the expected scale - is this for 100 or 100,000 users?
[/THOUGHT]
`;
