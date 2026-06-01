import { getIntelligenceDb, knowledgeItems } from '@uaip/shared-services'
import { eq, and, ilike } from '@uaip/shared-services/drizzle/clients'
import type {
  ComplexityResult,
  ComplexitySignalBreakdown,
  ComplexitySignalWeights,
  ComplexityThresholds,
  ComplexityTier,
  ImportEdge,
  RepoContext,
  StorySpec,
} from '@uaip/types'
import { DEFAULT_COMPLEXITY_THRESHOLDS, DEFAULT_SIGNAL_WEIGHTS } from '@uaip/types'
import { logger } from '@uaip/utils'

const SCHEMA_KEYWORDS = [
  'schema',
  'migration',
  'pgTable',
  'drizzle',
  'entity',
  'typeorm',
  'ALTER TABLE',
  'CREATE TABLE',
  'addColumn',
  'createIndex',
]

const API_KEYWORDS = [
  'endpoint',
  'route',
  'GET ',
  'POST ',
  'PUT ',
  'DELETE ',
  'app.get',
  'app.post',
  'app.put',
  'app.delete',
  'registerRoute',
  'openapi',
  'swagger',
]

export class ComplexityScorerService {
  private thresholds: ComplexityThresholds
  private weights: ComplexitySignalWeights

  constructor(
    thresholds: ComplexityThresholds = DEFAULT_COMPLEXITY_THRESHOLDS,
    weights: ComplexitySignalWeights = DEFAULT_SIGNAL_WEIGHTS
  ) {
    this.thresholds = thresholds
    this.weights = weights
  }

  async score(spec: StorySpec, repoCtx: RepoContext): Promise<ComplexityResult> {
    const specText = `${spec.title} ${spec.description ?? ''}`

    const [filesTouched, blastRadius, schemaChanges, apiSurface, llmJudgment] = await Promise.all([
      this.scoreFilesTouched(specText, repoCtx),
      this.scoreBlastRadius(specText, repoCtx),
      this.scoreSchemaChanges(specText),
      this.scoreApiSurface(specText),
      this.scoreLlmJudgment(specText),
    ])

    const breakdown: ComplexitySignalBreakdown = {
      filesTouched,
      blastRadius,
      schemaChanges,
      apiSurface,
      llmJudgment,
    }

    const rawScore =
      filesTouched * (this.weights.filesTouched / 100) +
      blastRadius * (this.weights.blastRadius / 100) +
      schemaChanges * (this.weights.schemaChanges / 100) +
      apiSurface * (this.weights.apiSurface / 100) +
      llmJudgment * (this.weights.llmJudgment / 100)

    const score = Math.round(Math.min(100, Math.max(0, rawScore)))
    const tier = this.classifyTier(score)
    const affectedModules = this.extractAffectedModules(specText, repoCtx)

    const rationale = this.buildRationale(score, tier, breakdown, affectedModules)

    logger.info('ComplexityScorer result', {
      storyTitle: spec.title,
      score,
      tier,
      affectedModules,
    })

    return { score, tier, rationale, affectedModules, breakdown }
  }

  private classifyTier(score: number): ComplexityTier {
    if (score < this.thresholds.executeCeiling) {
      return 'execute'
    }
    if (score >= this.thresholds.councilFloor) {
      return 'council'
    }
    return 'architect'
  }

  private async scoreFilesTouched(specText: string, repoCtx: RepoContext): Promise<number> {
    const importGraph = await this.loadImportGraph(repoCtx.source)
    if (!importGraph || importGraph.length === 0) {
      return this.heuristicFilesTouched(specText, repoCtx)
    }

    const mentionedFiles = this.extractMentionedFiles(specText, importGraph)
    const transitiveFiles = this.computeTransitiveDependencies(mentionedFiles, importGraph)
    const totalFiles = new Set([...mentionedFiles, ...transitiveFiles]).size

    if (totalFiles <= 1) return 10
    if (totalFiles <= 3) return 30
    if (totalFiles <= 8) return 55
    if (totalFiles <= 15) return 75
    return 100
  }

  private heuristicFilesTouched(specText: string, repoCtx: RepoContext): number {
    const serviceCount = repoCtx.services.length
    const lower = specText.toLowerCase()
    const mentionedServices = repoCtx.services.filter(
      (svc) => lower.includes(svc.name.toLowerCase()) || lower.includes(svc.type.toLowerCase())
    )
    if (mentionedServices.length === 0) return 15
    if (mentionedServices.length === 1) return 25
    const ratio = mentionedServices.length / Math.max(1, serviceCount)
    return Math.round(25 + ratio * 75)
  }

  private async scoreBlastRadius(specText: string, repoCtx: RepoContext): Promise<number> {
    const lower = specText.toLowerCase()
    const mentionedServices = repoCtx.services.filter(
      (svc) =>
        lower.includes(svc.name.toLowerCase()) ||
        (svc.entryPoint && lower.includes(svc.entryPoint.toLowerCase()))
    )

    if (mentionedServices.length === 0) return 10
    if (mentionedServices.length === 1) return 20

    const serviceCount = repoCtx.services.length
    const ratio = mentionedServices.length / Math.max(1, serviceCount)
    return Math.round(20 + ratio * 80)
  }

  private scoreSchemaChanges(specText: string): number {
    const lower = specText.toLowerCase()
    const matchCount = SCHEMA_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase())).length

    if (matchCount === 0) return 0
    if (matchCount <= 2) return 40
    if (matchCount <= 4) return 70
    return 100
  }

  private scoreApiSurface(specText: string): number {
    const lower = specText.toLowerCase()
    const matchCount = API_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase())).length

    if (matchCount === 0) return 0
    if (matchCount <= 1) return 30
    if (matchCount <= 3) return 60
    return 100
  }

  private scoreLlmJudgment(specText: string): number {
    const ambiguitySignals = [
      'maybe',
      'possibly',
      'consider',
      'might',
      'unclear',
      'depends on',
      'tbd',
      'to be determined',
      'figure out',
    ]
    const noveltySignals = [
      'new service',
      'new module',
      'greenfield',
      'from scratch',
      'new architecture',
      'redesign',
      'rewrite',
      'breaking change',
    ]

    const lower = specText.toLowerCase()
    const ambiguityHits = ambiguitySignals.filter((s) => lower.includes(s)).length
    const noveltyHits = noveltySignals.filter((s) => lower.includes(s)).length
    const totalHits = ambiguityHits + noveltyHits

    if (totalHits === 0) return 10
    if (totalHits <= 2) return 40
    if (totalHits <= 4) return 70
    return 100
  }

  private async loadImportGraph(repoSource: string): Promise<ImportEdge[]> {
    try {
      const db = getIntelligenceDb()
      const [row] = await db
        .select()
        .from(knowledgeItems)
        .where(
          and(
            eq(knowledgeItems.sourceIdentifier, repoSource),
            ilike(knowledgeItems.type, 'import-graph')
          )
        )
        .limit(1)

      if (!row?.content) return []

      const parsed = JSON.parse(row.content)
      if (parsed && Array.isArray(parsed.edges)) {
        return parsed.edges.filter(
          (e: unknown): e is ImportEdge => typeof e === 'object' && e !== null && 'from' in e && 'to' in e
        )
      }
      return []
    } catch (error) {
      logger.warn('Failed to load import graph, falling back to heuristic scoring', {
        repoSource,
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  private extractMentionedFiles(specText: string, edges: ImportEdge[]): Set<string> {
    const lower = specText.toLowerCase()
    const allFiles = new Set<string>()
    for (const edge of edges) {
      allFiles.add(edge.from)
      allFiles.add(edge.to)
    }

    const mentioned = new Set<string>()
    for (const file of allFiles) {
      const baseName = file.split('/').pop() ?? file
      const nameWithoutExt = baseName.replace(/\.\w+$/, '')
      if (lower.includes(nameWithoutExt.toLowerCase())) {
        mentioned.add(file)
      }
    }
    return mentioned
  }

  private computeTransitiveDependencies(
    seedFiles: Set<string>,
    edges: ImportEdge[]
  ): Set<string> {
    const adjacency = new Map<string, Set<string>>()
    for (const edge of edges) {
      if (!adjacency.has(edge.from)) {
        adjacency.set(edge.from, new Set())
      }
      adjacency.get(edge.from)!.add(edge.to)

      if (!adjacency.has(edge.to)) {
        adjacency.set(edge.to, new Set())
      }
      adjacency.get(edge.to)!.add(edge.from)
    }

    const visited = new Set<string>()
    const queue = [...seedFiles]
    while (queue.length > 0) {
      const current = queue.pop()!
      if (visited.has(current)) continue
      visited.add(current)
      const neighbors = adjacency.get(current)
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor)
          }
        }
      }
    }

    for (const seed of seedFiles) {
      visited.delete(seed)
    }
    return visited
  }

  private extractAffectedModules(specText: string, repoCtx: RepoContext): string[] {
    const lower = specText.toLowerCase()
    const affected: string[] = []

    for (const service of repoCtx.services) {
      if (lower.includes(service.name.toLowerCase())) {
        affected.push(service.name)
      }
    }

    const genericModules = ['database', 'auth', 'middleware', 'config', 'types', 'utils', 'events']
    for (const mod of genericModules) {
      if (lower.includes(mod)) {
        affected.push(mod)
      }
    }

    return [...new Set(affected)]
  }

  private buildRationale(
    score: number,
    tier: ComplexityTier,
    breakdown: ComplexitySignalBreakdown,
    affectedModules: string[]
  ): string {
    const parts: string[] = [
      `Score: ${score}/100 → ${tier.toUpperCase()} tier.`,
    ]

    const signals: string[] = []
    if (breakdown.filesTouched >= 50) signals.push(`high file touch estimate (${breakdown.filesTouched})`)
    if (breakdown.blastRadius >= 50) signals.push(`cross-service blast radius (${breakdown.blastRadius})`)
    if (breakdown.schemaChanges >= 40) signals.push(`schema changes detected (${breakdown.schemaChanges})`)
    if (breakdown.apiSurface >= 30) signals.push(`new API surface (${breakdown.apiSurface})`)
    if (breakdown.llmJudgment >= 40) signals.push(`ambiguity/novelty signals (${breakdown.llmJudgment})`)

    if (signals.length > 0) {
      parts.push(`Key drivers: ${signals.join(', ')}.`)
    }

    if (affectedModules.length > 0) {
      parts.push(`Affected: ${affectedModules.join(', ')}.`)
    }

    return parts.join(' ')
  }
}
