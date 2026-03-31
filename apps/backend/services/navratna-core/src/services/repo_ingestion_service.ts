import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, type Stats } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { getIntelligenceDb, knowledgeItems } from '@uaip/shared-services'
import {
  SourceType,
  type EnvVarSchema,
  type OperationalAnalysis,
  type RepoContext,
  type RepoDocument,
  type ServiceDefinition,
  type StructuralAnalysis,
} from '@uaip/types'
import { logger } from '@uaip/utils'
import { AstSymbolExtractor } from './ast_symbol_extractor'
import { ImportGraphService } from './import_graph_service'
import { SemanticIndexService } from './semantic_index_service'

const MAX_WALK_DEPTH = 5
const TODO_LIMIT = 20
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.nx', 'dist'])
const TEXT_FILE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.env',
  '.example',
  '.txt',
  '.sh',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.rb',
  '.php',
  '.html',
  '.css',
  '.scss',
  '.toml',
  '.ini',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGitUrl(source: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/).*$/i.test(source)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function readFileSafe(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

function parseJsonSafe(filePath: string): unknown {
  const text = readFileSafe(filePath)
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function walkDirectory(rootPath: string, depth = 0): string[] {
  if (depth > MAX_WALK_DEPTH) {
    return []
  }

  let dirents: Array<{ isDirectory: () => boolean; isFile: () => boolean; name: string }>
  try {
    dirents = readdirSync(rootPath, { withFileTypes: true }) as Array<{
      isDirectory: () => boolean
      isFile: () => boolean
      name: string
    }>
  } catch {
    return []
  }

  const collected: string[] = []
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(dirent.name)) {
        continue
      }
      collected.push(...walkDirectory(join(rootPath, dirent.name), depth + 1))
      continue
    }

    if (dirent.isFile()) {
      collected.push(join(rootPath, dirent.name))
    }
  }

  return collected
}

function parsePackageScripts(repoPath: string): {
  scripts: Record<string, string>
  packageName?: string
  entryPoint?: string
} {
  const packageJsonPath = join(repoPath, 'package.json')
  const packageJson = parseJsonSafe(packageJsonPath)
  if (!isRecord(packageJson)) {
    return { scripts: {} }
  }

  const scriptsFromPackage: Record<string, string> = isRecord(packageJson.scripts)
    ? Object.entries(packageJson.scripts).reduce<Record<string, string>>((acc, [key, value]) => {
        if (typeof value === 'string') {
          acc[key] = value
        }
        return acc
      }, {})
    : {}

  const packageName = typeof packageJson.name === 'string' ? packageJson.name : undefined
  const entryPoint =
    typeof packageJson.main === 'string'
      ? packageJson.main
      : typeof packageJson.module === 'string'
        ? packageJson.module
        : undefined

  return {
    scripts: scriptsFromPackage,
    packageName,
    entryPoint,
  }
}

function parseNxProjects(repoPath: string): ServiceDefinition[] {
  const nxJsonPath = join(repoPath, 'nx.json')
  const nxJson = parseJsonSafe(nxJsonPath)
  if (!isRecord(nxJson) || !isRecord(nxJson.projects)) {
    return []
  }

  return Object.entries(nxJson.projects).map(([name, projectDef]): ServiceDefinition => {
    if (typeof projectDef === 'string') {
      return {
        name,
        type: 'nx-project',
        entryPoint: projectDef,
      }
    }

    if (isRecord(projectDef)) {
      return {
        name,
        type: 'nx-project',
        entryPoint: typeof projectDef.root === 'string' ? projectDef.root : undefined,
      }
    }

    return {
      name,
      type: 'nx-project',
    }
  })
}

function parsePortsFromText(text: string): number[] {
  const portMatches = text.match(/\b\d{2,5}\b/g) ?? []
  return Array.from(
    new Set(
      portMatches
        .map((value: string) => Number.parseInt(value, 10))
        .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535)
    )
  )
}

function parseDockerArtifacts(repoPath: string): { services: ServiceDefinition[]; ports: number[] } {
  const services: ServiceDefinition[] = []
  const ports = new Set<number>()

  const dockerfileText = readFileSafe(join(repoPath, 'Dockerfile'))
  if (dockerfileText) {
    const exposeMatches = dockerfileText.match(/^\s*EXPOSE\s+(.+)$/gim) ?? []
    const dockerfilePorts = exposeMatches.flatMap((line: string) => parsePortsFromText(line))
    for (const port of dockerfilePorts) {
      ports.add(port)
    }

    services.push({
      name: 'dockerfile-service',
      type: 'docker',
      port: dockerfilePorts[0],
      description: 'Detected from Dockerfile',
    })
  }

  const composeCandidates = ['docker-compose.yml', 'docker-compose.yaml']
  for (const composeName of composeCandidates) {
    const composePath = join(repoPath, composeName)
    const composeText = readFileSafe(composePath)
    if (!composeText) continue

    const lines = composeText.split(/\r?\n/)
    let inServicesBlock = false

    for (const line of lines) {
      if (!inServicesBlock && /^\s*services\s*:\s*$/.test(line)) {
        inServicesBlock = true
        continue
      }

      if (inServicesBlock && /^\S/.test(line)) {
        inServicesBlock = false
      }

      if (!inServicesBlock) {
        continue
      }

      const serviceMatch = line.match(/^\s{2}([A-Za-z0-9_.-]+)\s*:\s*$/)
      if (serviceMatch) {
        services.push({
          name: serviceMatch[1],
          type: 'docker-compose',
          description: `Detected from ${composeName}`,
        })
      }

      for (const port of parsePortsFromText(line)) {
        ports.add(port)
      }
    }
  }

  return {
    services,
    ports: Array.from(ports),
  }
}

function parseEnvVars(repoPath: string): EnvVarSchema[] {
  const envFiles = ['.env.example', 'sample.env']
  const envVarMap = new Map<string, EnvVarSchema>()

  for (const envFileName of envFiles) {
    const content = readFileSafe(join(repoPath, envFileName))
    if (!content) {
      continue
    }

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (line.length === 0 || line.startsWith('#')) {
        continue
      }

      const varMatch = line.match(/^([A-Z][A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!varMatch) {
        continue
      }

      const [, name, defaultValue] = varMatch
      envVarMap.set(name, {
        name,
        default: defaultValue.length > 0 ? defaultValue : undefined,
      })
    }
  }

  return Array.from(envVarMap.values())
}

function parseDocs(repoPath: string): RepoDocument[] {
  const docFileNames = ['AGENTS.md', 'CLAUDE.md', 'README.md']
  const docs: RepoDocument[] = []

  for (const fileName of docFileNames) {
    const content = readFileSafe(join(repoPath, fileName))
    if (!content) {
      continue
    }

    docs.push({
      file: fileName,
      content,
    })
  }

  return docs
}

function parseMakeTargets(repoPath: string): string[] {
  const makefileText = readFileSafe(join(repoPath, 'Makefile'))
  if (!makefileText) {
    return []
  }

  const targets = new Set<string>()
  for (const line of makefileText.split(/\r?\n/)) {
    const targetMatch = line.match(/^([A-Za-z0-9_.-]+)\s*:(?![=])/)
    if (!targetMatch) {
      continue
    }

    const target = targetMatch[1]
    if (target === '.PHONY') {
      continue
    }

    targets.add(target)
  }

  return Array.from(targets)
}

function detectCommitFormat(repoPath: string): string | undefined {
  const commitlintCandidates = [
    '.commitlintrc',
    '.commitlintrc.json',
    '.commitlintrc.js',
    '.commitlintrc.cjs',
    '.commitlintrc.yaml',
    '.commitlintrc.yml',
  ]

  if (commitlintCandidates.some((candidate) => existsSync(join(repoPath, candidate)))) {
    return 'conventional-commits'
  }

  const contributingText = readFileSafe(join(repoPath, 'CONTRIBUTING.md'))
  if (!contributingText) {
    return undefined
  }

  if (/conventional commit/i.test(contributingText) || /^(feat|fix|chore|docs|refactor)\(.+\):/im.test(contributingText)) {
    return 'conventional-commits'
  }

  return undefined
}

function isLikelyTextFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase()
  if (normalized.endsWith('makefile')) {
    return true
  }

  const extensionStart = normalized.lastIndexOf('.')
  if (extensionStart === -1) {
    return false
  }

  const extension = normalized.slice(extensionStart)
  return TEXT_FILE_EXTENSIONS.has(extension)
}

function scanTechDebt(repoPath: string, allFiles: string[]): string[] {
  const findings: string[] = []

  for (const filePath of allFiles) {
    if (findings.length >= TODO_LIMIT || !isLikelyTextFile(filePath)) {
      continue
    }

    let stat: Stats
    try {
      stat = statSync(filePath)
    } catch {
      continue
    }

    if (stat.size > 500_000) {
      continue
    }

    const text = readFileSafe(filePath)
    if (!text) {
      continue
    }

    const lines = text.split(/\r?\n/)
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex]
      const match = line.match(/\b(TODO|FIXME|HACK)\b\s*:?\s*(.*)$/i)
      if (!match) {
        continue
      }

      const keyword = match[1].toUpperCase()
      const detail = match[2]?.trim()
      findings.push(
        `${relative(repoPath, filePath)}:${lineIndex + 1} ${keyword}${detail ? ` ${detail}` : ''}`
      )

      if (findings.length >= TODO_LIMIT) {
        break
      }
    }
  }

  return findings
}

function detectGreenfield(repoPath: string): boolean {
  const hasGitDirectory = existsSync(join(repoPath, '.git'))
  const hasSrcDirectory = existsSync(join(repoPath, 'src'))

  let hasCommits = false
  if (hasGitDirectory) {
    try {
      const result = execSync(`git -C ${shellQuote(repoPath)} rev-list --max-count=1 HEAD`, {
        stdio: 'pipe',
      })
      hasCommits = result.toString('utf-8').trim().length > 0
    } catch {
      hasCommits = false
    }
  }

  return !hasGitDirectory || !hasCommits || !hasSrcDirectory
}

function listBranches(repoPath: string): string[] {
  try {
    const branchOutput = execSync(`git -C ${shellQuote(repoPath)} branch --format='%(refname:short)'`, {
      stdio: 'pipe',
    })
      .toString('utf-8')
      .trim()

    if (branchOutput.length === 0) {
      return []
    }

    return branchOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  } catch {
    return []
  }
}

export class RepoIngestionService {
  async ingest(source: string): Promise<RepoContext> {
    const trimmedSource = source.trim()
    if (trimmedSource.length === 0) {
      throw new Error('Invalid source: source is required')
    }

    const sourceIsGitUrl = isGitUrl(trimmedSource)
    let repoPath = trimmedSource
    let tempClonePath: string | null = null

    try {
      if (sourceIsGitUrl) {
        tempClonePath = join(tmpdir(), `rdlo-${randomUUID()}`)
        execSync(
          `git clone --depth 1 ${shellQuote(trimmedSource)} ${shellQuote(tempClonePath)}`,
          { stdio: 'pipe' }
        )
        repoPath = tempClonePath
      } else {
        repoPath = resolve(trimmedSource)
        if (!existsSync(repoPath)) {
          throw new Error(`Invalid source: local path does not exist (${repoPath})`)
        }

        if (!statSync(repoPath).isDirectory()) {
          throw new Error(`Invalid source: local path is not a directory (${repoPath})`)
        }
      }

      const layer1 = this.runStructuralAnalysis(repoPath)
      const repoMode = detectGreenfield(repoPath) ? 'greenfield' : 'brownfield'

      const layer3 =
        repoMode === 'greenfield'
          ? { scripts: layer1.scripts, commitFormat: undefined, techDebt: [], makeTargets: [] }
          : this.runOperationalAnalysis(repoPath, layer1.scripts)

      const repoContext: RepoContext = {
        id: randomUUID(),
        source: trimmedSource,
        repoMode,
        services: layer1.services,
        ports: layer1.ports,
        envVars: layer1.envVars,
        scripts: layer3.scripts,
        commitFormat: layer3.commitFormat,
        techDebt: layer3.techDebt,
        branches: repoMode === 'greenfield' ? [] : listBranches(repoPath),
      }

      try {
        const extractor = new AstSymbolExtractor()
        const layer2 = await extractor.extractFromDirectory(repoPath)
        const indexService = new SemanticIndexService()
        await indexService.indexSymbols(layer2.symbols, repoContext.id)
        const graphService = new ImportGraphService()
        await graphService.buildGraph(layer2.imports, repoPath)

        logger.info('Layer 2 ingestion completed', {
          source: trimmedSource,
          repoPath,
          fileCount: layer2.fileCount,
          symbolCount: layer2.symbols.length,
          importCount: layer2.imports.length,
        })
      } catch (layer2Error) {
        logger.error('Layer 2 ingestion failed; continuing without semantic graph data', {
          source: trimmedSource,
          repoPath,
          error: layer2Error instanceof Error ? layer2Error.message : String(layer2Error),
        })
      }

      const intelligenceDb = getIntelligenceDb()
      const [createdKnowledgeItem] = await intelligenceDb
        .insert(knowledgeItems)
        .values({
          content: JSON.stringify(repoContext),
          type: 'repo-context' as unknown as typeof knowledgeItems.$inferInsert['type'],
          sourceType: sourceIsGitUrl ? SourceType.GIT_REPOSITORY : SourceType.FILE_SYSTEM,
          sourceIdentifier: trimmedSource,
          sourceUrl: sourceIsGitUrl ? trimmedSource : undefined,
          tags: ['repo-context', repoMode],
          confidence: 0.9,
          metadata: {
            title: trimmedSource,
            docs: layer1.docs,
            makeTargets: layer3.makeTargets,
          },
          summary: `RepoContext for ${basename(trimmedSource) || trimmedSource}`,
        })
        .returning({ id: knowledgeItems.id })

      repoContext.knowledgeItemId = createdKnowledgeItem?.id
      return repoContext
    } catch (error) {
      logger.error('Repo ingestion failed', {
        source: trimmedSource,
        repoPath,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error instanceof Error ? error : new Error('Failed to ingest repository source')
    } finally {
      if (tempClonePath && existsSync(tempClonePath)) {
        try {
          rmSync(tempClonePath, { recursive: true, force: true })
        } catch (cleanupError) {
          logger.warn('Failed to cleanup temporary repository clone', {
            tempClonePath,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          })
        }
      }
    }
  }

  private runStructuralAnalysis(repoPath: string): StructuralAnalysis {
    const discoveredServices: ServiceDefinition[] = []
    const discoveredPorts = new Set<number>()

    const packageInfo = parsePackageScripts(repoPath)
    if (packageInfo.packageName) {
      discoveredServices.push({
        name: packageInfo.packageName,
        type: 'node-package',
        entryPoint: packageInfo.entryPoint,
      })
    }

    for (const nxProject of parseNxProjects(repoPath)) {
      discoveredServices.push(nxProject)
    }

    const dockerArtifacts = parseDockerArtifacts(repoPath)
    for (const service of dockerArtifacts.services) {
      discoveredServices.push(service)
    }
    for (const port of dockerArtifacts.ports) {
      discoveredPorts.add(port)
    }

    return {
      scripts: packageInfo.scripts,
      services: discoveredServices,
      ports: Array.from(discoveredPorts),
      envVars: parseEnvVars(repoPath),
      docs: parseDocs(repoPath),
    }
  }

  private runOperationalAnalysis(
    repoPath: string,
    packageScripts: Record<string, string>
  ): OperationalAnalysis {
    const allFiles = walkDirectory(repoPath)
    return {
      scripts: packageScripts,
      commitFormat: detectCommitFormat(repoPath),
      techDebt: scanTechDebt(repoPath, allFiles),
      makeTargets: parseMakeTargets(repoPath),
    }
  }
}
