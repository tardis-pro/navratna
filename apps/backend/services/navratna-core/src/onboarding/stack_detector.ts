// Stack Detection Engine — analyzes a cloned repo directory and produces a StackProfile
// Uses filesystem reads and regex parsing for fast, pragmatic detection

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@uaip/utils'
import type {
  StackProfile,
} from '@uaip/types'

function readFileSafe(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

function parseJsonSafe(filePath: string): Record<string, unknown> | null {
  const text = readFileSafe(filePath)
  if (!text) return null
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function globFiles(dir: string, pattern: RegExp, maxDepth = 3, currentDepth = 0): string[] {
  if (currentDepth > maxDepth) return []
  const results: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
      const fullPath = join(dir, entry.name)
      if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath)
      } else if (entry.isDirectory()) {
        results.push(...globFiles(fullPath, pattern, maxDepth, currentDepth + 1))
      }
    }
  } catch {
    // ignore permission errors
  }
  return results
}

export class StackDetector {
  async detect(repoPath: string): Promise<StackProfile> {
    logger.info('Stack detection started', { repoPath })

    const profile: StackProfile = {
      language: 'unknown',
      runtime: 'unknown',
      framework: null,
      databases: [],
      port: null,
      hasDockerfile: false,
      hasHealthEndpoint: false,
      envVars: [],
      apiRoutes: [],
      existingDeploy: null,
      buildCommand: null,
      startCommand: null,
      testCommand: null,
    }

    this.detectFromPackageJson(repoPath, profile)
    this.detectFromGoMod(repoPath, profile)
    this.detectFromRequirementsTxt(repoPath, profile)
    this.detectFromCargoToml(repoPath, profile)
    this.detectFromGemfile(repoPath, profile)
    this.detectFromPomXml(repoPath, profile)
    this.detectFromMixExs(repoPath, profile)
    this.detectFrameworkFiles(repoPath, profile)
    this.detectDockerfile(repoPath, profile)
    this.detectDockerCompose(repoPath, profile)
    this.detectEnvVars(repoPath, profile)
    this.detectExistingDeploy(repoPath, profile)
    this.detectApiRoutes(repoPath, profile)
    this.detectHealthEndpoint(repoPath, profile)
    this.detectPort(repoPath, profile)

    logger.info('Stack detection complete', {
      language: profile.language,
      runtime: profile.runtime,
      framework: profile.framework,
      databases: profile.databases,
    })

    return profile
  }

  private detectFromPackageJson(repoPath: string, profile: StackProfile): void {
    const pkgPath = join(repoPath, 'package.json')
    const pkg = parseJsonSafe(pkgPath)
    if (!pkg) return

    // Language
    const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>
    const deps = (pkg.dependencies ?? {}) as Record<string, string>
    const allDeps = { ...deps, ...devDeps }

    if (allDeps.typescript || existsSync(join(repoPath, 'tsconfig.json'))) {
      profile.language = 'typescript'
    } else {
      profile.language = 'javascript'
    }

    // Runtime detection
    const engines = (pkg.engines ?? {}) as Record<string, string>
    if (engines.bun || allDeps['@types/bun'] || existsSync(join(repoPath, 'bunfig.toml'))) {
      profile.runtime = 'bun'
    } else if (engines.deno || existsSync(join(repoPath, 'deno.json')) || existsSync(join(repoPath, 'deno.jsonc'))) {
      profile.runtime = 'deno'
    } else {
      profile.runtime = 'node'
    }

    // Framework detection from dependencies
    const frameworkMap: [string, string][] = [
      ['elysia', 'elysia'],
      ['next', 'nextjs'],
      ['nuxt', 'nuxt'],
      ['@remix-run/node', 'remix'],
      ['@remix-run/react', 'remix'],
      ['express', 'express'],
      ['fastify', 'fastify'],
      ['hono', 'hono'],
      ['koa', 'koa'],
      ['@nestjs/core', 'nestjs'],
      ['gatsby', 'gatsby'],
      ['astro', 'astro'],
      ['svelte', 'sveltekit'],
      ['@sveltejs/kit', 'sveltekit'],
      ['solid-start', 'solid-start'],
      ['vite', 'vite'],
    ]

    for (const [dep, framework] of frameworkMap) {
      if (deps[dep]) {
        profile.framework = framework
        break
      }
    }

    // Database detection from dependencies
    const dbMap: [string, string][] = [
      ['pg', 'postgres'],
      ['postgres', 'postgres'],
      ['@prisma/client', 'postgres'], // default assumption
      ['drizzle-orm', 'postgres'], // default assumption
      ['mysql2', 'mysql'],
      ['mongodb', 'mongodb'],
      ['mongoose', 'mongodb'],
      ['redis', 'redis'],
      ['ioredis', 'redis'],
      ['@upstash/redis', 'redis'],
      ['better-sqlite3', 'sqlite'],
      ['sqlite3', 'sqlite'],
      ['neo4j-driver', 'neo4j'],
      ['@qdrant/js-client-rest', 'qdrant'],
      ['typeorm', 'postgres'],
      ['sequelize', 'postgres'],
    ]

    const detectedDbs = new Set<string>()
    for (const [dep, db] of dbMap) {
      if (allDeps[dep]) {
        detectedDbs.add(db)
      }
    }
    profile.databases = [...detectedDbs]

    // Scripts
    const scripts = (pkg.scripts ?? {}) as Record<string, string>
    profile.buildCommand = scripts.build ?? null
    profile.startCommand = scripts.start ?? scripts.dev ?? null
    profile.testCommand = scripts.test ?? null
  }

  private detectFromGoMod(repoPath: string, profile: StackProfile): void {
    const goModPath = join(repoPath, 'go.mod')
    const content = readFileSafe(goModPath)
    if (!content) return

    profile.language = 'go'
    profile.runtime = 'go'

    // Framework detection
    if (content.includes('github.com/gin-gonic/gin')) profile.framework = 'gin'
    else if (content.includes('github.com/gofiber/fiber')) profile.framework = 'fiber'
    else if (content.includes('github.com/labstack/echo')) profile.framework = 'echo'
    else if (content.includes('github.com/gorilla/mux')) profile.framework = 'gorilla'
    else if (content.includes('github.com/go-chi/chi')) profile.framework = 'chi'

    // Database detection
    if (content.includes('github.com/lib/pq') || content.includes('github.com/jackc/pgx')) {
      profile.databases.push('postgres')
    }
    if (content.includes('github.com/go-redis/redis') || content.includes('github.com/redis/go-redis')) {
      profile.databases.push('redis')
    }
    if (content.includes('go.mongodb.org/mongo-driver')) {
      profile.databases.push('mongodb')
    }
    if (content.includes('github.com/go-sql-driver/mysql')) {
      profile.databases.push('mysql')
    }

    profile.buildCommand = 'go build -o app .'
    profile.startCommand = './app'
    profile.testCommand = 'go test ./...'
  }

  private detectFromRequirementsTxt(repoPath: string, profile: StackProfile): void {
    // Check requirements.txt, pyproject.toml, setup.py
    const content = readFileSafe(join(repoPath, 'requirements.txt'))
    const pyprojectContent = readFileSafe(join(repoPath, 'pyproject.toml'))
    const setupPy = existsSync(join(repoPath, 'setup.py'))

    if (!content && !pyprojectContent && !setupPy) return

    profile.language = 'python'
    profile.runtime = 'python'

    const allContent = (content ?? '') + '\n' + (pyprojectContent ?? '')

    // Framework detection
    if (allContent.includes('fastapi')) profile.framework = 'fastapi'
    else if (allContent.includes('django')) profile.framework = 'django'
    else if (allContent.includes('flask')) profile.framework = 'flask'
    else if (allContent.includes('starlette')) profile.framework = 'starlette'
    else if (allContent.includes('tornado')) profile.framework = 'tornado'
    else if (allContent.includes('sanic')) profile.framework = 'sanic'
    else if (allContent.includes('litestar')) profile.framework = 'litestar'

    // Database detection
    if (allContent.includes('psycopg') || allContent.includes('asyncpg')) {
      profile.databases.push('postgres')
    }
    if (allContent.includes('redis') || allContent.includes('aioredis')) {
      profile.databases.push('redis')
    }
    if (allContent.includes('pymongo') || allContent.includes('motor')) {
      profile.databases.push('mongodb')
    }
    if (allContent.includes('mysqlclient') || allContent.includes('aiomysql')) {
      profile.databases.push('mysql')
    }
    if (allContent.includes('sqlalchemy')) {
      if (!profile.databases.length) profile.databases.push('postgres')
    }

    // Commands
    if (profile.framework === 'fastapi') {
      profile.startCommand = 'uvicorn main:app --host 0.0.0.0 --port 8000'
    } else if (profile.framework === 'django') {
      profile.startCommand = 'python manage.py runserver 0.0.0.0:8000'
    } else if (profile.framework === 'flask') {
      profile.startCommand = 'flask run --host 0.0.0.0 --port 5000'
    }
    profile.testCommand = 'pytest'
  }

  private detectFromCargoToml(repoPath: string, profile: StackProfile): void {
    const content = readFileSafe(join(repoPath, 'Cargo.toml'))
    if (!content) return

    profile.language = 'rust'
    profile.runtime = 'rust'

    if (content.includes('actix-web')) profile.framework = 'actix'
    else if (content.includes('axum')) profile.framework = 'axum'
    else if (content.includes('rocket')) profile.framework = 'rocket'
    else if (content.includes('warp')) profile.framework = 'warp'

    if (content.includes('tokio-postgres') || content.includes('sqlx') || content.includes('diesel')) {
      profile.databases.push('postgres')
    }
    if (content.includes('redis')) profile.databases.push('redis')

    profile.buildCommand = 'cargo build --release'
    profile.startCommand = './target/release/app'
    profile.testCommand = 'cargo test'
  }

  private detectFromGemfile(repoPath: string, profile: StackProfile): void {
    const content = readFileSafe(join(repoPath, 'Gemfile'))
    if (!content) return

    profile.language = 'ruby'
    profile.runtime = 'ruby'

    if (content.includes("'rails'") || content.includes('"rails"')) profile.framework = 'rails'
    else if (content.includes("'sinatra'") || content.includes('"sinatra"')) profile.framework = 'sinatra'
    else if (content.includes("'hanami'") || content.includes('"hanami"')) profile.framework = 'hanami'

    if (content.includes("'pg'") || content.includes('"pg"')) profile.databases.push('postgres')
    if (content.includes("'redis'") || content.includes('"redis"')) profile.databases.push('redis')
    if (content.includes("'mongoid'") || content.includes('"mongoid"')) profile.databases.push('mongodb')
    if (content.includes("'mysql2'") || content.includes('"mysql2"')) profile.databases.push('mysql')

    profile.buildCommand = 'bundle install'
    profile.startCommand = profile.framework === 'rails' ? 'rails server -b 0.0.0.0' : 'ruby app.rb'
    profile.testCommand = 'bundle exec rspec'
  }

  private detectFromPomXml(repoPath: string, profile: StackProfile): void {
    const content = readFileSafe(join(repoPath, 'pom.xml'))
    const gradleContent = readFileSafe(join(repoPath, 'build.gradle'))
    const gradleKtsContent = readFileSafe(join(repoPath, 'build.gradle.kts'))

    const javaContent = content ?? gradleContent ?? gradleKtsContent
    if (!javaContent) return

    profile.language = 'java'
    profile.runtime = 'jvm'

    if (javaContent.includes('spring-boot')) profile.framework = 'spring-boot'
    else if (javaContent.includes('quarkus')) profile.framework = 'quarkus'
    else if (javaContent.includes('micronaut')) profile.framework = 'micronaut'
    else if (javaContent.includes('ktor')) profile.framework = 'ktor'

    if (javaContent.includes('postgresql') || javaContent.includes('postgres')) {
      profile.databases.push('postgres')
    }
    if (javaContent.includes('redis') || javaContent.includes('jedis') || javaContent.includes('lettuce')) {
      profile.databases.push('redis')
    }
    if (javaContent.includes('mongodb') || javaContent.includes('mongo')) {
      profile.databases.push('mongodb')
    }
    if (javaContent.includes('mysql')) profile.databases.push('mysql')

    if (content) {
      profile.buildCommand = 'mvn clean package -DskipTests'
      profile.startCommand = 'java -jar target/*.jar'
      profile.testCommand = 'mvn test'
    } else {
      profile.buildCommand = './gradlew build -x test'
      profile.startCommand = 'java -jar build/libs/*.jar'
      profile.testCommand = './gradlew test'
    }
  }

  private detectFromMixExs(repoPath: string, profile: StackProfile): void {
    const content = readFileSafe(join(repoPath, 'mix.exs'))
    if (!content) return

    profile.language = 'elixir'
    profile.runtime = 'beam'

    if (content.includes(':phoenix')) profile.framework = 'phoenix'

    if (content.includes(':postgrex') || content.includes(':ecto')) {
      profile.databases.push('postgres')
    }
    if (content.includes(':redix')) profile.databases.push('redis')

    profile.buildCommand = 'mix compile'
    profile.startCommand = 'mix phx.server'
    profile.testCommand = 'mix test'
  }

  private detectFrameworkFiles(repoPath: string, profile: StackProfile): void {
    // Override framework detection based on config files that are definitive
    if (existsSync(join(repoPath, 'next.config.js')) || existsSync(join(repoPath, 'next.config.mjs')) || existsSync(join(repoPath, 'next.config.ts'))) {
      profile.framework = 'nextjs'
    } else if (existsSync(join(repoPath, 'nuxt.config.ts')) || existsSync(join(repoPath, 'nuxt.config.js'))) {
      profile.framework = 'nuxt'
    } else if (existsSync(join(repoPath, 'astro.config.mjs')) || existsSync(join(repoPath, 'astro.config.ts'))) {
      profile.framework = 'astro'
    } else if (existsSync(join(repoPath, 'svelte.config.js')) || existsSync(join(repoPath, 'svelte.config.ts'))) {
      profile.framework = 'sveltekit'
    } else if (existsSync(join(repoPath, 'remix.config.js')) || existsSync(join(repoPath, 'remix.config.ts'))) {
      profile.framework = 'remix'
    } else if (existsSync(join(repoPath, 'angular.json'))) {
      profile.framework = 'angular'
    } else if (existsSync(join(repoPath, 'vite.config.ts')) || existsSync(join(repoPath, 'vite.config.js'))) {
      if (!profile.framework) profile.framework = 'vite'
    }
  }

  private detectDockerfile(repoPath: string, profile: StackProfile): void {
    const dockerfilePath = join(repoPath, 'Dockerfile')
    const content = readFileSafe(dockerfilePath)
    if (!content) {
      profile.hasDockerfile = false
      return
    }

    profile.hasDockerfile = true

    // Extract EXPOSE port
    const exposeMatch = content.match(/^EXPOSE\s+(\d+)/m)
    if (exposeMatch) {
      profile.port = parseInt(exposeMatch[1], 10)
    }

    // Extract runtime from FROM
    const fromMatch = content.match(/^FROM\s+(\S+)/m)
    if (fromMatch) {
      const baseImage = fromMatch[1].toLowerCase()
      if (baseImage.includes('bun')) profile.runtime = 'bun'
      else if (baseImage.includes('deno')) profile.runtime = 'deno'
      else if (baseImage.includes('node')) profile.runtime = 'node'
      else if (baseImage.includes('python')) profile.runtime = 'python'
      else if (baseImage.includes('golang') || baseImage.includes('go:')) profile.runtime = 'go'
      else if (baseImage.includes('rust')) profile.runtime = 'rust'
      else if (baseImage.includes('ruby')) profile.runtime = 'ruby'
      else if (baseImage.includes('openjdk') || baseImage.includes('eclipse-temurin') || baseImage.includes('amazoncorretto')) profile.runtime = 'jvm'
      else if (baseImage.includes('elixir') || baseImage.includes('erlang')) profile.runtime = 'beam'
    }

    // Extract CMD start command
    const cmdMatch = content.match(/^CMD\s+(.+)$/m)
    if (cmdMatch && !profile.startCommand) {
      const cmd = cmdMatch[1].trim()
      // Clean up JSON array format: ["node", "server.js"] -> node server.js
      if (cmd.startsWith('[')) {
        try {
          const parts = JSON.parse(cmd) as string[]
          profile.startCommand = parts.join(' ')
        } catch {
          profile.startCommand = cmd
        }
      } else {
        profile.startCommand = cmd
      }
    }
  }

  private detectDockerCompose(repoPath: string, profile: StackProfile): void {
    const composePaths = [
      join(repoPath, 'docker-compose.yml'),
      join(repoPath, 'docker-compose.yaml'),
      join(repoPath, 'compose.yml'),
      join(repoPath, 'compose.yaml'),
    ]

    let content: string | null = null
    for (const p of composePaths) {
      content = readFileSafe(p)
      if (content) break
    }
    if (!content) return

    // Detect databases from service images
    const dbImageMap: [RegExp, string][] = [
      [/image:\s*['"]?postgres/m, 'postgres'],
      [/image:\s*['"]?redis/m, 'redis'],
      [/image:\s*['"]?mongo/m, 'mongodb'],
      [/image:\s*['"]?mysql/m, 'mysql'],
      [/image:\s*['"]?mariadb/m, 'mysql'],
      [/image:\s*['"]?neo4j/m, 'neo4j'],
      [/image:\s*['"]?qdrant/m, 'qdrant'],
      [/image:\s*['"]?meilisearch/m, 'meilisearch'],
      [/image:\s*['"]?elasticsearch/m, 'elasticsearch'],
      [/image:\s*['"]?memcached/m, 'memcached'],
      [/image:\s*['"]?rabbitmq/m, 'rabbitmq'],
      [/image:\s*['"]?nats/m, 'nats'],
    ]

    const existingDbs = new Set(profile.databases)
    for (const [pattern, db] of dbImageMap) {
      if (pattern.test(content) && !existingDbs.has(db)) {
        profile.databases.push(db)
        existingDbs.add(db)
      }
    }

    // Extract env vars from compose
    const envMatches = content.matchAll(/^\s+-\s+(\w+)=/gm)
    for (const match of envMatches) {
      if (match[1] && !profile.envVars.includes(match[1])) {
        profile.envVars.push(match[1])
      }
    }
  }

  private detectEnvVars(repoPath: string, profile: StackProfile): void {
    const envFiles = [
      join(repoPath, '.env.example'),
      join(repoPath, '.env.sample'),
      join(repoPath, '.env.template'),
      join(repoPath, 'sample.env'),
      join(repoPath, '.env.local.example'),
    ]

    for (const envFile of envFiles) {
      const content = readFileSafe(envFile)
      if (!content) continue

      const lines = content.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIndex = trimmed.indexOf('=')
        if (eqIndex > 0) {
          const varName = trimmed.substring(0, eqIndex).trim()
          if (/^[A-Z_][A-Z0-9_]*$/.test(varName) && !profile.envVars.includes(varName)) {
            profile.envVars.push(varName)
          }
        }
      }
    }
  }

  private detectExistingDeploy(repoPath: string, profile: StackProfile): void {
    if (existsSync(join(repoPath, 'fly.toml'))) {
      profile.existingDeploy = 'fly'

      // Extract port from fly.toml
      const flyContent = readFileSafe(join(repoPath, 'fly.toml'))
      if (flyContent) {
        const portMatch = flyContent.match(/internal_port\s*=\s*(\d+)/)
        if (portMatch && !profile.port) {
          profile.port = parseInt(portMatch[1], 10)
        }
      }
    } else if (existsSync(join(repoPath, 'vercel.json')) || existsSync(join(repoPath, '.vercel'))) {
      profile.existingDeploy = 'vercel'
    } else if (existsSync(join(repoPath, 'wrangler.toml')) || existsSync(join(repoPath, 'wrangler.json'))) {
      profile.existingDeploy = 'cloudflare'
    } else if (existsSync(join(repoPath, 'Procfile'))) {
      // Could be Heroku or Railway
      profile.existingDeploy = 'heroku'
    } else if (existsSync(join(repoPath, 'railway.json')) || existsSync(join(repoPath, 'railway.toml'))) {
      profile.existingDeploy = 'railway'
    }
  }

  private detectApiRoutes(repoPath: string, profile: StackProfile): void {
    // Scan for common route patterns in source files
    const routePatterns: RegExp[] = [
      // Express/Elysia/Fastify style: app.get('/path', ...) or router.post('/path', ...)
      /\.(get|post|put|patch|delete|all)\s*\(\s*['"`](\/[^'"`]*?)['"`]/g,
      // Decorator style: @Get('/path'), @Post('/path')
      /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`](\/[^'"`]*?)['"`]/g,
      // FastAPI style: @app.get("/path")
      /@app\.(get|post|put|patch|delete)\s*\(\s*['"`](\/[^'"`]*?)['"`]/g,
    ]

    const routeFilePatterns = /\.(ts|js|py|rb|go|java|kt|rs)$/
    const routeFiles = globFiles(repoPath, routeFilePatterns, 4)

    const detectedRoutes = new Set<string>()

    for (const file of routeFiles.slice(0, 100)) {
      // limit to 100 files for performance
      const content = readFileSafe(file)
      if (!content) continue

      for (const pattern of routePatterns) {
        // Reset lastIndex for global regex
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(content)) !== null) {
          const route = match[2]
          if (route && route.length < 200) {
            detectedRoutes.add(`${match[1].toUpperCase()} ${route}`)
          }
        }
      }
    }

    profile.apiRoutes = [...detectedRoutes].sort().slice(0, 50) // cap at 50 routes
  }

  private detectHealthEndpoint(repoPath: string, profile: StackProfile): void {
    const healthPaths = ['/health', '/healthz', '/api/health', '/api/v1/health', '/_health']

    // Check from detected routes
    for (const route of profile.apiRoutes) {
      const routePath = route.split(' ')[1]
      if (routePath && healthPaths.includes(routePath)) {
        profile.hasHealthEndpoint = true
        return
      }
    }

    // Scan source files for health patterns
    const sourceFiles = globFiles(repoPath, /\.(ts|js|py|rb|go)$/, 3)
    for (const file of sourceFiles.slice(0, 50)) {
      const content = readFileSafe(file)
      if (!content) continue
      for (const healthPath of healthPaths) {
        if (content.includes(`'${healthPath}'`) || content.includes(`"${healthPath}"`)) {
          profile.hasHealthEndpoint = true
          return
        }
      }
    }
  }

  private detectPort(repoPath: string, profile: StackProfile): void {
    // Port already detected from Dockerfile or fly.toml
    if (profile.port) return

    // Check package.json scripts for port
    const pkg = parseJsonSafe(join(repoPath, 'package.json'))
    if (pkg) {
      const scripts = (pkg.scripts ?? {}) as Record<string, string>
      for (const script of Object.values(scripts)) {
        const portMatch = script.match(/(?:--port|PORT=|-p)\s*(\d{4,5})/)
        if (portMatch) {
          profile.port = parseInt(portMatch[1], 10)
          return
        }
      }
    }

    // Check .env.example for PORT
    const envFiles = ['.env.example', '.env.sample', 'sample.env']
    for (const envFile of envFiles) {
      const content = readFileSafe(join(repoPath, envFile))
      if (!content) continue
      const portMatch = content.match(/^PORT\s*=\s*(\d+)/m)
      if (portMatch) {
        profile.port = parseInt(portMatch[1], 10)
        return
      }
    }

    // Default ports by framework
    const frameworkPorts: Record<string, number> = {
      nextjs: 3000,
      nuxt: 3000,
      express: 3000,
      fastify: 3000,
      elysia: 3000,
      hono: 3000,
      nestjs: 3000,
      remix: 3000,
      vite: 5173,
      astro: 4321,
      sveltekit: 5173,
      angular: 4200,
      fastapi: 8000,
      django: 8000,
      flask: 5000,
      gin: 8080,
      fiber: 3000,
      echo: 8080,
      chi: 8080,
      'spring-boot': 8080,
      rails: 3000,
      phoenix: 4000,
      actix: 8080,
      axum: 3000,
      rocket: 8000,
    }

    if (profile.framework && frameworkPorts[profile.framework]) {
      profile.port = frameworkPorts[profile.framework]
    }
  }
}
