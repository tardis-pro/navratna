import { logger, AuthenticationError, InternalServerError, ValidationError } from '@uaip/utils';

export interface ToolAdapter {
  id: string;
  name: string;
  type: 'github' | 'jira' | 'confluence' | 'slack' | 'figma' | 'notion';
  isConfigured: boolean;
  capabilities: string[];
}

export interface GitHubConfig {
  token: string;
  organization?: string;
  repository?: string;
  webhookUrl?: string;
}

export interface JiraConfig {
  url: string;
  email: string;
  apiToken: string;
  projectKey?: string;
}

export interface ConfluenceConfig {
  url: string;
  email: string;
  apiToken: string;
  spaceKey?: string;
}

export interface ToolOperation {
  operation: 'search' | 'fetch' | 'create' | 'update' | 'delete' | 'list';
  toolType: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export class ToolAdapterService {
  private adapters = new Map<string, ToolAdapter>();
  private configurations = new Map<string, unknown>();
  private config: unknown;

  constructor(config: unknown) {
    this.config = config;
    this.initializeAdapters();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private isGitHubConfig(v: unknown): v is GitHubConfig {
    const r = this.asRecord(v);
    return typeof r.token === 'string';
  }

  private isJiraConfig(v: unknown): v is JiraConfig {
    const r = this.asRecord(v);
    return typeof r.url === 'string' && typeof r.email === 'string' && typeof r.apiToken === 'string';
  }

  private isConfluenceConfig(v: unknown): v is ConfluenceConfig {
    const r = this.asRecord(v);
    return typeof r.url === 'string' && typeof r.email === 'string' && typeof r.apiToken === 'string';
  }

  private initializeAdapters() {
    const serviceConfig = this.asRecord(this.config);
    // GitHub Adapter
    this.adapters.set('github', {
      id: 'github',
      name: 'GitHub',
      type: 'github',
      isConfigured: !!(serviceConfig.GITHUB_TOKEN || process.env.GITHUB_TOKEN),
      capabilities: [
        'repository_management',
        'issue_tracking',
        'pull_request_workflows',
        'code_search',
        'webhook_integration',
        'ci_cd_integration',
      ],
    });

    // Jira Adapter
    this.adapters.set('jira', {
      id: 'jira',
      name: 'Jira',
      type: 'jira',
      isConfigured: !!(
        (serviceConfig.JIRA_URL || process.env.JIRA_URL) &&
        (serviceConfig.JIRA_API_TOKEN || process.env.JIRA_API_TOKEN)
      ),
      capabilities: [
        'issue_management',
        'sprint_planning',
        'workflow_automation',
        'advanced_search',
        'reporting',
        'time_tracking',
      ],
    });

    // Confluence Adapter
    this.adapters.set('confluence', {
      id: 'confluence',
      name: 'Confluence',
      type: 'confluence',
      isConfigured: !!(
        (serviceConfig.CONFLUENCE_URL || process.env.CONFLUENCE_URL) &&
        (serviceConfig.CONFLUENCE_API_TOKEN || process.env.CONFLUENCE_API_TOKEN)
      ),
      capabilities: [
        'document_management',
        'knowledge_base',
        'content_search',
        'collaborative_editing',
        'page_templates',
        'space_management',
      ],
    });

    // Slack Adapter
    this.adapters.set('slack', {
      id: 'slack',
      name: 'Slack',
      type: 'slack',
      isConfigured: !!(serviceConfig.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN),
      capabilities: [
        'channel_messaging',
        'direct_messaging',
        'file_sharing',
        'notification_automation',
        'slash_commands',
        'workflow_integration',
      ],
    });
  }

  async getAvailableAdapters(): Promise<ToolAdapter[]> {
    return Array.from(this.adapters.values());
  }

  async getAdapter(toolId: string): Promise<ToolAdapter | null> {
    return this.adapters.get(toolId) || null;
  }

  async configureAdapter(toolId: string, config: unknown): Promise<boolean> {
    const adapter = this.adapters.get(toolId);
    if (!adapter) {
      throw new InternalServerError(`Unknown tool adapter: ${toolId}`);
    }

    try {
      // Validate configuration based on tool type
      await this.validateConfiguration(toolId, config);

      // Store configuration securely
      this.configurations.set(toolId, config);

      // Update adapter status
      adapter.isConfigured = true;
      this.adapters.set(toolId, adapter);

      logger.info(`Tool adapter ${toolId} configured successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to configure tool adapter ${toolId}:`, error);
      return false;
    }
  }

  async executeOperation(operation: ToolOperation): Promise<ToolResult> {
    const adapter = this.adapters.get(operation.toolType);
    if (!adapter || !adapter.isConfigured) {
      return {
        success: false,
        error: `Tool adapter ${operation.toolType} not configured`,
      };
    }

    try {
      switch (operation.toolType) {
        case 'github':
          return await this.executeGitHubOperation(operation);
        case 'jira':
          return await this.executeJiraOperation(operation);
        case 'confluence':
          return await this.executeConfluenceOperation(operation);
        case 'slack':
          return await this.executeSlackOperation(operation);
        default:
          return {
            success: false,
            error: `Unsupported tool type: ${operation.toolType}`,
          };
      }
    } catch (error) {
      logger.error(`Tool operation failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Operation failed',
      };
    }
  }

  private async validateConfiguration(toolId: string, config: unknown): Promise<void> {
    const cfg = this.asRecord(config);
    switch (toolId) {
      case 'github':
        if (typeof cfg.token !== 'string') {
          throw new ValidationError('GitHub token is required');
        }
        if (!this.isGitHubConfig(cfg)) throw new ValidationError('Invalid GitHub config');
        await this.testGitHubConnection(cfg);
        break;

      case 'jira':
        if (
          typeof cfg.url !== 'string' ||
          typeof cfg.email !== 'string' ||
          typeof cfg.apiToken !== 'string'
        ) {
          throw new ValidationError('Jira URL, email, and API token are required');
        }
        if (!this.isJiraConfig(cfg)) throw new ValidationError('Invalid Jira config');
        await this.testJiraConnection(cfg);
        break;

      case 'confluence':
        if (
          typeof cfg.url !== 'string' ||
          typeof cfg.email !== 'string' ||
          typeof cfg.apiToken !== 'string'
        ) {
          throw new ValidationError('Confluence URL, email, and API token are required');
        }
        if (!this.isConfluenceConfig(cfg)) throw new ValidationError('Invalid Confluence config');
        await this.testConfluenceConnection(cfg);
        break;

      default:
        throw new InternalServerError(`Validation not implemented for tool: ${toolId}`);
    }
  }

  private buildBasicAuthHeaders(email: string, apiToken: string): Record<string, string> {
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    return {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private async testBasicAuthConnection(
    url: string,
    email: string,
    apiToken: string,
    errorMessage: string
  ): Promise<void> {
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new InternalServerError(errorMessage);
    }
  }

  private toRecord(v: unknown): Record<string, unknown> {
    return this.isRecord(v) ? v : { _raw: v };
  }

  private async fetchGetJson(
    url: string,
    headers: Record<string, string>
  ): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const response = await fetch(url, { headers });
    return { ok: response.ok, data: this.toRecord(await response.json()) };
  }

  private async fetchPostJson(
    url: string,
    headers: Record<string, string>,
    body: unknown
  ): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return { ok: response.ok, data: this.toRecord(await response.json()) };
  }

  private async testGitHubConnection(config: GitHubConfig): Promise<void> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new AuthenticationError('Invalid GitHub token or API access denied');
    }
  }

  private async testJiraConnection(config: JiraConfig): Promise<void> {
    await this.testBasicAuthConnection(
      `${config.url}/rest/api/3/myself`,
      config.email,
      config.apiToken,
      'Invalid Jira credentials or API access denied'
    );
  }

  private async testConfluenceConnection(config: ConfluenceConfig): Promise<void> {
    await this.testBasicAuthConnection(
      `${config.url}/rest/api/user/current`,
      config.email,
      config.apiToken,
      'Invalid Confluence credentials or API access denied'
    );
  }

  private async executeGitHubOperation(operation: ToolOperation): Promise<ToolResult> {
    const rawConfig = this.configurations.get('github');
    if (!this.isGitHubConfig(rawConfig)) {
      return { success: false, error: 'GitHub adapter not configured' };
    }
    const config = rawConfig;
    const _baseUrl = 'https://api.github.com';

    const headers = {
      Authorization: `token ${config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };

    switch (operation.operation) {
      case 'search':
        return await this.githubSearch(operation.parameters, headers);

      case 'fetch':
        return await this.githubFetch(operation.parameters, headers);

      case 'create':
        return await this.githubCreate(operation.parameters, headers);

      case 'list':
        return await this.githubList(operation.parameters, headers);

      default:
        return {
          success: false,
          error: `Unsupported GitHub operation: ${operation.operation}`,
        };
    }
  }

  private async githubSearch(params: unknown, headers: Record<string, string>): Promise<ToolResult> {
    const p = this.asRecord(params);
    const query = String(p.query || '');
    const type = typeof p.type === 'string' ? p.type : 'repositories';
    const url = `https://api.github.com/search/${type}?q=${encodeURIComponent(query)}`;

    const { ok, data } = await this.fetchGetJson(url, headers);
    const items = Array.isArray(data.items) ? data.items : [];

    return {
      success: ok,
      data: items,
      metadata: { total_count: data.total_count },
    };
  }

  private async githubFetch(params: unknown, headers: Record<string, string>): Promise<ToolResult> {
    const p = this.asRecord(params);
    const owner = String(p.owner || '');
    const repo = String(p.repo || '');
    const path = typeof p.path === 'string' ? p.path : '';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    const { ok, data } = await this.fetchGetJson(url, headers);
    const errorMsg = typeof data.message === 'string' ? data.message : undefined;
    return { success: ok, data, error: ok ? undefined : errorMsg };
  }

  private async githubCreate(params: unknown, headers: Record<string, string>): Promise<ToolResult> {
    const p = this.asRecord(params);
    const owner = String(p.owner || '');
    const repo = String(p.repo || '');
    const type = String(p.type || '');
    const createData = this.asRecord(p.data);

    let url: string;
    let body: unknown;

    switch (type) {
      case 'issue':
        url = `https://api.github.com/repos/${owner}/${repo}/issues`;
        body = {
          title: createData.title,
          body: createData.body,
          labels: createData.labels || [],
        };
        break;

      case 'repository':
        url = `https://api.github.com/user/repos`;
        body = {
          name: createData.name,
          description: createData.description,
          private: createData.private || false,
        };
        break;

      default:
        return {
          success: false,
          error: `Unsupported GitHub create type: ${type}`,
        };
    }

    const { ok, data } = await this.fetchPostJson(url, headers, body);
    const errorMsg = typeof data.message === 'string' ? data.message : undefined;
    return { success: ok, data, error: ok ? undefined : errorMsg };
  }

  private async githubList(params: unknown, headers: Record<string, string>): Promise<ToolResult> {
    const p = this.asRecord(params);
    const type = typeof p.type === 'string' ? p.type : 'repos';
    const owner = typeof p.owner === 'string' ? p.owner : undefined;

    let url: string;
    switch (type) {
      case 'repos':
        url = owner
          ? `https://api.github.com/users/${owner}/repos`
          : 'https://api.github.com/user/repos';
        break;

      case 'issues':
        if (!owner || typeof p.repo !== 'string') {
          return { success: false, error: 'Owner and repo required for listing issues' };
        }
        url = `https://api.github.com/repos/${owner}/${p.repo}/issues`;
        break;

      default:
        return { success: false, error: `Unsupported list type: ${type}` };
    }

    const { ok, data } = await this.fetchGetJson(url, headers);
    const errorMsg = typeof data.message === 'string' ? data.message : undefined;
    return { success: ok, data: Array.isArray(data) ? data : [data], error: ok ? undefined : errorMsg };
  }

  private async executeJiraOperation(operation: ToolOperation): Promise<ToolResult> {
    const rawConfig = this.configurations.get('jira');
    if (!this.isJiraConfig(rawConfig)) {
      return { success: false, error: 'Jira adapter not configured' };
    }
    const config = rawConfig;
    const headers = this.buildBasicAuthHeaders(config.email, config.apiToken);

    switch (operation.operation) {
      case 'search':
        return await this.jiraSearch(operation.parameters, headers, config);

      case 'fetch':
        return await this.jiraFetch(operation.parameters, headers, config);

      case 'create':
        return await this.jiraCreate(operation.parameters, headers, config);

      case 'list':
        return await this.jiraList(operation.parameters, headers, config);

      default:
        return {
          success: false,
          error: `Unsupported Jira operation: ${operation.operation}`,
        };
    }
  }

  private async jiraSearch(
    params: unknown,
    headers: Record<string, string>,
    config: JiraConfig
  ): Promise<ToolResult> {
    const p = this.asRecord(params);
    const jql = String(p.jql || '');
    const url = `${config.url}/rest/api/3/search`;

    const { ok, data } = await this.fetchPostJson(url, headers, {
      jql,
      maxResults: p.maxResults || 50,
    });
    return {
      success: ok,
      data: Array.isArray(data.issues) ? data.issues : [],
      metadata: { total: data.total, startAt: data.startAt, maxResults: data.maxResults },
    };
  }

  private async jiraFetch(
    params: unknown,
    headers: Record<string, string>,
    config: JiraConfig
  ): Promise<ToolResult> {
    const p = this.asRecord(params);
    const issueKey = String(p.issueKey || '');
    const url = `${config.url}/rest/api/3/issue/${issueKey}`;

    const { ok, data } = await this.fetchGetJson(url, headers);
    const errorMessages = Array.isArray(data.errorMessages)
      ? data.errorMessages.filter((m): m is string => typeof m === 'string')
      : undefined;
    return { success: ok, data, error: ok ? undefined : errorMessages?.join(', ') };
  }

  private async jiraCreate(
    params: unknown,
    headers: Record<string, string>,
    config: JiraConfig
  ): Promise<ToolResult> {
    const p = this.asRecord(params);
    const issueType = typeof p.issueType === 'string' ? p.issueType : undefined;
    const summary = String(p.summary || '');
    const description = String(p.description || '');
    const projectKey = typeof p.projectKey === 'string' ? p.projectKey : config.projectKey;

    if (!projectKey) {
      return { success: false, error: 'Project key is required' };
    }

    const url = `${config.url}/rest/api/3/issue`;
    const body = {
      fields: {
        project: { key: projectKey },
        summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: description }],
            },
          ],
        },
        issuetype: { name: issueType || 'Task' },
      },
    };

    const { ok, data } = await this.fetchPostJson(url, headers, body);
    const errorMessages = Array.isArray(data.errorMessages)
      ? data.errorMessages.filter((m): m is string => typeof m === 'string')
      : undefined;
    return { success: ok, data, error: ok ? undefined : errorMessages?.join(', ') };
  }

  private async jiraList(
    params: unknown,
    headers: Record<string, string>,
    config: JiraConfig
  ): Promise<ToolResult> {
    const p = this.asRecord(params);
    const type = typeof p.type === 'string' ? p.type : 'issues';
    const projectKey = typeof p.projectKey === 'string' ? p.projectKey : config.projectKey;

    switch (type) {
      case 'issues':
        const jql = projectKey ? `project = "${projectKey}"` : 'assignee = currentUser()';
        return await this.jiraSearch({ jql, maxResults: p.maxResults }, headers, config);

      case 'projects': {
        const url = `${config.url}/rest/api/3/project`;
        const { ok, data } = await this.fetchGetJson(url, headers);
        return { success: ok, data: Array.isArray(data) ? data : [data] };
      }

      default:
        return { success: false, error: `Unsupported Jira list type: ${type}` };
    }
  }

  private async executeConfluenceOperation(operation: ToolOperation): Promise<ToolResult> {
    const rawConfig = this.configurations.get('confluence');
    if (!this.isConfluenceConfig(rawConfig)) {
      return { success: false, error: 'Confluence adapter not configured' };
    }
    const config = rawConfig;
    const headers = this.buildBasicAuthHeaders(config.email, config.apiToken);

    switch (operation.operation) {
      case 'search':
        return await this.confluenceSearch(operation.parameters, headers, config);

      case 'fetch':
        return await this.confluenceFetch(operation.parameters, headers, config);

      case 'create':
        return await this.confluenceCreate(operation.parameters, headers, config);

      case 'list':
        return await this.confluenceList(operation.parameters, headers, config);

      default:
        return {
          success: false,
          error: `Unsupported Confluence operation: ${operation.operation}`,
        };
    }
  }

  private async confluenceSearch(
    params: unknown,
    headers: Record<string, string>,
    config: ConfluenceConfig
  ): Promise<ToolResult> {
    const p = this.asRecord(params);
    const query = String(p.query || '');
    const type = typeof p.type === 'string' ? p.type : 'page';
    const url = `${config.url}/rest/api/content/search?cql=type=${type} and text~"${encodeURIComponent(query)}"`;

    const { ok, data } = await this.fetchGetJson(url, headers);
    const results = Array.isArray(data.results) ? data.results : [];

    return {
      success: ok,
      data: results,
      metadata: { size: data.size, start: data.start },
    };
  }

  private async confluenceFetch(
    params: unknown,
    headers: Record<string, string>,
    config: ConfluenceConfig
  ): Promise<ToolResult> {
    const p = this.asRecord(params);
    const pageId = String(p.pageId || '');
    const expand = typeof p.expand === 'string' ? p.expand : 'body.storage,version';
    const url = `${config.url}/rest/api/content/${pageId}?expand=${expand}`;

    const { ok, data } = await this.fetchGetJson(url, headers);
    const errorMsg = typeof data.message === 'string' ? data.message : undefined;
    return { success: ok, data, error: ok ? undefined : errorMsg };
  }

  private async confluenceCreate(
    params: unknown,
    headers: Record<string, string>,
    config: ConfluenceConfig
  ): Promise<ToolResult> {
    const p = this.asRecord(params);
    const title = String(p.title || '');
    const content = String(p.content || '');
    const spaceKey = typeof p.spaceKey === 'string' ? p.spaceKey : config.spaceKey;
    const type = typeof p.type === 'string' ? p.type : 'page';

    if (!spaceKey) {
      return { success: false, error: 'Space key is required' };
    }

    const url = `${config.url}/rest/api/content`;
    const body = {
      type,
      title,
      space: { key: spaceKey },
      body: {
        storage: {
          value: content,
          representation: 'storage',
        },
      },
    };

    const { ok, data } = await this.fetchPostJson(url, headers, body);
    const errorMsg = typeof data.message === 'string' ? data.message : undefined;
    return { success: ok, data, error: ok ? undefined : errorMsg };
  }

  private async confluenceList(
    params: unknown,
    headers: Record<string, string>,
    config: ConfluenceConfig
  ): Promise<ToolResult> {
    const p = this.asRecord(params);
    const type = typeof p.type === 'string' ? p.type : 'page';
    const spaceKey = typeof p.spaceKey === 'string' ? p.spaceKey : config.spaceKey;
    const limit = typeof p.limit === 'number' ? p.limit : 25;

    let url = `${config.url}/rest/api/content?type=${type}&limit=${limit}`;
    if (spaceKey) {
      url += `&spaceKey=${spaceKey}`;
    }

    const { ok, data } = await this.fetchGetJson(url, headers);
    return {
      success: ok,
      data: Array.isArray(data.results) ? data.results : [],
      metadata: { size: data.size, start: data.start },
    };
  }

  private async executeSlackOperation(_operation: ToolOperation): Promise<ToolResult> {
    // Placeholder for Slack operations
    return {
      success: true,
      data: { message: 'Slack integration coming soon' },
    };
  }
}
