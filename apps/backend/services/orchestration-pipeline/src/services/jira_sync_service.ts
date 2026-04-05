import { logger, ExternalServiceError, ValidationError } from '@uaip/utils'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type JiraSyncPayload = { issueKey?: string; status?: StoryStatus };
function isJiraSyncPayload(v: unknown): v is JiraSyncPayload {
  return isRecord(v);
}
import { EventBusService } from '@uaip/infra'
import type {
  JiraWebhookPayload,
  JiraWebhookChangelog,
  StoryStatus,
} from '@uaip/types'

const JIRA_TO_STORY_STATUS: Record<string, StoryStatus> = {
  'to do': 'backlog',
  'in progress': 'in-progress',
  'in review': 'in-review',
  'done': 'done',
}

const STORY_TO_JIRA_STATUS: Record<StoryStatus, string> = {
  'backlog': 'To Do',
  'in-progress': 'In Progress',
  'in-review': 'In Progress',
  'done': 'Done',
  'blocked': 'To Do',
  'needs-triage': 'To Do',
}

interface JiraSyncConfig {
  baseUrl: string
  email: string
  apiToken: string
}

function getSyncConfig(): JiraSyncConfig {
  const baseUrl = process.env.JIRA_BASE_URL
  const email = process.env.JIRA_EMAIL
  const apiToken = process.env.JIRA_API_TOKEN

  if (!baseUrl || !email || !apiToken) {
    throw new ValidationError('JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN are required')
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), email, apiToken }
}

function buildAuthHeader(config: JiraSyncConfig): string {
  return `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`
}

export function extractStatusChange(changelog: JiraWebhookChangelog): { from: string; to: string } | null {
  const statusItem = changelog.items.find((item) => item.field === 'status')
  if (!statusItem || !statusItem.fromString || !statusItem.toString) {
    return null
  }
  return { from: statusItem.fromString, to: statusItem.toString }
}

export function mapJiraStatusToStory(jiraStatus: string): StoryStatus {
  return JIRA_TO_STORY_STATUS[jiraStatus.toLowerCase()] ?? 'backlog'
}

export async function onJiraStatusChange(payload: JiraWebhookPayload): Promise<void> {
  if (!payload.changelog || !payload.issue) {
    return
  }

  const statusChange = extractStatusChange(payload.changelog)
  if (!statusChange) {
    return
  }

  const storyStatus = mapJiraStatusToStory(statusChange.to)
  const issueKey = payload.issue.key

  try {
    const eventBus = EventBusService.getInstance()
    await eventBus.publish('rdlo.board.status.sync', {
      source: 'jira',
      issueKey,
      fromStatus: statusChange.from,
      toStatus: storyStatus,
      timestamp: new Date().toISOString(),
    })

    logger.info('Jira status change synced to internal board', {
      issueKey,
      from: statusChange.from,
      to: storyStatus,
    })
  } catch (error) {
    logger.error('Failed to sync Jira status change', {
      error: error instanceof Error ? error.message : String(error),
      issueKey,
    })
  }
}

export async function syncStatusToJira(issueKey: string, status: StoryStatus): Promise<void> {
  const config = getSyncConfig()
  const authHeader = buildAuthHeader(config)
  const targetStatusName = STORY_TO_JIRA_STATUS[status]

  const transitionsResponse = await fetch(
    `${config.baseUrl}/rest/api/3/issue/${issueKey}/transitions`,
    {
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader,
      },
    }
  )

  if (!transitionsResponse.ok) {
    throw new ExternalServiceError(`Failed to get transitions for ${issueKey}: ${transitionsResponse.status}`)
  }

  const transitionsData = await transitionsResponse.json() as {
    transitions: Array<{ id: string; name: string }>
  }

  const transition = transitionsData.transitions.find((t) => t.name === targetStatusName)
  if (!transition) {
    logger.warn('No matching Jira transition found', { issueKey, status, targetStatusName })
    return
  }

  const response = await fetch(
    `${config.baseUrl}/rest/api/3/issue/${issueKey}/transitions`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({ transition: { id: transition.id } }),
    }
  )

  if (!response.ok) {
    throw new ExternalServiceError(`Failed to transition ${issueKey}: ${response.status}`)
  }

  logger.info('RDLO status synced to Jira', { issueKey, status, transitionId: transition.id })
}

export async function syncArtifactToJira(
  issueKey: string,
  artifactUrl: string,
  artifactName: string
): Promise<void> {
  const config = getSyncConfig()
  const authHeader = buildAuthHeader(config)

  const artifactResponse = await fetch(artifactUrl)
  if (!artifactResponse.ok) {
    throw new ExternalServiceError(`Failed to fetch artifact: ${artifactResponse.status}`)
  }
  const artifactBlob = await artifactResponse.blob()

  const formData = new FormData()
  formData.append('file', artifactBlob, artifactName)

  const response = await fetch(
    `${config.baseUrl}/rest/api/3/issue/${issueKey}/attachments`,
    {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'X-Atlassian-Token': 'no-check',
      },
      body: formData,
    }
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '<unreadable>')
    throw new ExternalServiceError(`Failed to attach artifact to ${issueKey}: ${response.status} ${errorBody.slice(0, 300)}`)
  }

  logger.info('Artifact synced to Jira', { issueKey, artifactName })
}

export async function addRemoteLink(
  issueKey: string,
  url: string,
  title: string
): Promise<void> {
  const config = getSyncConfig()
  const authHeader = buildAuthHeader(config)

  const response = await fetch(
    `${config.baseUrl}/rest/api/3/issue/${issueKey}/remotelink`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        object: { url, title },
      }),
    }
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '<unreadable>')
    throw new ExternalServiceError(`Failed to add remote link to ${issueKey}: ${response.status} ${errorBody.slice(0, 300)}`)
  }

  logger.info('Remote link added to Jira issue', { issueKey, url, title })
}

export function initJiraSyncEventListeners(): void {
  try {
    const eventBus = EventBusService.getInstance()

    eventBus.subscribe('rdlo.story.status.changed', async (data: unknown) => {
      if (!isJiraSyncPayload(data)) return;
      if (data.issueKey && data.status) {
        await syncStatusToJira(data.issueKey, data.status).catch((error) => {
          logger.error('Bidirectional Jira sync failed', {
            error: error instanceof Error ? error.message : String(error),
            issueKey: data.issueKey,
          })
        })
      }
    })

    logger.info('Jira sync event listeners initialized')
  } catch (error) {
    logger.warn('Failed to initialize Jira sync event listeners', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
