import type { ComplexityResult } from './complexity'
import type { RepoContext } from './repo-context'

export type DevLoopStage =
  | 'repo-ingestion'
  | 'board-setup'
  | 'complexity-routing'
  | 'code-generation'
  | 'ci-healing'

export type DevLoopStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'compensating'

export interface DevLoopCheckpoint {
  stage: DevLoopStage
  status: DevLoopStatus
  completedAt?: string
  error?: string
  data?: Record<string, unknown>
}

export interface DevLoopConfig {
  repoUrl: string
  boardType: 'internal' | 'github' | 'jira'
  boardCredentials?: Record<string, unknown>
  epicTitle: string
  epicDescription?: string
  stories: DevLoopStoryInput[]
  autoHeal: boolean
  healingConfidenceThreshold: number
}

export interface DevLoopStoryInput {
  title: string
  description?: string
  labels?: string[]
}

export interface DevLoopState {
  id: string
  config: DevLoopConfig
  status: DevLoopStatus
  currentStage: DevLoopStage
  checkpoints: DevLoopCheckpoint[]
  repoContext?: RepoContext
  projectId?: string
  epicId?: string
  storyIds: string[]
  prUrls: string[]
  complexityResults: ComplexityResult[]
  startedAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface DevLoopProgressEvent {
  loopId: string
  stage: DevLoopStage
  status: DevLoopStatus
  message: string
  progress?: number
  timestamp: string
}
