import { logger } from '@uaip/utils';

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
  parameters: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export class ToolAdapterService {
  private adapters = new Map<string, ToolAdapter>();
  private configurations = new Map<string, any>();
  private config: any;

  constructor(config: any) {
    this.config = config;
    this.initializeAdapters();
  }

  private initializeAdapters() {
    // GitHub Adapter
    this.adapters.set('github', {
      id: 'github',
      name: 'GitHub',
      type: 'github',
      isConfigured: !!(this.config.GITHUB_TOKEN || process.env.GITHUB_TOKEN),
      capabilities: [
        'repository_management',
        'issue_tracking',
        'pull_request_workflows',
        'code_search',
        'webhook_integration',
        'ci_cd_integration'
      ]
    });

    // Jira Adapter
    this.adapters.set('jira', {
      id: 'jira',
      name: 'Jira',
      type: 'jira',
      isConfigured: !!((this.config.JIRA_URL || process.env.JIRA_URL) && (this.config.JIRA_API_TOKEN || process.env.JIRA_API_TOKEN)),
      capabilities: [
        'issue_management',
        'sprint_planning',
        'workflow_automation',
        'advanced_search',
        'reporting',
        'time_tracking'
      ]
    });

    // Confluence Adapter
    this.adapters.set('confluence', {
      id: 'confluence',
      name: 'Confluence',
      type: 'confluence',
      isConfigured: !!((this.config.CONFLUENCE_URL || process.env.CONFLUENCE_URL) && (this.config.CONFLUENCE_API_TOKEN || process.env.CONFLUENCE_API_TOKEN)),
      capabilities: [
        'document_management',
        'knowledge_base',
        'content_search',
        'collaborative_editing',
        'page_templates',
        'space_management'
      ]
    });

    // Slack Adapter
    this.adapters.set('slack', {
      id: 'slack',
      name: 'Slack',
      type: 'slack',
      isConfigured: !!(this.config.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN),
      capabilities: [
        'channel_messaging',
        'direct_messaging',
        'file_sharing',
        'notification_automation',
        'slash_commands',
        'workflow_integration'
      ]
    });
  }

  async getAvailableAdapters(): Promise<ToolAdapter[]> {
    return Array.from(this.adapters.values());
  }

  async getAdapter(toolId: string): Promise<ToolAdapter | null> {
    return this.adapters.get(toolId) || null;
  }

  async configureAdapter(toolId: string, config: any): Promise<boolean> {
    const adapter = this.adapters.get(toolId);
    if (!adapter) {
      throw new Error(`Unknown tool adapter: ${toolId}`);
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
        error: `Tool adapter ${operation.toolType} not configured`
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
            error: `Unsupported tool type: ${operation.toolType}`
          };
      }
    } catch (error) {
      logger.error(`Tool operation failed:`, error);
      return {
        success: false,
        error: error.message || 'Operation failed'
      };
    }
  }

  private async validateConfiguration(toolId: string, config: any): Promise<void> {
    switch (toolId) {
      case 'github':
        if (!config.token) {
          throw new Error('GitHub token is required');
        }
        // Test GitHub API connection
        await this.testGitHubConnection(config as GitHubConfig);
        break;
      
      case 'jira':
        if (!config.url || !config.email || !config.apiToken) {
          throw new Error('Jira URL, email, and API token are required');
        }
        // Test Jira API connection
        await this.testJiraConnection(config as JiraConfig);
        break;
      
      case 'confluence':
        if (!config.url || !config.email || !config.apiToken) {
          throw new Error('Confluence URL, email, and API token are required');
        }
        // Test Confluence API connection
        await this.testConfluenceConnection(config as ConfluenceConfig);
        break;
      
      default:
        throw new Error(`Validation not implemented for tool: ${toolId}`);
    }
  }

  private async testGitHubConnection(config: GitHubConfig): Promise<void> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${config.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error('Invalid GitHub token or API access denied');
    }
  }

  private async testJiraConnection(config: JiraConfig): Promise<void> {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    const response = await fetch(`${config.url}/rest/api/3/myself`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Invalid Jira credentials or API access denied');
    }
  }

  private async testConfluenceConnection(config: ConfluenceConfig): Promise<void> {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    const response = await fetch(`${config.url}/rest/api/user/current`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Invalid Confluence credentials or API access denied');
    }
  }

  private async executeGitHubOperation(operation: ToolOperation): Promise<ToolResult> {
    const config = this.configurations.get('github') as GitHubConfig;
    const baseUrl = 'https://api.github.com';
    
    const headers = {
      'Authorization': `token ${config.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
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
          error: `Unsupported GitHub operation: ${operation.operation}`
        };
    }
  }

  private async githubSearch(params: any, headers: any): Promise<ToolResult> {
    const { query, type = 'repositories' } = params;
    const url = `https://api.github.com/search/${type}?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    return {
      success: response.ok,
      data: data.items || [],
      metadata: { total_count: data.total_count }
    };
  }

  private async githubFetch(params: any, headers: any): Promise<ToolResult> {
    const { owner, repo, path = '' } = params;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    return {
      success: response.ok,
      data,
      error: response.ok ? undefined : data.message
    };
  }

  private async githubCreate(params: any, headers: any): Promise<ToolResult> {
    const { owner, repo, type, data: createData } = params;
    
    let url: string;
    let body: any;
    
    switch (type) {
      case 'issue':
        url = `https://api.github.com/repos/${owner}/${repo}/issues`;
        body = {
          title: createData.title,
          body: createData.body,
          labels: createData.labels || []
        };
        break;
      
      case 'repository':
        url = `https://api.github.com/user/repos`;
        body = {
          name: createData.name,
          description: createData.description,
          private: createData.private || false
        };
        break;
      
      default:
        return {
          success: false,
          error: `Unsupported GitHub create type: ${type}`
        };
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    return {
      success: response.ok,
      data,
      error: response.ok ? undefined : data.message
    };
  }

  private async githubList(params: any, headers: any): Promise<ToolResult> {
    const { type = 'repos', owner } = params;
    
    let url: string;
    switch (type) {
      case 'repos':
        url = owner ? `https://api.github.com/users/${owner}/repos` : 'https://api.github.com/user/repos';
        break;
      
      case 'issues':
        if (!owner || !params.repo) {
          return { success: false, error: 'Owner and repo required for listing issues' };
        }
        url = `https://api.github.com/repos/${owner}/${params.repo}/issues`;
        break;
      
      default:
        return { success: false, error: `Unsupported list type: ${type}` };
    }
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    return {
      success: response.ok,
      data: Array.isArray(data) ? data : [data],
      error: response.ok ? undefined : data.message
    };
  }

  private async executeJiraOperation(operation: ToolOperation): Promise<ToolResult> {
    const config = this.configurations.get('jira') as JiraConfig;
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

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
          error: `Unsupported Jira operation: ${operation.operation}`
        };
    }
  }

  private async jiraSearch(params: any, headers: any, config: JiraConfig): Promise<ToolResult> {
    const { jql } = params;
    const url = `${config.url}/rest/api/3/search`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jql, maxResults: params.maxResults || 50 })
    });
    
    const data = await response.json();
    
    return {
      success: response.ok,
      data: data.issues || [],
      metadata: { 
        total: data.total,
        startAt: data.startAt,
        maxResults: data.maxResults
      }
    };
  }

  private async jiraFetch(params: any, headers: any, config: JiraConfig): Promise<ToolResult> {
    const { issueKey } = params;
    const url = `${config.url}/rest/api/3/issue/${issueKey}`;
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    return {
      success: response.ok,
      data,
      error: response.ok ? undefined : data.errorMessages?.join(', ')
    };
  }

  private async jiraCreate(params: any, headers: any, config: JiraConfig): Promise<ToolResult> {
    const { issueType, summary, description, projectKey = config.projectKey } = params;
    
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
              content: [{ type: 'text', text: description }]
            }
          ]
        },
        issuetype: { name: issueType || 'Task' }
      }
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    return {
      success: response.ok,
      data,
      error: response.ok ? undefined : data.errorMessages?.join(', ')
    };
  }

  private async jiraList(params: any, headers: any, config: JiraConfig): Promise<ToolResult> {
    const { type = 'issues', projectKey = config.projectKey } = params;
    
    switch (type) {
      case 'issues':
        const jql = projectKey ? `project = "${projectKey}"` : 'assignee = currentUser()';
        return await this.jiraSearch({ jql, maxResults: params.maxResults }, headers, config);
      
      case 'projects':
        const url = `${config.url}/rest/api/3/project`;
        const response = await fetch(url, { headers });
        const data = await response.json();
        
        return {
          success: response.ok,
          data: Array.isArray(data) ? data : [data]
        };
      
      default:
        return { success: false, error: `Unsupported Jira list type: ${type}` };
    }
  }

  private async executeConfluenceOperation(operation: ToolOperation): Promise<ToolResult> {
    const config = this.configurations.get('confluence') as ConfluenceConfig;
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

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
          error: `Unsupported Confluence operation: ${operation.operation}`
        };
    }
  }

  private async confluenceSearch(params: any, headers: any, config: ConfluenceConfig): Promise<ToolResult> {
    const { query, type = 'page' } = params;
    const url = `${config.url}/rest/api/content/search?cql=type=${type} and text~"${encodeURIComponent(query)}"`;
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    return {
      success: response.ok,
      data: data.results || [],
      metadata: { size: data.size, start: data.start }
    };
  }

  private async confluenceFetch(params: any, headers: any, config: ConfluenceConfig): Promise<ToolResult> {
    const { pageId, expand = 'body.storage,version' } = params;
    const url = `${config.url}/rest/api/content/${pageId}?expand=${expand}`;
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    return {
      success: response.ok,
      data,
      error: response.ok ? undefined : data.message
    };
  }

  private async confluenceCreate(params: any, headers: any, config: ConfluenceConfig): Promise<ToolResult> {
    const { title, content, spaceKey = config.spaceKey, type = 'page' } = params;
    
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
          representation: 'storage'
        }
      }
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    return {
      success: response.ok,
      data,
      error: response.ok ? undefined : data.message
    };
  }

  private async confluenceList(params: any, headers: any, config: ConfluenceConfig): Promise<ToolResult> {
    const { type = 'page', spaceKey = config.spaceKey, limit = 25 } = params;
    
    let url = `${config.url}/rest/api/content?type=${type}&limit=${limit}`;
    if (spaceKey) {
      url += `&spaceKey=${spaceKey}`;
    }
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    return {
      success: response.ok,
      data: data.results || [],
      metadata: { size: data.size, start: data.start }
    };
  }

  private async executeSlackOperation(operation: ToolOperation): Promise<ToolResult> {
    // Placeholder for Slack operations
    return {
      success: true,
      data: { message: 'Slack integration coming soon' }
    };
  }
}