import { randomUUID } from 'crypto';
import {
  Question,
  QuestionCategory,
  QuestionPhase,
  QuestionStatus,
  Assumption,
  Contradiction,
} from '@uaip/types';
import type { ForgeRequest, ForgeResult, InterviewSession, CouncilDebateResult } from '@uaip/types';
import { EventBusService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';

import { InputNormalizerService } from './inputNormalizer.service.js';
import { QuestionRankerService } from './questionRanker.service.js';
import { DebateFlowExtension } from './debateFlow.extension.js';
import { InterviewCaptureService } from './interviewCapture.service.js';
import { QuestionPackGeneratorService } from './questionPack.generator.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_COUNCIL_PERSONA_IDS = [
  'qf-product-strategist',
  'qf-backend-architect',
  'qf-software-architect',
  'qf-delivery-manager',
  'qf-security-compliance',
  'qf-business-commercial',
  'qf-user-advocate',
  'qf-skeptic-red-team',
];

const TOKEN_OVERLAP_THRESHOLD = 0.7;

// ─── Service ─────────────────────────────────────────────────────────────────

export class QuestionForgeService {
  private readonly inputNormalizer: InputNormalizerService;
  private readonly questionRanker: QuestionRankerService;
  private readonly debateFlow: DebateFlowExtension;
  private readonly interviewCapture: InterviewCaptureService;
  private readonly questionPackGenerator: QuestionPackGeneratorService;
  private readonly eventBus: EventBusService;

  private readonly forgeResults: Map<string, ForgeResult> = new Map();

  constructor(eventBus: EventBusService) {
    this.eventBus = eventBus;
    this.inputNormalizer = new InputNormalizerService();
    this.questionRanker = new QuestionRankerService();
    this.debateFlow = new DebateFlowExtension(eventBus);
    this.interviewCapture = new InterviewCaptureService(eventBus);
    this.questionPackGenerator = new QuestionPackGeneratorService();

    logger.info('QuestionForgeService initialized');
  }

  /**
   * Main pipeline: takes a forge request and produces a full ForgeResult.
   *
   * Steps:
   *  1. Normalize input
   *  2. Run council debate
   *  3. Extract + deduplicate questions
   *  4. Rank questions
   *  5. Generate stakeholder-specific packs
   *  6. Prepare interview scripts per stakeholder
   *  7. Publish completion event
   */
  async forge(request: ForgeRequest): Promise<ForgeResult> {
    const startTime = Date.now();
    const projectBriefId = randomUUID();

    logger.info('QuestionForge pipeline started', {
      projectBriefId,
      inputType: request.inputType,
      stakeholderRoles: request.stakeholderRoles,
    });

    try {
      // Step 1: Normalize input
      logger.info('Step 1: Normalizing input', { projectBriefId });
      const normalizedBrief = await this.inputNormalizer.normalize(
        request.projectBriefText,
        request.inputType
      );

      // Step 2: Run council debate
      logger.info('Step 2: Running council debate', { projectBriefId });
      const personaIds = request.agentPersonaIds?.length
        ? request.agentPersonaIds
        : DEFAULT_COUNCIL_PERSONA_IDS;

      const debateResult = await this.debateFlow.runCouncilDebate({
        projectBriefId,
        normalizedBrief,
        agentPersonaIds: personaIds,
      });

      // Step 3: Extract and deduplicate questions from debate results
      logger.info('Step 3: Extracting and deduplicating questions', { projectBriefId });
      const rawQuestions = this.extractQuestionsFromDebate(debateResult as unknown as Record<string, unknown>);
      const deduplicatedQuestions = this.deduplicateQuestions(rawQuestions);

      logger.info('Questions extracted', {
        projectBriefId,
        rawCount: rawQuestions.length,
        deduplicatedCount: deduplicatedQuestions.length,
      });

      // Step 4: Rank questions
      logger.info('Step 4: Ranking questions', { projectBriefId });
      const assumptions: Assumption[] = (debateResult as unknown as { assumptions?: Assumption[] }).assumptions ?? [];
      const contradictions: Contradiction[] = debateResult.contradictions ?? [];
      const scores = this.questionRanker.rankQuestions(
        deduplicatedQuestions,
        assumptions,
        contradictions
      );

      // Sort questions by score for downstream use
      const scoreMap = new Map(scores.map((s) => [s.questionId, s.totalScore]));
      const rankedQuestions = deduplicatedQuestions
        .slice()
        .sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0));

      // Step 5: Generate stakeholder-specific packs
      logger.info('Step 5: Generating question packs', { projectBriefId });
      const stakeholderRoles = request.stakeholderRoles ?? [];
      const questionPacks = this.questionPackGenerator.generatePacks({
        projectBriefId,
        questions: rankedQuestions,
        assumptions,
        contradictions,
        scores,
        stakeholderRoles,
      });

      // Step 6: Prepare interview scripts per stakeholder
      logger.info('Step 6: Preparing interview scripts', { projectBriefId });
      const interviewScripts = new Map<string, unknown>();
      for (const [role, pack] of questionPacks.entries()) {
        const orderedQuestions = (pack.questions as Question[])
          .slice()
          .sort((a: Question, b: Question) => b.priority - a.priority);
        interviewScripts.set(role, {
          stakeholderRole: role,
          questions: orderedQuestions,
          totalQuestions: orderedQuestions.length,
        });
      }

      const processingTimeMs = Date.now() - startTime;

      const forgeResult: ForgeResult = {
        projectBriefId,
        normalizedBrief,
        debateResult,
        questionPacks: Object.fromEntries(questionPacks) as ForgeResult['questionPacks'],
        topAssumptions: assumptions,
        contradictions,
        interviewScripts: Object.fromEntries(interviewScripts) as ForgeResult['interviewScripts'],
        metadata: {
          totalQuestions: rankedQuestions.length,
          totalAssumptions: assumptions.length,
          totalContradictions: contradictions.length,
          processingTimeMs,
        },
      };

      // Cache result for later interview session creation
      this.forgeResults.set(projectBriefId, forgeResult);

      // Step 7: Publish completion event
      logger.info('Step 7: Publishing completion event', {
        projectBriefId,
        processingTimeMs,
      });

      await this.eventBus.publish('questionforge.forge.completed', {
        projectBriefId,
        totalQuestions: rankedQuestions.length,
        totalAssumptions: assumptions.length,
        totalContradictions: contradictions.length,
        stakeholderRoles: Array.from(questionPacks.keys()),
        processingTimeMs,
      });

      logger.info('QuestionForge pipeline completed', {
        projectBriefId,
        totalQuestions: rankedQuestions.length,
        processingTimeMs,
      });

      return forgeResult;
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      logger.error('QuestionForge pipeline failed', {
        projectBriefId,
        processingTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Creates an interview session from a cached forge result for a specific stakeholder.
   */
  async startInterview(forgeResultId: string, stakeholderRole: string): Promise<InterviewSession> {
    const forgeResult = this.forgeResults.get(forgeResultId);
    if (!forgeResult) {
      throw new Error(`Forge result not found: ${forgeResultId}`);
    }

    const script = (forgeResult.interviewScripts as Record<string, unknown>)[stakeholderRole] as (typeof forgeResult.interviewScripts)[string] | undefined;
    if (!script) {
      throw new Error(`No interview script found for stakeholder role: ${stakeholderRole}`);
    }

    const session = {
      id: randomUUID(),
      forgeResultId,
      stakeholderRole,
      questions: script.questions,
      currentQuestionIndex: 0,
      answers: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    } as unknown as InterviewSession;

    logger.info('Interview session created', {
      sessionId: session.id,
      forgeResultId,
      stakeholderRole,
      totalQuestions: session.questions.length,
    });

    return session;
  }

  /**
   * Remove near-duplicate questions using token overlap comparison.
   * Two questions are considered duplicates if their token overlap ratio
   * exceeds the threshold.
   */
  deduplicateQuestions(questions: Question[]): Question[] {
    if (questions.length === 0) return [];

    const unique: Question[] = [];

    for (const question of questions) {
      const isDuplicate = unique.some(
        (existing) =>
          this.computeTokenOverlap(existing.text, question.text) >= TOKEN_OVERLAP_THRESHOLD
      );

      if (!isDuplicate) {
        unique.push(question);
      }
    }

    return unique;
  }

  /**
   * Convert AgentAnalysis questions from debate results into typed Question objects.
   */
  extractQuestionsFromDebate(debateResult: Record<string, unknown>): Question[] {
    const questions: Question[] = [];
    const agentAnalyses = debateResult.agentAnalyses ?? debateResult.analyses ?? [];

    for (const analysis of agentAnalyses as unknown[]) {
      const a = analysis as Record<string, unknown>;
      const agentQuestions = (a.questions ?? a.generatedQuestions ?? []) as unknown[];
      const stakeholderId = a.agentId ?? a.personaId;
      const stakeholderName = a.agentName ?? a.personaName ?? stakeholderId;

      for (const _q of agentQuestions) {
        const q = _q as Record<string, unknown>;
        const question: Question = {
          id: (q.id as string | undefined) ?? randomUUID(),
          projectBriefId: (debateResult.projectBriefId as string | undefined) ?? '',
          stakeholderId: stakeholderId as string | undefined,
          stakeholderName: stakeholderName as string | undefined,
          category: (q.category as QuestionCategory | undefined) ?? QuestionCategory.ASSUMPTION_REVEAL,
          text: typeof q === 'string' ? q : ((q.text ?? q.question ?? '') as string),
          intent: (q.intent as string | undefined) ?? 'Discover hidden assumptions and stakeholder needs',
          priority: (q.priority as number | undefined) ?? 5,
          phase: (q.phase as QuestionPhase | undefined) ?? QuestionPhase.DISCOVERY,
          tags: (q.tags as string[] | undefined) ?? [],
          status: QuestionStatus.DRAFT,
          usageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        if (question.text) {
          questions.push(question);
        }
      }
    }

    return questions;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Compute the Jaccard-like token overlap ratio between two strings.
   * Returns a value between 0 (no overlap) and 1 (identical token sets).
   */
  private computeTokenOverlap(textA: string, textB: string): number {
    const tokensA = this.tokenize(textA);
    const tokensB = this.tokenize(textB);

    if (tokensA.size === 0 && tokensB.size === 0) return 1;
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersectionSize = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) {
        intersectionSize++;
      }
    }

    const unionSize = new Set([...tokensA, ...tokensB]).size;
    return unionSize > 0 ? intersectionSize / unionSize : 0;
  }

  /**
   * Tokenize a string into a set of lowercase words, filtering short tokens.
   */
  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2)
    );
  }
}
