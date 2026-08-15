import { execFile, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  type Dirent,
  type Stats,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { getIntelligenceDb, knowledgeItems } from '@uaip/shared-services'
import {
  KnowledgeType,
  SourceType,
  type EnvVarSchema,
  type OperationalAnalysis,
  type RepoContext,
  type RepoDocument,
  type ServiceDefinition,
  type StructuralAnalysis,
} from '@uaip/types'
import { logger, NotFoundError, ValidationError } from '@uaip/utils'
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

/**
 * The environment a git command runs in, carrying the clone credential if there
 * is one.
 *
 * WHERE THE TOKEN IS NOT. Not in the URL: `source` is logged on the error path,
 * and a failed clone is exactly what happens while this is being set up, so a
 * credential in the URL would be written to the logs by the first thing that
 * goes wrong. Not in argv either — `git -c http.extraHeader=...` would put it
 * on the command line, where any process on the box can read it out of `ps`
 * for the lifetime of the clone.
 *
 * `GIT_CONFIG_COUNT`/`KEY`/`VALUE` set the same config git would have taken
 * from `-c`, through the environment instead. That is readable via
 * /proc/<pid>/environ, but only by the same user or root, rather than by
 * anything that can run `ps`.
 *
 * `GIT_TERMINAL_PROMPT=0` is set whether or not there is a token: without it a
 * private repository with no credential does not fail, it BLOCKS waiting for a
 * username on a terminal that will never answer.
 */
const execFileAsync = promisify(execFile)

/** A clone of a large monorepo is minutes, not seconds. A hung one is forever. */
const GIT_NETWORK_TIMEOUT_MS = Number(process.env.REPO_GIT_TIMEOUT_MS ?? 10 * 60 * 1000)

/**
 * Run a git command that talks to a remote, WITHOUT blocking the event loop.
 *
 * These used to be `execSync`. That blocks the whole process for the duration
 * of the call, so while one ingest cloned, navratna-core served nothing at all
 * — not other requests, not the triage workflow's MCP calls, not its own health
 * checks. On a small repo that is a blip; on the navratna monorepo it is
 * minutes of a service that looks dead to everything watching it.
 *
 * Two other properties come free from `execFile` with an argument array:
 * no shell is spawned, so nothing in a path or URL can be interpreted as a
 * shell metacharacter and `shellQuote` is not needed here; and a timeout is
 * enforceable, so a clone that hangs on an unreachable remote fails instead of
 * holding a request open forever.
 */
async function runGit(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await execFileAsync('git', args, {
    env,
    timeout: GIT_NETWORK_TIMEOUT_MS,
    // git writes progress to stderr; the default 1MB is enough to truncate a
    // long clone and turn a working command into an error.
    maxBuffer: 10 * 1024 * 1024,
  })
}

function gitEnv(cloneToken?: string): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }

  /**
   * Trust the homelab CA, when one is configured.
   *
   * Every git remote on this platform is `https://git.tardis.local`, signed by
   * a private CA. The container's default bundle does not contain it, so a
   * clone fails at TLS before it ever reaches authentication:
   *
   *   fatal: unable to access '...': server verification failed:
   *   certificate signer not trusted. (CAfile: /etc/ssl/certs/ca-certificates.crt)
   *
   * `GIT_SSL_CAINFO` points git at the mounted CA instead. It is read from the
   * environment rather than hardcoded because the path is a deployment
   * decision, and unset simply means the system bundle — which is correct for
   * a public remote.
   *
   * NOT `GIT_SSL_NO_VERIFY`. That would also make this error go away, by
   * turning off certificate verification for every clone including public
   * ones — trading a configuration gap for a permanent hole. If the CA is not
   * mounted, the honest outcome is that the clone fails.
   */
  const caPath = process.env.GIT_SSL_CAINFO || process.env.TARDIS_CA_PATH
  if (caPath) base.GIT_SSL_CAINFO = caPath

  if (!cloneToken) return base
  return {
    ...base,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `Authorization: token ${cloneToken}`,
  }
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
    const result: unknown = JSON.parse(text)
    return result
  } catch {
    return null
  }
}

function walkDirectory(rootPath: string, depth = 0): string[] {
  if (depth > MAX_WALK_DEPTH) {
    return []
  }

  let dirents: Dirent[]
  try {
    dirents = readdirSync(rootPath, { withFileTypes: true })
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

/**
 * Where cloned repositories live between ingests.
 *
 * Defaults under tmpdir so the service works with no configuration, but a
 * deployment that wants the cache to survive a restart must point this at a
 * mounted volume — otherwise every boot re-clones every project.
 */
const REPO_CACHE_ROOT =
  process.env.REPO_CACHE_DIR?.trim() || join(tmpdir(), 'navratna-repo-cache')

/**
 * One directory per project, so re-ingesting a project reuses its checkout.
 * Sources with no project fall back to a hash of the URL, which keeps two
 * different repositories from sharing (and overwriting) one directory.
 */
function repoCacheKey(source: string, projectId?: string): string {
  if (projectId) return `project-${projectId}`
  return `source-${createHash('sha256').update(source).digest('hex').slice(0, 32)}`
}

/**
 * Serializes ingests of the SAME cache key within this process.
 *
 * Two concurrent ingests of one project would otherwise run `git reset --hard`
 * in the directory the other is mid-read of, producing a half-updated tree that
 * analysis silently reports as the repository's real contents. Cross-process
 * races are NOT covered — a second navratna-core replica ingesting the same
 * project concurrently still conflicts; that needs the cache on a per-replica
 * volume or a distributed lock.
 */
const cacheLocks = new Map<string, Promise<unknown>>()

function withCacheLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = cacheLocks.get(key) ?? Promise.resolve()

  // Both handlers are `run`, so the queue advances whether the predecessor
  // succeeded or threw. Chaining on success alone would wedge the key forever
  // after the first failed ingest.
  const current = previous.then(run, run)

  // The map holds a promise that never rejects, so an unhandled rejection from
  // one waiter cannot escape through the chain of the next.
  const tail: Promise<unknown> = current.then(
    () => {
      if (cacheLocks.get(key) === tail) cacheLocks.delete(key)
    },
    () => {
      if (cacheLocks.get(key) === tail) cacheLocks.delete(key)
    }
  )
  cacheLocks.set(key, tail)

  return current
}

/**
 * Brings the cached checkout of `source` up to date and returns its path.
 *
 * Refresh, not re-clone: a shallow fetch plus a hard reset is what makes the
 * cache worth having. A cache directory that fails to refresh (interrupted
 * clone, corrupted objects, a repository that moved) is discarded and cloned
 * fresh rather than being reported as an error — a stale tree analysed as if it
 * were current is the worse failure.
 */
async function syncRepoCache(
  source: string,
  cacheKey: string,
  cloneToken?: string
): Promise<string> {
  const cachePath = join(REPO_CACHE_ROOT, cacheKey)
  // The refresh path talks to the remote too, so it needs the credential for
  // the same reason the clone does. Omitting it here would work on the first
  // ingest and fail on every one after it, once the cache existed.
  const env = gitEnv(cloneToken)

  if (existsSync(join(cachePath, '.git'))) {
    try {
      await runGit(['-C', cachePath, 'fetch', '--depth', '1', 'origin'], env)
      await runGit(['-C', cachePath, 'reset', '--hard', 'FETCH_HEAD'], env)
      // Build artefacts and other untracked leftovers from a previous checkout
      // would otherwise be walked as if they were part of the repository.
      await runGit(['-C', cachePath, 'clean', '-fdx'], env)

      logger.info('Refreshed cached repository clone', { source, cachePath })
      return cachePath
    } catch (error) {
      logger.warn('Could not refresh the cached clone; recloning', {
        source,
        cachePath,
        error: error instanceof Error ? error.message : String(error),
      })
      rmSync(cachePath, { recursive: true, force: true })
    }
  }

  mkdirSync(REPO_CACHE_ROOT, { recursive: true })
  // Removed unconditionally: a directory that exists WITHOUT a .git is the
  // wreckage of an interrupted clone, and git refuses to clone into it.
  rmSync(cachePath, { recursive: true, force: true })
  await runGit(['clone', '--depth', '1', source, cachePath], env)

  logger.info('Cloned repository into the cache', { source, cachePath })
  return cachePath
}

export interface IngestOptions {
  /**
   * Scopes the resulting knowledge to a project: it is tagged `project:<id>` so
   * a thread in that project retrieves this codebase and not another's, and the
   * checkout is cached under the project so re-ingesting refreshes in place.
   */
  projectId?: string

  /**
   * A token that authorises cloning THIS repository, and nothing else.
   *
   * Per-project by design: the provisioner already mints a Gitea bot token
   * scoped to each project and stows it in that project's secret, so ingesting
   * seven repositories uses seven credentials that each open one. The rejected
   * alternative was a single workspace-wide token held by this service, which
   * is the shape that made every project's SonarQube findings readable by
   * everyone — isolation resting on the code remembering to ask narrowly,
   * rather than on the credential being unable to answer broadly.
   *
   * Never logged, never placed in the URL, never passed in argv. See `gitEnv`.
   */
  cloneToken?: string
}

/** The tag that binds a knowledge item to a project. */
export function projectKnowledgeTag(projectId: string): string {
  return `project:${projectId}`
}

export class RepoIngestionService {
  async ingest(source: string, options: IngestOptions = {}): Promise<RepoContext> {
    const trimmedSource = source.trim()
    if (trimmedSource.length === 0) {
      throw new ValidationError('Invalid source: source is required')
    }

    const sourceIsGitUrl = isGitUrl(trimmedSource)

    // Serialized per cache key rather than per call: two ingests of different
    // projects are independent and still run concurrently.
    return withCacheLock(repoCacheKey(trimmedSource, options.projectId), () =>
      this.runIngest(trimmedSource, sourceIsGitUrl, options)
    )
  }

  private async runIngest(
    trimmedSource: string,
    sourceIsGitUrl: boolean,
    options: IngestOptions
  ): Promise<RepoContext> {
    let repoPath = trimmedSource

    try {
      if (sourceIsGitUrl) {
        // Kept on disk between ingests, unlike the previous throwaway clone: a
        // project's codebase is read on every turn that retrieves from it, and
        // re-cloning per read made that unaffordable.
        repoPath = await syncRepoCache(
          trimmedSource,
          repoCacheKey(trimmedSource, options.projectId),
          options.cloneToken
        )
      } else {
        repoPath = resolve(trimmedSource)
        if (!existsSync(repoPath)) {
          throw new NotFoundError(`Invalid source: local path does not exist (${repoPath})`)
        }

        if (!statSync(repoPath).isDirectory()) {
          throw new ValidationError(`Invalid source: local path is not a directory (${repoPath})`)
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
          type: KnowledgeType.REPO_CONTEXT,
          sourceType: sourceIsGitUrl ? SourceType.GIT_REPOSITORY : SourceType.FILE_SYSTEM,
          sourceIdentifier: trimmedSource,
          sourceUrl: sourceIsGitUrl ? trimmedSource : undefined,
          // The project tag is what lets retrieval tell one project's codebase
          // from another's — filters.tags is inclusion-only, so the binding has
          // to be present on the item itself.
          tags: options.projectId
            ? ['repo-context', repoMode, projectKnowledgeTag(options.projectId)]
            : ['repo-context', repoMode],
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
    }
    // No cleanup block: the checkout is the cache now, and deleting it here is
    // exactly what made every ingest pay for a fresh clone. syncRepoCache owns
    // the directory's lifetime — it discards and re-clones one it cannot
    // refresh.
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
