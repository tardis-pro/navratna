/**
 * Confluence Adapter
 * Handles communication with Atlassian Confluence API
 * Implements OAuth2 authentication and secure API calls
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '@uaip/utils';
import { ToolDefinition } from '../services/enterprise-tool-registry';

export class ConfluenceAdapter {
  private toolDefinition: ToolDefinition;
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private baseUrl: string;

  constructor(toolDefinition: ToolDefinition) {
    this.toolDefinition = toolDefinition;
    this.baseUrl = process.env.CONFLUENCE_BASE_URL || 'https://your-domain.atlassian.net/wiki';

    this.axiosInstance = axios.create({
      baseURL: `${this.baseUrl}/rest/api`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Add request interceptor for authentication
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const token = await this.getValidToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.refreshToken) {
          // Token expired, try to refresh
          await this.refreshAccessToken();
          // Retry the original request
          return this.axiosInstance.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Execute a Confluence operation
   */
  async execute(operationId: string, parameters: any): Promise<any> {
    try {
      logger.info('Executing Confluence operation', { operationId, baseUrl: this.baseUrl });

      switch (operationId) {
        case 'createPage':
          return await this.createPage(parameters);
        case 'updatePage':
          return await this.updatePage(parameters);
        case 'searchContent':
          return await this.searchContent(parameters);
        case 'getPage':
          return await this.getPage(parameters);
        case 'addAttachment':
          return await this.addAttachment(parameters);
        default:
          throw new Error(`Unknown operation: ${operationId}`);
      }
    } catch (error) {
      logger.error('Confluence operation failed', { error, operationId });
      throw this.formatError(error);
    }
  }

  /**
   * Create a new page
   */
  private async createPage(parameters: any): Promise<any> {
    const { type = 'page', title, space, body, ancestors, metadata } = parameters;

    const pageData: any = {
      type,
      title,
      space: typeof space === 'string' ? { key: space } : space,
      body: body || {
        storage: {
          value: '<p>Page content</p>',
          representation: 'storage',
        },
      },
    };

    // Add parent page if specified
    if (ancestors && ancestors.length > 0) {
      pageData.ancestors = ancestors;
    }

    // Add metadata/labels if specified
    if (metadata?.labels) {
      pageData.metadata = {
        labels: metadata.labels.map((label: string) => ({
          prefix: 'global',
          name: label,
        })),
      };
    }

    const response = await this.axiosInstance.post('/content', pageData);

    logger.info('Confluence page created', {
      pageId: response.data.id,
      title: response.data.title,
      spaceKey: response.data.space.key,
    });

    return {
      id: response.data.id,
      title: response.data.title,
      version: response.data.version,
      _links: response.data._links,
    };
  }

  /**
   * Update an existing page
   */
  private async updatePage(parameters: any): Promise<any> {
    const { pageId, title, body, version, message = 'Updated via API' } = parameters;

    // Get current page version if not provided
    let currentVersion = version;
    if (!currentVersion) {
      const currentPage = await this.getPage({ pageId });
      currentVersion = currentPage.version.number;
    }

    const updateData = {
      version: {
        number: currentVersion + 1,
        message,
      },
      title: title,
      type: 'page',
      body: body || {
        storage: {
          value: '<p>Updated content</p>',
          representation: 'storage',
        },
      },
    };

    const response = await this.axiosInstance.put(`/content/${pageId}`, updateData);

    logger.info('Confluence page updated', {
      pageId,
      newVersion: response.data.version.number,
    });

    return {
      id: response.data.id,
      title: response.data.title,
      version: response.data.version,
      _links: response.data._links,
    };
  }

  /**
   * Search for content
   */
  private async searchContent(parameters: any): Promise<any> {
    const {
      query,
      cql,
      type = 'page',
      spaceKey,
      limit = 25,
      start = 0,
      expand = ['version', 'space'],
    } = parameters;

    let searchQuery = cql || '';

    // Build CQL query if not provided
    if (!cql && query) {
      searchQuery = `text ~ "${query}"`;
      if (type) {
        searchQuery += ` AND type = "${type}"`;
      }
      if (spaceKey) {
        searchQuery += ` AND space = "${spaceKey}"`;
      }
    }

    const response = await this.axiosInstance.get('/content/search', {
      params: {
        cql: searchQuery,
        limit,
        start,
        expand: expand.join(','),
      },
    });

    logger.info('Confluence search completed', {
      total: response.data.totalSize,
      returned: response.data.results.length,
      query: searchQuery,
    });

    return {
      results: response.data.results,
      totalSize: response.data.totalSize,
      start: response.data.start,
      limit: response.data.limit,
      _links: response.data._links,
    };
  }

  /**
   * Get a specific page
   */
  private async getPage(parameters: any): Promise<any> {
    const { pageId, expand = ['version', 'space', 'body.storage', 'metadata.labels'] } = parameters;

    const response = await this.axiosInstance.get(`/content/${pageId}`, {
      params: {
        expand: expand.join(','),
      },
    });

    return response.data;
  }

  /**
   * Add attachment to a page
   */
  private async addAttachment(parameters: any): Promise<any> {
    const { pageId, file, comment = 'File attached via API' } = parameters;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('comment', comment);

    const response = await this.axiosInstance.post(
      `/content/${pageId}/child/attachment`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Atlassian-Token': 'no-check',
        },
      }
    );

    logger.info('Attachment added to Confluence page', {
      pageId,
      attachmentId: response.data.results[0]?.id,
    });

    return response.data.results[0];
  }

  /**
   * OAuth2 token management
   */
  private async getValidToken(): Promise<string | null> {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Try to refresh if we have a refresh token
    if (this.refreshToken) {
      await this.refreshAccessToken();
      return this.accessToken;
    }

    // Otherwise, get a new token
    await this.authenticate();
    return this.accessToken;
  }

  /**
   * Authenticate with Confluence OAuth2
   */
  private async authenticate(): Promise<void> {
    try {
      const authConfig = this.toolDefinition.authentication.config;

      // In production, this would involve the full OAuth2 flow
      // For now, we'll use environment variables
      const clientId = process.env.CONFLUENCE_CLIENT_ID;
      const clientSecret = process.env.CONFLUENCE_CLIENT_SECRET;
      const refreshToken = process.env.CONFLUENCE_REFRESH_TOKEN;

      if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Confluence OAuth2 credentials not configured');
      }

      // Exchange refresh token for access token
      const response = await axios.post(
        authConfig.tokenUrl,
        {
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token || refreshToken;
      this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);

      logger.info('Confluence authentication successful', {
        expiresIn: response.data.expires_in,
      });
    } catch (error) {
      logger.error('Confluence authentication failed', { error });
      throw new Error('Failed to authenticate with Confluence');
    }
  }

  /**
   * Refresh the access token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const authConfig = this.toolDefinition.authentication.config;
      const clientId = process.env.CONFLUENCE_CLIENT_ID;
      const clientSecret = process.env.CONFLUENCE_CLIENT_SECRET;

      const response = await axios.post(
        authConfig.tokenUrl,
        {
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: this.refreshToken,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      if (response.data.refresh_token) {
        this.refreshToken = response.data.refresh_token;
      }
      this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);

      logger.info('Confluence token refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh Confluence token', { error });
      this.accessToken = null;
      this.refreshToken = null;
      this.tokenExpiry = null;
      throw new Error('Failed to refresh Confluence token');
    }
  }

  /**
   * Format error for consistent error handling
   */
  private formatError(error: any): Error {
    if (error.response) {
      // Confluence API error
      const status = error.response.status;
      const message =
        error.response.data?.message || error.response.data?.reason || error.response.statusText;

      return new Error(`Confluence API error (${status}): ${message}`);
    } else if (error.request) {
      // Network error
      return new Error('Network error: Unable to reach Confluence');
    } else {
      // Other error
      return error;
    }
  }

  /**
   * Additional utility methods
   */

  /**
   * Get space information
   */
  async getSpace(spaceKey: string): Promise<any> {
    const response = await this.axiosInstance.get(`/space/${spaceKey}`, {
      params: {
        expand: 'description,homepage',
      },
    });

    return response.data;
  }

  /**
   * Create a blog post
   */
  async createBlogPost(parameters: {
    title: string;
    spaceKey: string;
    content: string;
    labels?: string[];
  }): Promise<any> {
    const blogData = {
      type: 'blogpost',
      title: parameters.title,
      space: { key: parameters.spaceKey },
      body: {
        storage: {
          value: parameters.content,
          representation: 'storage',
        },
      },
      metadata: parameters.labels
        ? {
            labels: parameters.labels.map((label) => ({
              prefix: 'global',
              name: label,
            })),
          }
        : undefined,
    };

    const response = await this.axiosInstance.post('/content', blogData);

    logger.info('Confluence blog post created', {
      blogId: response.data.id,
      title: response.data.title,
    });

    return response.data;
  }

  /**
   * Add a comment to a page
   */
  async addComment(parameters: {
    pageId: string;
    content: string;
    parentCommentId?: string;
  }): Promise<any> {
    const commentData: any = {
      type: 'comment',
      container: {
        id: parameters.pageId,
        type: 'page',
      },
      body: {
        storage: {
          value: parameters.content,
          representation: 'storage',
        },
      },
    };

    if (parameters.parentCommentId) {
      commentData.ancestors = [
        {
          id: parameters.parentCommentId,
        },
      ];
    }

    const response = await this.axiosInstance.post('/content', commentData);

    logger.info('Comment added to Confluence page', {
      pageId: parameters.pageId,
      commentId: response.data.id,
    });

    return response.data;
  }

  /**
   * Get page children (sub-pages)
   */
  async getPageChildren(
    pageId: string,
    type: 'page' | 'comment' | 'attachment' = 'page'
  ): Promise<any> {
    const response = await this.axiosInstance.get(`/content/${pageId}/child/${type}`, {
      params: {
        expand: 'version,space',
      },
    });

    return response.data.results;
  }

  /**
   * Move a page to a different space or parent
   */
  async movePage(parameters: {
    pageId: string;
    targetSpaceKey?: string;
    targetParentId?: string;
    position?: number;
  }): Promise<any> {
    const moveData: any = {
      position: parameters.position || 0,
    };

    if (parameters.targetSpaceKey) {
      moveData.targetSpace = { key: parameters.targetSpaceKey };
    }

    if (parameters.targetParentId) {
      moveData.targetParent = { id: parameters.targetParentId };
    }

    const response = await this.axiosInstance.put(`/content/${parameters.pageId}/move`, moveData);

    logger.info('Confluence page moved', {
      pageId: parameters.pageId,
      targetSpace: parameters.targetSpaceKey,
      targetParent: parameters.targetParentId,
    });

    return response.data;
  }

  /**
   * Delete a page
   */
  async deletePage(pageId: string): Promise<any> {
    const response = await this.axiosInstance.delete(`/content/${pageId}`);

    logger.info('Confluence page deleted', { pageId });

    return { success: true };
  }
}
