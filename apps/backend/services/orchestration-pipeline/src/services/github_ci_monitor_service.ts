import { logger, ValidationError } from '@uaip/utils'
import { EventBusService } from '@uaip/infra'
import type {
  GitHubCheckRunPayload,
  GitHubCheckSuitePayload,
} from '@uaip/types'

const GITHUB_API_BASE = 'https://api.github.com'

interface CICheckResult {
  passed: boolean
  conclusion: string | null
  name: string
  sha: string
  prNumbers: number[]
}

function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new ValidationError('GITHUB_TOKEN environment variable is required')
  }
  return token
}

export function evaluateCheckRun(payload: GitHubCheckRunPayload): CICheckResult {
  const checkRun = payload.check_run
  const passed = checkRun.conclusion === 'success'
  const prNumbers = checkRun.pull_requests.map((pr) => pr.number)

  return {
    passed,
    conclusion: checkRun.conclusion,
    name: checkRun.name,
    sha: checkRun.head_sha,
    prNumbers,
  }
}

export function evaluateCheckSuite(payload: GitHubCheckSuitePayload): CICheckResult {
  const suite = payload.check_suite
  const passed = suite.conclusion === 'success'
  const prNumbers = suite.pull_requests.map((pr) => pr.number)

  return {
    passed,
    conclusion: suite.conclusion,
    name: `check_suite_${suite.id}`,
    sha: suite.head_sha,
    prNumbers,
  }
}

export async function handleCIResult(result: CICheckResult): Promise<void> {
  const eventBus = EventBusService.getInstance()

  if (result.passed) {
    await eventBus.publish('rdlo.gate4.trigger', {
      sha: result.sha,
      checkName: result.name,
      prNumbers: result.prNumbers,
      timestamp: new Date().toISOString(),
    })
    logger.info('CI passed — Gate 4 triggered', { sha: result.sha, name: result.name })
  } else {
    await eventBus.publish('rdlo.healing.trigger', {
      sha: result.sha,
      checkName: result.name,
      conclusion: result.conclusion,
      prNumbers: result.prNumbers,
      timestamp: new Date().toISOString(),
    })
    logger.info('CI failed — Healing triggered', { sha: result.sha, conclusion: result.conclusion })
  }
}

export async function pollCheckRuns(
  owner: string,
  repo: string,
  sha: string
): Promise<CICheckResult[]> {
  const token = getGitHubToken()
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${sha}/check-runs`

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    logger.error('Failed to poll GitHub check runs', { owner, repo, sha, status: response.status })
    return []
  }

  const data = (await response.json()) as {
    check_runs: Array<{
      id: number
      name: string
      status: string
      conclusion: string | null
      head_sha: string
      pull_requests: Array<{ number: number }>
    }>
  }

  return data.check_runs
    .filter((run) => run.status === 'completed')
    .map((run) => ({
      passed: run.conclusion === 'success',
      conclusion: run.conclusion,
      name: run.name,
      sha: run.head_sha,
      prNumbers: run.pull_requests.map((pr) => pr.number),
    }))
}
