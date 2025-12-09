import { BaseOAuthAdapter, OAuthConfig, OAuthTokens } from './base-oauth-adapter.js';
import { logger } from '@uaip/utils';

/**
 * GitHub tool adapter for repository operations
 */
export class GitHubAdapter extends BaseOAuthAdapter {
  constructor(config: Partial<OAuthConfig> = {}) {
    const defaultConfig: OAuthConfig = {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      redirectUri: process.env.GITHUB_REDIRECT_URI || '',
      scope: ['repo', 'user:email'],
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      apiBaseUrl: 'https://api.github.com',
      ...config,
    };

    super(defaultConfig);
  }

  protected setupOperations(): void {
    // List repositories
    this.operations.set('list_repos', {
      id: 'list_repos',
      name: 'List Repositories',
      description: 'List user repositories',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['all', 'owner', 'public', 'private'],
            default: 'all',
          },
          sort: {
            type: 'string',
            enum: ['created', 'updated', 'pushed', 'full_name'],
            default: 'updated',
          },
          per_page: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 30,
          },
        },
      },
      execute: this.listRepositories.bind(this),
    });

    // Get repository contents
    this.operations.set('get_repo_contents', {
      id: 'get_repo_contents',
      name: 'Get Repository Contents',
      description: 'Get contents of a repository file or directory',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          path: { type: 'string', description: 'File or directory path', default: '' },
        },
        required: ['owner', 'repo'],
      },
      execute: this.getRepositoryContents.bind(this),
    });

    // Create file
    this.operations.set('create_file', {
      id: 'create_file',
      name: 'Create File',
      description: 'Create a new file in repository',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          path: { type: 'string', description: 'File path' },
          message: { type: 'string', description: 'Commit message' },
          content: { type: 'string', description: 'File content (base64 encoded)' },
          branch: { type: 'string', description: 'Branch name', default: 'main' },
        },
        required: ['owner', 'repo', 'path', 'message', 'content'],
      },
      execute: this.createFile.bind(this),
    });

    // Create issue
    this.operations.set('create_issue', {
      id: 'create_issue',
      name: 'Create Issue',
      description: 'Create a new issue in repository',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue body' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
        },
        required: ['owner', 'repo', 'title'],
      },
      execute: this.createIssue.bind(this),
    });

    // Get pull requests
    this.operations.set('list_pull_requests', {
      id: 'list_pull_requests',
      name: 'List Pull Requests',
      description: 'List pull requests for a repository',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
          sort: { type: 'string', enum: ['created', 'updated', 'popularity'], default: 'created' },
        },
        required: ['owner', 'repo'],
      },
      execute: this.listPullRequests.bind(this),
    });
  }

  private async listRepositories(params: any, tokens: OAuthTokens): Promise<any> {
    try {
      const url = new URL(`${this.config.apiBaseUrl}/user/repos`);
      url.searchParams.append('type', params.type || 'all');
      url.searchParams.append('sort', params.sort || 'updated');
      url.searchParams.append('per_page', String(params.per_page || 30));

      const response = await this.makeApiRequest(url.toString(), { method: 'GET' }, tokens);
      const repos = await response.json();

      return {
        success: true,
        data: repos.map((repo: any) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          private: repo.private,
          html_url: repo.html_url,
          clone_url: repo.clone_url,
          created_at: repo.created_at,
          updated_at: repo.updated_at,
          language: repo.language,
          stargazers_count: repo.stargazers_count,
          forks_count: repo.forks_count,
        })),
      };
    } catch (error) {
      logger.error('Failed to list repositories', error);
      return { success: false, error: error.message };
    }
  }

  private async getRepositoryContents(params: any, tokens: OAuthTokens): Promise<any> {
    try {
      const { owner, repo, path = '' } = params;
      const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/contents/${path}`;

      const response = await this.makeApiRequest(url, { method: 'GET' }, tokens);
      const contents = await response.json();

      return {
        success: true,
        data: Array.isArray(contents)
          ? contents.map((item) => ({
              name: item.name,
              path: item.path,
              type: item.type,
              size: item.size,
              download_url: item.download_url,
            }))
          : {
              name: contents.name,
              path: contents.path,
              type: contents.type,
              size: contents.size,
              content: contents.content,
              encoding: contents.encoding,
            },
      };
    } catch (error) {
      logger.error('Failed to get repository contents', error);
      return { success: false, error: error.message };
    }
  }

  private async createFile(params: any, tokens: OAuthTokens): Promise<any> {
    try {
      const { owner, repo, path, message, content, branch = 'main' } = params;
      const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/contents/${path}`;

      const body = JSON.stringify({
        message,
        content,
        branch,
      });

      const response = await this.makeApiRequest(
        url,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        },
        tokens
      );

      const result = await response.json();

      return {
        success: true,
        data: {
          commit: result.commit,
          content: {
            name: result.content.name,
            path: result.content.path,
            sha: result.content.sha,
            html_url: result.content.html_url,
          },
        },
      };
    } catch (error) {
      logger.error('Failed to create file', error);
      return { success: false, error: error.message };
    }
  }

  private async createIssue(params: any, tokens: OAuthTokens): Promise<any> {
    try {
      const { owner, repo, title, body, labels = [] } = params;
      const url = `${this.config.apiBaseUrl}/repos/${owner}/${repo}/issues`;

      const requestBody = JSON.stringify({
        title,
        body,
        labels,
      });

      const response = await this.makeApiRequest(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        },
        tokens
      );

      const issue = await response.json();

      return {
        success: true,
        data: {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          html_url: issue.html_url,
          created_at: issue.created_at,
          labels: issue.labels.map((label: any) => label.name),
        },
      };
    } catch (error) {
      logger.error('Failed to create issue', error);
      return { success: false, error: error.message };
    }
  }

  private async listPullRequests(params: any, tokens: OAuthTokens): Promise<any> {
    try {
      const { owner, repo, state = 'open', sort = 'created' } = params;
      const url = new URL(`${this.config.apiBaseUrl}/repos/${owner}/${repo}/pulls`);
      url.searchParams.append('state', state);
      url.searchParams.append('sort', sort);

      const response = await this.makeApiRequest(url.toString(), { method: 'GET' }, tokens);
      const prs = await response.json();

      return {
        success: true,
        data: prs.map((pr: any) => ({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: pr.state,
          html_url: pr.html_url,
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          user: pr.user.login,
          head: {
            ref: pr.head.ref,
            sha: pr.head.sha,
          },
          base: {
            ref: pr.base.ref,
            sha: pr.base.sha,
          },
        })),
      };
    } catch (error) {
      logger.error('Failed to list pull requests', error);
      return { success: false, error: error.message };
    }
  }
}
