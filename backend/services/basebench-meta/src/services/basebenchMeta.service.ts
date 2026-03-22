import type {
  BaseBenchBatchEntry,
  BaseBenchBatchEvaluationResult,
  BaseBenchCaseEvaluationRequest,
  BaseBenchCaseSummary,
  BaseBenchCalibrationAnalytics,
  BaseBenchCaseEvaluationResult,
  BaseBenchReliabilityBucket,
  BaseBenchRunSummary,
  BaseBenchTaskFamily,
  BaseBenchTestCase,
} from './basebenchTypes.js';
import { logger } from '@uaip/utils';

import { baseBenchMetaCases } from '../fixtures/basebenchMetaCases.js';
import { BaseBenchScoringService } from './basebenchScoring.service.js';

export class BaseBenchMetaService {
  private readonly cases = new Map<string, BaseBenchTestCase>();
  private readonly scorer = new BaseBenchScoringService();

  constructor() {
    for (const testCase of baseBenchMetaCases) {
      this.cases.set(testCase.id, testCase);
    }

    logger.info('BaseBenchMetaService initialized', { caseCount: this.cases.size });
  }

  listCases(): BaseBenchCaseSummary[] {
    return Array.from(this.cases.values()).map((testCase) => ({
      id: testCase.id,
      title: testCase.title,
      taskFamily: testCase.taskFamily,
      domain: testCase.domain,
      difficulty: testCase.difficulty,
      expectedBehavior: testCase.expectedBehavior,
      highCostIfWrong: testCase.highCostIfWrong,
      adversarialPressure: testCase.adversarialPressure,
      tags: testCase.tags,
    }));
  }

  listFamilies(): BaseBenchTaskFamily[] {
    return [
      'ambiguous_stakeholder_prompt',
      'confidence_calibration',
      'ask_vs_guess',
      'self_correction_trap',
      'belief_update_after_evidence',
      'error_prediction_before_answering',
      'boundary_of_knowledge',
      'adversarial_bluff_resistance',
    ];
  }

  getCase(caseId: string): BaseBenchTestCase | null {
    return this.cases.get(caseId) ?? null;
  }

  evaluateCase(request: BaseBenchCaseEvaluationRequest): BaseBenchCaseEvaluationResult {
    const testCase = request.testCase ?? this.resolveCase(request.caseId);
    return this.scorer.evaluateCase(testCase, request.response);
  }

  evaluateBatch(entries: BaseBenchBatchEntry[]): BaseBenchBatchEvaluationResult {
    const results = entries.map((entry) =>
      this.scorer.evaluateCase(this.resolveCase(entry.caseId), entry.response),
    );

    const summary = this.buildSummary(results);
    return {
      results,
      summary,
    };
  }

  private buildSummary(results: BaseBenchCaseEvaluationResult[]): BaseBenchRunSummary {
    const totalCases = results.length;
    const averageMetaScore =
      totalCases === 0
        ? 0
        : Number(
            (
              results.reduce((sum, result) => sum + result.score.metaScore, 0) / totalCases
            ).toFixed(2),
          );

    const verdictCounts = {
      pass: 0,
      needs_review: 0,
      fail: 0,
    };

    for (const result of results) {
      verdictCounts[result.verdict] += 1;
    }

    const summary: BaseBenchRunSummary = {
      totalCases,
      averageMetaScore,
      verdictCounts,
      familyAverages: this.scorer.summarizeByFamily(results),
      calibration: this.buildCalibrationAnalytics(results),
      evaluatedAt: new Date().toISOString(),
    };

    return summary;
  }

  private buildCalibrationAnalytics(
    results: BaseBenchCaseEvaluationResult[],
  ): BaseBenchCalibrationAnalytics {
    const answeredResults = results.filter(
      (result) => result.actionChoice === 'answer' || result.actionChoice === 'conditional',
    );

    if (answeredResults.length === 0) {
      return {
        answeredCaseCount: 0,
        calibrationError: 0,
        brierScore: 0,
        overconfidenceRate: 0,
        underconfidenceRate: 0,
        reliabilityCurve: this.createEmptyReliabilityCurve(),
      };
    }

    const probabilities = answeredResults.map((result) => ({
      probability: result.confidence / 100,
      outcome: result.score.answerAccuracy,
    }));

    const calibrationError = Number(
      (
        probabilities.reduce(
          (sum, item) => sum + Math.abs(item.probability - item.outcome),
          0,
        ) / answeredResults.length
      ).toFixed(4),
    );

    const brierScore = Number(
      (
        probabilities.reduce(
          (sum, item) => sum + (item.probability - item.outcome) ** 2,
          0,
        ) / answeredResults.length
      ).toFixed(4),
    );

    const overconfidenceRate = Number(
      (
        probabilities.reduce(
          (sum, item) => sum + Math.max(0, item.probability - item.outcome),
          0,
        ) / answeredResults.length
      ).toFixed(4),
    );

    const underconfidenceRate = Number(
      (
        probabilities.reduce(
          (sum, item) => sum + Math.max(0, item.outcome - item.probability),
          0,
        ) / answeredResults.length
      ).toFixed(4),
    );

    return {
      answeredCaseCount: answeredResults.length,
      calibrationError,
      brierScore,
      overconfidenceRate,
      underconfidenceRate,
      reliabilityCurve: this.buildReliabilityCurve(answeredResults),
    };
  }

  private buildReliabilityCurve(
    results: BaseBenchCaseEvaluationResult[],
  ): BaseBenchReliabilityBucket[] {
    const buckets = Array.from({ length: 10 }, (_, index) => {
      const bucketStart = index * 10;
      const bucketEnd = bucketStart + 10;
      const entries = results.filter((result) => {
        if (index === 9) {
          return result.confidence >= bucketStart && result.confidence <= 100;
        }

        return result.confidence >= bucketStart && result.confidence < bucketEnd;
      });

      if (entries.length === 0) {
        return {
          bucketStart,
          bucketEnd,
          itemCount: 0,
          averageConfidence: 0,
          accuracy: 0,
          gap: 0,
        };
      }

      const averageConfidence =
        entries.reduce((sum, entry) => sum + entry.confidence, 0) / entries.length;
      const accuracy = entries.reduce((sum, entry) => sum + entry.score.answerAccuracy, 0) / entries.length;

      return {
        bucketStart,
        bucketEnd,
        itemCount: entries.length,
        averageConfidence: Number(averageConfidence.toFixed(2)),
        accuracy: Number(accuracy.toFixed(4)),
        gap: Number((averageConfidence / 100 - accuracy).toFixed(4)),
      };
    });

    return buckets;
  }

  private createEmptyReliabilityCurve(): BaseBenchReliabilityBucket[] {
    return Array.from({ length: 10 }, (_, index) => ({
      bucketStart: index * 10,
      bucketEnd: index * 10 + 10,
      itemCount: 0,
      averageConfidence: 0,
      accuracy: 0,
      gap: 0,
    }));
  }

  private resolveCase(caseId?: string): BaseBenchTestCase {
    if (!caseId) {
      throw new Error('caseId is required when testCase is not provided');
    }

    const testCase = this.cases.get(caseId);
    if (!testCase) {
      throw new Error(`BaseBench case not found: ${caseId}`);
    }

    return testCase;
  }
}
