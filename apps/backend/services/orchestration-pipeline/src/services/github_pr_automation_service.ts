import { logger, ExternalServiceError, ValidationError } from '@uaip/utils'
import { EventBusService } from '@uaip/infra'
import type {
  GitHubBranchProtectionConfig,
  GitHubPRDescription,
  StalePRDetection,
} from '@uaip/types'

const GITHUB_API_BASE = 'https://api.github.com'

function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new ValidationError('GITHUB_TOKEN environment variable is required')
  }
  return token
}

export function buildStructuredPRBody(config: GitHubPRDescription): string {
  const sections: string[] = []

  sections.push('## Story Context')
  sections.push(config.storyContext)
  sections.push('')

  if (config.acceptanceCriteria.length > 0) {
    sections.push('## Acceptance Criteria')
    for (const criterion of config.acceptanceCriteria) {
      sections.push(`- [ ] ${criterion}`)
    }
    sections.push('')
  }

  if (config.affectedModules.length > 0) {
    sections.push('## Affected Modules')
    for (const mod of config.affectedModules) {
      sections.push(`- \`${mod}\``)
    }
    sections.push('')
  }

  if (config.testResults) {
    sections.push('## Test Results')
    sections.push(config.testResults)
    sections.push('')
  }

  if (config.framerPrototypeUrl) {
    sections.push('## Framer Prototype')
    sections.push(`[View Prototype](${config.framerPrototypeUrl})`)
    sections.push('')
  }

  return sections.join('\n')
}

export async function createStructuredPR(
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  config: GitHubPRDescription
): Promise<{ number: number; html_url: string }> {
  const token = getGitHubToken()
  const body = buildStructuredPRBody(config)

  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, head, base }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '<unreadable>')
    throw new ExternalServiceError(`Failed to create PR: ${response.status} ${errorBody.slice(0, 300)}`)
  }

  const pr = await response.json() as { number: number; html_url: string }
  logger.info('Structured PR created', { owner, repo, prNumber: pr.number })
  return pr
}

export async function requestReviewers(
  owner: string,
  repo: string,
  prNumber: number,
  reviewers: string[]
): Promise<void> {
  const token = getGitHubToken()

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reviewers }),
    }
  )

  if (!response.ok) {
    logger.error('Failed to request reviewers', { owner, repo, prNumber, status: response.status })
  }

  logger.info('Reviewers requested', { owner, repo, prNumber, reviewers })
}

export async function configureBranchProtection(
  owner: string,
  repo: string,
  branch: string,
  config: GitHubBranchProtectionConfig
): Promise<void> {
  const token = getGitHubToken()

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${branch}/protection`,
    {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        required_status_checks: config.requireCiPass
          ? { strict: config.requireUpToDate, contexts: [] }
          : null,
        enforce_admins: true,
        required_pull_request_reviews: {
          required_approving_review_count: config.requiredReviewers,
          dismiss_stale_reviews: config.dismissStaleReviews,
        },
        restrictions: null,
        allow_force_pushes: !config.noForcePush,
        allow_deletions: false,
      }),
    }
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '<unreadable>')
    throw new ExternalServiceError(`Failed to configure branch protection: ${response.status} ${errorBody.slice(0, 300)}`)
  }

  logger.info('Branch protection configured', { owner, repo, branch })
}

export async function detectStalePRs(
  owner: string,
  repo: string,
  thresholdHours = 48
): Promise<StalePRDetection[]> {
  const token = getGitHubToken()
  const cutoffDate = new Date(Date.now() - thresholdHours * 60 * 60 * 1000)

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=asc&per_page=100`,
    {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )

  if (!response.ok) {
    logger.error('Failed to fetch open PRs', { owner, repo, status: response.status })
    return []
  }

  const prs = await response.json() as Array<{
    number: number
    html_url: string
    title: string
    created_at: string
    updated_at: string
    user: { login: string }
    requested_reviewers: Array<{ login: string }>
  }>

  const stalePRs: StalePRDetection[] = prs
    .filter((pr) => new Date(pr.updated_at) < cutoffDate)
    .map((pr) => {
      const hoursStale = Math.round((Date.now() - new Date(pr.updated_at).getTime()) / (1000 * 60 * 60))
      return {
        prNumber: pr.number,
        prUrl: pr.html_url,
        title: pr.title,
        openedAt: pr.created_at,
        lastActivityAt: pr.updated_at,
        hoursStale,
        author: pr.user.login,
        reviewers: pr.requested_reviewers.map((r) => r.login),
      }
    })

  if (stalePRs.length > 0) {
    try {
      const eventBus = EventBusService.getInstance()
      await eventBus.publish('telescope.notification.stale-pr', {
        stalePRs,
        owner,
        repo,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      logger.warn('Failed to publish stale PR notification', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger.info('Stale PR detection completed', { owner, repo, stalePRCount: stalePRs.length })
  return stalePRs
}
