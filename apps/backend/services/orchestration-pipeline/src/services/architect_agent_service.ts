import { randomUUID } from 'node:crypto'
import { EventBusService } from '@uaip/shared-services'
import type {
  ComplexityResult,
  DecomposedStory,
  EventBusMessage,
  RepoContext,
  SolutionDesign,
  SolutionDesignFileChange,
  SolutionDesignRisk,
  StorySpec,
} from '@uaip/types'
import { logger } from '@uaip/utils'

const ARCHITECT_DESIGN_EVENT = 'rdlo.architect.design'
const ARCHITECT_DECOMPOSE_EVENT = 'rdlo.architect.decompose'
const COUNCIL_DISCUSSION_EVENT = 'rdlo.council.discussion'

export class ArchitectAgentService {
  constructor(private readonly eventBusService: EventBusService) {}

  async produceSolutionDesign(
    spec: StorySpec,
    repoCtx: RepoContext,
    complexity: ComplexityResult
  ): Promise<SolutionDesign> {
    const affectedFiles = this.inferAffectedFiles(spec, repoCtx, complexity)
    const newAbstractions = this.inferNewAbstractions(spec)
    const schemaChanges = this.inferSchemaChanges(spec)
    const apiSurfaceChanges = this.inferApiChanges(spec)
    const risks = this.assessRisks(complexity, affectedFiles)

    const design: SolutionDesign = {
      id: randomUUID(),
      storyTitle: spec.title,
      tier: complexity.tier,
      summary: this.generateSummary(spec, complexity, affectedFiles),
      affectedFiles,
      newAbstractions,
      schemaChanges,
      apiSurfaceChanges,
      risks,
      estimatedLOC: this.estimateLOC(affectedFiles, complexity),
      createdAt: new Date().toISOString(),
    }

    await this.eventBusService.publish(ARCHITECT_DESIGN_EVENT, {
      designId: design.id,
      storyTitle: spec.title,
      tier: complexity.tier,
      fileCount: affectedFiles.length,
    })

    logger.info('Solution design produced', {
      designId: design.id,
      storyTitle: spec.title,
      tier: complexity.tier,
      affectedFileCount: affectedFiles.length,
      estimatedLOC: design.estimatedLOC,
    })

    return design
  }

  async decomposeDesign(design: SolutionDesign): Promise<DecomposedStory[]> {
    const stories: DecomposedStory[] = []

    const fileGroups = this.groupFilesByModule(design.affectedFiles)
    let order = 0

    if (design.schemaChanges.length > 0) {
      stories.push({
        title: `[Schema] ${design.storyTitle} — database changes`,
        description: `Schema changes required:\n${design.schemaChanges.map((c) => `- ${c}`).join('\n')}`,
        affectedFiles: design.affectedFiles
          .filter((f) => f.path.includes('schema') || f.path.includes('migration'))
          .map((f) => f.path),
        estimatedLOC: Math.min(100, Math.round(design.estimatedLOC * 0.15)),
        order: order++,
        labels: ['rdlo', 'schema'],
        dependsOn: [],
      })
    }

    for (const [module, files] of Object.entries(fileGroups)) {
      const moduleEstimate = Math.round(
        (files.length / Math.max(1, design.affectedFiles.length)) * design.estimatedLOC
      )
      const clampedEstimate = Math.min(300, moduleEstimate)

      stories.push({
        title: `[${module}] ${design.storyTitle}`,
        description: `Implement changes for module ${module}:\n${files.map((f) => `- ${f.action} ${f.path}: ${f.description}`).join('\n')}`,
        affectedFiles: files.map((f) => f.path),
        estimatedLOC: clampedEstimate,
        order: order++,
        labels: ['rdlo', module.toLowerCase()],
        dependsOn: design.schemaChanges.length > 0 ? [stories[0]?.title ?? ''] : [],
      })
    }

    if (stories.length === 0) {
      stories.push({
        title: design.storyTitle,
        description: design.summary,
        affectedFiles: design.affectedFiles.map((f) => f.path),
        estimatedLOC: design.estimatedLOC,
        order: 0,
        labels: ['rdlo'],
        dependsOn: [],
      })
    }

    await this.eventBusService.publish(ARCHITECT_DECOMPOSE_EVENT, {
      designId: design.id,
      storyCount: stories.length,
      totalEstimatedLOC: stories.reduce((sum, s) => sum + s.estimatedLOC, 0),
    })

    logger.info('Solution design decomposed', {
      designId: design.id,
      storyCount: stories.length,
    })

    return stories
  }

  async initiateCouncilMode(
    spec: StorySpec,
    repoCtx: RepoContext,
    complexity: ComplexityResult
  ): Promise<SolutionDesign> {
    await this.eventBusService.publish(COUNCIL_DISCUSSION_EVENT, {
      type: 'council-mode',
      storyTitle: spec.title,
      complexity,
      repoSource: repoCtx.source,
      participants: ['architect-agent', 'security-agent', 'qa-agent'],
      turnStrategy: 'debate',
    })

    logger.info('Council mode initiated for high-complexity story', {
      storyTitle: spec.title,
      score: complexity.score,
    })

    return this.produceSolutionDesign(spec, repoCtx, complexity)
  }

  private inferAffectedFiles(
    spec: StorySpec,
    repoCtx: RepoContext,
    complexity: ComplexityResult
  ): SolutionDesignFileChange[] {
    const files: SolutionDesignFileChange[] = []
    const specText = `${spec.title} ${spec.description ?? ''}`.toLowerCase()

    for (const module of complexity.affectedModules) {
      const matchingService = repoCtx.services.find(
        (svc) => svc.name.toLowerCase() === module.toLowerCase()
      )

      if (matchingService?.entryPoint) {
        files.push({
          path: matchingService.entryPoint,
          action: 'modify',
          description: `Update ${module} service for ${spec.title}`,
        })
      }

      if (specText.includes('route') || specText.includes('endpoint') || specText.includes('api')) {
        files.push({
          path: `src/routes/${module}_routes.ts`,
          action: specText.includes('new') ? 'create' : 'modify',
          description: `${specText.includes('new') ? 'Create' : 'Update'} routes for ${module}`,
        })
      }
    }

    if (files.length === 0) {
      files.push({
        path: 'src/services/new_service.ts',
        action: 'create',
        description: `New service for ${spec.title}`,
      })
    }

    return files
  }

  private inferNewAbstractions(spec: StorySpec): string[] {
    const abstractions: string[] = []
    const text = `${spec.title} ${spec.description ?? ''}`.toLowerCase()

    if (text.includes('service') || text.includes('provider')) {
      abstractions.push(`${spec.title.split(' ')[0]}Service`)
    }
    if (text.includes('handler') || text.includes('middleware')) {
      abstractions.push(`${spec.title.split(' ')[0]}Handler`)
    }
    if (text.includes('interface') || text.includes('contract')) {
      abstractions.push(`I${spec.title.split(' ')[0]}`)
    }

    return abstractions
  }

  private inferSchemaChanges(spec: StorySpec): string[] {
    const changes: string[] = []
    const text = `${spec.title} ${spec.description ?? ''}`.toLowerCase()

    const schemaKeywords = ['table', 'column', 'schema', 'migration', 'entity', 'field']
    if (schemaKeywords.some((kw) => text.includes(kw))) {
      changes.push(`Database schema changes required for ${spec.title}`)
    }

    return changes
  }

  private inferApiChanges(spec: StorySpec): string[] {
    const changes: string[] = []
    const text = `${spec.title} ${spec.description ?? ''}`.toLowerCase()

    if (text.includes('endpoint') || text.includes('route') || text.includes('api')) {
      changes.push(`New or modified API endpoints for ${spec.title}`)
    }

    return changes
  }

  private assessRisks(
    complexity: ComplexityResult,
    files: SolutionDesignFileChange[]
  ): SolutionDesignRisk[] {
    const risks: SolutionDesignRisk[] = []

    if (complexity.score >= 70) {
      risks.push({
        description: 'High complexity — multiple services affected, coordination risk',
        severity: 'high',
        mitigation: 'Use Council mode for consensus, implement staged rollout',
      })
    }

    if (files.some((f) => f.path.includes('schema') || f.path.includes('migration'))) {
      risks.push({
        description: 'Schema changes may require data migration',
        severity: 'medium',
        mitigation: 'Write reversible migration, test on staging data first',
      })
    }

    const createCount = files.filter((f) => f.action === 'create').length
    if (createCount >= 3) {
      risks.push({
        description: `${createCount} new files — increased surface area and review burden`,
        severity: 'low',
        mitigation: 'Split into multiple PRs if possible',
      })
    }

    return risks
  }

  private estimateLOC(files: SolutionDesignFileChange[], complexity: ComplexityResult): number {
    const basePerFile = complexity.tier === 'council' ? 150 : complexity.tier === 'architect' ? 100 : 50
    return files.length * basePerFile
  }

  private generateSummary(
    spec: StorySpec,
    complexity: ComplexityResult,
    files: SolutionDesignFileChange[]
  ): string {
    const tier = complexity.tier.charAt(0).toUpperCase() + complexity.tier.slice(1)
    return `${tier}-tier solution for "${spec.title}". ` +
      `Affects ${files.length} file(s) across ${complexity.affectedModules.length} module(s). ` +
      `Complexity score: ${complexity.score}/100. ${complexity.rationale}`
  }

  private groupFilesByModule(
    files: SolutionDesignFileChange[]
  ): Record<string, SolutionDesignFileChange[]> {
    const groups: Record<string, SolutionDesignFileChange[]> = {}

    for (const file of files) {
      const parts = file.path.split('/')
      const module = parts.length >= 2 ? parts[1] : parts[0]
      if (!groups[module]) {
        groups[module] = []
      }
      groups[module].push(file)
    }

    return groups
  }
}
