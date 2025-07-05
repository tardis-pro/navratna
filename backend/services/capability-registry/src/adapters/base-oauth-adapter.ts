import { logger } from '@uaip/utils';
import { randomUUID } from 'crypto';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
  authUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string[];
}

export interface ToolOperation {
  id: string;
  name: string;
  description: string;
  parameters: any;
  execute: (params: any, tokens: OAuthTokens) => Promise<any>;
}

/**
 * Base class for OAuth-based enterprise tool adapters
 */
export abstract class BaseOAuthAdapter {
  protected config: OAuthConfig;
  protected operations: Map<string, ToolOperation> = new Map();

  constructor(config: OAuthConfig) {
    this.config = config;
    this.setupOperations();
  }

  /**
   * Setup available operations for this adapter
   */
  protected abstract setupOperations(): void;

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope.join(' '),
      state: state || randomUUID()
    });

    return `${this.config.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    try {
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
          code
        })
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        scope: data.scope ? data.scope.split(' ') : this.config.scope
      };
    } catch (error) {
      logger.error('Failed to exchange code for tokens', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    try {
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken
        })
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        scope: data.scope ? data.scope.split(' ') : this.config.scope
      };
    } catch (error) {
      logger.error('Failed to refresh tokens', error);
      throw error;
    }
  }

  /**
   * Execute a tool operation
   */
  async executeOperation(operationId: string, parameters: any, tokens: OAuthTokens): Promise<any> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    // Check if token needs refresh
    if (tokens.expiresAt && tokens.expiresAt <= new Date() && tokens.refreshToken) {
      tokens = await this.refreshTokens(tokens.refreshToken);
    }

    return operation.execute(parameters, tokens);
  }

  /**
   * Get available operations
   */
  getOperations(): ToolOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Make authenticated API request
   */
  protected async makeApiRequest(
    url: string, 
    options: RequestInit, 
    tokens: OAuthTokens
  ): Promise<Response> {
    const headers = {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Accept': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response;
  }
}