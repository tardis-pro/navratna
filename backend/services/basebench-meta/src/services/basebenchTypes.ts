export type BaseBenchTaskFamily =
  | 'ambiguous_stakeholder_prompt'
  | 'confidence_calibration'
  | 'ask_vs_guess'
  | 'self_correction_trap'
  | 'belief_update_after_evidence'
  | 'error_prediction_before_answering'
  | 'boundary_of_knowledge'
  | 'adversarial_bluff_resistance';

export type BaseBenchDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type BaseBenchActionChoice = 'answer' | 'ask' | 'abstain' | 'conditional';
export type BaseBenchAdversarialPressure = 'none' | 'mild' | 'strong';
export type BaseBenchConfidenceShift = 'increase' | 'decrease' | 'maintain';
export type BaseBenchKnowledgeBoundaryLabel =
  | 'directly_known'
  | 'inferred'
  | 'assumed'
  | 'uncertain';

export interface BaseBenchSelfCorrectionExpectation {
  followUpPrompt: string;
  acceptableDetectedIssues: string[];
  acceptableFailedAssumptions: string[];
}

export interface BaseBenchEvidenceUpdate {
  newEvidence: string;
  revisedGroundTruthAnswer?: string | null;
  expectedConfidenceShift?: BaseBenchConfidenceShift;
  notes?: string;
}

export interface BaseBenchKnowledgeBoundaryExpectation {
  segment: string;
  expectedLabel: BaseBenchKnowledgeBoundaryLabel;
}

export interface BaseBenchKnowledgeBoundaryAssessment {
  segment: string;
  label: BaseBenchKnowledgeBoundaryLabel;
}

export interface BaseBenchTestCase {
  id: string;
  title: string;
  taskFamily: BaseBenchTaskFamily;
  domain: string;
  prompt: string;
  groundTruthAnswer: string | null;
  acceptableAnswerSet: string[];
  isAnswerable: boolean;
  requiresClarification: boolean;
  acceptableClarificationQuestions: string[];
  ambiguityType?: string;
  difficulty: BaseBenchDifficulty;
  expectedBehavior: BaseBenchActionChoice;
  highCostIfWrong: boolean;
  adversarialPressure: BaseBenchAdversarialPressure;
  referenceConfidenceBand: readonly [number, number];
  tags: string[];
  evaluationNotes?: string;
  selfCorrection?: BaseBenchSelfCorrectionExpectation;
  evidenceUpdate?: BaseBenchEvidenceUpdate;
  knowledgeBoundaryExpectations?: BaseBenchKnowledgeBoundaryExpectation[];
}

export interface BaseBenchSelfCritique {
  couldBeWrong: boolean;
  detectedIssues: string[];
  failedAssumptions: string[];
  overturnEvidence?: string | null;
}

export interface BaseBenchModelOutput {
  answer: string | null;
  preAnswerConfidence?: number | null;
  confidence: number;
  actionChoice: BaseBenchActionChoice;
  clarificationQuestion: string | null;
  clarificationQuestions?: string[];
  uncertaintyRationale: string;
  knowledgeBoundary?: BaseBenchKnowledgeBoundaryAssessment[];
  selfCritique?: BaseBenchSelfCritique;
  revisedAnswer?: string | null;
  revisedConfidence?: number | null;
}

export interface BaseBenchComponentScore {
  actionAppropriateness: number;
  calibrationQuality: number;
  answerAccuracy: number;
  clarificationQuality: number;
  selfErrorDetection: number;
  beliefUpdating: number;
  overconfidencePenalty: number;
  unnecessaryAbstentionPenalty: number;
  metaScore: number;
}

export type BaseBenchEvaluationVerdict = 'pass' | 'needs_review' | 'fail';

export interface BaseBenchCaseSummary {
  id: string;
  title: string;
  taskFamily: BaseBenchTaskFamily;
  domain: string;
  difficulty: BaseBenchDifficulty;
  expectedBehavior: BaseBenchActionChoice;
  highCostIfWrong: boolean;
  adversarialPressure: BaseBenchAdversarialPressure;
  tags: string[];
}

export interface BaseBenchCaseEvaluationRequest {
  caseId?: string;
  testCase?: BaseBenchTestCase;
  response: BaseBenchModelOutput;
}

export interface BaseBenchBatchEntry {
  caseId?: string;
  response: BaseBenchModelOutput;
}

export interface BaseBenchCaseEvaluationResult {
  caseId: string;
  title: string;
  taskFamily: BaseBenchTaskFamily;
  actionChoice: BaseBenchActionChoice;
  confidence: number;
  revisedConfidence?: number | null;
  score: BaseBenchComponentScore;
  verdict: BaseBenchEvaluationVerdict;
  notes: string[];
  evaluatedAt: string;
}

export interface BaseBenchReliabilityBucket {
  bucketStart: number;
  bucketEnd: number;
  itemCount: number;
  averageConfidence: number;
  accuracy: number;
  gap: number;
}

export interface BaseBenchCalibrationAnalytics {
  answeredCaseCount: number;
  calibrationError: number;
  brierScore: number;
  overconfidenceRate: number;
  underconfidenceRate: number;
  reliabilityCurve: BaseBenchReliabilityBucket[];
}

export interface BaseBenchRunSummary {
  totalCases: number;
  averageMetaScore: number;
  verdictCounts: Record<BaseBenchEvaluationVerdict, number>;
  familyAverages: Record<BaseBenchTaskFamily, number>;
  calibration: BaseBenchCalibrationAnalytics;
  evaluatedAt: string;
}

export interface BaseBenchBatchEvaluationResult {
  results: BaseBenchCaseEvaluationResult[];
  summary: BaseBenchRunSummary;
}
