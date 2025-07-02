/**
 * Slack Adapter
 * Handles communication with Slack API
 * Implements OAuth2 authentication and secure API calls
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '@uaip/utils';
import { ToolDefinition } from '../services/enterprise-tool-registry';

export class SlackAdapter {
  private toolDefinition: ToolDefinition;
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private baseUrl: string;

  constructor(toolDefinition: ToolDefinition) {
    this.toolDefinition = toolDefinition;
    this.baseUrl = 'https://slack.com/api';
    
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Request interceptor to add authentication
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const token = await this.getValidToken();
        if (token) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expired, try to refresh
          await this.refreshAccessToken();
          
          // Retry the original request
          const originalRequest = error.config;
          if (!originalRequest._retry) {
            originalRequest._retry = true;
            const token = await this.getValidToken();
            if (token) {
              originalRequest.headers['Authorization'] = `Bearer ${token}`;
            }
            return this.axiosInstance.request(originalRequest);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set OAuth tokens
   */
  public setTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);
    logger.info('Slack OAuth tokens set successfully');
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  private async getValidToken(): Promise<string | null> {
    if (!this.accessToken) {
      logger.warn('No Slack access token available');
      return null;
    }

    // Check if token is about to expire (within 5 minutes)
    if (this.tokenExpiry && this.tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000) {
      logger.info('Slack token expiring soon, refreshing...');
      await this.refreshAccessToken();
    }

    return this.accessToken;
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      logger.error('No refresh token available for Slack');
      throw new Error('Cannot refresh Slack token - no refresh token available');
    }

    try {
      // Note: Slack doesn't use refresh tokens in the same way as other OAuth2 providers
      // This is a placeholder implementation
      logger.warn('Slack token refresh not implemented - would need to re-authenticate');
    } catch (error) {
      logger.error('Failed to refresh Slack token:', error);
      throw error;
    }
  }

  /**
   * Send a message to a Slack channel
   */
  public async sendMessage(channelId: string, text: string, options: any = {}): Promise<any> {
    try {
      const response = await this.axiosInstance.post('/chat.postMessage', {
        channel: channelId,
        text,
        ...options
      });

      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }

      logger.info(`Message sent to Slack channel ${channelId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to send Slack message:', error);
      throw error;
    }
  }

  /**
   * Get channel information
   */
  public async getChannelInfo(channelId: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/conversations.info', {
        params: { channel: channelId }
      });

      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }

      return response.data.channel;
    } catch (error) {
      logger.error('Failed to get Slack channel info:', error);
      throw error;
    }
  }

  /**
   * List channels
   */
  public async listChannels(options: any = {}): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/conversations.list', {
        params: {
          types: 'public_channel,private_channel',
          limit: options.limit || 100,
          cursor: options.cursor
        }
      });

      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to list Slack channels:', error);
      throw error;
    }
  }

  /**
   * Execute arbitrary Slack API method
   */
  public async executeMethod(method: string, parameters: Record<string, any>): Promise<any> {
    try {
      const response = await this.axiosInstance.post(`/${method}`, parameters);

      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }

      logger.info(`Slack method ${method} executed successfully`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to execute Slack method ${method}:`, error);
      throw error;
    }
  }
}

// Export for dynamic import
export default SlackAdapter;