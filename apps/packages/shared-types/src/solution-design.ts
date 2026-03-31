import type { ComplexityTier } from './complexity'

export interface SolutionDesignFileChange {
  path: string
  action: 'create' | 'modify' | 'delete'
  description: string
}

export interface SolutionDesignRisk {
  description: string
  severity: 'low' | 'medium' | 'high'
  mitigation: string
}

export interface SolutionDesign {
  id: string
  storyTitle: string
  tier: ComplexityTier
  summary: string
  affectedFiles: SolutionDesignFileChange[]
  newAbstractions: string[]
  schemaChanges: string[]
  apiSurfaceChanges: string[]
  risks: SolutionDesignRisk[]
  estimatedLOC: number
  createdAt: string
}

export interface DecomposedStory {
  title: string
  description: string
  affectedFiles: string[]
  estimatedLOC: number
  order: number
  labels: string[]
  dependsOn: string[]
}
