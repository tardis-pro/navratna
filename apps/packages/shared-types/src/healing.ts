export type CIFailureType = 'test' | 'lint' | 'build' | 'runtime' | 'unknown'

export type HealingAction = 'auto-apply' | 'review' | 'escalate'

export interface CIFailureClassification {
  type: CIFailureType
  summary: string
  affectedFiles: string[]
  rawOutput: string
}

export interface HealingFix {
  file: string
  diff: string
  description: string
}

export interface HealingDiagnosis {
  id: string
  prUrl: string
  classification: CIFailureClassification
  confidence: number
  action: HealingAction
  fixes: HealingFix[]
  hypotheses: string[]
  attemptedStrategies: string[]
  createdAt: string
}
