// OAuth Capability Discovery Service
// Automatically discovers and registers OAuth provider capabilities
// Part of capability-registry microservice

import { logger } from '@uaip/utils';
import { EventBusService } from '@uaip/infra/eventBus';

interface OAuthCapability {
  action: string;
  name: string;
  description: string;
  category: string;
  parameters?: Record<string, unknown>;
  returnType?: Record<string, unknown>;
  scopes?: string[];
  examples?: unknown[];
}

interface OAuthProviderConfig {
  name: string;
  baseUrl: string;
  capabilities: OAuthCapability[];
  authScopes: string[];
  webhookSupport?: boolean;
}

interface OAuthTokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string[];
  tokenType?: string;
}

interface OAuthProviderConnection extends OAuthProviderConfig {
  userId: string;
  tokenInfo?: OAuthTokenInfo;
}

export class OAuthCapabilityDiscovery {
  private static instance: OAuthCapabilityDiscovery;
  private eventBusService?: EventBusService;
  private connectedProviders = new Map<string, OAuthProviderConnection>();

  // GitHub OAuth capabilities
  private githubCapabilities: OAuthCapability[] = [
    {
      action: 'list-repos',
      name: 'List Repositories',
      description: 'List all repositories for the authenticated user',
      category: 'repository',
      parameters: {
        type: { type: 'string', enum: ['all', 'owner', 'member'], default: 'all' },
        sort: {
          type: 'string',
          enum: ['created', 'updated', 'pushed', 'full_name'],
          default: 'updated',
        },
        per_page: { type: 'number', minimum: 1, maximum: 100, default: 30 },
      },
      returnType: { type: 'array', items: { type: 'object' } },
      scopes: ['repo'],
      examples: [
        {
          input: { type: 'owner', sort: 'updated' },
          description: 'List owned repositories by update date',
        },
      ],
    },
    {
      action: 'create-repo',
      name: 'Create Repository',
      description: 'Create a new repository for the authenticated user',
      category: 'repository',
      parameters: {
        name: { type: 'string', required: true },
        description: { type: 'string' },
        private: { type: 'boolean', default: false },
        auto_init: { type: 'boolean', default: false },
      },
      returnType: { type: 'object' },
      scopes: ['repo'],
      examples: [
        {
          input: { name: 'my-new-repo', description: 'A test repository', private: false },
          description: 'Create a public repository',
        },
      ],
    },
    {
      action: 'list-issues',
      name: 'List Issues',
      description: 'List issues in a repository',
      category: 'issues',
      parameters: {
        owner: { type: 'string', required: true },
        repo: { type: 'string', required: true },
        state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
        labels: { type: 'string' },
        per_page: { type: 'number', minimum: 1, maximum: 100, default: 30 },
      },
      returnType: { type: 'array', items: { type: 'object' } },
      scopes: ['repo'],
      examples: [
        {
          input: { owner: 'octocat', repo: 'Hello-World', state: 'open' },
          description: 'List open issues',
        },
      ],
    },
    {
      action: 'create-issue',
      name: 'Create Issue',
      description: 'Create a new issue in a repository',
      category: 'issues',
      parameters: {
        owner: { type: 'string', required: true },
        repo: { type: 'string', required: true },
        title: { type: 'string', required: true },
        body: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
        assignees: { type: 'array', items: { type: 'string' } },
      },
      returnType: { type: 'object' },
      scopes: ['repo'],
      examples: [
        {
          input: {
            owner: 'octocat',
            repo: 'Hello-World',
            title: 'Bug report',
            body: 'Something is broken',
          },
          description: 'Create a bug report issue',
        },
      ],
    },
    {
      action: 'list-pull-requests',
      name: 'List Pull Requests',
      description: 'List pull requests in a repository',
      category: 'pulls',
      parameters: {
        owner: { type: 'string', required: true },
        repo: { type: 'string', required: true },
        state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
        head: { type: 'string' },
        base: { type: 'string' },
      },
      returnType: { type: 'array', items: { type: 'object' } },
      scopes: ['repo'],
      examples: [
        {
          input: { owner: 'octocat', repo: 'Hello-World', state: 'open' },
          description: 'List open pull requests',
        },
      ],
    },
    {
      action: 'get-user',
      name: 'Get User Info',
      description: 'Get authenticated user information',
      category: 'user',
      parameters: {},
      returnType: { type: 'object' },
      scopes: ['user:read'],
      examples: [{ input: {}, description: 'Get current user profile' }],
    },
  ];

  // Gmail OAuth capabilities
  private gmailCapabilities: OAuthCapability[] = [
    {
      action: 'list-messages',
      name: 'List Messages',
      description: "List messages in the user's mailbox",
      category: 'messages',
      parameters: {
        q: { type: 'string', description: 'Search query' },
        labelIds: { type: 'array', items: { type: 'string' } },
        maxResults: { type: 'number', minimum: 1, maximum: 500, default: 100 },
      },
      returnType: { type: 'object' },
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      examples: [
        { input: { q: 'is:unread', maxResults: 10 }, description: 'List 10 unread messages' },
      ],
    },
    {
      action: 'get-message',
      name: 'Get Message',
      description: 'Get a specific message by ID',
      category: 'messages',
      parameters: {
        id: { type: 'string', required: true },
        format: { type: 'string', enum: ['minimal', 'full', 'raw', 'metadata'], default: 'full' },
      },
      returnType: { type: 'object' },
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      examples: [
        {
          input: { id: '16c9b9b5a5b9b5a5', format: 'full' },
          description: 'Get full message content',
        },
      ],
    },
    {
      action: 'send-message',
      name: 'Send Message',
      description: 'Send an email message',
      category: 'messages',
      parameters: {
        to: { type: 'string', required: true },
        subject: { type: 'string', required: true },
        body: { type: 'string', required: true },
        cc: { type: 'string' },
        bcc: { type: 'string' },
      },
      returnType: { type: 'object' },
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      examples: [
        {
          input: { to: 'example@gmail.com', subject: 'Hello', body: 'Hello World!' },
          description: 'Send a simple email',
        },
      ],
    },
    {
      action: 'list-labels',
      name: 'List Labels',
      description: "List all labels in the user's mailbox",
      category: 'labels',
      parameters: {},
      returnType: { type: 'object' },
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      examples: [{ input: {}, description: 'Get all available labels' }],
    },
    {
      action: 'search-messages',
      name: 'Search Messages',
      description: 'Search for messages using Gmail search syntax',
      category: 'messages',
      parameters: {
        query: { type: 'string', required: true },
        maxResults: { type: 'number', minimum: 1, maximum: 500, default: 50 },
      },
      returnType: { type: 'object' },
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      examples: [
        {
          input: { query: 'from:noreply subject:invoice', maxResults: 20 },
          description: 'Search for invoice emails',
        },
      ],
    },
    {
      action: 'create-draft',
      name: 'Create Draft',
      description: 'Create a draft message',
      category: 'drafts',
      parameters: {
        to: { type: 'string', required: true },
        subject: { type: 'string', required: true },
        body: { type: 'string', required: true },
      },
      returnType: { type: 'object' },
      scopes: ['https://www.googleapis.com/auth/gmail.compose'],
      examples: [
        {
          input: { to: 'example@gmail.com', subject: 'Draft', body: 'This is a draft message' },
          description: 'Create an email draft',
        },
      ],
    },
  ];

  private constructor() {}

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  public static getInstance(): OAuthCapabilityDiscovery {
    if (!OAuthCapabilityDiscovery.instance) {
      OAuthCapabilityDiscovery.instance = new OAuthCapabilityDiscovery();
    }
    return OAuthCapabilityDiscovery.instance;
  }

  async initialize(eventBusService: EventBusService): Promise<void> {
    this.eventBusService = eventBusService;
    await this.setupEventSubscriptions();
    logger.info('OAuth Capability Discovery Service initialized');
  }

  private async setupEventSubscriptions(): Promise<void> {
    if (!this.eventBusService) return;

    try {
      // Listen for OAuth connection events
      await this.eventBusService.subscribe('oauth.provider.connected', async (event) => {
        await this.handleProviderConnection(event);
      });

      // Listen for OAuth disconnection events
      await this.eventBusService.subscribe('oauth.provider.disconnected', async (event) => {
        await this.handleProviderDisconnection(event);
      });

      logger.info('OAuth capability discovery event subscriptions configured');
    } catch (error) {
      logger.error('Failed to setup OAuth capability discovery event subscriptions:', error);
    }
  }

  private async handleProviderConnection(event: unknown): Promise<void> {
    try {
      const evt = this.asRecord(event);
      const provider = typeof evt.provider === 'string' ? evt.provider : '';
      const userId = typeof evt.userId === 'string' ? evt.userId : '';
      const scopes = Array.isArray(evt.scopes) ? evt.scopes.map(String) : undefined;
      const tokenInfo = evt.tokenInfo;
      logger.info(`OAuth provider connected: ${provider} for user ${userId}`);

      // Get capabilities for the connected provider
      const capabilities = this.getProviderCapabilities(provider, scopes);

      if (capabilities.length > 0) {
        // Store provider connection
        this.connectedProviders.set(`${provider}-${userId}`, {
          name: provider,
          baseUrl: this.getProviderBaseUrl(provider),
          capabilities,
          authScopes: scopes || [],
          webhookSupport: this.supportsWebhooks(provider),
          userId,
          tokenInfo: this.normalizeTokenInfo(tokenInfo),
        });

        // Publish capabilities discovered event
        await this.publishEvent('oauth.capabilities.discovered', {
          provider,
          userId,
          capabilities,
          connectionId: `${provider}-${userId}`,
          scopes: scopes || [],
          totalCapabilities: capabilities.length,
        });

        logger.info(`Discovered ${capabilities.length} capabilities for ${provider}`);
      }
    } catch (error) {
      const evt = this.asRecord(event);
      logger.error(`Failed to handle provider connection for ${String(evt.provider || 'unknown')}:`, error);
    }
  }

  private async handleProviderDisconnection(event: unknown): Promise<void> {
    try {
      const evt = this.asRecord(event);
      const provider = typeof evt.provider === 'string' ? evt.provider : '';
      const userId = typeof evt.userId === 'string' ? evt.userId : '';
      const connectionId = `${provider}-${userId}`;

      if (this.connectedProviders.has(connectionId)) {
        this.connectedProviders.delete(connectionId);

        // Publish capabilities removed event
        await this.publishEvent('oauth.capabilities.removed', {
          provider,
          userId,
          connectionId,
        });

        logger.info(`Removed OAuth capabilities for ${provider} user ${userId}`);
      }
    } catch (error) {
      const evt = this.asRecord(event);
      logger.error(
        `Failed to handle provider disconnection for ${String(evt.provider || 'unknown')}:`,
        error
      );
    }
  }

  private getProviderCapabilities(provider: string, scopes?: string[]): OAuthCapability[] {
    let allCapabilities: OAuthCapability[] = [];

    switch (provider.toLowerCase()) {
      case 'github':
        allCapabilities = this.githubCapabilities;
        break;
      case 'gmail':
      case 'google':
        allCapabilities = this.gmailCapabilities;
        break;
      default:
        logger.warn(`Unknown OAuth provider: ${provider}`);
        return [];
    }

    // Filter capabilities based on available scopes
    if (scopes && scopes.length > 0) {
      return allCapabilities.filter((capability) => {
        return capability.scopes?.some((scope) => scopes.includes(scope));
      });
    }

    return allCapabilities;
  }

  private getProviderBaseUrl(provider: string): string {
    switch (provider.toLowerCase()) {
      case 'github':
        return 'https://api.github.com';
      case 'gmail':
      case 'google':
        return 'https://www.googleapis.com/gmail/v1';
      default:
        return '';
    }
  }

  private supportsWebhooks(provider: string): boolean {
    switch (provider.toLowerCase()) {
      case 'github':
        return true;
      case 'gmail':
      case 'google':
        return true;
      default:
        return false;
    }
  }

  private async publishEvent(channel: string, data: unknown): Promise<void> {
    if (!this.eventBusService) return;

    try {
      await this.eventBusService.publish(channel, {
        ...this.asRecord(data),
        source: 'oauth-capability-discovery',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to publish OAuth capability event:', { channel, error });
    }
  }

  // Public API for manual capability discovery
  async discoverCapabilities(
    provider: string,
    userId: string,
    scopes?: string[]
  ): Promise<OAuthCapability[]> {
    const capabilities = this.getProviderCapabilities(provider, scopes);

    if (capabilities.length > 0) {
      await this.publishEvent('oauth.capabilities.discovered', {
        provider,
        userId,
        capabilities,
        connectionId: `${provider}-${userId}`,
        scopes: scopes || [],
        totalCapabilities: capabilities.length,
        manualDiscovery: true,
      });
    }

    return capabilities;
  }

  // Get all connected providers and their capabilities
  getConnectedProviders(): Map<string, OAuthProviderConfig> {
    const providers = new Map<string, OAuthProviderConfig>();
    for (const [connectionId, connection] of this.connectedProviders.entries()) {
      providers.set(connectionId, {
        name: connection.name,
        baseUrl: connection.baseUrl,
        capabilities: connection.capabilities,
        authScopes: connection.authScopes,
        webhookSupport: connection.webhookSupport,
      });
    }
    return providers;
  }

  getProviderToken(provider: string, userId?: string): OAuthTokenInfo | null {
    if (userId) {
      const connection = this.connectedProviders.get(`${provider}-${userId}`);
      return connection?.tokenInfo || null;
    }

    for (const connection of this.connectedProviders.values()) {
      if (connection.name.toLowerCase() === provider.toLowerCase() && connection.tokenInfo) {
        return connection.tokenInfo;
      }
    }

    return null;
  }

  getProviderConnectionByName(provider: string, userId?: string): OAuthProviderConnection | null {
    if (userId) {
      return this.connectedProviders.get(`${provider}-${userId}`) || null;
    }

    for (const connection of this.connectedProviders.values()) {
      if (connection.name.toLowerCase() === provider.toLowerCase()) {
        return connection;
      }
    }

    return null;
  }

  // Get capabilities for a specific provider connection
  getProviderConnection(provider: string, userId: string): OAuthProviderConfig | null {
    return this.connectedProviders.get(`${provider}-${userId}`) || null;
  }

  private normalizeTokenInfo(tokenInfo: unknown): OAuthTokenInfo | undefined {
    if (!tokenInfo || typeof tokenInfo !== 'object') {
      return undefined;
    }

    const tokenData = tokenInfo as Record<string, unknown>;
    const accessToken = tokenData.accessToken || tokenData.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      return undefined;
    }

    const scopeValue = tokenData.scope;
    const scope =
      Array.isArray(scopeValue) && scopeValue.every((entry) => typeof entry === 'string')
        ? (scopeValue as string[])
        : typeof scopeValue === 'string'
          ? scopeValue.split(' ').filter((entry) => entry.length > 0)
          : undefined;

    const refreshToken =
      typeof tokenData.refreshToken === 'string'
        ? tokenData.refreshToken
        : typeof tokenData.refresh_token === 'string'
          ? tokenData.refresh_token
          : undefined;

    const expiresAt =
      typeof tokenData.expiresAt === 'string'
        ? tokenData.expiresAt
        : typeof tokenData.expires_at === 'string'
          ? tokenData.expires_at
          : undefined;

    const tokenType =
      typeof tokenData.tokenType === 'string'
        ? tokenData.tokenType
        : typeof tokenData.token_type === 'string'
          ? tokenData.token_type
          : undefined;

    return {
      accessToken,
      refreshToken,
      expiresAt,
      scope,
      tokenType,
    };
  }
}
