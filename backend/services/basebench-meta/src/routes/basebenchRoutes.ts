import type { AnyElysia } from 'elysia';
import {
  BaseBenchBatchEvaluationRequestSchema,
  BaseBenchCaseEvaluationRequestSchema,
} from '@uaip/types';
import { logger } from '@uaip/utils';

import type {
  BaseBenchBatchEntry,
  BaseBenchCaseEvaluationRequest,
  BaseBenchModelOutput,
  BaseBenchTestCase,
} from '../services/basebenchTypes.js';

import { BaseBenchMetaService } from '../services/basebenchMeta.service.js';

export function registerBaseBenchRoutes(
  app: AnyElysia,
  baseBenchService: BaseBenchMetaService
): AnyElysia {
  return app.group('/api/v1/basebench', (g: AnyElysia) =>
    g
      .get('/cases', () => ({
        success: true,
        data: baseBenchService.listCases(),
      }))
      .get('/families', () => ({
        success: true,
        data: baseBenchService.listFamilies(),
      }))
      .get(
        '/cases/:caseId',
        ({ params, set }: { params: Record<string, string>; set: { status: number } }) => {
          const testCase = baseBenchService.getCase(params.caseId);
          if (!testCase) {
            set.status = 404;
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'BaseBench case not found' },
            };
          }

          return {
            success: true,
            data: testCase,
          };
        }
      )
      .post(
        '/evaluate',
        ({ body, set }: { body: Record<string, unknown>; set: { status: number } }) => {
          const parsed = BaseBenchCaseEvaluationRequestSchema.safeParse(body);
          if (!parsed.success) {
            set.status = 400;
            return {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid BaseBench evaluation request',
                details: parsed.error.flatten(),
              },
            };
          }

          try {
            const request = toCaseEvaluationRequest(parsed.data);
            return {
              success: true,
              data: baseBenchService.evaluateCase(request),
            };
          } catch (error) {
            logger.error('Failed to evaluate BaseBench case', { error });
            set.status = 400;
            return {
              success: false,
              error: {
                code: 'EVALUATION_ERROR',
                message:
                  error instanceof Error ? error.message : 'Failed to evaluate BaseBench case',
              },
            };
          }
        }
      )
      .post(
        '/evaluate/batch',
        ({ body, set }: { body: Record<string, unknown>; set: { status: number } }) => {
          const parsed = BaseBenchBatchEvaluationRequestSchema.safeParse(body);
          if (!parsed.success) {
            set.status = 400;
            return {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid BaseBench batch evaluation request',
                details: parsed.error.flatten(),
              },
            };
          }

          try {
            const entries = parsed.data.entries.map(toBatchEntry);
            return {
              success: true,
              data: baseBenchService.evaluateBatch(entries),
            };
          } catch (error) {
            logger.error('Failed to evaluate BaseBench batch run', { error });
            set.status = 400;
            return {
              success: false,
              error: {
                code: 'BATCH_EVALUATION_ERROR',
                message:
                  error instanceof Error ? error.message : 'Failed to evaluate BaseBench batch run',
              },
            };
          }
        }
      )
  );
}

function toCaseEvaluationRequest(value: {
  caseId?: string;
  testCase?: Record<string, unknown>;
  response?: Record<string, unknown>;
}): BaseBenchCaseEvaluationRequest {
  return {
    caseId: typeof value.caseId === 'string' ? value.caseId : undefined,
    testCase: isRecord(value.testCase) ? toTestCase(value.testCase) : undefined,
    response: toModelOutput(value.response),
  };
}

function toBatchEntry(value: {
  caseId?: string;
  response?: Record<string, unknown>;
}): BaseBenchBatchEntry {
  return {
    caseId: typeof value.caseId === 'string' ? value.caseId : undefined,
    response: toModelOutput(value.response),
  };
}

function toModelOutput(value?: Record<string, unknown>): BaseBenchModelOutput {
  const source = isRecord(value) ? value : {};
  const answer = toNullableString(source.answer);
  const clarificationQuestion = toNullableString(source.clarificationQuestion);
  const revisedAnswer = toNullableString(source.revisedAnswer);
  const groundlessActionChoice = source.actionChoice;

  return {
    answer,
    preAnswerConfidence:
      typeof source.preAnswerConfidence === 'number' ? source.preAnswerConfidence : null,
    confidence: typeof source.confidence === 'number' ? source.confidence : 0,
    actionChoice:
      groundlessActionChoice === 'answer' ||
      groundlessActionChoice === 'ask' ||
      groundlessActionChoice === 'abstain' ||
      groundlessActionChoice === 'conditional'
        ? groundlessActionChoice
        : 'answer',
    clarificationQuestion,
    clarificationQuestions: Array.isArray(source.clarificationQuestions)
      ? source.clarificationQuestions.filter(
          (question): question is string => typeof question === 'string'
        )
      : [],
    uncertaintyRationale:
      typeof source.uncertaintyRationale === 'string' ? source.uncertaintyRationale : '',
    knowledgeBoundary: Array.isArray(source.knowledgeBoundary)
      ? source.knowledgeBoundary.flatMap((item) => {
          if (!isRecord(item) || typeof item.segment !== 'string') {
            return [];
          }

          if (
            item.label !== 'directly_known' &&
            item.label !== 'inferred' &&
            item.label !== 'assumed' &&
            item.label !== 'uncertain'
          ) {
            return [];
          }

          return [{ segment: item.segment, label: item.label }];
        })
      : [],
    selfCritique: isRecord(source.selfCritique)
      ? {
          couldBeWrong: source.selfCritique.couldBeWrong === true,
          detectedIssues: Array.isArray(source.selfCritique.detectedIssues)
            ? source.selfCritique.detectedIssues.filter(
                (issue): issue is string => typeof issue === 'string'
              )
            : [],
          failedAssumptions: Array.isArray(source.selfCritique.failedAssumptions)
            ? source.selfCritique.failedAssumptions.filter(
                (issue): issue is string => typeof issue === 'string'
              )
            : [],
          overturnEvidence:
            typeof source.selfCritique.overturnEvidence === 'string' ||
            source.selfCritique.overturnEvidence === null
              ? source.selfCritique.overturnEvidence
              : null,
        }
      : undefined,
    revisedAnswer,
    revisedConfidence:
      typeof source.revisedConfidence === 'number' ? source.revisedConfidence : null,
  };
}

function toTestCase(value: Record<string, unknown>): BaseBenchTestCase {
  const groundTruthAnswer = toNullableString(value.groundTruthAnswer);

  return {
    id: typeof value.id === 'string' ? value.id : '',
    title: typeof value.title === 'string' ? value.title : '',
    taskFamily:
      value.taskFamily === 'ambiguous_stakeholder_prompt' ||
      value.taskFamily === 'confidence_calibration' ||
      value.taskFamily === 'ask_vs_guess' ||
      value.taskFamily === 'self_correction_trap' ||
      value.taskFamily === 'belief_update_after_evidence' ||
      value.taskFamily === 'error_prediction_before_answering' ||
      value.taskFamily === 'boundary_of_knowledge' ||
      value.taskFamily === 'adversarial_bluff_resistance'
        ? value.taskFamily
        : 'confidence_calibration',
    domain: typeof value.domain === 'string' ? value.domain : '',
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    groundTruthAnswer,
    acceptableAnswerSet: Array.isArray(value.acceptableAnswerSet)
      ? value.acceptableAnswerSet.filter((item): item is string => typeof item === 'string')
      : [],
    isAnswerable: value.isAnswerable === true,
    requiresClarification: value.requiresClarification === true,
    acceptableClarificationQuestions: Array.isArray(value.acceptableClarificationQuestions)
      ? value.acceptableClarificationQuestions.filter(
          (item): item is string => typeof item === 'string'
        )
      : [],
    ambiguityType: typeof value.ambiguityType === 'string' ? value.ambiguityType : undefined,
    difficulty:
      value.difficulty === 'easy' ||
      value.difficulty === 'medium' ||
      value.difficulty === 'hard' ||
      value.difficulty === 'expert'
        ? value.difficulty
        : 'medium',
    expectedBehavior:
      value.expectedBehavior === 'answer' ||
      value.expectedBehavior === 'ask' ||
      value.expectedBehavior === 'abstain' ||
      value.expectedBehavior === 'conditional'
        ? value.expectedBehavior
        : 'answer',
    highCostIfWrong: value.highCostIfWrong === true,
    adversarialPressure:
      value.adversarialPressure === 'none' ||
      value.adversarialPressure === 'mild' ||
      value.adversarialPressure === 'strong'
        ? value.adversarialPressure
        : 'none',
    referenceConfidenceBand:
      Array.isArray(value.referenceConfidenceBand) && value.referenceConfidenceBand.length >= 2
        ? [
            typeof value.referenceConfidenceBand[0] === 'number'
              ? value.referenceConfidenceBand[0]
              : 0,
            typeof value.referenceConfidenceBand[1] === 'number'
              ? value.referenceConfidenceBand[1]
              : 100,
          ]
        : [0, 100],
    tags: Array.isArray(value.tags)
      ? value.tags.filter((item): item is string => typeof item === 'string')
      : [],
    evaluationNotes: typeof value.evaluationNotes === 'string' ? value.evaluationNotes : undefined,
    selfCorrection: isRecord(value.selfCorrection)
      ? {
          followUpPrompt:
            typeof value.selfCorrection.followUpPrompt === 'string'
              ? value.selfCorrection.followUpPrompt
              : '',
          acceptableDetectedIssues: Array.isArray(value.selfCorrection.acceptableDetectedIssues)
            ? value.selfCorrection.acceptableDetectedIssues.filter(
                (item): item is string => typeof item === 'string'
              )
            : [],
          acceptableFailedAssumptions: Array.isArray(
            value.selfCorrection.acceptableFailedAssumptions
          )
            ? value.selfCorrection.acceptableFailedAssumptions.filter(
                (item): item is string => typeof item === 'string'
              )
            : [],
        }
      : undefined,
    evidenceUpdate: isRecord(value.evidenceUpdate)
      ? {
          newEvidence:
            typeof value.evidenceUpdate.newEvidence === 'string'
              ? value.evidenceUpdate.newEvidence
              : '',
          revisedGroundTruthAnswer:
            typeof value.evidenceUpdate.revisedGroundTruthAnswer === 'string' ||
            value.evidenceUpdate.revisedGroundTruthAnswer === null
              ? value.evidenceUpdate.revisedGroundTruthAnswer
              : null,
          expectedConfidenceShift:
            value.evidenceUpdate.expectedConfidenceShift === 'increase' ||
            value.evidenceUpdate.expectedConfidenceShift === 'decrease' ||
            value.evidenceUpdate.expectedConfidenceShift === 'maintain'
              ? value.evidenceUpdate.expectedConfidenceShift
              : undefined,
          notes:
            typeof value.evidenceUpdate.notes === 'string' ? value.evidenceUpdate.notes : undefined,
        }
      : undefined,
    knowledgeBoundaryExpectations: Array.isArray(value.knowledgeBoundaryExpectations)
      ? value.knowledgeBoundaryExpectations.flatMap((item) => {
          if (!isRecord(item) || typeof item.segment !== 'string') {
            return [];
          }

          if (
            item.expectedLabel !== 'directly_known' &&
            item.expectedLabel !== 'inferred' &&
            item.expectedLabel !== 'assumed' &&
            item.expectedLabel !== 'uncertain'
          ) {
            return [];
          }

          return [{ segment: item.segment, expectedLabel: item.expectedLabel }];
        })
      : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
