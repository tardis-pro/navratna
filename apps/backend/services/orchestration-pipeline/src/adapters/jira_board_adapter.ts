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

interface JiraAdapterConfig {
  baseUrl: string
  email: string
  apiToken: string
  projectKey: string
}

interface JiraIssue {
  id: string
  key: string
  fields: {
    summary: string
    description: unknown
    status: { name: string }
    issuetype: { name: string }
    assignee: { displayName: string } | null
    created: string
    updated: string
    labels: string[]
  }
}

interface JiraCreateResponse {
  id: string
  key: string
  self: string
}

const STATUS_MAP: Record<StoryStatus, string> = {
  'backlog': 'To Do',
  'in-progress': 'In Progress',
  'in-review': 'In Progress',
  'done': 'Done',
  'blocked': 'To Do',
  'needs-triage': 'To Do',
}

export class JiraBoardAdapter implements BoardProvider {
  private readonly baseUrl: string
  private readonly authHeader: string
  private readonly projectKey: string

  constructor(config: JiraAdapterConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`
    this.projectKey = config.projectKey
  }

  async createProject(name: string, config?: Partial<BoardProject>): Promise<BoardProject> {
    const now = new Date().toISOString()
    return {
      id: this.projectKey,
      title: name,
      description: config?.description,
      status: 'backlog',
      createdAt: now,
      updatedAt: now,
      boardConfig: { type: 'jira' },
    }
  }

  async createEpic(_projectId: string, spec: EpicSpec): Promise<BoardEpic> {
    const created = await this.jiraRequest<JiraCreateResponse>(
      '/rest/api/3/issue',
      'POST',
      {
        fields: {
          project: { key: this.projectKey },
          issuetype: { name: 'Workstream' },
          summary: spec.title,
          description: this.toAdfDoc(spec.description ?? ''),
          labels: ['rdlo'],
        },
      }
    )

    if (!created) {
      throw new ExternalServiceError('Jira issue POST returned no data')
    }

    return {
      id: created.key,
      projectId: this.projectKey,
      title: spec.title,
      description: spec.description,
      status: 'backlog',
      priority: spec.priority,
      dueDate: spec.dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  async createStory(epicId: string, spec: StorySpec): Promise<BoardStory> {
    const fields: Record<string, unknown> = {
      project: { key: this.projectKey },
      issuetype: { name: 'Task' },
      summary: spec.title,
      description: this.toAdfDoc(spec.description ?? ''),
      labels: [...(spec.labels ?? []), 'rdlo'],
    }

    if (epicId && epicId !== this.projectKey) {
      fields.parent = { key: epicId }
    }

    const created = await this.jiraRequest<JiraCreateResponse>(
      '/rest/api/3/issue',
      'POST',
      { fields }
    )

    if (!created) {
      throw new ExternalServiceError('Jira issue POST returned no data')
    }

    return {
      id: created.key,
      epicId,
      title: spec.title,
      description: spec.description,
      status: 'backlog',
      assignee: spec.assignee,
      storyPoints: spec.storyPoints,
      labels: spec.labels,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  async updateStatus(itemId: string, status: StoryStatus): Promise<void> {
    const transitions = await this.jiraRequest<{ transitions: Array<{ id: string; name: string }> }>(
      `/rest/api/3/issue/${itemId}/transitions`,
      'GET'
    )

    const targetName = STATUS_MAP[status]
    const transition = transitions?.transitions.find((t) => t.name === targetName)
    if (!transition) {
      logger.warn('No matching Jira transition found', { itemId, status, targetName })
      return
    }

    await this.jiraRequest(
      `/rest/api/3/issue/${itemId}/transitions`,
      'POST',
      { transition: { id: transition.id } }
    )

    logger.info('Jira issue status updated', { itemId, status, transitionId: transition.id })
  }

  async linkPR(storyId: string, prUrl: string): Promise<void> {
    await this.jiraRequest(
      `/rest/api/3/issue/${storyId}/comment`,
      'POST',
      {
        body: this.toAdfDoc(`PR linked: ${prUrl}`),
      }
    )

    logger.info('PR linked to Jira issue', { storyId, prUrl })
  }

  async getBacklog(projectId: string): Promise<BoardStory[]> {
    const result = await this.jiraRequest<{ issues: JiraIssue[] }>(
      '/rest/api/3/search/jql',
      'POST',
      {
        jql: `project=${projectId} AND labels=rdlo AND status != Done ORDER BY created DESC`,
        maxResults: 100,
        fields: ['summary', 'status', 'issuetype', 'assignee', 'created', 'updated', 'labels'],
      }
    )

    return (result?.issues ?? []).map((issue) => ({
      id: issue.key,
      epicId: projectId,
      title: issue.fields.summary,
      status: this.jiraStatusToStory(issue.fields.status.name),
      assignee: issue.fields.assignee?.displayName,
      labels: issue.fields.labels,
      createdAt: issue.fields.created,
      updatedAt: issue.fields.updated,
    }))
  }

  private jiraStatusToStory(jiraStatus: string): StoryStatus {
    const lower = jiraStatus.toLowerCase()
    if (lower === 'done') return 'done'
    if (lower === 'in progress') return 'in-progress'
    return 'backlog'
  }

  private toAdfDoc(text: string): Record<string, unknown> {
    return {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    }
  }

  private async jiraRequest<T>(path: string, method: string, body?: unknown): Promise<T | undefined> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': this.authHeader,
    }

    const init: RequestInit = { method, headers }
    if (body && method !== 'GET') {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }

    const response = await fetch(url, init)

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '<unreadable>')
      logger.error('Jira API request failed', {
        url,
        method,
        status: response.status,
        body: errorBody.slice(0, 500),
      })
      throw new ExternalServiceError(`Jira API ${method} ${path} failed: ${response.status} ${response.statusText}`)
    }

    if (response.status === 204) {
      return undefined
    }

    const data: T = await response.json()
    return data
  }
}
