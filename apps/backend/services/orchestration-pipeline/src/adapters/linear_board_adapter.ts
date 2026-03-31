import type {
  BoardEpic,
  BoardProject,
  BoardProvider,
  BoardStory,
  EpicSpec,
  StorySpec,
  StoryStatus,
  LinearAdapterConfig,
  LinearIssueState,
  LinearPriority,
  LinearWebhookPayload,
  LINEAR_PRIORITY_THRESHOLDS,
} from '@uaip/types'
import { logger } from '@uaip/utils'
import { randomUUID } from 'node:crypto'

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>
}

interface LinearProjectNode {
  id: string
  name: string
  description: string | null
  state: string
  url: string
  teams: { nodes: Array<{ id: string }> }
  createdAt: string
  updatedAt: string
}

interface LinearIssueNode {
  id: string
  identifier: string
  title: string
  description: string | null
  priority: number
  url: string
  createdAt: string
  updatedAt: string
  state: { id: string; name: string; type: string }
  assignee: { id: string; name: string; email: string } | null
  labels: { nodes: Array<{ id: string; name: string; color: string }> }
  project: { id: string } | null
  cycle: { id: string; number: number } | null
}

interface LinearCycleNode {
  id: string
  name: string | null
  number: number
  startsAt: string
  endsAt: string
  completedAt: string | null
}

const LINEAR_API_URL = 'https://api.linear.app/graphql'

const STATUS_TO_LINEAR_STATE: Record<StoryStatus, string> = {
  'backlog': 'backlog',
  'in-progress': 'started',
  'in-review': 'started',
  'done': 'completed',
  'blocked': 'unstarted',
  'needs-triage': 'backlog',
}

export class LinearBoardAdapter implements BoardProvider {
  private readonly apiKey: string
  private readonly teamId?: string

  constructor(config: LinearAdapterConfig) {
    this.apiKey = config.apiKey
    this.teamId = config.teamId
  }

  async createProject(name: string, config?: Partial<BoardProject>): Promise<BoardProject> {
    const teamIds = this.teamId ? [this.teamId] : await this.getDefaultTeamIds()

    const result = await this.linearRequest<{
      projectCreate: { success: boolean; project: LinearProjectNode }
    }>(`
      mutation($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          success
          project { id name description state url teams { nodes { id } } createdAt updatedAt }
        }
      }
    `, {
      input: {
        name,
        description: config?.description ?? '',
        teamIds,
      },
    })

    const project = result.projectCreate.project
    const now = project.createdAt

    return {
      id: project.id,
      title: project.name,
      description: project.description ?? undefined,
      status: 'backlog',
      createdAt: now,
      updatedAt: now,
      repoUrl: project.url,
      boardConfig: { type: 'linear' },
    }
  }

  async createEpic(projectId: string, spec: EpicSpec): Promise<BoardEpic> {
    const teamId = this.teamId ?? (await this.getDefaultTeamId())

    const result = await this.linearRequest<{
      issueCreate: { success: boolean; issue: LinearIssueNode }
    }>(`
      mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier title description priority url createdAt updatedAt state { id name type } assignee { id name email } labels { nodes { id name color } } project { id } cycle { id number } }
        }
      }
    `, {
      input: {
        title: spec.title,
        description: spec.description ?? '',
        teamId,
        projectId,
        priority: 2,
        labelIds: [],
      },
    })

    const issue = result.issueCreate.issue

    return {
      id: issue.identifier,
      projectId,
      title: issue.title,
      description: issue.description ?? undefined,
      status: 'backlog',
      priority: spec.priority,
      dueDate: spec.dueDate,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    }
  }

  async createStory(epicId: string, spec: StorySpec): Promise<BoardStory> {
    const teamId = this.teamId ?? (await this.getDefaultTeamId())
    const labelIds = await this.resolveLabelIds(teamId, [...(spec.labels ?? []), 'rdlo'])

    const input: Record<string, unknown> = {
      title: spec.title,
      description: spec.description ?? '',
      teamId,
      labelIds,
      estimate: spec.storyPoints,
    }

    if (epicId) {
      input.parentId = await this.resolveIssueId(epicId)
    }

    if (spec.assignee) {
      input.assigneeId = spec.assignee
    }

    const result = await this.linearRequest<{
      issueCreate: { success: boolean; issue: LinearIssueNode }
    }>(`
      mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier title description priority url createdAt updatedAt state { id name type } assignee { id name email } labels { nodes { id name color } } project { id } cycle { id number } }
        }
      }
    `, { input })

    const issue = result.issueCreate.issue

    return {
      id: issue.identifier,
      epicId,
      title: issue.title,
      description: issue.description ?? undefined,
      status: 'backlog',
      assignee: issue.assignee?.name,
      storyPoints: spec.storyPoints,
      labels: issue.labels.nodes.map((l) => l.name),
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    }
  }

  async updateStatus(itemId: string, status: StoryStatus): Promise<void> {
    const issueId = await this.resolveIssueId(itemId)
    const targetType = STATUS_TO_LINEAR_STATE[status]
    const stateId = await this.resolveStateId(issueId, targetType)

    if (!stateId) {
      logger.warn('No matching Linear state found', { itemId, status, targetType })
      return
    }

    await this.linearRequest(`
      mutation($input: IssueUpdateInput!, $id: String!) {
        issueUpdate(id: $id, input: $input) { success }
      }
    `, { id: issueId, input: { stateId } })

    logger.info('Linear issue status updated', { itemId, status, stateId })
  }

  async linkPR(storyId: string, prUrl: string): Promise<void> {
    const issueId = await this.resolveIssueId(storyId)

    await this.linearRequest(`
      mutation($input: AttachmentCreateInput!) {
        attachmentCreate(input: $input) { success }
      }
    `, {
      input: {
        issueId,
        url: prUrl,
        title: `PR: ${prUrl.split('/').pop()}`,
      },
    })

    logger.info('PR linked to Linear issue', { storyId, prUrl })
  }

  async getBacklog(projectId: string): Promise<BoardStory[]> {
    const result = await this.linearRequest<{
      issues: { nodes: LinearIssueNode[] }
    }>(`
      query($filter: IssueFilter) {
        issues(filter: $filter, first: 100) {
          nodes { id identifier title description priority url createdAt updatedAt state { id name type } assignee { id name email } labels { nodes { id name color } } project { id } cycle { id number } }
        }
      }
    `, {
      filter: {
        project: { id: { eq: projectId } },
        state: { type: { nin: ['completed', 'cancelled'] } },
        labels: { name: { eq: 'rdlo' } },
      },
    })

    return result.issues.nodes.map((issue) => ({
      id: issue.identifier,
      epicId: projectId,
      title: issue.title,
      description: issue.description ?? undefined,
      status: this.mapLinearStateToStatus(issue.state),
      assignee: issue.assignee?.name,
      labels: issue.labels.nodes.map((l) => l.name),
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    }))
  }

  // ─── Linear-specific extensions ────────────────────────────────────────

  async createCycle(teamId: string, name: string, startsAt: string, endsAt: string): Promise<LinearCycleNode> {
    const result = await this.linearRequest<{
      cycleCreate: { success: boolean; cycle: LinearCycleNode }
    }>(`
      mutation($input: CycleCreateInput!) {
        cycleCreate(input: $input) {
          success
          cycle { id name number startsAt endsAt completedAt }
        }
      }
    `, { input: { teamId, name, startsAt, endsAt } })

    logger.info('Linear cycle created', { cycleId: result.cycleCreate.cycle.id, name })
    return result.cycleCreate.cycle
  }

  async assignToCycle(issueIdentifier: string, cycleId: string): Promise<void> {
    const issueId = await this.resolveIssueId(issueIdentifier)

    await this.linearRequest(`
      mutation($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) { success }
      }
    `, { id: issueId, input: { cycleId } })

    logger.info('Issue assigned to cycle', { issueIdentifier, cycleId })
  }

  handleWebhook(payload: LinearWebhookPayload): { action: string; type: string; data: Record<string, unknown> } {
    return {
      action: payload.action,
      type: payload.type,
      data: payload.data,
    }
  }

  mapPriorityFromComplexity(complexityScore: number): LinearPriority {
    const thresholds = [
      { complexityScore: 0.9, linearPriority: 1 as LinearPriority },
      { complexityScore: 0.7, linearPriority: 2 as LinearPriority },
      { complexityScore: 0.4, linearPriority: 3 as LinearPriority },
      { complexityScore: 0.0, linearPriority: 4 as LinearPriority },
    ]

    for (const threshold of thresholds) {
      if (complexityScore >= threshold.complexityScore) {
        return threshold.linearPriority
      }
    }
    return 4
  }

  // ─── Private helpers ───────────────────────────────────────────────────

  private mapLinearStateToStatus(state: { type: string }): StoryStatus {
    switch (state.type) {
      case 'completed': return 'done'
      case 'started': return 'in-progress'
      case 'unstarted': return 'backlog'
      case 'backlog': return 'backlog'
      case 'cancelled': return 'done'
      default: return 'backlog'
    }
  }

  private async resolveIssueId(identifier: string): Promise<string> {
    const result = await this.linearRequest<{
      issue: { id: string } | null
    }>(`
      query($id: String!) { issue(id: $id) { id } }
    `, { id: identifier })

    if (!result.issue) {
      throw new Error(`Linear issue not found: ${identifier}`)
    }
    return result.issue.id
  }

  private async resolveStateId(issueId: string, targetType: string): Promise<string | null> {
    const result = await this.linearRequest<{
      issue: { team: { states: { nodes: Array<{ id: string; type: string }> } } } | null
    }>(`
      query($id: String!) {
        issue(id: $id) { team { states { nodes { id type } } } }
      }
    `, { id: issueId })

    const states = result.issue?.team?.states?.nodes ?? []
    const match = states.find((s) => s.type === targetType)
    return match?.id ?? null
  }

  private async resolveLabelIds(teamId: string, labelNames: string[]): Promise<string[]> {
    const result = await this.linearRequest<{
      team: { labels: { nodes: Array<{ id: string; name: string }> } } | null
    }>(`
      query($id: String!) {
        team(id: $id) { labels { nodes { id name } } }
      }
    `, { id: teamId })

    const labels = result.team?.labels?.nodes ?? []
    const nameSet = new Set(labelNames.map((n) => n.toLowerCase()))
    return labels.filter((l) => nameSet.has(l.name.toLowerCase())).map((l) => l.id)
  }

  private async getDefaultTeamId(): Promise<string> {
    const ids = await this.getDefaultTeamIds()
    if (ids.length === 0) {
      throw new Error('No Linear teams found')
    }
    return ids[0]
  }

  private async getDefaultTeamIds(): Promise<string[]> {
    const result = await this.linearRequest<{
      teams: { nodes: Array<{ id: string }> }
    }>(`query { teams { nodes { id } } }`)

    return result.teams.nodes.map((t) => t.id)
  }

  private async linearRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '<unreadable>')
      logger.error('Linear API request failed', {
        status: response.status,
        body: errorBody.slice(0, 500),
      })
      throw new Error(`Linear API failed: ${response.status} ${response.statusText}`)
    }

    const json = (await response.json()) as GraphQLResponse<T>

    if (json.errors && json.errors.length > 0) {
      const messages = json.errors.map((e) => e.message).join('; ')
      logger.error('Linear GraphQL errors', { errors: json.errors })
      throw new Error(`Linear GraphQL error: ${messages}`)
    }

    if (!json.data) {
      throw new Error('Linear API returned no data')
    }

    return json.data
  }
}
