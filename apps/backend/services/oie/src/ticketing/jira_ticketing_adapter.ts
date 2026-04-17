import axios, { type AxiosInstance } from 'axios';
import { logger } from '@uaip/utils';
import type { TicketingAdapter } from '../types/ticketing_adapter.js';
import type { AdapterConfigSchema, AdapterCapability, AdapterHealth } from '../types/base_adapter.js';
import type { CreateIssueParams, UpdateIssueParams, SearchIssuesParams, CreatedIssue, TicketRef } from '../types/ticketing_adapter.js';

const JIRA_CONFIG_SCHEMA: AdapterConfigSchema = {
  fields: [
    { name: 'baseUrl', type: 'url', required: true, description: 'Jira base URL', envVar: 'JIRA_BASE_URL' },
    { name: 'email', type: 'string', required: true, description: 'Jira email', envVar: 'JIRA_EMAIL' },
    { name: 'apiToken', type: 'secret', required: true, description: 'Jira API token', envVar: 'JIRA_API_TOKEN' },
  ],
  validate(config: Record<string, unknown>): void {
    if (!config['baseUrl']) throw new Error('JiraTicketingAdapter: baseUrl required');
    if (!config['email']) throw new Error('JiraTicketingAdapter: email required');
    if (!config['apiToken']) throw new Error('JiraTicketingAdapter: apiToken required');
  },
};

const JIRA_CAPABILITIES: AdapterCapability[] = [
  { type: 'create_issue', supportsRealtime: true, supportsHistorical: false },
  { type: 'search_issues', supportsRealtime: false, supportsHistorical: true },
];

function isJiraIssue(data: unknown): data is { id: string; key: string; self: string; fields?: { status?: { name?: string }; assignee?: { displayName?: string }; created?: string } } {
  return typeof data === 'object' && data !== null && 'id' in data && 'key' in data;
}

function priorityToJira(priority: CreateIssueParams['priority']): string {
  const map: Record<string, string> = {
    Highest: 'Highest',
    High: 'High',
    Medium: 'Medium',
    Low: 'Low',
    Lowest: 'Lowest',
  };
  return map[priority] ?? 'Medium';
}

export class JiraTicketingAdapter implements TicketingAdapter {
  readonly id = 'jira';
  readonly type = 'ticketing';

  private http: AxiosInstance | null = null;

  getConfigSchema(): AdapterConfigSchema {
    return JIRA_CONFIG_SCHEMA;
  }

  getCapabilities(): AdapterCapability[] {
    return JIRA_CAPABILITIES;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    JIRA_CONFIG_SCHEMA.validate(config);
    const baseUrl = String(config['baseUrl'] ?? process.env.JIRA_BASE_URL ?? '');
    const email = String(config['email'] ?? process.env.JIRA_EMAIL ?? '');
    const apiToken = String(config['apiToken'] ?? process.env.JIRA_API_TOKEN ?? '');
    const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');

    this.http = axios.create({
      baseURL: `${baseUrl}/rest/api/3`,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30_000,
    });

    logger.info('JiraTicketingAdapter initialized', { baseUrl });
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      await this.http?.get('/myself');
      return { healthy: true, latencyMs: Date.now() - start, checkedAt: new Date() };
    } catch (err) {
      return { healthy: false, error: err instanceof Error ? err.message : 'unknown', checkedAt: new Date() };
    }
  }

  async shutdown(): Promise<void> {
    this.http = null;
  }

  async createIssue(params: CreateIssueParams): Promise<CreatedIssue> {
    if (!this.http) throw new Error('JiraTicketingAdapter not initialized');

    const body = {
      fields: {
        project: { key: params.projectKey },
        summary: params.summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: params.description }],
            },
          ],
        },
        issuetype: { name: params.issueType },
        priority: { name: priorityToJira(params.priority) },
        labels: params.labels ?? [],
        ...(params.assignee ? { assignee: { accountId: params.assignee } } : {}),
        ...(params.customFields ?? {}),
      },
    };

    const res = await this.http.post('/issue', body);
    const data = res.data as unknown;

    if (!isJiraIssue(data)) {
      throw new Error('JiraTicketingAdapter: unexpected response from createIssue');
    }

    return {
      ref: {
        id: data.id,
        key: data.key,
        url: data.self,
      },
      status: data.fields?.status?.name ?? 'To Do',
      assignee: data.fields?.assignee?.displayName,
      created: new Date(data.fields?.created ?? Date.now()),
    };
  }

  async updateIssue(ref: TicketRef, update: UpdateIssueParams): Promise<void> {
    if (!this.http) throw new Error('JiraTicketingAdapter not initialized');

    const fields: Record<string, unknown> = {};
    if (update.summary) fields['summary'] = update.summary;
    if (update.priority) fields['priority'] = { name: priorityToJira(update.priority) };
    if (update.labels) fields['labels'] = update.labels;

    if (Object.keys(fields).length > 0) {
      await this.http.put(`/issue/${ref.key}`, { fields });
    }

    if (update.description || update.comment) {
      await this.addComment(ref, update.comment ?? update.description ?? '');
    }
  }

  async transitionIssue(ref: TicketRef, targetStatus: string): Promise<void> {
    if (!this.http) throw new Error('JiraTicketingAdapter not initialized');

    const transitions = await this.http.get(`/issue/${ref.key}/transitions`);
    const transitionList = (transitions.data as { transitions?: unknown[] })?.transitions ?? [];

    const target = transitionList.find(
      (t): t is { id: string; name: string } =>
        typeof t === 'object' && t !== null && 'name' in t && String((t as Record<string, unknown>)['name']).toLowerCase() === targetStatus.toLowerCase()
    );

    if (!target) {
      logger.warn('JiraTicketingAdapter: transition not found', { ref: ref.key, targetStatus });
      return;
    }

    await this.http.post(`/issue/${ref.key}/transitions`, { transition: { id: target.id } });
  }

  async searchIssues(params: SearchIssuesParams): Promise<CreatedIssue[]> {
    if (!this.http) throw new Error('JiraTicketingAdapter not initialized');

    const res = await this.http.post('/search', {
      jql: params.jql,
      maxResults: params.maxResults ?? 50,
      fields: params.fields ?? ['summary', 'status', 'assignee', 'created', 'priority'],
    });

    const issues = (res.data as { issues?: unknown[] })?.issues ?? [];
    return issues.filter(isJiraIssue).map((issue): CreatedIssue => ({
      ref: { id: issue.id, key: issue.key, url: issue.self },
      status: issue.fields?.status?.name ?? '',
      assignee: issue.fields?.assignee?.displayName,
      created: new Date(issue.fields?.created ?? Date.now()),
    }));
  }

  async addComment(ref: TicketRef, body: string): Promise<void> {
    if (!this.http) throw new Error('JiraTicketingAdapter not initialized');

    await this.http.post(`/issue/${ref.key}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }],
      },
    });
  }
}
