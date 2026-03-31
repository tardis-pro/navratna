import { EventBusService, getIntelligenceDb, knowledgeItems } from '@uaip/shared-services'
import { eq, and, ilike } from '@uaip/shared-services/drizzle/clients'
import type {
  BoardProvider,
  DriftReport,
  DriftSignal,
  DriftSignalType,
  RepoContext,
  StorySpec,
} from '@uaip/types'
import { logger } from '@uaip/utils'

const DRIFT_REPORT_EVENT = 'rdlo.drift.report'
const DRIFT_STORY_CREATED_EVENT = 'rdlo.drift.story.created'

const TODO_PATTERN = /\/\/\s*(TODO|FIXME|HACK|XXX|WARN)\b[:\s]*(.*)/gi
const LOC_GROWTH_THRESHOLD = 300
const DEAD_EXPORT_MIN_SYMBOLS = 5

export class DriftDetectionService {
  constructor(private readonly eventBusService: EventBusService) {}

  async runDetection(repoCtx: RepoContext, boardProvider: BoardProvider, projectId: string): Promise<DriftReport> {
    const previousSnapshot = await this.loadPreviousSnapshot(repoCtx.source)
    const currentSnapshot = await this.loadCurrentSnapshot(repoCtx.source)

    const signals: DriftSignal[] = []
    const now = new Date().toISOString()

    const todoSignals = this.detectNewTodos(currentSnapshot, previousSnapshot)
    signals.push(...todoSignals)

    const growthSignals = this.detectGrowingFiles(currentSnapshot, previousSnapshot)
    signals.push(...growthSignals)

    const deadExportSignals = this.detectDeadExports(currentSnapshot)
    signals.push(...deadExportSignals)

    let generatedStories = 0
    for (const signal of signals) {
      if (signal.severity === 'high' || signal.severity === 'medium') {
        const spec: StorySpec = {
          title: `[Tech Debt] ${signal.description}`,
          description: `Drift detected in ${signal.file}:\n\nType: ${signal.type}\nSeverity: ${signal.severity}\nDetected: ${signal.detectedAt}`,
          labels: ['rdlo', 'tech-debt', 'needs-triage', signal.type],
        }
        try {
          await boardProvider.createStory(projectId, spec)
          generatedStories++

          await this.eventBusService.publish(DRIFT_STORY_CREATED_EVENT, {
            repoSource: repoCtx.source,
            signalType: signal.type,
            file: signal.file,
          })
        } catch (error) {
          logger.error('Failed to create drift story', {
            file: signal.file,
            type: signal.type,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    const report: DriftReport = {
      repoSource: repoCtx.source,
      runAt: now,
      signals,
      generatedStories,
      previousSnapshotAt: previousSnapshot?.createdAt,
    }

    await this.eventBusService.publish(DRIFT_REPORT_EVENT, {
      repoSource: repoCtx.source,
      signalCount: signals.length,
      generatedStories,
    })

    await this.saveSnapshot(repoCtx.source, currentSnapshot)

    logger.info('Drift detection complete', {
      repoSource: repoCtx.source,
      signalCount: signals.length,
      generatedStories,
    })

    return report
  }

  private detectNewTodos(
    current: SnapshotData | null,
    previous: SnapshotData | null
  ): DriftSignal[] {
    const signals: DriftSignal[] = []
    const now = new Date().toISOString()

    if (!current?.files) return signals

    const previousTodos = new Set(previous?.todos ?? [])

    for (const file of current.files) {
      const matches = file.content.matchAll(TODO_PATTERN)
      for (const match of matches) {
        const todoText = `${file.path}:${match[1]}:${match[2]?.trim()}`
        if (!previousTodos.has(todoText)) {
          signals.push({
            type: 'new-todo',
            file: file.path,
            description: `New ${match[1]}: ${match[2]?.trim() ?? '(no description)'}`,
            severity: match[1] === 'FIXME' || match[1] === 'HACK' ? 'medium' : 'low',
            detectedAt: now,
          })
        }
      }
    }

    return signals
  }

  private detectGrowingFiles(
    current: SnapshotData | null,
    previous: SnapshotData | null
  ): DriftSignal[] {
    const signals: DriftSignal[] = []
    const now = new Date().toISOString()

    if (!current?.files || !previous?.fileSizes) return signals

    for (const file of current.files) {
      const lineCount = file.content.split('\n').length
      const previousSize = previous.fileSizes.get(file.path) ?? 0

      if (previousSize > 0 && lineCount - previousSize > LOC_GROWTH_THRESHOLD) {
        signals.push({
          type: 'growing-file',
          file: file.path,
          description: `File grew by ${lineCount - previousSize} lines (${previousSize} → ${lineCount})`,
          severity: lineCount - previousSize > 500 ? 'high' : 'medium',
          detectedAt: now,
        })
      }
    }

    return signals
  }

  private detectDeadExports(current: SnapshotData | null): DriftSignal[] {
    const signals: DriftSignal[] = []
    const now = new Date().toISOString()

    if (!current?.symbols || current.symbols.length < DEAD_EXPORT_MIN_SYMBOLS) return signals

    const importedSymbols = new Set<string>()
    for (const file of current.files ?? []) {
      const importMatches = file.content.matchAll(/import\s+{([^}]+)}\s+from/g)
      for (const match of importMatches) {
        const symbols = match[1].split(',').map((s) => s.trim().split(' as ')[0].trim())
        for (const sym of symbols) {
          importedSymbols.add(sym)
        }
      }
    }

    for (const symbol of current.symbols) {
      if (!importedSymbols.has(symbol.name) && symbol.exported) {
        signals.push({
          type: 'dead-export',
          file: symbol.file,
          description: `Exported symbol "${symbol.name}" has 0 import references`,
          severity: 'low',
          detectedAt: now,
        })
      }
    }

    return signals.slice(0, 20)
  }

  private async loadPreviousSnapshot(repoSource: string): Promise<SnapshotData | null> {
    try {
      const db = getIntelligenceDb()
      const [row] = await db
        .select()
        .from(knowledgeItems)
        .where(
          and(
            eq(knowledgeItems.sourceIdentifier, repoSource),
            ilike(knowledgeItems.type, 'drift-snapshot')
          )
        )
        .limit(1)

      if (!row?.content) return null

      const parsed = JSON.parse(row.content)
      return {
        createdAt: row.createdAt?.toISOString(),
        files: parsed.files ?? [],
        todos: new Set(parsed.todos ?? []),
        fileSizes: new Map(Object.entries(parsed.fileSizes ?? {})),
        symbols: parsed.symbols ?? [],
      }
    } catch {
      return null
    }
  }

  private async loadCurrentSnapshot(repoSource: string): Promise<SnapshotData | null> {
    try {
      const db = getIntelligenceDb()
      const rows = await db
        .select()
        .from(knowledgeItems)
        .where(
          and(
            eq(knowledgeItems.sourceIdentifier, repoSource),
            ilike(knowledgeItems.type, 'code-symbol')
          )
        )
        .limit(500)

      const symbols = rows.map((r) => {
        const meta = r.metadata as Record<string, unknown> | null
        return {
          name: (meta?.title as string) ?? '',
          file: (meta?.file as string) ?? '',
          exported: true,
        }
      })

      return {
        files: [],
        todos: new Set(),
        fileSizes: new Map(),
        symbols,
      }
    } catch {
      return null
    }
  }

  private async saveSnapshot(repoSource: string, snapshot: SnapshotData | null): Promise<void> {
    if (!snapshot) return

    try {
      const db = getIntelligenceDb()
      const content = JSON.stringify({
        files: snapshot.files?.map((f) => ({ path: f.path, content: '' })) ?? [],
        todos: [...(snapshot.todos ?? [])],
        fileSizes: Object.fromEntries(snapshot.fileSizes ?? new Map()),
        symbols: snapshot.symbols ?? [],
      })

      await db.insert(knowledgeItems).values({
        type: 'drift-snapshot' as unknown as typeof knowledgeItems.$inferInsert['type'],
        content,
        sourceType: 'drift-detection' as unknown as typeof knowledgeItems.$inferInsert['sourceType'],
        sourceIdentifier: repoSource,
        tags: ['drift-snapshot'],
        confidence: 1.0,
        metadata: { title: 'Drift Snapshot' },
        summary: `Drift detection snapshot for ${repoSource}`,
      })
    } catch (error) {
      logger.error('Failed to save drift snapshot', {
        repoSource,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

interface SnapshotFile {
  path: string
  content: string
}

interface SnapshotSymbol {
  name: string
  file: string
  exported: boolean
}

interface SnapshotData {
  createdAt?: string
  files: SnapshotFile[]
  todos: Set<string>
  fileSizes: Map<string, number>
  symbols: SnapshotSymbol[]
}
