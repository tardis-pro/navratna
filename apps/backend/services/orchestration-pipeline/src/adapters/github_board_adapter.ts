import type {
  BoardEpic,
  BoardProject,
  BoardProvider,
  BoardStory,
  EpicSpec,
  StorySpec,
  StoryStatus,
} from '@uaip/types'
import { logger, ExternalServiceError } from '@uaip/utils'
import { randomUUID } from 'node:crypto'

interface GitHubAdapterConfig {
  owner: string
  repo: string
  token: string
}

interface GitHubApiIssue {
  id: number
  number: number
  title: string
  body: string | null
  state: string
  html_url: string
  created_at: string
  updated_at: string
  labels: Array<{ name: string }>
  milestone: { number: number; title: string } | null
  assignee: { login: string } | null
}

interface GitHubApiMilestone {
  id: number
  number: number
  title: string
  description: string | null
  state: string
  created_at: string
  updated_at: string
}

const STATUS_TO_LABEL: Record<StoryStatus, string> = {
  'backlog': 'backlog',
  'in-progress': 'in-progress',
  'in-review': 'in-review',
  'done': 'done',
  'blocked': 'blocked',
  'needs-triage': 'needs-triage',
}

const GITHUB_API_BASE = 'https://api.github.com'

export class GitHubBoardAdapter implements BoardProvider {
  private readonly owner: string
  private readonly repo: string
  private readonly token: string

  constructor(config: GitHubAdapterConfig) {
    this.owner = config.owner
    this.repo = config.repo
    this.token = config.token
  }

  async createProject(name: string, config?: Partial<BoardProject>): Promise<BoardProject> {
    const now = new Date().toISOString()
    return {
      id: randomUUID(),
      title: name,
      description: config?.description,
      status: 'backlog',
      createdAt: now,
      updatedAt: now,
      repoUrl: `https://github.com/${this.owner}/${this.repo}`,
      boardConfig: { type: 'github' },
    }
  }

  async createEpic(projectId: string, spec: EpicSpec): Promise<BoardEpic> {
    const milestone = await this.githubRequest<GitHubApiMilestone>(
      `/repos/${this.owner}/${this.repo}/milestones`,
      'POST',
      {
        title: spec.title,
        description: spec.description ?? '',
        due_on: spec.dueDate ?? undefined,
      }
    )

    if (!milestone) {
      throw new ExternalServiceError('GitHub milestones POST returned no data')
    }

    return {
      id: String(milestone.number),
      projectId,
      title: milestone.title,
      description: milestone.description ?? undefined,
      status: 'backlog',
      priority: spec.priority,
      dueDate: spec.dueDate,
      createdAt: milestone.created_at,
      updatedAt: milestone.updated_at,
    }
  }

  async createStory(epicId: string, spec: StorySpec): Promise<BoardStory> {
    const milestoneNumber = parseInt(epicId, 10) || undefined
    const labels = [...(spec.labels ?? []), 'rdlo']

    const issue = await this.githubRequest<GitHubApiIssue>(
      `/repos/${this.owner}/${this.repo}/issues`,
      'POST',
      {
        title: spec.title,
        body: spec.description ?? '',
        milestone: milestoneNumber,
        labels,
        assignees: spec.assignee ? [spec.assignee] : undefined,
      }
    )

    if (!issue) {
      throw new ExternalServiceError('GitHub issues POST returned no data')
    }

    return {
      id: String(issue.number),
      epicId,
      title: issue.title,
      description: issue.body ?? undefined,
      status: 'backlog',
      assignee: issue.assignee?.login,
      storyPoints: spec.storyPoints,
      labels: issue.labels.map((l) => l.name),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    }
  }

  async updateStatus(itemId: string, status: StoryStatus): Promise<void> {
    const issueNumber = parseInt(itemId, 10)
    const state = status === 'done' ? 'closed' : 'open'
    const label = STATUS_TO_LABEL[status]

    await this.githubRequest(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}`,
      'PATCH',
      { state, labels: [label, 'rdlo'] }
    )

    logger.info('GitHub issue status updated', { issueNumber, status, state })
  }

  async linkPR(storyId: string, prUrl: string): Promise<void> {
    const issueNumber = parseInt(storyId, 10)

    await this.githubRequest(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`,
      'POST',
      { body: `🔗 PR linked: ${prUrl}` }
    )

    logger.info('PR linked to GitHub issue', { issueNumber, prUrl })
  }

  async getBacklog(projectId: string): Promise<BoardStory[]> {
    const issues = await this.githubRequest<GitHubApiIssue[]>(
      `/repos/${this.owner}/${this.repo}/issues?state=open&labels=rdlo&per_page=100`,
      'GET'
    )

    return (issues ?? []).map((issue) => ({
      id: String(issue.number),
      epicId: issue.milestone ? String(issue.milestone.number) : projectId,
      title: issue.title,
      description: issue.body ?? undefined,
      status: this.issueToStatus(issue),
      assignee: issue.assignee?.login,
      labels: issue.labels.map((l) => l.name),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    }))
  }

  private issueToStatus(issue: GitHubApiIssue): StoryStatus {
    if (issue.state === 'closed') return 'done'
    const labelNames = new Set(issue.labels.map((l) => l.name))
    if (labelNames.has('in-progress')) return 'in-progress'
    if (labelNames.has('in-review')) return 'in-review'
    if (labelNames.has('blocked')) return 'blocked'
    if (labelNames.has('needs-triage')) return 'needs-triage'
    return 'backlog'
  }

  private async githubRequest<T>(path: string, method: string, body?: unknown): Promise<T | undefined> {
    const url = path.startsWith('http') ? path : `${GITHUB_API_BASE}${path}`

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    }

    const init: RequestInit = { method, headers }
    if (body && method !== 'GET') {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }

    const response = await fetch(url, init)

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '<unreadable>')
      logger.error('GitHub API request failed', {
        url,
        method,
        status: response.status,
        body: errorBody.slice(0, 500),
      })
      throw new ExternalServiceError(`GitHub API ${method} ${path} failed: ${response.status} ${response.statusText}`)
    }

    if (response.status === 204) {
      return undefined
    }

    const data: T = await response.json()
    return data
  }
}
