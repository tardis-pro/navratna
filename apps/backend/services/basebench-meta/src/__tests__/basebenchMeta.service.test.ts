import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BaseBenchMetaService } from '../services/basebenchMeta.service.js';

describe('BaseBenchMetaService', () => {
  const service = new BaseBenchMetaService();

  it('lists seeded benchmark cases', () => {
    const cases = service.listCases();
    assert.ok(cases.length >= 13);
    assert.equal(
      cases.some((testCase) => testCase.taskFamily === 'confidence_calibration'),
      true
    );
    assert.equal(
      cases.some((testCase) => testCase.taskFamily === 'boundary_of_knowledge'),
      true
    );
  });

  it('evaluates a batch run and returns family averages', () => {
    const batchResult = service.evaluateBatch([
      {
        caseId: 'bbm-calibration-logic-001',
        response: {
          answer: '102',
          confidence: 97,
          actionChoice: 'answer',
          clarificationQuestion: null,
          clarificationQuestions: [],
          uncertaintyRationale: 'Direct multiplication.',
        },
      },
      {
        caseId: 'bbm-ask-guess-debug-001',
        response: {
          answer: null,
          confidence: 18,
          actionChoice: 'ask',
          clarificationQuestion: 'What error message and deployment platform are involved?',
          clarificationQuestions: [],
          uncertaintyRationale: 'The failure cannot be diagnosed without the concrete error.',
        },
      },
    ]);

    assert.equal(batchResult.results.length, 2);
    assert.equal(batchResult.summary.totalCases, 2);
    assert.ok(batchResult.summary.averageMetaScore > 75);
    assert.ok(batchResult.summary.familyAverages.ask_vs_guess > 0);
    assert.ok(batchResult.summary.verdictCounts.pass >= 1);
    assert.equal(batchResult.summary.calibration.answeredCaseCount, 1);
    assert.equal(batchResult.summary.calibration.reliabilityCurve.length, 10);
    assert.ok(batchResult.summary.calibration.calibrationError >= 0);
    assert.ok(batchResult.summary.calibration.brierScore >= 0);
  });

  it('computes explicit calibration analytics for answered cases', () => {
    const batchResult = service.evaluateBatch([
      {
        caseId: 'bbm-calibration-logic-001',
        response: {
          answer: '102',
          confidence: 100,
          actionChoice: 'answer',
          clarificationQuestion: null,
          clarificationQuestions: [],
          uncertaintyRationale: 'Simple arithmetic.',
        },
      },
      {
        caseId: 'bbm-calibration-factual-001',
        response: {
          answer: 'Jupiter',
          confidence: 80,
          actionChoice: 'answer',
          clarificationQuestion: null,
          clarificationQuestions: [],
          uncertaintyRationale: 'I might be recalling an older count.',
        },
      },
    ]);

    assert.equal(batchResult.summary.calibration.answeredCaseCount, 2);
    assert.equal(batchResult.summary.calibration.calibrationError, 0.4);
    assert.equal(batchResult.summary.calibration.brierScore, 0.32);
    assert.equal(batchResult.summary.calibration.overconfidenceRate, 0.4);
    assert.equal(batchResult.summary.calibration.underconfidenceRate, 0);
    const eightyToNinetyBucket = batchResult.summary.calibration.reliabilityCurve.find(
      (bucket) => bucket.bucketStart === 80
    );
    assert.ok(eightyToNinetyBucket);
    assert.equal(eightyToNinetyBucket.itemCount, 1);
    assert.equal(eightyToNinetyBucket.accuracy, 0);
  });
});
