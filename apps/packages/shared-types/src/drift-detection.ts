export type DriftSignalType =
  | 'new-todo'
  | 'growing-file'
  | 'dead-export'
  | 'dependency-drift'
  | 'coverage-drop'

export interface DriftSignal {
  type: DriftSignalType
  file: string
  description: string
  severity: 'low' | 'medium' | 'high'
  detectedAt: string
}

export interface DriftReport {
  repoSource: string
  runAt: string
  signals: DriftSignal[]
  generatedStories: number
  previousSnapshotAt?: string
}
