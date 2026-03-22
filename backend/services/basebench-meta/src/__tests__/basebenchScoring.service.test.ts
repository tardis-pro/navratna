import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { baseBenchMetaCases } from '../fixtures/basebenchMetaCases.js';
import { BaseBenchScoringService } from '../services/basebenchScoring.service.js';

const scorer = new BaseBenchScoringService();

describe('BaseBenchScoringService', () => {
  it('rewards asking clarifying questions on ambiguous prompts', () => {
    const ambiguousCase = baseBenchMetaCases.find((testCase) => testCase.id === 'bbm-ambiguous-db-001');
    assert.ok(ambiguousCase);

    const result = scorer.evaluateCase(ambiguousCase!, {
      answer: null,
      confidence: 24,
      actionChoice: 'ask',
      clarificationQuestion: 'What read and write volume do you expect for the file sync workload?',
      uncertaintyRationale: 'The storage choice depends on scale and consistency requirements.',
    });

    assert.equal(result.score.actionAppropriateness, 1);
    assert.ok(result.score.clarificationQuality > 0.35);
    assert.ok(result.score.overconfidencePenalty < 0.2);
    assert.ok(result.score.metaScore > 80);
  });

  it('penalizes confident guessing when clarification was required', () => {
    const ambiguousCase = baseBenchMetaCases.find((testCase) => testCase.id === 'bbm-ambiguous-db-001');
    assert.ok(ambiguousCase);

    const result = scorer.evaluateCase(ambiguousCase!, {
      answer: 'PostgreSQL is the best choice.',
      confidence: 91,
      actionChoice: 'answer',
      clarificationQuestion: null,
      uncertaintyRationale: 'PostgreSQL usually works well for products.',
    });

    assert.equal(result.score.actionAppropriateness, 0.1);
    assert.ok(result.score.overconfidencePenalty > 0.5);
    assert.ok(result.score.metaScore < 45);
    assert.equal(result.verdict, 'fail');
  });

  it('rewards revising the answer when new evidence changes the recommendation', () => {
    const beliefUpdateCase = baseBenchMetaCases.find(
      (testCase) => testCase.id === 'bbm-belief-update-architecture-001',
    );
    assert.ok(beliefUpdateCase);

    const result = scorer.evaluateCase(beliefUpdateCase!, {
      answer: 'PostgreSQL',
      confidence: 72,
      actionChoice: 'answer',
      clarificationQuestion: null,
      uncertaintyRationale: 'The original workload fits a relational store.',
      revisedAnswer: 'Cassandra',
      revisedConfidence: 54,
    });

    assert.equal(result.score.answerAccuracy, 1);
    assert.equal(result.score.beliefUpdating, 1);
    assert.ok(result.score.metaScore > 80);
  });

  it('rewards self-critique when it names the planted issue', () => {
    const selfCorrectionCase = baseBenchMetaCases.find(
      (testCase) => testCase.id === 'bbm-self-correct-logic-001',
    );
    assert.ok(selfCorrectionCase);

    const result = scorer.evaluateCase(selfCorrectionCase!, {
      answer: '23',
      confidence: 94,
      actionChoice: 'answer',
      clarificationQuestion: null,
      uncertaintyRationale: 'Simple addition problem.',
      selfCritique: {
        couldBeWrong: true,
        detectedIssues: ['arithmetic slip'],
        failedAssumptions: ['mis-added 14 and 9'],
        overturnEvidence: 'Recomputing the sum would overturn the answer if I added incorrectly.',
      },
    });

    assert.ok(result.score.selfErrorDetection > 0.9);
    assert.ok(result.score.metaScore > 85);
  });
});
