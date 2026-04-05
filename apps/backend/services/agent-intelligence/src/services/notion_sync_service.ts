import { logger, ExternalServiceError, ValidationError } from '@uaip/utils'
import { EventBusService } from '@uaip/infra'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isPlainTextItem(v: unknown): v is { plain_text: string } {
  return isRecord(v) && typeof v['plain_text'] === 'string';
}
import type {
  NotionSyncConfig,
  NotionSyncResult,
  NotionSyncDirection,
  NotionSyncTarget,
  NotionBlockContent,
} from '@uaip/types'

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

function getNotionToken(): string {
  const token = process.env.NOTION_INTEGRATION_TOKEN
  if (!token) {
    throw new ValidationError('NOTION_INTEGRATION_TOKEN environment variable is required')
  }
  return token
}

async function notionRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const token = getNotionToken()
  const url = `${NOTION_API_BASE}${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Accept': 'application/json',
  }

  const init: RequestInit = { method, headers }
  if (body && method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  const response = await fetch(url, init)

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '<unreadable>')
    logger.error('Notion API request failed', { url, method, status: response.status, body: errorBody.slice(0, 500) })
    throw new ExternalServiceError(`Notion API ${method} ${path} failed: ${response.status}`)
  }

  if (response.status === 204) {
    return undefined;
  }

  const json: unknown = await response.json();
  // @ts-expect-error — generic fetch wrapper: runtime JSON shape matches T as specified by caller
  return json;
}

function markdownToNotionBlocks(markdown: string): Array<Record<string, unknown>> {
  const lines = markdown.split('\n')
  const blocks: Array<Record<string, unknown>> = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const richText = [{ type: 'text', text: { content: trimmed.replace(/^#+\s|^[-*]\s|^\d+\.\s/, '') } }]

    if (trimmed.startsWith('### ')) {
      blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: richText } })
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: richText } })
    } else if (trimmed.startsWith('# ')) {
      blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: richText } })
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText } })
    } else if (/^\d+\.\s/.test(trimmed)) {
      blocks.push({ object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: richText } })
    } else if (trimmed === '---') {
      blocks.push({ object: 'block', type: 'divider', divider: {} })
    } else {
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: trimmed } }] } })
    }
  }

  return blocks
}

export async function syncRunbookToNotion(
  _repoId: string,
  runbookContent: string,
  syncConfig: NotionSyncConfig
): Promise<NotionSyncResult> {
  const syncId = `sync-${Date.now()}`
  const startedAt = new Date().toISOString()
  const errors: string[] = []
  let itemsSynced = 0

  try {
    const blocks = markdownToNotionBlocks(runbookContent)
    const pageId = syncConfig.notionPageId

    if (!pageId) {
      throw new ValidationError('notionPageId is required for runbook sync')
    }

    // Notion max 100 blocks per append
    const BATCH_SIZE = 100
    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
      const batch = blocks.slice(i, i + BATCH_SIZE)
      await notionRequest(`/blocks/${pageId}/children`, 'PATCH', { children: batch })
      itemsSynced += batch.length
    }

    logger.info('Runbook synced to Notion', { pageId, itemsSynced })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(message)
    logger.error('Runbook sync to Notion failed', { error: message })
  }

  const result: NotionSyncResult = {
    syncId,
    syncTarget: syncConfig.syncTarget,
    direction: syncConfig.syncDirection,
    itemsSynced,
    errors,
    startedAt,
    completedAt: new Date().toISOString(),
    status: errors.length === 0 ? 'success' : itemsSynced > 0 ? 'partial' : 'failed',
  }

  await publishSyncEvent(result)
  return result
}

export async function syncArtifactToNotion(
  artifactId: string,
  artifactContent: string,
  artifactType: string,
  syncConfig: NotionSyncConfig
): Promise<NotionSyncResult> {
  const syncId = `sync-artifact-${Date.now()}`
  const startedAt = new Date().toISOString()
  const errors: string[] = []
  let itemsSynced = 0

  try {
    const parentId = syncConfig.notionPageId ?? syncConfig.notionDatabaseId
    if (!parentId) {
      throw new ValidationError('notionPageId or notionDatabaseId is required for artifact sync')
    }

    const blocks = markdownToNotionBlocks(artifactContent)

    await notionRequest('/pages', 'POST', {
      parent: syncConfig.notionDatabaseId
        ? { database_id: syncConfig.notionDatabaseId }
        : { page_id: parentId },
      properties: {
        title: { title: [{ text: { content: `[${artifactType}] ${artifactId}` } }] },
      },
      children: blocks.slice(0, 100),
    })

    itemsSynced = 1
    logger.info('Artifact synced to Notion', { artifactId, artifactType })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(message)
    logger.error('Artifact sync to Notion failed', { error: message, artifactId })
  }

  const result: NotionSyncResult = {
    syncId,
    syncTarget: syncConfig.syncTarget,
    direction: syncConfig.syncDirection,
    itemsSynced,
    errors,
    startedAt,
    completedAt: new Date().toISOString(),
    status: errors.length === 0 ? 'success' : 'failed',
  }

  await publishSyncEvent(result)
  return result
}

export async function importFromNotion(
  notionPageId: string,
  _targetRepoId: string
): Promise<{ content: string; title: string }> {
  const page = await notionRequest<Record<string, unknown>>(`/pages/${notionPageId}`, 'GET')
  const properties = isRecord(page.properties) ? page.properties : undefined;
  const rawTitleProp = properties?.['title'] ?? properties?.['Name'];
  const titleProp = isRecord(rawTitleProp) ? rawTitleProp : undefined;
  const rawTitleArray = titleProp?.['title'];
  const titleArray = Array.isArray(rawTitleArray)
    ? rawTitleArray.filter(isPlainTextItem)
    : undefined;
  const title = titleArray?.[0]?.plain_text ?? 'Imported Page'

  const blocksResponse = await notionRequest<{
    results: Array<Record<string, unknown>>
  }>(`/blocks/${notionPageId}/children?page_size=100`, 'GET')

  const lines: string[] = []
  for (const block of blocksResponse.results) {
    const blockType = typeof block.type === 'string' ? block.type : '';
    const rawBlockData = block[blockType];
    const blockData = isRecord(rawBlockData) ? rawBlockData : undefined;
    const rawRichText = blockData?.['rich_text'];
    const richText = Array.isArray(rawRichText)
      ? rawRichText.filter(isPlainTextItem)
      : undefined;
    const text = richText?.map((rt) => rt.plain_text).join('') ?? ''

    switch (blockType) {
      case 'heading_1': lines.push(`# ${text}`); break
      case 'heading_2': lines.push(`## ${text}`); break
      case 'heading_3': lines.push(`### ${text}`); break
      case 'bulleted_list_item': lines.push(`- ${text}`); break
      case 'numbered_list_item': lines.push(`1. ${text}`); break
      case 'divider': lines.push('---'); break
      default: lines.push(text); break
    }
  }

  logger.info('Content imported from Notion', { notionPageId, title, blockCount: blocksResponse.results.length })
  return { content: lines.join('\n'), title }
}

async function publishSyncEvent(result: NotionSyncResult): Promise<void> {
  try {
    const eventBus = EventBusService.getInstance()
    const topic = result.status === 'failed' ? 'notion.sync.failed' : 'notion.sync.completed'
    await eventBus.publish(topic, result)
  } catch (error) {
    logger.warn('Failed to publish Notion sync event', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function initNotionSyncEventListeners(): void {
  try {
    const eventBus = EventBusService.getInstance()

    eventBus.subscribe('artifact.created', async (data: unknown) => {
      const payload = data as { artifactId: string; content: string; type: string; syncConfig?: NotionSyncConfig }
      if (payload.syncConfig && payload.syncConfig.autoSync) {
        await syncArtifactToNotion(payload.artifactId, payload.content, payload.type, payload.syncConfig).catch((error) => {
          logger.error('Auto artifact sync to Notion failed', {
            error: error instanceof Error ? error.message : String(error),
            artifactId: payload.artifactId,
          })
        })
      }
    })

    logger.info('Notion sync event listeners initialized')
  } catch (error) {
    logger.warn('Failed to initialize Notion sync event listeners', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
