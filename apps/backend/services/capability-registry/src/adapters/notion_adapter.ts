import { logger, ExternalServiceError } from '@uaip/utils'
import { BaseOAuthAdapter, type OAuthConfig, type OAuthTokens, type ToolOperation } from './base_oauth_adapter.js'
import type {
  NotionAdapterConfig,
  NotionPage,
  NotionDatabase,
  NotionBlockContent,
} from '@uaip/types'

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function toRecord(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {}
}

export class NotionAdapter extends BaseOAuthAdapter {
  constructor(adapterConfig: NotionAdapterConfig) {
    const oauthConfig: OAuthConfig = {
      clientId: process.env.NOTION_CLIENT_ID ?? '',
      clientSecret: process.env.NOTION_CLIENT_SECRET ?? '',
      redirectUri: `${process.env.APP_BASE_URL ?? 'http://localhost:3002'}/api/v1/oauth/notion/callback`,
      scope: [],
      authUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      apiBaseUrl: NOTION_API_BASE,
    }
    super(oauthConfig)
  }

  protected override async makeApiRequest(
    url: string,
    options: RequestInit,
    tokens: OAuthTokens
  ): Promise<Response> {
    const existingHeaders = toRecord(options.headers)
    const stringHeaders: Record<string, string> = {}
    for (const [k, v] of Object.entries(existingHeaders)) {
      if (typeof v === 'string') stringHeaders[k] = v
    }
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Accept': 'application/json',
      ...stringHeaders,
    }

    const response = await fetch(url, { ...options, headers })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '<unreadable>')
      logger.error('Notion API request failed', { url, status: response.status, body: errorBody.slice(0, 500) })
      throw new ExternalServiceError(`Notion API request failed: ${response.status} ${response.statusText}`)
    }

    return response
  }

  protected setupOperations(): void {
    this.operations.set('notion_create_page', {
      id: 'notion_create_page',
      name: 'Create Notion Page',
      description: 'Creates a new page in Notion',
      parameters: { parentId: 'string', title: 'string', content: 'string' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = toRecord(params)
        const parentId = typeof p.parentId === 'string' ? p.parentId : ''
        const title = typeof p.title === 'string' ? p.title : ''
        const content = typeof p.content === 'string' ? p.content : ''
        return this.createPage(parentId, title, content, tokens)
      },
    })

    this.operations.set('notion_update_page', {
      id: 'notion_update_page',
      name: 'Update Notion Page',
      description: 'Updates a page in Notion',
      parameters: { pageId: 'string', properties: 'object' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = toRecord(params)
        const pageId = typeof p.pageId === 'string' ? p.pageId : ''
        const properties = toRecord(p.properties)
        return this.updatePage(pageId, properties, tokens)
      },
    })

    this.operations.set('notion_get_page', {
      id: 'notion_get_page',
      name: 'Get Notion Page',
      description: 'Retrieves a page from Notion',
      parameters: { pageId: 'string' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = toRecord(params)
        const pageId = typeof p.pageId === 'string' ? p.pageId : ''
        return this.getPage(pageId, tokens)
      },
    })

    this.operations.set('notion_query_database', {
      id: 'notion_query_database',
      name: 'Query Notion Database',
      description: 'Queries a Notion database',
      parameters: { databaseId: 'string', filter: 'object' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = toRecord(params)
        const databaseId = typeof p.databaseId === 'string' ? p.databaseId : ''
        const filter = p.filter !== undefined ? toRecord(p.filter) : undefined
        return this.queryDatabase(databaseId, filter, tokens)
      },
    })

    this.operations.set('notion_search', {
      id: 'notion_search',
      name: 'Search Notion',
      description: 'Searches across Notion workspace',
      parameters: { query: 'string' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = toRecord(params)
        const query = typeof p.query === 'string' ? p.query : ''
        return this.search(query, tokens)
      },
    })

    this.operations.set('notion_append_blocks', {
      id: 'notion_append_blocks',
      name: 'Append Blocks',
      description: 'Appends blocks to a Notion page',
      parameters: { pageId: 'string', blocks: 'array' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = toRecord(params)
        const pageId = typeof p.pageId === 'string' ? p.pageId : ''
        const blocks = Array.isArray(p.blocks) ? p.blocks.filter((b): b is NotionBlockContent => isRecord(b) && typeof b['type'] === 'string' && typeof b['content'] === 'string') : []
        return this.appendBlocks(pageId, blocks, tokens)
      },
    })
  }

  // ─── API operations ────────────────────────────────────────────────────

  private async createPage(
    parentId: string,
    title: string,
    content: string,
    tokens: OAuthTokens
  ): Promise<NotionPage> {
    const blocks = this.markdownToNotionBlocks(content)
    const children = blocks.map((block) => this.blockContentToNotionBlock(block))

    const response = await this.makeApiRequest(
      `${NOTION_API_BASE}/pages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent: { page_id: parentId },
          properties: {
            title: { title: [{ text: { content: title } }] },
          },
          children,
        }),
      },
      tokens
    )

    const data = toRecord(await response.json())
    return this.mapToNotionPage(data)
  }

  private async updatePage(
    pageId: string,
    properties: Record<string, unknown>,
    tokens: OAuthTokens
  ): Promise<NotionPage> {
    const response = await this.makeApiRequest(
      `${NOTION_API_BASE}/pages/${pageId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties }),
      },
      tokens
    )

    const data = toRecord(await response.json())
    return this.mapToNotionPage(data)
  }

  private async getPage(pageId: string, tokens: OAuthTokens): Promise<NotionPage> {
    const response = await this.makeApiRequest(
      `${NOTION_API_BASE}/pages/${pageId}`,
      { method: 'GET' },
      tokens
    )

    const data = toRecord(await response.json())
    return this.mapToNotionPage(data)
  }

  private async queryDatabase(
    databaseId: string,
    filter: Record<string, unknown> | undefined,
    tokens: OAuthTokens
  ): Promise<{ results: NotionPage[] }> {
    const body: Record<string, unknown> = {}
    if (filter) {
      body.filter = filter
    }

    const response = await this.makeApiRequest(
      `${NOTION_API_BASE}/databases/${databaseId}/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      tokens
    )

    const responseData = toRecord(await response.json())
    const results = Array.isArray(responseData.results) ? responseData.results : []
    return {
      results: results.map((item) => this.mapToNotionPage(toRecord(item))),
    }
  }

  private async search(query: string, tokens: OAuthTokens): Promise<{ results: NotionPage[] }> {
    const response = await this.makeApiRequest(
      `${NOTION_API_BASE}/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      },
      tokens
    )

    const responseData = toRecord(await response.json())
    const results = Array.isArray(responseData.results) ? responseData.results : []
    return {
      results: results.map((item) => this.mapToNotionPage(toRecord(item))),
    }
  }

  private async appendBlocks(
    pageId: string,
    blocks: NotionBlockContent[],
    tokens: OAuthTokens
  ): Promise<void> {
    const children = blocks.map((block) => this.blockContentToNotionBlock(block))

    await this.makeApiRequest(
      `${NOTION_API_BASE}/blocks/${pageId}/children`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ children }),
      },
      tokens
    )
  }

  // ─── Conversion helpers ────────────────────────────────────────────────

  markdownToNotionBlocks(markdown: string): NotionBlockContent[] {
    const lines = markdown.split('\n')
    const blocks: NotionBlockContent[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      if (trimmed.startsWith('### ')) {
        blocks.push({ type: 'heading_3', content: trimmed.slice(4) })
      } else if (trimmed.startsWith('## ')) {
        blocks.push({ type: 'heading_2', content: trimmed.slice(3) })
      } else if (trimmed.startsWith('# ')) {
        blocks.push({ type: 'heading_1', content: trimmed.slice(2) })
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        blocks.push({ type: 'bulleted_list_item', content: trimmed.slice(2) })
      } else if (/^\d+\.\s/.test(trimmed)) {
        blocks.push({ type: 'numbered_list_item', content: trimmed.replace(/^\d+\.\s/, '') })
      } else if (trimmed.startsWith('```')) {
        const language = trimmed.slice(3).trim() || undefined
        blocks.push({ type: 'code', content: '', language })
      } else if (trimmed === '---') {
        blocks.push({ type: 'divider', content: '' })
      } else {
        blocks.push({ type: 'paragraph', content: trimmed })
      }
    }

    return blocks
  }

  notionBlocksToMarkdown(blocks: NotionBlockContent[]): string {
    return blocks.map((block) => {
      switch (block.type) {
        case 'heading_1': return `# ${block.content}`
        case 'heading_2': return `## ${block.content}`
        case 'heading_3': return `### ${block.content}`
        case 'bulleted_list_item': return `- ${block.content}`
        case 'numbered_list_item': return `1. ${block.content}`
        case 'code': return `\`\`\`${block.language ?? ''}\n${block.content}\n\`\`\``
        case 'divider': return '---'
        default: return block.content
      }
    }).join('\n')
  }

  private blockContentToNotionBlock(block: NotionBlockContent): Record<string, unknown> {
    const richText = [{ type: 'text', text: { content: block.content } }]

    switch (block.type) {
      case 'heading_1': return { object: 'block', type: 'heading_1', heading_1: { rich_text: richText } }
      case 'heading_2': return { object: 'block', type: 'heading_2', heading_2: { rich_text: richText } }
      case 'heading_3': return { object: 'block', type: 'heading_3', heading_3: { rich_text: richText } }
      case 'bulleted_list_item': return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText } }
      case 'numbered_list_item': return { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: richText } }
      case 'code': return { object: 'block', type: 'code', code: { rich_text: richText, language: block.language ?? 'plain text' } }
      case 'divider': return { object: 'block', type: 'divider', divider: {} }
      default: return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText } }
    }
  }

  private mapToNotionPage(data: Record<string, unknown>): NotionPage {
    const parent = toRecord(data.parent)
    const properties = toRecord(data.properties)
    const titleProp = toRecord(properties.title ?? properties.Name)
    const titleArr = Array.isArray(titleProp.title) ? titleProp.title : []
    const firstTitle = toRecord(titleArr[0])
    const title = typeof firstTitle.plain_text === 'string' ? firstTitle.plain_text : 'Untitled'

    const parentId = typeof parent.page_id === 'string'
      ? parent.page_id
      : typeof parent.database_id === 'string'
        ? parent.database_id
        : typeof parent.workspace === 'string'
          ? parent.workspace
          : undefined

    return {
      id: typeof data.id === 'string' ? data.id : '',
      title,
      url: typeof data.url === 'string' ? data.url : '',
      parentId,
      parentType: parent.type === 'database_id' ? 'database' : parent.type === 'page_id' ? 'page' : 'workspace',
      lastEditedAt: typeof data.last_edited_time === 'string' ? data.last_edited_time : '',
      createdAt: typeof data.created_time === 'string' ? data.created_time : '',
      archived: typeof data.archived === 'boolean' ? data.archived : false,
    }
  }
}
