import { randomUUID } from 'node:crypto'
import {
  EventBusService,
  getControlDb,
  OperationRepository,
  SYSTEM_AGENT_ID,
} from '@uaip/shared-services'
import { operations } from '@uaip/shared-services/drizzle/control'
import { eq } from '@uaip/shared-services/drizzle/clients'
import { OperationStatus } from '@uaip/types'
import type {
  BoardProvider,
  ComplexityResult,
  DevLoopCheckpoint,
  DevLoopConfig,
  DevLoopProgressEvent,
  DevLoopStage,
  DevLoopState,
  DevLoopStatus,
  EventBusMessage,
  RepoContext,
  StorySpec,
} from '@uaip/types'
import { logger, InternalServerError } from '@uaip/utils'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

import { BoardProviderRegistry } from './board_provider_registry.js'
import { ComplexityScorerService } from './complexity_scorer_service.js'

const DEVLOOP_PROGRESS_EVENT = 'rdlo.devloop.progress'
const DEVLOOP_CHECKPOINT_PREFIX = 'rdlo.devloop.checkpoint'

const STAGE_ORDER: DevLoopStage[] = [
  'repo-ingestion',
  'board-setup',
  'complexity-routing',
  'code-generation',
  'ci-healing',
]

/**
 * boardCredentials holds live Jira/GitHub API tokens. The operations row is
 * readable through the operations API, so persisting the raw config would leak
 * those tokens to anyone who can read the operation.
 */
function redactLoopConfig(config: DevLoopConfig): Omit<DevLoopConfig, 'boardCredentials'> {
  const { boardCredentials: _boardCredentials, ...safe } = config
  return safe
}

export class DevLoopOrchestrator {
  private readonly boardRegistry = new BoardProviderRegistry()
  private readonly complexityScorer = new ComplexityScorerService()
  private activeLoops = new Map<string, DevLoopState>()

  constructor(private readonly eventBusService: EventBusService) {}

  async initialize(): Promise<void> {
    await this.eventBusService.subscribe(
      `${DEVLOOP_CHECKPOINT_PREFIX}.resume`,
      async (event: EventBusMessage) => {
        const eventData = isRecord(event.data) ? event.data : null
        const loopId = typeof eventData?.loopId === 'string' ? eventData.loopId : undefined
        if (loopId && this.activeLoops.has(loopId)) {
          const state = this.activeLoops.get(loopId)!
          if (state.status === 'paused') {
            await this.resumeFromCheckpoint(state)
          }
        }
      }
    )

    logger.info('DevLoopOrchestrator initialized')
  }

  async startLoop(config: DevLoopConfig, startedBy: string): Promise<DevLoopState> {
    const loopId = randomUUID()
    const now = new Date().toISOString()

    const state: DevLoopState = {
      id: loopId,
      config,
      status: 'running',
      currentStage: 'repo-ingestion',
      checkpoints: [],
      storyIds: [],
      prUrls: [],
      complexityResults: [],
      startedAt: now,
      updatedAt: now,
    }

    this.activeLoops.set(loopId, state)

    await this.persistOperation(state, startedBy)
    await this.emitProgress(state, 'RDLO loop started')

    this.executeLoop(state).catch((error) => {
      logger.error('DevLoop execution failed unexpectedly', {
        loopId,
        error: error instanceof Error ? error.message : String(error),
      })
    })

    return state
  }

  async getLoopState(loopId: string): Promise<DevLoopState | null> {
    return this.activeLoops.get(loopId) ?? null
  }

  async cancelLoop(loopId: string): Promise<void> {
    const state = this.activeLoops.get(loopId)
    if (!state) return

    state.status = 'failed'
    state.error = 'Cancelled by user'
    state.updatedAt = new Date().toISOString()

    await this.emitProgress(state, 'RDLO loop cancelled')
    await this.updateOperationStatus(state)
  }

  private async executeLoop(state: DevLoopState): Promise<void> {
    const startIndex = STAGE_ORDER.indexOf(state.currentStage)

    for (let i = startIndex; i < STAGE_ORDER.length; i++) {
      const stage = STAGE_ORDER[i]
      state.currentStage = stage
      state.updatedAt = new Date().toISOString()

      try {
        await this.emitProgress(state, `Starting stage: ${stage}`)
        await this.executeStage(state, stage)
        await this.saveCheckpoint(state, stage, 'completed')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error('DevLoop stage failed', { loopId: state.id, stage, error: message })

        await this.saveCheckpoint(state, stage, 'failed', message)

        state.status = 'compensating'
        await this.emitProgress(state, `Stage ${stage} failed, compensating: ${message}`)
        await this.compensate(state, i)

        state.status = 'failed'
        state.error = `Stage ${stage} failed: ${message}`
        state.updatedAt = new Date().toISOString()
        await this.updateOperationStatus(state)
        return
      }
    }

    state.status = 'completed'
    state.completedAt = new Date().toISOString()
    state.updatedAt = state.completedAt
    await this.emitProgress(state, 'RDLO loop completed successfully')
    await this.updateOperationStatus(state)
  }

  private async executeStage(state: DevLoopState, stage: DevLoopStage): Promise<void> {
    switch (stage) {
      case 'repo-ingestion':
        await this.stageRepoIngestion(state)
        break
      case 'board-setup':
        await this.stageBoardSetup(state)
        break
      case 'complexity-routing':
        await this.stageComplexityRouting(state)
        break
      case 'code-generation':
        await this.stageCodeGeneration(state)
        break
      case 'ci-healing':
        await this.stageCiHealing(state)
        break
    }
  }

  private async stageRepoIngestion(state: DevLoopState): Promise<void> {
    await this.eventBusService.publish('rdlo.repo.ingest', {
      loopId: state.id,
      repoUrl: state.config.repoUrl,
    })

    const repoContext: RepoContext = {
      id: randomUUID(),
      source: state.config.repoUrl,
      repoMode: 'brownfield',
      services: [],
      ports: [],
      envVars: [],
      scripts: {},
      techDebt: [],
      branches: [],
      boardConfig: {
        type: state.config.boardType,
        credentials: state.config.boardCredentials,
      },
    }
    state.repoContext = repoContext

    logger.info('Repo ingestion completed', { loopId: state.id, repoUrl: state.config.repoUrl })
  }

  private async stageBoardSetup(state: DevLoopState): Promise<void> {
    const repoCtx = state.repoContext
    if (!repoCtx) {
      throw new InternalServerError('RepoContext not available — repo-ingestion stage must complete first')
    }

    const boardConfig = repoCtx.boardConfig ?? { type: 'internal' as const }
    const adapter: BoardProvider = this.boardRegistry.resolveAdapter(boardConfig)

    const project = await adapter.createProject(state.config.epicTitle, {
      description: state.config.epicDescription,
      repoUrl: state.config.repoUrl,
    })
    state.projectId = project.id

    const epic = await adapter.createEpic(project.id, {
      title: state.config.epicTitle,
      description: state.config.epicDescription,
    })
    state.epicId = epic.id

    for (const storyInput of state.config.stories) {
      const story = await adapter.createStory(epic.id, {
        title: storyInput.title,
        description: storyInput.description,
        labels: storyInput.labels,
      })
      state.storyIds.push(story.id)
    }

    logger.info('Board setup completed', {
      loopId: state.id,
      projectId: project.id,
      epicId: epic.id,
      storyCount: state.storyIds.length,
    })
  }

  private async stageComplexityRouting(state: DevLoopState): Promise<void> {
    const repoCtx = state.repoContext
    if (!repoCtx) {
      throw new InternalServerError('RepoContext not available')
    }

    for (const storyInput of state.config.stories) {
      const spec: StorySpec = {
        title: storyInput.title,
        description: storyInput.description,
        labels: storyInput.labels,
      }
      const result: ComplexityResult = await this.complexityScorer.score(spec, repoCtx)
      state.complexityResults.push(result)

      logger.info('Story complexity scored', {
        loopId: state.id,
        story: storyInput.title,
        score: result.score,
        tier: result.tier,
      })
    }
  }

  /**
   * NOT IMPLEMENTED.
   *
   * This published `rdlo.code.generate` once per story and logged "Code
   * generation requested", then returned — and the stage was marked complete.
   * Nothing anywhere subscribes to `rdlo.code.generate`; the publish went into
   * the void. The component that would answer it is DevAgentService.executeStory,
   * which does not generate code either (it now throws rather than opening a pull
   * request for a branch it never created).
   *
   * The publish is removed rather than left dangling: an event with no consumer
   * is not a handoff, it is a no-op that reads like one.
   */
  private async stageCodeGeneration(state: DevLoopState): Promise<void> {
    throw new InternalServerError(
      `Dev loop ${state.id} reached the 'code-generation' stage, which is not implemented. ` +
        `It previously published rdlo.code.generate (a topic with no subscriber) for ` +
        `${state.config.stories.length} story/stories and reported the stage complete without ` +
        `generating anything.`
    )
  }

  /**
   * NOT IMPLEMENTED. Same shape as stageCodeGeneration above: it published
   * `rdlo.ci.heal` — no subscriber — and logged "CI healing stage completed".
   * HealingAgentService.diagnose() is real, but applyFixes() is not, so there is
   * nothing on the other end of that topic to do the healing.
   *
   * The autoHeal opt-out is preserved: a loop that never asked for healing still
   * skips this stage cleanly instead of failing.
   */
  private async stageCiHealing(state: DevLoopState): Promise<void> {
    if (!state.config.autoHeal) {
      logger.info('Auto-healing disabled, skipping CI healing stage', { loopId: state.id })
      return
    }

    throw new InternalServerError(
      `Dev loop ${state.id} reached the 'ci-healing' stage with autoHeal enabled, and that ` +
        `stage is not implemented. It previously published rdlo.ci.heal (a topic with no ` +
        `subscriber) for ${state.prUrls.length} PR(s) and reported the stage complete. ` +
        `Set autoHeal: false to skip it, or implement HealingAgentService.applyFixes.`
    )
  }

  private async compensate(state: DevLoopState, failedStageIndex: number): Promise<void> {
    for (let i = failedStageIndex - 1; i >= 0; i--) {
      const stage = STAGE_ORDER[i]
      try {
        await this.compensateStage(state, stage)
        logger.info('Compensation succeeded', { loopId: state.id, stage })
      } catch (error) {
        logger.error('Compensation failed', {
          loopId: state.id,
          stage,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private async compensateStage(state: DevLoopState, stage: DevLoopStage): Promise<void> {
    switch (stage) {
      case 'board-setup': {
        if (state.epicId) {
          const boardConfig = state.repoContext?.boardConfig ?? { type: 'internal' as const }
          const adapter = this.boardRegistry.resolveAdapter(boardConfig)
          for (const storyId of state.storyIds) {
            await adapter.updateStatus(storyId, 'blocked').catch((err) => {
              logger.warn('Failed to set story status to blocked during saga compensation', {
                storyId,
                loopId: state.id,
                error: err instanceof Error ? err.message : String(err),
              })
            })
          }
        }
        break
      }
      case 'code-generation': {
        await this.eventBusService.publish('rdlo.code.rollback', {
          loopId: state.id,
          storyIds: state.storyIds,
        })
        break
      }
      default:
        break
    }
  }

  private async saveCheckpoint(
    state: DevLoopState,
    stage: DevLoopStage,
    status: DevLoopStatus,
    error?: string
  ): Promise<void> {
    const checkpoint: DevLoopCheckpoint = {
      stage,
      status,
      completedAt: new Date().toISOString(),
      error,
    }
    state.checkpoints.push(checkpoint)
    state.updatedAt = new Date().toISOString()

    await this.eventBusService.publish(`${DEVLOOP_CHECKPOINT_PREFIX}.saved`, {
      loopId: state.id,
      checkpoint,
    })
  }

  private async resumeFromCheckpoint(state: DevLoopState): Promise<void> {
    const lastCompleted = [...state.checkpoints]
      .reverse()
      .find((cp) => cp.status === 'completed')

    if (!lastCompleted) {
      state.currentStage = STAGE_ORDER[0]
    } else {
      const completedIndex = STAGE_ORDER.indexOf(lastCompleted.stage)
      const nextIndex = completedIndex + 1
      if (nextIndex >= STAGE_ORDER.length) {
        state.status = 'completed'
        return
      }
      state.currentStage = STAGE_ORDER[nextIndex]
    }

    state.status = 'running'
    await this.executeLoop(state)
  }

  private async emitProgress(state: DevLoopState, message: string): Promise<void> {
    const event: DevLoopProgressEvent = {
      loopId: state.id,
      stage: state.currentStage,
      status: state.status,
      message,
      timestamp: new Date().toISOString(),
    }

    await this.eventBusService.publish(DEVLOOP_PROGRESS_EVENT, event)
  }

  private async persistOperation(state: DevLoopState, startedBy: string): Promise<void> {
    // Via the repository so the cross-plane agentId is verified before insert.
    await new OperationRepository().createOperation({
      // Must be the loop id, not a DB-generated uuid: updateOperationStatus
      // matches WHERE operations.id = state.id, so omitting it makes every
      // subsequent status write silently update zero rows.
      id: state.id,
      type: 'rdlo-dev-loop',
      name: `RDLO: ${state.config.epicTitle}`,
      status: OperationStatus.RUNNING,
      agentId: SYSTEM_AGENT_ID,
      userId: startedBy,
      executionPlan: {
        id: state.id,
        type: 'rdlo-dev-loop',
        agentId: SYSTEM_AGENT_ID,
        steps: STAGE_ORDER.map((stage, stepIndex) => ({
          id: `${state.id}-${stepIndex + 1}-${stage}`,
          type: stage,
          description: `RDLO stage: ${stage}`,
          estimatedDuration: 60,
          required: true,
        })),
        dependencies: [],
        estimatedDuration: STAGE_ORDER.length * 60,
        priority: 'high',
        constraints: [],
        metadata: {
          generatedBy: 'DevLoopOrchestrator',
          basedOnAnalysis: new Date(),
          version: '1.0.0',
        },
        created_at: new Date(),
      },
      startedAt: new Date(),
      totalSteps: STAGE_ORDER.length,
      metadata: {
        loopId: state.id,
        config: redactLoopConfig(state.config),
        currentStage: state.currentStage,
      },
    })
  }

  private async updateOperationStatus(state: DevLoopState): Promise<void> {
    const db = getControlDb()
    const dbStatus = state.status === 'completed'
      ? OperationStatus.COMPLETED
      : state.status === 'failed'
        ? OperationStatus.FAILED
        : OperationStatus.RUNNING

    await db
      .update(operations)
      .set({
        status: dbStatus,
        currentStep: STAGE_ORDER.indexOf(state.currentStage),
        metadata: {
          loopId: state.id,
          currentStage: state.currentStage,
          checkpoints: state.checkpoints,
          error: state.error,
          storyIds: state.storyIds,
          prUrls: state.prUrls,
        },
        updatedAt: new Date(),
        ...(state.status === 'completed' ? { completedAt: new Date() } : {}),
      })
      .where(eq(operations.id, state.id))
  }
}
