import type {
  BaseBenchBatchEntry,
  BaseBenchBatchEvaluationResult,
  BaseBenchCaseEvaluationRequest,
  BaseBenchCaseEvaluationResult,
  BaseBenchCaseSummary,
  BaseBenchRunSummary,
  BaseBenchTaskFamily,
  BaseBenchTestCase,
} from '@uaip/types';
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

    return {
      totalCases,
      averageMetaScore,
      verdictCounts,
      familyAverages: this.scorer.summarizeByFamily(results),
      evaluatedAt: new Date().toISOString(),
    };
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
