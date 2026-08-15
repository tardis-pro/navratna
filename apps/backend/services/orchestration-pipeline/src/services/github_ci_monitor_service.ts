import { logger, ValidationError } from '@uaip/utils'
import type {
  GitHubCheckRunPayload,
  GitHubCheckSuitePayload,
} from '@uaip/types'

const GITHUB_API_BASE = 'https://api.github.com'

export interface CICheckResult {
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

/**
 * Records the outcome of a CI check.
 *
 * The pass/fail classification above is genuine, and this function used to fork
 * on it correctly — publishing `rdlo.gate4.trigger` on success and
 * `rdlo.healing.trigger` on failure, then logging "Gate 4 triggered" / "Healing
 * triggered". Neither topic has a subscriber anywhere in the codebase, so both
 * branches published into the void while the logs described work being handed
 * off. Nothing was triggered.
 *
 * The publishes are removed. Consumers that want CI outcomes should subscribe to
 * `github.ci.check` / `github.ci.suite`, which routeGitHubWebhookEvent publishes
 * from the verified webhook and which a workflow definition can now bind to with
 * a trigger of kind 'event'. That is a real subscription path; these two were
 * not.
 */
export async function handleCIResult(result: CICheckResult): Promise<void> {
  if (result.passed) {
    logger.info('CI passed', {
      sha: result.sha,
      name: result.name,
      prNumbers: result.prNumbers,
    })
  } else {
    logger.warn('CI failed', {
      sha: result.sha,
      name: result.name,
      conclusion: result.conclusion,
      prNumbers: result.prNumbers,
    })
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

  type CheckRunsResponse = {
    check_runs: Array<{
      id: number
      name: string
      status: string
      conclusion: string | null
      head_sha: string
      pull_requests: Array<{ number: number }>
    }>
  }
  const data: CheckRunsResponse = await response.json()

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
