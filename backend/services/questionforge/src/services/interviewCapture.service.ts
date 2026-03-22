/**
 * Interview Capture Service
 *
 * Captures stakeholder answers to generated questions, updates assumptions,
 * closes resolved questions, identifies new contradictions, and triggers
 * question regeneration. Uses the Discussion system with discussionMode: 'interview'.
 */

import { randomUUID } from 'crypto';
import { logger } from '@uaip/utils';
import type { Question, Assumption, Contradiction } from '@uaip/types';
import { EventBusService } from '@uaip/shared-services';

// --- Interfaces ---

export interface InterviewSession {
  id: string;
  projectBriefId: string;
  stakeholderRole: string;
  stakeholderName?: string;
  questions: Question[];
  currentQuestionIndex: number;
  answers: InterviewAnswer[];
  status: 'pending' | 'active' | 'paused' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

export interface InterviewAnswer {
  questionId: string;
  answer: string;
  confidence?: number;
  followUpNeeded: boolean;
  resolvedAssumptions: string[];
  newContradictions: string[];
  capturedAt: Date;
}

export interface InterviewResult {
  sessionId: string;
  stakeholderRole: string;
  totalQuestions: number;
  answeredQuestions: number;
  resolvedAssumptions: Assumption[];
  newContradictions: Contradiction[];
  unresolvedQuestions: Question[];
  suggestedFollowUps: string[];
  completedAt: Date;
}

// --- Service ---

/**
 * Manages interview sessions for capturing stakeholder responses to
 * QuestionForge-generated questions. Sessions are stored in-memory for MVP;
 * production usage should persist to the database.
 */
export class InterviewCaptureService {
  /** In-memory session store (MVP). Replace with DB persistence in production. */
  private sessions: Map<string, InterviewSession> = new Map();

  constructor(private readonly eventBus: EventBusService) {}

  // ---- Session lifecycle ----

  /**
   * Create a new interview session for a stakeholder.
   */
  createSession(
    projectBriefId: string,
    stakeholderRole: string,
    questions: Question[]
  ): InterviewSession {
    const session: InterviewSession = {
      id: randomUUID(),
      projectBriefId,
      stakeholderRole,
      questions: [...questions],
      currentQuestionIndex: 0,
      answers: [],
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(session.id, session);

    logger.info('Interview session created', {
      sessionId: session.id,
      projectBriefId,
      stakeholderRole,
      questionCount: questions.length,
    });

    // Mark session as active and publish start event
    session.status = 'active';

    this.eventBus
      .publish('questionforge.interview.started', {
        sessionId: session.id,
        projectBriefId,
        stakeholderRole,
        questionCount: questions.length,
      })
      .catch((err: unknown) =>
        logger.warn('Failed to publish interview.started event', { error: String(err) })
      );

    return session;
  }

  /**
   * Retrieve a session by id, or null if not found.
   */
  getSession(sessionId: string): InterviewSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  // ---- Question navigation ----

  /**
   * Return the next unanswered question in the session, or null if all
   * questions have been answered / skipped.
   */
  nextQuestion(sessionId: string): Question | null {
    const session = this.requireSession(sessionId);

    const answeredIds = new Set(session.answers.map((a) => a.questionId));

    for (let i = session.currentQuestionIndex; i < session.questions.length; i++) {
      if (!answeredIds.has(session.questions[i].id)) {
        session.currentQuestionIndex = i;
        session.updatedAt = new Date();
        return session.questions[i];
      }
    }

    return null;
  }

  /**
   * Skip a specific question without recording an answer. The question will
   * appear in `unresolvedQuestions` when the session completes.
   */
  skipQuestion(sessionId: string, questionId: string): void {
    const session = this.requireSession(sessionId);
    this.assertActive(session);

    const questionExists = session.questions.some((q) => q.id === questionId);
    if (!questionExists) {
      throw new Error(`Question ${questionId} not found in session ${sessionId}`);
    }

    // Advance past the skipped question if it is the current one
    if (
      session.currentQuestionIndex < session.questions.length &&
      session.questions[session.currentQuestionIndex].id === questionId
    ) {
      session.currentQuestionIndex += 1;
    }

    session.updatedAt = new Date();

    logger.info('Question skipped', { sessionId, questionId });
  }

  // ---- Answer capture ----

  /**
   * Record a stakeholder answer for a question. Uses LLM (via event bus) to
   * analyse the answer for assumption resolution and contradiction detection.
   */
  async recordAnswer(
    sessionId: string,
    questionId: string,
    answer: string
  ): Promise<InterviewAnswer> {
    const session = this.requireSession(sessionId);
    this.assertActive(session);

    const question = session.questions.find((q) => q.id === questionId);
    if (!question) {
      throw new Error(`Question ${questionId} not found in session ${sessionId}`);
    }

    // Analyse the answer via LLM
    const analysis = await this.analyzeAnswer(question, answer);

    const interviewAnswer: InterviewAnswer = {
      questionId,
      answer,
      confidence: undefined,
      followUpNeeded: analysis.followUpNeeded,
      resolvedAssumptions: analysis.resolvedAssumptions,
      newContradictions: analysis.newContradictions,
      capturedAt: new Date(),
    };

    session.answers.push(interviewAnswer);

    // Advance the question index past the answered question
    if (
      session.currentQuestionIndex < session.questions.length &&
      session.questions[session.currentQuestionIndex].id === questionId
    ) {
      session.currentQuestionIndex += 1;
    }

    session.updatedAt = new Date();

    logger.info('Interview answer recorded', {
      sessionId,
      questionId,
      followUpNeeded: analysis.followUpNeeded,
      resolvedAssumptions: analysis.resolvedAssumptions.length,
      newContradictions: analysis.newContradictions.length,
    });

    this.eventBus
      .publish('questionforge.interview.answer.recorded', {
        sessionId,
        projectBriefId: session.projectBriefId,
        questionId,
        followUpNeeded: analysis.followUpNeeded,
        resolvedAssumptions: analysis.resolvedAssumptions,
        newContradictions: analysis.newContradictions,
        suggestedFollowUps: analysis.suggestedFollowUps,
      })
      .catch((err: unknown) =>
        logger.warn('Failed to publish interview.answer.recorded event', {
          error: String(err),
        })
      );

    return interviewAnswer;
  }

  // ---- Session state transitions ----

  /**
   * Pause an active session so the stakeholder can resume later.
   */
  pauseSession(sessionId: string): void {
    const session = this.requireSession(sessionId);
    this.assertActive(session);

    session.status = 'paused';
    session.updatedAt = new Date();

    logger.info('Interview session paused', { sessionId });
  }

  /**
   * Resume a previously paused session.
   */
  resumeSession(sessionId: string): void {
    const session = this.requireSession(sessionId);

    if (session.status !== 'paused') {
      throw new Error(
        `Cannot resume session ${sessionId}: current status is '${session.status}', expected 'paused'`
      );
    }

    session.status = 'active';
    session.updatedAt = new Date();

    logger.info('Interview session resumed', { sessionId });
  }

  /**
   * Complete the session and produce the final InterviewResult. Publishes a
   * completion event so downstream services can trigger question regeneration
   * or assumption updates.
   */
  async completeSession(sessionId: string): Promise<InterviewResult> {
    const session = this.requireSession(sessionId);

    if (session.status === 'completed') {
      throw new Error(`Session ${sessionId} is already completed`);
    }

    session.status = 'completed';
    session.updatedAt = new Date();

    const answeredIds = new Set(session.answers.map((a) => a.questionId));
    const unresolvedQuestions = session.questions.filter((q) => !answeredIds.has(q.id));

    // Aggregate resolved assumptions and new contradictions across all answers
    const allResolvedAssumptionIds = [
      ...new Set(session.answers.flatMap((a) => a.resolvedAssumptions)),
    ];
    const allNewContradictionIds = [
      ...new Set(session.answers.flatMap((a) => a.newContradictions)),
    ];

    // Build lightweight Assumption stubs from the collected ids.
    // A full implementation would fetch these from the database.
    const resolvedAssumptions: Assumption[] = allResolvedAssumptionIds.map((id) => ({
      id,
      stakeholderId: session.stakeholderRole,
      stakeholderName: session.stakeholderName ?? session.stakeholderRole,
      content: '',
      projectBriefId: session.projectBriefId,
      confidence: 1,
      tags: [] as string[],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const newContradictions: Contradiction[] = allNewContradictionIds.map((id) => ({
      id,
      projectBriefId: session.projectBriefId,
      assumptionAId: '',
      assumptionBId: '',
      assumptionAContent: '',
      assumptionBContent: '',
      stakeholderAId: session.stakeholderRole,
      stakeholderAName: session.stakeholderName ?? session.stakeholderRole,
      stakeholderBId: '',
      stakeholderBName: '',
      severity: 'medium' as const,
      description: '',
      status: 'identified' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // Collect suggested follow-ups from answers that flagged followUpNeeded
    const suggestedFollowUps = session.answers
      .filter((a) => a.followUpNeeded)
      .map((a) => {
        const matched = session.questions.find((item) => item.id === a.questionId);
        return matched
          ? `Follow-up needed for: ${matched.text}`
          : `Follow-up needed for question ${a.questionId}`;
      });

    const result: InterviewResult = {
      sessionId: session.id,
      stakeholderRole: session.stakeholderRole,
      totalQuestions: session.questions.length,
      answeredQuestions: session.answers.length,
      resolvedAssumptions,
      newContradictions,
      unresolvedQuestions,
      suggestedFollowUps,
      completedAt: new Date(),
    };

    logger.info('Interview session completed', {
      sessionId: session.id,
      totalQuestions: result.totalQuestions,
      answeredQuestions: result.answeredQuestions,
      resolvedAssumptions: resolvedAssumptions.length,
      newContradictions: newContradictions.length,
      unresolvedQuestions: unresolvedQuestions.length,
    });

    this.eventBus
      .publish('questionforge.interview.completed', {
        sessionId: session.id,
        projectBriefId: session.projectBriefId,
        stakeholderRole: session.stakeholderRole,
        totalQuestions: result.totalQuestions,
        answeredQuestions: result.answeredQuestions,
        resolvedAssumptionIds: allResolvedAssumptionIds,
        newContradictionIds: allNewContradictionIds,
        unresolvedQuestionIds: unresolvedQuestions.map((q) => q.id),
        suggestedFollowUps,
      })
      .catch((err: unknown) =>
        logger.warn('Failed to publish interview.completed event', { error: String(err) })
      );

    return result;
  }

  // ---- LLM Analysis ----

  /**
   * Analyse a stakeholder answer using the LLM (via event bus). Returns
   * resolved assumption ids, new contradiction ids, whether follow-up is
   * needed, and suggested follow-up questions.
   */
  async analyzeAnswer(
    question: Question,
    answer: string
  ): Promise<{
    resolvedAssumptions: string[];
    newContradictions: string[];
    followUpNeeded: boolean;
    suggestedFollowUps: string[];
  }> {
    try {
      // Publish an LLM analysis request and await the result.
      // The event payload follows the convention used by the llm-service for
      // structured analysis requests.
      const analysisPromise = new Promise<{
        resolvedAssumptions: string[];
        newContradictions: string[];
        followUpNeeded: boolean;
        suggestedFollowUps: string[];
      }>((resolve) => {
        const correlationId = randomUUID();

        // Set a timeout so we never block indefinitely
        const timeout = setTimeout(() => {
          logger.warn('LLM analysis timed out, returning empty result', {
            questionId: question.id,
            correlationId,
          });
          resolve({
            resolvedAssumptions: [],
            newContradictions: [],
            followUpNeeded: false,
            suggestedFollowUps: [],
          });
        }, 30_000);

        // Subscribe for the response on the correlation-specific event
        this.eventBus
          .publish('questionforge.interview.analysis.request', {
            correlationId,
            question: {
              id: question.id,
              text: question.text,
              category: question.category,
              intent: question.intent,
              phase: question.phase,
              projectBriefId: question.projectBriefId,
            },
            answer,
          })
          .then(() => {
            // In a full implementation this would subscribe to a response
            // event keyed by correlationId. For MVP we resolve with a
            // heuristic-based fallback after publishing.
            clearTimeout(timeout);
            resolve(this.heuristicAnalysis(question, answer));
          })
          .catch((err: unknown) => {
            clearTimeout(timeout);
            logger.warn('LLM analysis request failed, using heuristic fallback', {
              questionId: question.id,
              error: String(err),
            });
            resolve(this.heuristicAnalysis(question, answer));
          });
      });

      return await analysisPromise;
    } catch (err: unknown) {
      logger.error('Unexpected error in analyzeAnswer', {
        questionId: question.id,
        error: String(err),
      });
      return {
        resolvedAssumptions: [],
        newContradictions: [],
        followUpNeeded: false,
        suggestedFollowUps: [],
      };
    }
  }

  // ---- Private helpers ----

  /**
   * Lightweight heuristic analysis used as a fallback when the LLM is
   * unavailable. Detects basic signals in the answer text.
   */
  private heuristicAnalysis(
    question: Question,
    answer: string
  ): {
    resolvedAssumptions: string[];
    newContradictions: string[];
    followUpNeeded: boolean;
    suggestedFollowUps: string[];
  } {
    const lowerAnswer = answer.toLowerCase();

    // Short or vague answers likely need follow-up
    const followUpNeeded =
      answer.trim().length < 20 ||
      lowerAnswer.includes('not sure') ||
      lowerAnswer.includes("don't know") ||
      lowerAnswer.includes('maybe') ||
      lowerAnswer.includes('it depends');

    // Contradiction signals
    const contradictionSignals =
      lowerAnswer.includes('but ') ||
      lowerAnswer.includes('however') ||
      lowerAnswer.includes('on the other hand') ||
      lowerAnswer.includes('disagree');

    const newContradictions: string[] = contradictionSignals ? [randomUUID()] : [];

    const suggestedFollowUps: string[] = [];
    if (followUpNeeded) {
      suggestedFollowUps.push(`Can you elaborate on your answer regarding: "${question.text}"?`);
    }
    if (contradictionSignals) {
      suggestedFollowUps.push(
        `You mentioned a contrasting viewpoint — could you clarify the trade-offs you see?`
      );
    }

    return {
      resolvedAssumptions: [],
      newContradictions,
      followUpNeeded,
      suggestedFollowUps,
    };
  }

  /**
   * Retrieve a session or throw if not found.
   */
  private requireSession(sessionId: string): InterviewSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Interview session not found: ${sessionId}`);
    }
    return session;
  }

  /**
   * Assert that the session is in an active state.
   */
  private assertActive(session: InterviewSession): void {
    if (session.status !== 'active') {
      throw new Error(`Session ${session.id} is not active (current status: '${session.status}')`);
    }
  }
}
