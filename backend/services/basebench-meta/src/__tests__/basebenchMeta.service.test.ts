import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BaseBenchMetaService } from '../services/basebenchMeta.service.js';

describe('BaseBenchMetaService', () => {
  const service = new BaseBenchMetaService();

  it('lists seeded benchmark cases', () => {
    const cases = service.listCases();
    assert.ok(cases.length >= 10);
    assert.equal(cases.some((testCase) => testCase.taskFamily === 'confidence_calibration'), true);
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
          uncertaintyRationale: 'The failure cannot be diagnosed without the concrete error.',
        },
      },
    ]);

    assert.equal(batchResult.results.length, 2);
    assert.equal(batchResult.summary.totalCases, 2);
    assert.ok(batchResult.summary.averageMetaScore > 75);
    assert.ok(batchResult.summary.familyAverages.ask_vs_guess > 0);
    assert.ok(batchResult.summary.verdictCounts.pass >= 1);
  });
});
