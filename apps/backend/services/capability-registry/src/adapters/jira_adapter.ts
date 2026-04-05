/**
 * Jira Adapter
 * Handles communication with Atlassian Jira API
 * Implements OAuth2 authentication and secure API calls
 */

import axios, { AxiosInstance } from 'axios';
import { logger, AuthenticationError, InternalServerError, ValidationError } from '@uaip/utils';
import { EventBusService } from '@uaip/infra';
import type { JiraOperationOutcome, JiraOperationStatus } from '@uaip/types';
import type { EnterpriseToolDefinition as ToolDefinition } from '@uaip/types';

interface JiraUpdateParams {
  issueIdOrKey?: string;
  fields?: Record<string, unknown>;
  notifyUsers?: boolean;
}

interface JiraSearchParams {
  jql?: string;
  fields?: string[];
  maxResults?: number;
  startAt?: number;
}

interface JiraSprintParams {
  projectKey?: string;
}

interface JiraCommentParams {
  issueIdOrKey?: string;
  body?: string;
}

const JIRA_OPERATION_COMPLETED_EVENT = 'jira.operation.completed';

export class JiraAdapter {
  private toolDefinition: ToolDefinition;
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private baseUrl: string;

  constructor(toolDefinition: ToolDefinition) {
    this.toolDefinition = toolDefinition;
    this.baseUrl = process.env.JIRA_BASE_URL || 'https://your-domain.atlassian.net';

    this.axiosInstance = axios.create({
      baseURL: `${this.baseUrl}/rest/api/3`,
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

  public setTokens(accessToken: string, refreshToken?: string, expiresAt?: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken || null;
    this.tokenExpiry = expiresAt ? new Date(expiresAt) : null;
  }

  /**
   * Execute a Jira operation
   */
  async execute(operationId: string, parameters: unknown): Promise<unknown> {
    try {
      logger.info('Executing Jira operation', { operationId, baseUrl: this.baseUrl });

      switch (operationId) {
        case 'createIssue':
          return await this.createIssue(parameters);
        case 'updateIssue':
          return await this.updateIssue(parameters);
        case 'searchIssues':
          return await this.searchIssues(parameters);
        case 'getActiveSprint':
          return await this.getActiveSprint(parameters);
        case 'addComment':
          return await this.addComment(parameters);
        default:
          throw new InternalServerError(`Unknown operation: ${operationId}`);
      }
    } catch (error) {
      logger.error('Jira operation failed', { error, operationId });
      throw this.formatError(error);
    }
  }

  /**
   * Create a new issue
   */
  private async createIssue(parameters: unknown): Promise<unknown> {
    const response = await this.axiosInstance.post('/issue', parameters);

    logger.info('Jira issue created', {
      issueKey: response.data.key,
      issueId: response.data.id,
    });

    this.emitOperationOutcome(
      'createIssue',
      'success',
      response.data.key,
      response.data.id,
      response.data.key?.split('-')[0] || '',
      { id: response.data.id, key: response.data.key }
    );

    return {
      id: response.data.id,
      key: response.data.key,
      self: response.data.self,
    };
  }

  /**
   * Update an existing issue
   */
  private async updateIssue(parameters: unknown): Promise<unknown> {
    const { issueIdOrKey, fields, notifyUsers = true } = (parameters as JiraUpdateParams) ?? {};
    if (!issueIdOrKey || !fields) {
      throw new ValidationError('updateIssue requires issueIdOrKey and fields');
    }

    const _response = await this.axiosInstance.put(
      `/issue/${issueIdOrKey}`,
      { fields },
      {
        params: { notifyUsers },
      }
    );

    logger.info('Jira issue updated', { issueIdOrKey });

    this.emitOperationOutcome(
      'updateIssue',
      'success',
      String(issueIdOrKey),
      String(issueIdOrKey),
      String(issueIdOrKey).split('-')[0] || '',
      { updated: true }
    );

    return { success: true };
  }

  /**
   * Search for issues using JQL
   */
  private async searchIssues(parameters: unknown): Promise<unknown> {
    const {
      jql,
      fields = [],
      maxResults = 50,
      startAt = 0,
    } = (parameters as JiraSearchParams) ?? {};

    const response = await this.axiosInstance.post('/search', {
      jql,
      fields,
      maxResults,
      startAt,
    });

    logger.info('Jira search completed', {
      total: response.data.total,
      returned: response.data.issues.length,
    });

    this.emitOperationOutcome('searchIssues', 'success', '', '', '', {
      total: response.data.total,
      returned: response.data.issues.length,
    });

    return {
      issues: response.data.issues,
      total: response.data.total,
      startAt: response.data.startAt,
      maxResults: response.data.maxResults,
    };
  }

  /**
   * Get active sprint for a project
   */
  private async getActiveSprint(parameters: unknown): Promise<unknown> {
    const { projectKey } = (parameters as JiraSprintParams) ?? {};
    if (!projectKey) {
      throw new ValidationError('getActiveSprint requires projectKey');
    }

    // First, get the board ID for the project
    const boardsResponse = await this.axiosInstance.get(`/rest/agile/1.0/board`, {
      params: {
        projectKeyOrId: projectKey,
        type: 'scrum',
      },
    });

    if (boardsResponse.data.values.length === 0) {
      return null;
    }

    const boardId = boardsResponse.data.values[0].id;

    // Get active sprints for the board
    const sprintsResponse = await this.axiosInstance.get(
      `/rest/agile/1.0/board/${boardId}/sprint`,
      {
        params: {
          state: 'active',
        },
      }
    );

    if (sprintsResponse.data.values.length === 0) {
      return null;
    }

    const activeSprint = sprintsResponse.data.values[0];

    logger.info('Active sprint retrieved', {
      projectKey,
      sprintId: activeSprint.id,
      sprintName: activeSprint.name,
    });

    return activeSprint;
  }

  /**
   * Add a comment to an issue
   */
  private async addComment(parameters: unknown): Promise<unknown> {
    const { issueIdOrKey, body } = (parameters as JiraCommentParams) ?? {};
    if (!issueIdOrKey || !body) {
      throw new ValidationError('addComment requires issueIdOrKey and body');
    }

    const response = await this.axiosInstance.post(`/issue/${issueIdOrKey}/comment`, { body });

    logger.info('Comment added to issue', { issueIdOrKey });

    this.emitOperationOutcome(
      'addComment',
      'success',
      String(issueIdOrKey),
      String(issueIdOrKey),
      String(issueIdOrKey).split('-')[0] || '',
      { commentId: response.data.id }
    );

    return {
      id: response.data.id,
      created: response.data.created,
    };
  }

  /**
   * Emit a Jira operation outcome event via EventBusService (best-effort).
   * If EventBusService is not initialized or publishing fails, the error
   * is logged but does not affect the operation result.
   */
  private emitOperationOutcome(
    operationType: string,
    status: JiraOperationStatus,
    issueKey: string,
    issueId: string,
    projectKey: string,
    result: Record<string, string | number | boolean>
  ): void {
    try {
      const eventBus = EventBusService.getInstance();
      const outcome: JiraOperationOutcome = {
        operationType,
        issueKey,
        issueId,
        projectKey,
        status,
        agentId: 'system',
        operationId: `jira-${operationType}-${Date.now()}`,
        result,
        timestamp: new Date().toISOString(),
      };

      // Fire-and-forget: publish without awaiting
      eventBus.publish(JIRA_OPERATION_COMPLETED_EVENT, outcome).catch((err: Error) => {
        logger.warn('Failed to publish Jira operation outcome event', {
          error: err.message,
          operationType,
          issueKey,
        });
      });
    } catch (error) {
      // EventBusService may not be initialized yet — this is expected in some contexts
      logger.debug('EventBusService not available for Jira outcome emission', {
        error: error instanceof Error ? error.message : String(error),
        operationType,
      });
    }
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
   * Authenticate with Jira OAuth2
   */
  private async authenticate(): Promise<void> {
    try {
      const authConfig = this.toolDefinition.authentication.config;
      const oauthConfig = (authConfig ?? {}) as { tokenUrl?: string };

      // In production, this would involve the full OAuth2 flow
      // For now, we'll use environment variables
      const clientId = process.env.JIRA_CLIENT_ID;
      const clientSecret = process.env.JIRA_CLIENT_SECRET;
      const refreshToken = process.env.JIRA_REFRESH_TOKEN;

      if (!clientId || !clientSecret || !refreshToken) {
        throw new InternalServerError('Jira OAuth2 credentials not configured');
      }

      // Exchange refresh token for access token
      const response = await axios.post(
        oauthConfig.tokenUrl,
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

      logger.info('Jira authentication successful', {
        expiresIn: response.data.expires_in,
      });
    } catch (error) {
      logger.error('Jira authentication failed', { error });
      throw new AuthenticationError('Failed to authenticate with Jira', { cause: error });
    }
  }

  /**
   * Refresh the access token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new AuthenticationError('No refresh token available');
    }

    try {
      const authConfig = this.toolDefinition.authentication.config;
      const oauthConfig = (authConfig ?? {}) as { tokenUrl?: string };
      const clientId = process.env.JIRA_CLIENT_ID;
      const clientSecret = process.env.JIRA_CLIENT_SECRET;

      const response = await axios.post(
        oauthConfig.tokenUrl,
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

      logger.info('Jira token refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh Jira token', { error });
      this.accessToken = null;
      this.refreshToken = null;
      this.tokenExpiry = null;
      throw new AuthenticationError('Failed to refresh Jira token', { cause: error });
    }
  }

  /**
   * Format error for consistent error handling
   */
  private formatError(error: unknown): Error {
    if (axios.isAxiosError(error) && error.response) {
      // Jira API error
      const status = error.response.status;
      const message =
        error.response.data?.errorMessages?.join(', ') ||
        error.response.data?.errors?.toString() ||
        error.response.statusText;

      return new Error(`Jira API error (${status}): ${message}`);
    } else if (axios.isAxiosError(error) && error.request) {
      // Network error
      return new Error('Network error: Unable to reach Jira');
    } else {
      // Other error
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Get available transitions for an issue
   */
  async getTransitions(issueIdOrKey: string): Promise<unknown> {
    const response = await this.axiosInstance.get(`/issue/${issueIdOrKey}/transitions`);

    return response.data.transitions;
  }

  /**
   * Transition an issue to a new status
   */
  async transitionIssue(issueIdOrKey: string, transitionId: string): Promise<unknown> {
    const _response = await this.axiosInstance.post(`/issue/${issueIdOrKey}/transitions`, {
      transition: { id: transitionId },
    });

    logger.info('Issue transitioned', { issueIdOrKey, transitionId });

    return { success: true };
  }

  /**
   * Get issue details
   */
  async getIssue(issueIdOrKey: string, fields?: string[]): Promise<unknown> {
    const response = await this.axiosInstance.get(`/issue/${issueIdOrKey}`, {
      params: fields ? { fields: fields.join(',') } : undefined,
    });

    return response.data;
  }

  /**
   * Get project details
   */
  async getProject(projectKeyOrId: string): Promise<unknown> {
    const response = await this.axiosInstance.get(`/project/${projectKeyOrId}`);

    return response.data;
  }

  /**
   * Create a new sprint
   */
  async createSprint(parameters: {
    name: string;
    boardId: number;
    startDate?: string;
    endDate?: string;
    goal?: string;
  }): Promise<unknown> {
    const response = await this.axiosInstance.post(`/rest/agile/1.0/sprint`, parameters);

    logger.info('Sprint created', {
      sprintId: response.data.id,
      sprintName: response.data.name,
    });

    return response.data;
  }

  /**
   * Get user permissions
   */
  async getMyPermissions(projectKey?: string): Promise<unknown> {
    const response = await this.axiosInstance.get('/mypermissions', {
      params: projectKey ? { projectKey } : undefined,
    });

    return response.data.permissions;
  }
}
