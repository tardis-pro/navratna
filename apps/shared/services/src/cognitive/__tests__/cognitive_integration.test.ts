import { describe, it, expect, beforeAll } from 'vitest';
import { ThoughtParserService } from '../thought_parser_service';
import { CritiqueService } from '../critique_service';
import { DebateOrchestratorService } from '../debate_orchestrator_service';

describe('Cognitive Services Integration', () => {
  let thoughtParser: ThoughtParserService;
  let critiqueService: CritiqueService;
  let debateOrchestrator: DebateOrchestratorService;

  beforeAll(() => {
    thoughtParser = ThoughtParserService.getInstance();
    critiqueService = CritiqueService.getInstance();
    debateOrchestrator = DebateOrchestratorService.getInstance();
  });

  describe('ThoughtParserService', () => {
    it('should parse thought steps from LLM output', () => {
      const content = `
[THOUGHT type="observation" confidence="0.9"]
The user is asking about caching.
[/THOUGHT]

[THOUGHT type="hypothesis" confidence="0.7"]
Redis would be a good fit for this use case.
[/THOUGHT]
`;
      const thoughts = thoughtParser.parseThoughts(content);

      expect(thoughts).toHaveLength(2);
      expect(thoughts[0].type).toBe('observation');
      expect(thoughts[0].confidence).toBe(0.9);
      expect(thoughts[1].type).toBe('hypothesis');
    });

    it('should create thought chain with metadata', () => {
      const thoughts = [
        {
          id: '1',
          type: 'observation' as const,
          content: 'Test',
          confidence: 0.9,
          timestamp: Date.now(),
          dependencies: [],
        },
        {
          id: '2',
          type: 'conclusion' as const,
          content: 'Final',
          confidence: 0.8,
          timestamp: Date.now(),
          dependencies: [],
        },
      ];

      const chain = thoughtParser.createChain('agent-1', thoughts, 'conv-1');

      expect(chain.status).toBe('concluded');
      expect(chain.finalConclusion).toBe('Final');
      expect(chain.metadata?.totalSteps).toBe(2);
    });

    it('should parse streaming thoughts incrementally', () => {
      const buffer =
        '[THOUGHT type="reasoning" confidence="0.85"]This is a reasoning step.[/THOUGHT] remaining content';

      const result = thoughtParser.parseStreamingThought(buffer);

      expect(result.thought).not.toBeNull();
      expect(result.thought?.type).toBe('reasoning');
      expect(result.thought?.confidence).toBe(0.85);
      expect(result.remaining).toContain('remaining content');
    });

    it('should handle incomplete thought blocks', () => {
      const incompleteBuffer = '[THOUGHT type="reasoning" confidence="0.7"]Incomplete...';

      const result = thoughtParser.parseStreamingThought(incompleteBuffer);

      expect(result.thought).toBeNull();
      expect(result.remaining).toBe(incompleteBuffer);
    });

    it('should extract final answer from thought chain', () => {
      const thoughts = [
        {
          id: '1',
          type: 'reasoning' as const,
          content: 'Analyzing the problem',
          confidence: 0.8,
          timestamp: Date.now(),
          dependencies: [],
        },
        {
          id: '2',
          type: 'conclusion' as const,
          content: 'The answer is 42',
          confidence: 0.9,
          timestamp: Date.now(),
          dependencies: [],
        },
      ];

      const chain = thoughtParser.createChain('agent-1', thoughts);
      const answer = thoughtParser.extractFinalAnswer(chain);

      expect(answer).toBe('The answer is 42');
    });

    it('should check if chain can conclude', () => {
      const lowConfidenceThoughts = [
        {
          id: '1',
          type: 'conclusion' as const,
          content: 'Uncertain conclusion',
          confidence: 0.5,
          timestamp: Date.now(),
          dependencies: [],
        },
      ];

      const highConfidenceThoughts = [
        {
          id: '1',
          type: 'conclusion' as const,
          content: 'Confident conclusion',
          confidence: 0.9,
          timestamp: Date.now(),
          dependencies: [],
        },
      ];

      const lowChain = thoughtParser.createChain('agent-1', lowConfidenceThoughts);
      const highChain = thoughtParser.createChain('agent-1', highConfidenceThoughts);

      expect(thoughtParser.canConclude(lowChain, 0.7)).toBe(false);
      expect(thoughtParser.canConclude(highChain, 0.7)).toBe(true);
    });
  });

  describe('DebateOrchestratorService', () => {
    it('should calculate consensus correctly', () => {
      const votes = [
        { agentId: 'a1', stance: 'support' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a2', stance: 'support' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a3', stance: 'oppose' as const, weight: 1, timestamp: Date.now() },
      ];

      const consensus = debateOrchestrator.calculateConsensus(votes);

      expect(consensus.supportPercentage).toBeCloseTo(0.67, 1);
      expect(consensus.opposePercentage).toBeCloseTo(0.33, 1);
      expect(consensus.reached).toBe(true);
      expect(consensus.stance).toBe('support');
    });

    it('should detect deadlock', () => {
      const votes = [
        { agentId: 'a1', stance: 'support' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a2', stance: 'oppose' as const, weight: 1, timestamp: Date.now() },
      ];

      const consensus = debateOrchestrator.calculateConsensus(votes);

      expect(consensus.deadlock).toBe(true);
      expect(consensus.reached).toBe(false);
    });

    it('should handle weighted votes correctly', () => {
      const votes = [
        { agentId: 'expert', stance: 'support' as const, weight: 2, timestamp: Date.now() },
        { agentId: 'novice', stance: 'oppose' as const, weight: 0.5, timestamp: Date.now() },
      ];

      const consensus = debateOrchestrator.calculateConsensus(votes);

      // 2 / 2.5 = 0.8 for support
      expect(consensus.supportPercentage).toBeCloseTo(0.8, 1);
      expect(consensus.opposePercentage).toBeCloseTo(0.2, 1);
      expect(consensus.strongConsensus).toBe(true);
    });

    it('should detect unanimity', () => {
      const votes = [
        { agentId: 'a1', stance: 'support' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a2', stance: 'support' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a3', stance: 'support' as const, weight: 1, timestamp: Date.now() },
      ];

      const consensus = debateOrchestrator.calculateConsensus(votes);

      expect(consensus.unanimity).toBe(true);
      expect(consensus.supportPercentage).toBe(1);
    });

    it('should handle abstentions correctly', () => {
      const votes = [
        { agentId: 'a1', stance: 'support' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a2', stance: 'abstain' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a3', stance: 'oppose' as const, weight: 1, timestamp: Date.now() },
      ];

      const consensus = debateOrchestrator.calculateConsensus(votes);

      // Abstentions should be excluded from calculation
      // 1 support, 1 oppose out of 2 valid votes = 0.5 each
      expect(consensus.supportPercentage).toBeCloseTo(0.5, 1);
      expect(consensus.opposePercentage).toBeCloseTo(0.5, 1);
    });

    it('should detect weak consensus', () => {
      const votes = [
        { agentId: 'a1', stance: 'support' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a2', stance: 'support' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a3', stance: 'oppose' as const, weight: 1, timestamp: Date.now() },
        { agentId: 'a4', stance: 'neutral' as const, weight: 1, timestamp: Date.now() },
      ];

      const consensus = debateOrchestrator.calculateConsensus(votes);

      // 2/4 = 0.5 for support (weak consensus range 50-75%)
      expect(consensus.weakConsensus).toBe(true);
      expect(consensus.strongConsensus).toBe(false);
    });
  });

  describe('CritiqueService', () => {
    it('should be a singleton instance', () => {
      const instance1 = CritiqueService.getInstance();
      const instance2 = CritiqueService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should allow configuration changes', () => {
      critiqueService.configure({
        minScoreThreshold: 0.8,
        maxRevisions: 5,
      });

      // The service should accept configuration without errors
      expect(true).toBe(true);
    });
  });
});
