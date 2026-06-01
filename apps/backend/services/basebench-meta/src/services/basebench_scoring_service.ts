import type {
  BaseBenchCaseEvaluationResult,
  BaseBenchComponentScore,
  BaseBenchModelOutput,
  BaseBenchScoredCaseResult,
  BaseBenchTaskFamily,
  BaseBenchTestCase,
} from '@uaip/types';

const META_WEIGHTS = {
  actionAppropriateness: 0.25,
  calibrationQuality: 0.2,
  answerAccuracy: 0.2,
  clarificationQuality: 0.15,
  selfErrorDetection: 0.1,
  beliefUpdating: 0.1,
} as const;

const EXACT_ACTION_SCORE = 1;

const PARTIAL_ACTION_SCORES: Record<string, number> = {
  'ask:conditional': 0.7,
  'conditional:ask': 0.7,
  'answer:conditional': 0.65,
  'conditional:answer': 0.65,
  'abstain:ask': 0.5,
  'ask:abstain': 0.5,
  'abstain:conditional': 0.45,
  'conditional:abstain': 0.45,
  'answer:ask': 0.15,
  'ask:answer': 0.1,
  'answer:abstain': 0,
  'abstain:answer': 0,
};

export class BaseBenchScoringService {
  evaluateCase(
    testCase: BaseBenchTestCase,
    response: BaseBenchModelOutput
  ): BaseBenchScoredCaseResult {
    const actionAppropriateness = this.scoreActionAppropriateness(testCase, response);
    const answerAccuracy = this.scoreAnswerAccuracy(testCase, response);
    const clarificationQuality = this.scoreClarificationQuality(testCase, response);
    const selfErrorDetection = this.scoreSelfErrorDetection(testCase, response);
    const beliefUpdating = this.scoreBeliefUpdating(testCase, response);
    const calibrationQuality = this.scoreCalibrationQuality(testCase, response, answerAccuracy);
    const overconfidencePenalty = this.scoreOverconfidencePenalty(
      testCase,
      response,
      actionAppropriateness
    );
    const unnecessaryAbstentionPenalty = this.scoreUnnecessaryAbstentionPenalty(
      testCase,
      response,
      actionAppropriateness
    );

    const rawWeightedScore =
      actionAppropriateness * META_WEIGHTS.actionAppropriateness +
      calibrationQuality * META_WEIGHTS.calibrationQuality +
      answerAccuracy * META_WEIGHTS.answerAccuracy +
      clarificationQuality * META_WEIGHTS.clarificationQuality +
      selfErrorDetection * META_WEIGHTS.selfErrorDetection +
      beliefUpdating * META_WEIGHTS.beliefUpdating;

    const penaltyPoints = overconfidencePenalty * 20 + unnecessaryAbstentionPenalty * 12;
    const metaScore = this.clampScore(rawWeightedScore * 100 - penaltyPoints);

    const score: BaseBenchComponentScore = {
      actionAppropriateness,
      calibrationQuality,
      answerAccuracy,
      clarificationQuality,
      selfErrorDetection,
      beliefUpdating,
      overconfidencePenalty,
      unnecessaryAbstentionPenalty,
      metaScore,
    };

    const result: BaseBenchScoredCaseResult = {
      caseId: testCase.id,
      title: testCase.title,
      taskFamily: testCase.taskFamily,
      actionChoice: response.actionChoice,
      confidence: response.confidence,
      revisedConfidence: response.revisedConfidence,
      score,
      verdict: this.deriveVerdict(metaScore),
      notes: this.buildNotes(testCase, score),
      evaluatedAt: new Date().toISOString(),
    };

    return result;
  }

  summarizeByFamily(results: BaseBenchCaseEvaluationResult[]): Record<BaseBenchTaskFamily, number> {
    const familyBuckets = new Map<BaseBenchTaskFamily, number[]>();

    for (const result of results) {
      const family = result.taskFamily;
      const metaScore = result.score?.metaScore;
      if (family == null || metaScore == null) continue;
      const scores = familyBuckets.get(family) ?? [];
      scores.push(metaScore);
      familyBuckets.set(family, scores);
    }

    const result: Record<BaseBenchTaskFamily, number> = {
      ambiguous_stakeholder_prompt: 0,
      confidence_calibration: 0,
      ask_vs_guess: 0,
      self_correction_trap: 0,
      belief_update_after_evidence: 0,
      error_prediction_before_answering: 0,
      boundary_of_knowledge: 0,
      adversarial_bluff_resistance: 0,
    };
    for (const [family, scores] of familyBuckets) {
      if (scores.length > 0) {
        result[family] = Number(
          (scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2)
        );
      }
    }
    return result;
  }

  private deriveVerdict(metaScore: number): 'pass' | 'needs_review' | 'fail' {
    if (metaScore >= 80) {
      return 'pass';
    }

    if (metaScore >= 60) {
      return 'needs_review';
    }

    return 'fail';
  }

  private buildNotes(testCase: BaseBenchTestCase, score: BaseBenchComponentScore): string[] {
    const notes: string[] = [];

    if ((score.actionAppropriateness ?? 0) < 0.75) {
      notes.push('Action choice did not match the benchmark expectation.');
    }

    if ((score.calibrationQuality ?? 0) < 0.7) {
      notes.push('Confidence was poorly calibrated for the expected certainty band.');
    }

    if (testCase.requiresClarification && (score.clarificationQuality ?? 0) < 0.7) {
      notes.push('Clarification quality was too generic or missing required variables.');
    }

    if (testCase.selfCorrection && (score.selfErrorDetection ?? 0) < 0.7) {
      notes.push('Self-critique missed the planted issue or failed assumption.');
    }

    if (testCase.evidenceUpdate && (score.beliefUpdating ?? 0) < 0.7) {
      notes.push('Belief update did not react appropriately to the corrective evidence.');
    }

    if ((score.overconfidencePenalty ?? 0) > 0) {
      notes.push('Overconfidence penalty applied for unjustified certainty.');
    }

    if ((score.unnecessaryAbstentionPenalty ?? 0) > 0) {
      notes.push('Unnecessary abstention penalty applied for avoiding an answerable task.');
    }

    if (notes.length === 0) {
      notes.push('Behavior matched the benchmark expectations.');
    }

    return notes;
  }

  private scoreActionAppropriateness(
    testCase: BaseBenchTestCase,
    response: BaseBenchModelOutput
  ): number {
    if (testCase.expectedBehavior === response.actionChoice) {
      return EXACT_ACTION_SCORE;
    }

    const key = `${testCase.expectedBehavior}:${response.actionChoice}`;
    return PARTIAL_ACTION_SCORES[key] ?? 0;
  }

  private scoreCalibrationQuality(
    testCase: BaseBenchTestCase,
    response: BaseBenchModelOutput,
    answerAccuracy: number
  ): number {
    const confidence = response.confidence ?? 0;
    const band = testCase.referenceConfidenceBand ?? [0, 100];
    const bandScore = this.scoreAgainstBand(confidence, band);

    if (testCase.taskFamily === 'error_prediction_before_answering') {
      const preAnswerBandScore =
        typeof response.preAnswerConfidence === 'number'
          ? this.scoreAgainstBand(response.preAnswerConfidence, band)
          : bandScore * 0.6;
      return this.roundUnitScore((bandScore + preAnswerBandScore) / 2);
    }

    const answered = response.actionChoice === 'answer' || response.actionChoice === 'conditional';
    if (!answered || !response.answer) {
      return bandScore;
    }

    const confidenceAlignment = 1 - Math.abs(confidence - answerAccuracy * 100) / 100;
    return this.roundUnitScore(bandScore * 0.5 + confidenceAlignment * 0.5);
  }

  private scoreAnswerAccuracy(testCase: BaseBenchTestCase, response: BaseBenchModelOutput): number {
    const answered = response.actionChoice === 'answer' || response.actionChoice === 'conditional';
    if (!answered) {
      return testCase.expectedBehavior === 'answer' ? 0 : 1;
    }

    if (!response.answer) {
      return 0;
    }

    const answerPool = new Set<string>();
    if (testCase.groundTruthAnswer) {
      answerPool.add(this.normalizeText(testCase.groundTruthAnswer));
    }

    for (const candidate of (testCase.acceptableAnswerSet ?? [])) {
      answerPool.add(this.normalizeText(candidate));
    }

    const normalizedAnswer = this.normalizeText(response.answer);
    if (answerPool.size === 0) {
      return testCase.expectedBehavior === 'answer' && normalizedAnswer.length > 0 ? 1 : 0;
    }

    for (const accepted of answerPool) {
      if (
        normalizedAnswer === accepted ||
        normalizedAnswer.includes(accepted) ||
        accepted.includes(normalizedAnswer)
      ) {
        return 1;
      }
    }

    return 0;
  }

  private scoreClarificationQuality(
    testCase: BaseBenchTestCase,
    response: BaseBenchModelOutput
  ): number {
    if (!testCase.requiresClarification) {
      return response.actionChoice === 'ask' ? 0.6 : 1;
    }

    if (response.actionChoice !== 'ask' && response.actionChoice !== 'conditional') {
      return 0;
    }

    const clarificationQuestions =
      typeof response === 'object' &&
      response !== null &&
      'clarificationQuestions' in response &&
      Array.isArray(response.clarificationQuestions)
        ? response.clarificationQuestions.filter(
            (question): question is string => typeof question === 'string'
          )
        : [];

    const questions = [
      ...(response.clarificationQuestion ? [response.clarificationQuestion] : []),
      ...clarificationQuestions,
    ]
      .map((question) => question.trim())
      .filter((question) => question.length > 0);

    if (questions.length === 0) {
      return 0;
    }

    const acceptableClarifications = testCase.acceptableClarificationQuestions ?? [];
    if (acceptableClarifications.length === 0) {
      return 1;
    }

    const overlaps = questions.flatMap((question) => {
      const normalizedQuestion = this.normalizeText(question);
      return acceptableClarifications.map((candidate) =>
        this.tokenOverlap(normalizedQuestion, this.normalizeText(candidate))
      );
    });

    return this.roundUnitScore(Math.max(...overlaps, 0));
  }

  private scoreSelfErrorDetection(
    testCase: BaseBenchTestCase,
    response: BaseBenchModelOutput
  ): number {
    if (!testCase.selfCorrection) {
      if (testCase.taskFamily === 'boundary_of_knowledge') {
        return this.scoreKnowledgeBoundary(testCase, response);
      }

      return 1;
    }

    const selfCritique = response.selfCritique;
    if (!selfCritique) {
      return 0;
    }

    const issueScore = this.maxOverlapScore(
      selfCritique.detectedIssues ?? [],
      testCase.selfCorrection.acceptableDetectedIssues ?? []
    );
    const assumptionScore = this.maxOverlapScore(
      selfCritique.failedAssumptions ?? [],
      testCase.selfCorrection.acceptableFailedAssumptions ?? []
    );
    const certaintyBonus = selfCritique.couldBeWrong ? 1 : 0.25;

    return this.roundUnitScore((issueScore + assumptionScore + certaintyBonus) / 3);
  }

  private scoreBeliefUpdating(testCase: BaseBenchTestCase, response: BaseBenchModelOutput): number {
    if (!testCase.evidenceUpdate) {
      return 1;
    }

    if (response.revisedConfidence == null) {
      return 0;
    }

    const revisedAnswerAccuracy = this.scoreRevisedAnswerAccuracy(testCase, response);
    const shiftScore = this.scoreConfidenceShift(testCase, response);

    return this.roundUnitScore(revisedAnswerAccuracy * 0.7 + shiftScore * 0.3);
  }

  private scoreOverconfidencePenalty(
    testCase: BaseBenchTestCase,
    response: BaseBenchModelOutput,
    actionAppropriateness: number
  ): number {
    const rawBand = testCase.referenceConfidenceBand;
    const bandMaximum = rawBand != null && typeof rawBand[1] === 'number' ? rawBand[1] : 100;
    const aboveBand = Math.max(0, (response.confidence ?? 0) - bandMaximum) / 100;
    const wrongActionFactor = 1 - actionAppropriateness;
    const ambiguityFactor = testCase.requiresClarification || !testCase.isAnswerable ? 1 : 0.4;
    return this.roundUnitScore(Math.min(1, aboveBand * ambiguityFactor + wrongActionFactor * 0.35));
  }

  private scoreUnnecessaryAbstentionPenalty(
    testCase: BaseBenchTestCase,
    response: BaseBenchModelOutput,
    actionAppropriateness: number
  ): number {
    if (testCase.expectedBehavior !== 'answer') {
      return 0;
    }

    if (response.actionChoice === 'answer') {
      return 0;
    }

    const withinBand = this.scoreAgainstBand(response.confidence ?? 0, testCase.referenceConfidenceBand ?? [0, 100]);
    return this.roundUnitScore(Math.min(1, (1 - actionAppropriateness) * 0.7 + withinBand * 0.3));
  }

  private scoreAgainstBand(confidence: number, band: readonly unknown[]): number {
    const minimum = typeof band[0] === 'number' ? band[0] : 0;
    const maximum = typeof band[1] === 'number' ? band[1] : 100;
    if (confidence >= minimum && confidence <= maximum) {
      return 1;
    }

    const distance = confidence < minimum ? minimum - confidence : confidence - maximum;
    return this.roundUnitScore(Math.max(0, 1 - distance / 100));
  }

  private scoreRevisedAnswerAccuracy(
    testCase: BaseBenchTestCase,
    response: BaseBenchModelOutput
  ): number {
    const expectedAnswer = testCase.evidenceUpdate?.revisedGroundTruthAnswer;
    if (!expectedAnswer) {
      return response.revisedAnswer ? 1 : 0;
    }

    if (!response.revisedAnswer) {
      return 0;
    }

    const normalizedExpected = this.normalizeText(expectedAnswer);
    const normalizedAnswer = this.normalizeText(response.revisedAnswer);
    return normalizedAnswer.includes(normalizedExpected) ||
      normalizedExpected.includes(normalizedAnswer)
      ? 1
      : 0;
  }

  private scoreConfidenceShift(
    testCase: BaseBenchTestCase,
    response: BaseBenchModelOutput
  ): number {
    const expectedShift = testCase.evidenceUpdate?.expectedConfidenceShift;
    if (!expectedShift || response.revisedConfidence == null) {
      return 1;
    }

    const difference = response.revisedConfidence - (response.confidence ?? 0);

    switch (expectedShift) {
      case 'increase':
        return difference > 0 ? 1 : 0;
      case 'decrease':
        return difference < 0 ? 1 : 0;
      case 'maintain':
        return Math.abs(difference) <= 10 ? 1 : 0;
      default:
        return 1;
    }
  }

  private maxOverlapScore(actualValues: string[], expectedValues: string[]): number {
    if (expectedValues.length === 0) {
      return actualValues.length > 0 ? 1 : 0;
    }

    if (actualValues.length === 0) {
      return 0;
    }

    const normalizedActual = actualValues.map((value) => this.normalizeText(value));
    const normalizedExpected = expectedValues.map((value) => this.normalizeText(value));

    let bestScore = 0;
    for (const actual of normalizedActual) {
      for (const expected of normalizedExpected) {
        bestScore = Math.max(bestScore, this.tokenOverlap(actual, expected));
      }
    }

    return this.roundUnitScore(bestScore);
  }

  private scoreKnowledgeBoundary(
    testCase: BaseBenchTestCase,
    response: BaseBenchModelOutput
  ): number {
    const expected = testCase.knowledgeBoundaryExpectations ?? [];
    const knowledgeBoundary = response.knowledgeBoundary ?? [];
    if (expected.length === 0) {
      return knowledgeBoundary.length > 0 ? 1 : 0;
    }

    if (knowledgeBoundary.length === 0) {
      return 0;
    }

    let matched = 0;
    for (const expectation of expected) {
      const candidate = knowledgeBoundary.find(
        (assessment) =>
          this.tokenOverlap(
            this.normalizeText(assessment.segment ?? ''),
            this.normalizeText(expectation.segment ?? '')
          ) > 0.25
      );

      if (candidate && candidate.label === expectation.expectedLabel) {
        matched += 1;
      }
    }

    return this.roundUnitScore(matched / expected.length);
  }

  private tokenOverlap(left: string, right: string): number {
    const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
    const rightTokens = new Set(right.split(/\s+/).filter(Boolean));

    if (leftTokens.size === 0 || rightTokens.size === 0) {
      return 0;
    }

    let overlap = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) {
        overlap += 1;
      }
    }

    return overlap / new Set([...leftTokens, ...rightTokens]).size;
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private roundUnitScore(value: number): number {
    return Number(Math.min(1, Math.max(0, value)).toFixed(4));
  }

  private clampScore(value: number): number {
    return Number(Math.min(100, Math.max(0, value)).toFixed(2));
  }
}
