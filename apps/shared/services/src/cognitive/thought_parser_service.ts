import { ThoughtStep, ThoughtChain, ThoughtType, ThoughtStepSchema } from '@uaip/types';
import { logger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';

// Regex to parse thought blocks from LLM output
const THOUGHT_REGEX =
  /\[THOUGHT\s+type="(\w+)"\s+confidence="([\d.]+)"\s*\]([\s\S]*?)\[\/THOUGHT\]/g;

export class ThoughtParserService {
  private static instance: ThoughtParserService;

  static getInstance(): ThoughtParserService {
    if (!ThoughtParserService.instance) {
      ThoughtParserService.instance = new ThoughtParserService();
    }
    return ThoughtParserService.instance;
  }

  /**
   * Parse LLM output into structured thought steps
   */
  parseThoughts(content: string): ThoughtStep[] {
    const thoughts: ThoughtStep[] = [];
    let match;

    // Reset regex lastIndex for fresh matching
    THOUGHT_REGEX.lastIndex = 0;

    while ((match = THOUGHT_REGEX.exec(content)) !== null) {
      const [, type, confidence, thoughtContent] = match;

      try {
        const step: ThoughtStep = {
          id: uuidv4(),
          type: type as ThoughtType,
          content: thoughtContent.trim(),
          confidence: parseFloat(confidence),
          timestamp: Date.now(),
          dependencies: [],
        };

        // Validate with Zod
        ThoughtStepSchema.parse(step);
        thoughts.push(step);
      } catch (error) {
        logger.warn('Failed to parse thought step:', { type, error });
      }
    }

    // Infer dependencies based on order and references
    this.inferDependencies(thoughts);

    return thoughts;
  }

  /**
   * Parse streaming content incrementally
   */
  parseStreamingThought(buffer: string): { thought: ThoughtStep | null; remaining: string } {
    const match =
      /\[THOUGHT\s+type="(\w+)"\s+confidence="([\d.]+)"\s*\]([\s\S]*?)\[\/THOUGHT\]/.exec(buffer);

    if (!match) {
      return { thought: null, remaining: buffer };
    }

    const [fullMatch, type, confidence, content] = match;

    const thought: ThoughtStep = {
      id: uuidv4(),
      type: type as ThoughtType,
      content: content.trim(),
      confidence: parseFloat(confidence),
      timestamp: Date.now(),
      dependencies: [],
    };

    const remaining = buffer.slice(buffer.indexOf(fullMatch) + fullMatch.length);

    return { thought, remaining };
  }

  /**
   * Create a thought chain from parsed steps
   */
  createChain(agentId: string, steps: ThoughtStep[], conversationId?: string): ThoughtChain {
    const conclusions = steps.filter((s) => s.type === 'conclusion');
    const uncertainties = steps.filter((s) => s.type === 'uncertainty');
    const refinements = steps.filter((s) => s.type === 'refinement');

    // Calculate branches (thoughts with alternatives)
    const branchCount = steps.filter((s) => s.alternatives && s.alternatives.length > 0).length;

    // Calculate overall confidence
    const avgConfidence =
      steps.length > 0 ? steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length : 0;

    return {
      id: uuidv4(),
      agentId,
      conversationId,
      startedAt: steps[0]?.timestamp || Date.now(),
      completedAt: conclusions.length > 0 ? Date.now() : undefined,
      status: conclusions.length > 0 ? 'concluded' : 'thinking',
      steps,
      finalConclusion: conclusions[conclusions.length - 1]?.content,
      overallConfidence: avgConfidence,
      metadata: {
        totalSteps: steps.length,
        branchCount,
        uncertaintyCount: uncertainties.length,
        refinementCount: refinements.length,
      },
    };
  }

  /**
   * Infer dependencies between thoughts
   */
  private inferDependencies(thoughts: ThoughtStep[]): void {
    for (let i = 1; i < thoughts.length; i++) {
      const current = thoughts[i];

      // Find dependencies: thoughts that logically precede this one
      for (let j = 0; j < i; j++) {
        const previous = thoughts[j];

        // Conclusions depend on reasoning
        if (current.type === 'conclusion' && previous.type === 'reasoning') {
          current.dependencies.push(previous.id);
        }
        // Reasoning depends on hypotheses
        else if (current.type === 'reasoning' && previous.type === 'hypothesis') {
          current.dependencies.push(previous.id);
        }
        // Hypotheses depend on observations
        else if (current.type === 'hypothesis' && previous.type === 'observation') {
          current.dependencies.push(previous.id);
        }
        // Refinements depend on critiques
        else if (current.type === 'refinement' && previous.type === 'critique') {
          current.dependencies.push(previous.id);
        }
        // Critiques depend on reasoning
        else if (current.type === 'critique' && previous.type === 'reasoning') {
          current.dependencies.push(previous.id);
        }
      }
    }
  }

  /**
   * Extract final answer from thought chain
   */
  extractFinalAnswer(chain: ThoughtChain): string {
    if (chain.finalConclusion) {
      return chain.finalConclusion;
    }

    // If no conclusion, return last reasoning step
    const reasoningSteps = chain.steps.filter((s) => s.type === 'reasoning');
    if (reasoningSteps.length > 0) {
      return reasoningSteps[reasoningSteps.length - 1].content;
    }

    // Fallback: concatenate all content
    return chain.steps.map((s) => s.content).join('\n');
  }

  /**
   * Get uncertainties from chain
   */
  getUncertainties(chain: ThoughtChain): ThoughtStep[] {
    return chain.steps.filter((s) => s.type === 'uncertainty');
  }

  /**
   * Check if chain has sufficient confidence to conclude
   */
  canConclude(chain: ThoughtChain, threshold: number = 0.7): boolean {
    const conclusions = chain.steps.filter((s) => s.type === 'conclusion');
    if (conclusions.length === 0) return false;

    const lastConclusion = conclusions[conclusions.length - 1];
    return lastConclusion.confidence >= threshold;
  }
}
