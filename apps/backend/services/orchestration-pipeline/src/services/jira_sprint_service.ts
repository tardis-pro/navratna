import { logger, ExternalServiceError, NotFoundError, ValidationError } from '@uaip/utils'
import type { JiraSprintConfig, JiraPriorityMapping } from '@uaip/types'

interface JiraSprintServiceConfig {
  baseUrl: string
  email: string
  apiToken: string
}

interface JiraSprintResponse {
  id: number
  name: string
  state: string
  startDate: string
  endDate: string
  goal?: string
}

interface VelocityReport {
  sprintId: number
  sprintName: string
  completedStoryPoints: number
  totalStoryPoints: number
  completionRate: number
  issuesCompleted: number
  issuesTotal: number
}

const COMPLEXITY_TO_JIRA_PRIORITY: JiraPriorityMapping[] = [
  { score: 0.9, jiraPriority: 'Highest' },
  { score: 0.7, jiraPriority: 'High' },
  { score: 0.4, jiraPriority: 'Medium' },
  { score: 0.2, jiraPriority: 'Low' },
  { score: 0.0, jiraPriority: 'Lowest' },
]

function getConfig(): JiraSprintServiceConfig {
  const baseUrl = process.env.JIRA_BASE_URL
  const email = process.env.JIRA_EMAIL
  const apiToken = process.env.JIRA_API_TOKEN

  if (!baseUrl || !email || !apiToken) {
    throw new ValidationError('JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN are required')
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), email, apiToken }
}

function buildAuthHeader(config: JiraSprintServiceConfig): string {
  return `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`
}

async function agileRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const config = getConfig()
  const url = `${config.baseUrl}/rest/agile/1.0${path}`
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Authorization': buildAuthHeader(config),
  }

  const init: RequestInit = { method, headers }
  if (body && method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  const response = await fetch(url, init)

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '<unreadable>')
    logger.error('Jira Agile API request failed', { url, method, status: response.status, body: errorBody.slice(0, 500) })
    throw new ExternalServiceError(`Jira Agile API ${method} ${path} failed: ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function createSprint(config: JiraSprintConfig): Promise<JiraSprintResponse> {
  const sprint = await agileRequest<JiraSprintResponse>('/sprint', 'POST', {
    name: config.name,
    originBoardId: config.boardId,
    startDate: config.startDate,
    endDate: config.endDate,
    goal: config.goal,
  })

  logger.info('Jira sprint created', { sprintId: sprint.id, name: sprint.name })
  return sprint
}

export async function startSprint(sprintId: number): Promise<void> {
  await agileRequest(`/sprint/${sprintId}`, 'POST', {
    state: 'active',
    startDate: new Date().toISOString(),
  })

  logger.info('Jira sprint started', { sprintId })
}

export async function completeSprint(sprintId: number): Promise<void> {
  await agileRequest(`/sprint/${sprintId}`, 'POST', {
    state: 'closed',
    completeDate: new Date().toISOString(),
  })

  logger.info('Jira sprint completed', { sprintId })
}

export async function assignToSprint(sprintId: number, issueKeys: string[]): Promise<void> {
  const config = getConfig()
  const authHeader = buildAuthHeader(config)

  const issueIds: string[] = []
  for (const key of issueKeys) {
    const response = await fetch(`${config.baseUrl}/rest/api/3/issue/${key}?fields=id`, {
      headers: { 'Accept': 'application/json', 'Authorization': authHeader },
    })
    if (response.ok) {
      const rawData = await response.json()
      const data = typeof rawData === 'object' && rawData !== null && 'id' in rawData ? rawData as { id: string } : null
      if (!data) continue
      issueIds.push(data.id)
    }
  }

  if (issueIds.length > 0) {
    await agileRequest(`/sprint/${sprintId}/issue`, 'POST', { issues: issueIds })
  }

  logger.info('Issues assigned to sprint', { sprintId, issueCount: issueIds.length })
}

export function mapComplexityToPriority(score: number): JiraPriorityMapping['jiraPriority'] {
  for (const mapping of COMPLEXITY_TO_JIRA_PRIORITY) {
    if (score >= mapping.score) {
      return mapping.jiraPriority
    }
  }
  return 'Lowest'
}

export async function generateVelocityReport(sprintId: number): Promise<VelocityReport> {
  const sprint = await agileRequest<JiraSprintResponse>(`/sprint/${sprintId}`, 'GET')

  const boardsResponse = await agileRequest<{
    values: Array<{ id: number }>
  }>('/board', 'GET')

  const boardId = boardsResponse.values[0]?.id
  if (!boardId) {
    throw new NotFoundError('No board found for velocity report')
  }

  const issuesResponse = await agileRequest<{
    contents: {
      completedIssues: Array<{ estimateStatistic?: { statFieldValue?: { value?: number } } }>
      issuesNotCompletedInCurrentSprint: Array<{ estimateStatistic?: { statFieldValue?: { value?: number } } }>
    }
  }>(`/board/${boardId}/sprint/${sprintId}/report`, 'GET')

  const completedIssues = issuesResponse.contents?.completedIssues ?? []
  const incompleteIssues = issuesResponse.contents?.issuesNotCompletedInCurrentSprint ?? []

  const completedPoints = completedIssues.reduce(
    (sum, issue) => sum + (issue.estimateStatistic?.statFieldValue?.value ?? 0),
    0
  )
  const totalPoints = completedPoints + incompleteIssues.reduce(
    (sum, issue) => sum + (issue.estimateStatistic?.statFieldValue?.value ?? 0),
    0
  )

  const report: VelocityReport = {
    sprintId,
    sprintName: sprint.name,
    completedStoryPoints: completedPoints,
    totalStoryPoints: totalPoints,
    completionRate: totalPoints > 0 ? completedPoints / totalPoints : 0,
    issuesCompleted: completedIssues.length,
    issuesTotal: completedIssues.length + incompleteIssues.length,
  }

  logger.info('Velocity report generated', { sprintId, completedPoints, totalPoints })
  return report
}
