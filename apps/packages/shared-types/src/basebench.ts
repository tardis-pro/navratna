import { z } from 'zod';

export const BaseBenchTaskFamilySchema = z.enum([
  'ambiguous_stakeholder_prompt',
  'confidence_calibration',
  'ask_vs_guess',
  'self_correction_trap',
  'belief_update_after_evidence',
  'error_prediction_before_answering',
  'boundary_of_knowledge',
  'adversarial_bluff_resistance',
]);

export type BaseBenchTaskFamily = z.infer<typeof BaseBenchTaskFamilySchema>;

export const BaseBenchDifficultySchema = z.enum(['easy', 'medium', 'hard', 'expert']);
export type BaseBenchDifficulty = z.infer<typeof BaseBenchDifficultySchema>;

export const BaseBenchActionChoiceSchema = z.enum(['answer', 'ask', 'abstain', 'conditional']);
export type BaseBenchActionChoice = z.infer<typeof BaseBenchActionChoiceSchema>;

export const BaseBenchAdversarialPressureSchema = z.enum(['none', 'mild', 'strong']);
export type BaseBenchAdversarialPressure = z.infer<typeof BaseBenchAdversarialPressureSchema>;

export const BaseBenchConfidenceShiftSchema = z.enum(['increase', 'decrease', 'maintain']);
export type BaseBenchConfidenceShift = z.infer<typeof BaseBenchConfidenceShiftSchema>;

export const BaseBenchKnowledgeBoundaryLabelSchema = z.enum([
  'directly_known',
  'inferred',
  'assumed',
  'uncertain',
]);

export type BaseBenchKnowledgeBoundaryLabel = z.infer<typeof BaseBenchKnowledgeBoundaryLabelSchema>;

const confidenceBandSchema = z
  .tuple([z.number().min(0).max(100), z.number().min(0).max(100)])
  .refine(([minimum, maximum]) => minimum <= maximum, {
    message: 'referenceConfidenceBand minimum must be less than or equal to maximum',
  });

export const BaseBenchSelfCorrectionExpectationSchema = z.object({
  followUpPrompt: z.string().min(1),
  acceptableDetectedIssues: z.array(z.string()).default([]),
  acceptableFailedAssumptions: z.array(z.string()).default([]),
});

export type BaseBenchSelfCorrectionExpectation = z.infer<
  typeof BaseBenchSelfCorrectionExpectationSchema
>;

export const BaseBenchEvidenceUpdateSchema = z.object({
  newEvidence: z.string().min(1),
  revisedGroundTruthAnswer: z.string().nullable().optional(),
  expectedConfidenceShift: BaseBenchConfidenceShiftSchema.optional(),
  notes: z.string().optional(),
});

export type BaseBenchEvidenceUpdate = z.infer<typeof BaseBenchEvidenceUpdateSchema>;

export const BaseBenchKnowledgeBoundaryExpectationSchema = z.object({
  segment: z.string().min(1),
  expectedLabel: BaseBenchKnowledgeBoundaryLabelSchema,
});

export type BaseBenchKnowledgeBoundaryExpectation = z.infer<
  typeof BaseBenchKnowledgeBoundaryExpectationSchema
>;

export const BaseBenchTestCaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  taskFamily: BaseBenchTaskFamilySchema,
  domain: z.string().min(1),
  prompt: z.string().min(1),
  groundTruthAnswer: z.string().nullable(),
  acceptableAnswerSet: z.array(z.string()).default([]),
  isAnswerable: z.boolean(),
  requiresClarification: z.boolean(),
  acceptableClarificationQuestions: z.array(z.string()).default([]),
  ambiguityType: z.string().optional(),
  difficulty: BaseBenchDifficultySchema,
  expectedBehavior: BaseBenchActionChoiceSchema,
  highCostIfWrong: z.boolean().default(false),
  adversarialPressure: BaseBenchAdversarialPressureSchema.default('none'),
  referenceConfidenceBand: confidenceBandSchema,
  tags: z.array(z.string()).default([]),
  evaluationNotes: z.string().optional(),
  selfCorrection: BaseBenchSelfCorrectionExpectationSchema.optional(),
  evidenceUpdate: BaseBenchEvidenceUpdateSchema.optional(),
  knowledgeBoundaryExpectations: z.array(BaseBenchKnowledgeBoundaryExpectationSchema).default([]),
});

export type BaseBenchTestCase = z.infer<typeof BaseBenchTestCaseSchema>;

export const BaseBenchSelfCritiqueSchema = z.object({
  couldBeWrong: z.boolean(),
  detectedIssues: z.array(z.string()).default([]),
  failedAssumptions: z.array(z.string()).default([]),
  overturnEvidence: z.string().nullable().optional(),
});

export type BaseBenchSelfCritique = z.infer<typeof BaseBenchSelfCritiqueSchema>;

export const BaseBenchKnowledgeBoundaryAssessmentSchema = z.object({
  segment: z.string().min(1),
  label: BaseBenchKnowledgeBoundaryLabelSchema,
});

export type BaseBenchKnowledgeBoundaryAssessment = z.infer<
  typeof BaseBenchKnowledgeBoundaryAssessmentSchema
>;

export const BaseBenchModelOutputSchema = z.object({
  answer: z.string().nullable(),
  preAnswerConfidence: z.number().min(0).max(100).nullable().optional(),
  confidence: z.number().min(0).max(100),
  actionChoice: BaseBenchActionChoiceSchema,
  clarificationQuestion: z.string().nullable(),
  clarificationQuestions: z.array(z.string()).default([]),
  uncertaintyRationale: z.string().default(''),
  knowledgeBoundary: z.array(BaseBenchKnowledgeBoundaryAssessmentSchema).default([]),
  selfCritique: BaseBenchSelfCritiqueSchema.optional(),
  revisedAnswer: z.string().nullable().optional(),
  revisedConfidence: z.number().min(0).max(100).nullable().optional(),
});

export type BaseBenchModelOutput = z.infer<typeof BaseBenchModelOutputSchema>;

export const BaseBenchComponentScoreSchema = z.object({
  actionAppropriateness: z.number().min(0).max(1),
  calibrationQuality: z.number().min(0).max(1),
  answerAccuracy: z.number().min(0).max(1),
  clarificationQuality: z.number().min(0).max(1),
  selfErrorDetection: z.number().min(0).max(1),
  beliefUpdating: z.number().min(0).max(1),
  overconfidencePenalty: z.number().min(0).max(1),
  unnecessaryAbstentionPenalty: z.number().min(0).max(1),
  metaScore: z.number().min(0).max(100),
});

export type BaseBenchComponentScore = z.infer<typeof BaseBenchComponentScoreSchema>;

export const BaseBenchEvaluationVerdictSchema = z.enum(['pass', 'needs_review', 'fail']);
export type BaseBenchEvaluationVerdict = z.infer<typeof BaseBenchEvaluationVerdictSchema>;

export const BaseBenchCaseEvaluationResultSchema = z.object({
  caseId: z.string(),
  title: z.string(),
  taskFamily: BaseBenchTaskFamilySchema,
  actionChoice: BaseBenchActionChoiceSchema,
  confidence: z.number().min(0).max(100),
  revisedConfidence: z.number().min(0).max(100).nullable().optional(),
  score: BaseBenchComponentScoreSchema,
  verdict: BaseBenchEvaluationVerdictSchema,
  notes: z.array(z.string()).default([]),
  evaluatedAt: z.string().datetime(),
});

export type BaseBenchCaseEvaluationResult = z.infer<typeof BaseBenchCaseEvaluationResultSchema>;

export const BaseBenchReliabilityBucketSchema = z.object({
  bucketStart: z.number().min(0).max(100),
  bucketEnd: z.number().min(0).max(100),
  itemCount: z.number().int().min(0),
  averageConfidence: z.number().min(0).max(100),
  accuracy: z.number().min(0).max(1),
  gap: z.number().min(-1).max(1),
});

export type BaseBenchReliabilityBucket = z.infer<typeof BaseBenchReliabilityBucketSchema>;

export const BaseBenchCalibrationAnalyticsSchema = z.object({
  answeredCaseCount: z.number().int().min(0),
  calibrationError: z.number().min(0).max(1),
  brierScore: z.number().min(0).max(1),
  overconfidenceRate: z.number().min(0).max(1),
  underconfidenceRate: z.number().min(0).max(1),
  reliabilityCurve: z.array(BaseBenchReliabilityBucketSchema),
});

export type BaseBenchCalibrationAnalytics = z.infer<typeof BaseBenchCalibrationAnalyticsSchema>;

export const BaseBenchCaseSummarySchema = BaseBenchTestCaseSchema.pick({
  id: true,
  title: true,
  taskFamily: true,
  domain: true,
  difficulty: true,
  expectedBehavior: true,
  highCostIfWrong: true,
  adversarialPressure: true,
  tags: true,
});

export type BaseBenchCaseSummary = z.infer<typeof BaseBenchCaseSummarySchema>;

export const BaseBenchCaseEvaluationRequestSchema = z
  .object({
    caseId: z.string().min(1).optional(),
    testCase: BaseBenchTestCaseSchema.optional(),
    response: BaseBenchModelOutputSchema,
  })
  .superRefine((value, context) => {
    if (!value.caseId && !value.testCase) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either caseId or testCase must be provided',
      });
    }
  });

export type BaseBenchCaseEvaluationRequest = z.infer<typeof BaseBenchCaseEvaluationRequestSchema>;

export const BaseBenchBatchEntrySchema = z.object({
  caseId: z.string().min(1),
  response: BaseBenchModelOutputSchema,
});

export type BaseBenchBatchEntry = z.infer<typeof BaseBenchBatchEntrySchema>;

export const BaseBenchBatchEvaluationRequestSchema = z.object({
  entries: z.array(BaseBenchBatchEntrySchema).min(1),
});

export type BaseBenchBatchEvaluationRequest = z.infer<typeof BaseBenchBatchEvaluationRequestSchema>;

export const BaseBenchRunSummarySchema = z.object({
  totalCases: z.number().int().min(0),
  averageMetaScore: z.number().min(0).max(100),
  verdictCounts: z.record(BaseBenchEvaluationVerdictSchema, z.number().int().min(0)),
  familyAverages: z.record(BaseBenchTaskFamilySchema, z.number().min(0).max(100)),
  calibration: BaseBenchCalibrationAnalyticsSchema,
  evaluatedAt: z.string().datetime(),
});

export type BaseBenchRunSummary = z.infer<typeof BaseBenchRunSummarySchema>;

export const BaseBenchBatchEvaluationResultSchema = z.object({
  results: z.array(BaseBenchCaseEvaluationResultSchema),
  summary: BaseBenchRunSummarySchema,
});

export type BaseBenchBatchEvaluationResult = z.infer<typeof BaseBenchBatchEvaluationResultSchema>;

export const BaseBenchSchemas = {
  TaskFamily: BaseBenchTaskFamilySchema,
  Difficulty: BaseBenchDifficultySchema,
  ActionChoice: BaseBenchActionChoiceSchema,
  AdversarialPressure: BaseBenchAdversarialPressureSchema,
  ConfidenceShift: BaseBenchConfidenceShiftSchema,
  KnowledgeBoundaryLabel: BaseBenchKnowledgeBoundaryLabelSchema,
  TestCase: BaseBenchTestCaseSchema,
  KnowledgeBoundaryExpectation: BaseBenchKnowledgeBoundaryExpectationSchema,
  SelfCritique: BaseBenchSelfCritiqueSchema,
  KnowledgeBoundaryAssessment: BaseBenchKnowledgeBoundaryAssessmentSchema,
  ModelOutput: BaseBenchModelOutputSchema,
  ComponentScore: BaseBenchComponentScoreSchema,
  EvaluationVerdict: BaseBenchEvaluationVerdictSchema,
  ReliabilityBucket: BaseBenchReliabilityBucketSchema,
  CalibrationAnalytics: BaseBenchCalibrationAnalyticsSchema,
  CaseSummary: BaseBenchCaseSummarySchema,
  CaseEvaluationRequest: BaseBenchCaseEvaluationRequestSchema,
  BatchEvaluationRequest: BaseBenchBatchEvaluationRequestSchema,
  CaseEvaluationResult: BaseBenchCaseEvaluationResultSchema,
  BatchEvaluationResult: BaseBenchBatchEvaluationResultSchema,
  RunSummary: BaseBenchRunSummarySchema,
};

export type BaseBenchScoredCaseResult = BaseBenchCaseEvaluationResult;
