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
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
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
        const { parentId, title, content } = params as { parentId: string; title: string; content: string }
        return this.createPage(parentId, title, content, tokens)
      },
    })

    this.operations.set('notion_update_page', {
      id: 'notion_update_page',
      name: 'Update Notion Page',
      description: 'Updates a page in Notion',
      parameters: { pageId: 'string', properties: 'object' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const { pageId, properties } = params as { pageId: string; properties: Record<string, unknown> }
        return this.updatePage(pageId, properties, tokens)
      },
    })

    this.operations.set('notion_get_page', {
      id: 'notion_get_page',
      name: 'Get Notion Page',
      description: 'Retrieves a page from Notion',
      parameters: { pageId: 'string' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const { pageId } = params as { pageId: string }
        return this.getPage(pageId, tokens)
      },
    })

    this.operations.set('notion_query_database', {
      id: 'notion_query_database',
      name: 'Query Notion Database',
      description: 'Queries a Notion database',
      parameters: { databaseId: 'string', filter: 'object' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const { databaseId, filter } = params as { databaseId: string; filter?: Record<string, unknown> }
        return this.queryDatabase(databaseId, filter, tokens)
      },
    })

    this.operations.set('notion_search', {
      id: 'notion_search',
      name: 'Search Notion',
      description: 'Searches across Notion workspace',
      parameters: { query: 'string' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const { query } = params as { query: string }
        return this.search(query, tokens)
      },
    })

    this.operations.set('notion_append_blocks', {
      id: 'notion_append_blocks',
      name: 'Append Blocks',
      description: 'Appends blocks to a Notion page',
      parameters: { pageId: 'string', blocks: 'array' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const { pageId, blocks } = params as { pageId: string; blocks: NotionBlockContent[] }
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

    const data = (await response.json()) as Record<string, unknown>
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

    const data = (await response.json()) as Record<string, unknown>
    return this.mapToNotionPage(data)
  }

  private async getPage(pageId: string, tokens: OAuthTokens): Promise<NotionPage> {
    const response = await this.makeApiRequest(
      `${NOTION_API_BASE}/pages/${pageId}`,
      { method: 'GET' },
      tokens
    )

    const data = (await response.json()) as Record<string, unknown>
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

    const data = (await response.json()) as { results: Array<Record<string, unknown>> }
    return {
      results: data.results.map((item) => this.mapToNotionPage(item)),
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

    const data = (await response.json()) as { results: Array<Record<string, unknown>> }
    return {
      results: data.results.map((item) => this.mapToNotionPage(item)),
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
    const parent = data.parent as Record<string, unknown> | undefined
    const properties = data.properties as Record<string, unknown> | undefined
    const titleProp = properties?.title ?? properties?.Name
    const titleArray = (titleProp as Record<string, unknown>)?.title as Array<{ plain_text: string }> | undefined

    return {
      id: data.id as string,
      title: titleArray?.[0]?.plain_text ?? 'Untitled',
      url: data.url as string ?? '',
      parentId: (parent?.page_id ?? parent?.database_id ?? parent?.workspace) as string | undefined,
      parentType: parent?.type === 'database_id' ? 'database' : parent?.type === 'page_id' ? 'page' : 'workspace',
      lastEditedAt: data.last_edited_time as string ?? '',
      createdAt: data.created_time as string ?? '',
      archived: (data.archived as boolean) ?? false,
    }
  }
}
