export type ComplexityTier = 'execute' | 'architect' | 'council'

export interface ComplexityThresholds {
  executeCeiling: number
  councilFloor: number
}

export interface ComplexitySignalWeights {
  filesTouched: number
  blastRadius: number
  schemaChanges: number
  apiSurface: number
  llmJudgment: number
}

export interface ComplexitySignalBreakdown {
  filesTouched: number
  blastRadius: number
  schemaChanges: number
  apiSurface: number
  llmJudgment: number
}

export interface ComplexityResult {
  score: number
  tier: ComplexityTier
  rationale: string
  affectedModules: string[]
  breakdown: ComplexitySignalBreakdown
}

export const DEFAULT_COMPLEXITY_THRESHOLDS: ComplexityThresholds = {
  executeCeiling: 30,
  councilFloor: 70,
}

export const DEFAULT_SIGNAL_WEIGHTS: ComplexitySignalWeights = {
  filesTouched: 30,
  blastRadius: 30,
  schemaChanges: 20,
  apiSurface: 10,
  llmJudgment: 10,
}
