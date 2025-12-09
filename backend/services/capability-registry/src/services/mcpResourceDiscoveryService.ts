// MCP Resource Discovery Service
// Comprehensive resource discovery patterns for MCP servers
// Handles resources, prompts, and selective tool management

import { EventEmitter } from 'events';
import { logger } from '@uaip/utils';
import { MCPClientService } from './mcpClientService.js';
import { RedisCacheService } from '@uaip/shared-services';

export interface MCPDiscoveryConfig {
  enableCaching: boolean;
  cacheTTL: number;
  autoDiscovery: boolean;
  discoveryInterval: number;
}

export interface ResourceDiscoveryResult {
  resources: Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
    serverName: string;
    discoveredAt: string;
    category: 'file' | 'database' | 'api' | 'document' | 'media' | 'unknown';
    tags: string[];
  }>;
  prompts: Array<{
    name: string;
    description?: string;
    serverName: string;
    arguments?: Array<{
      name: string;
      description?: string;
      required?: boolean;
    }>;
    discoveredAt: string;
    category: 'template' | 'generator' | 'analyzer' | 'transformer' | 'unknown';
    tags: string[];
  }>;
  tools: Array<{
    id: string;
    name: string;
    description: string;
    serverName: string;
    selectable: boolean;
    category: string;
    inputSchema: any;
    capabilities: string[];
  }>;
  servers: Array<{
    name: string;
    status: string;
    toolCount: number;
    resourceCount: number;
    promptCount: number;
  }>;
}

export class MCPResourceDiscoveryService extends EventEmitter {
  private static instance: MCPResourceDiscoveryService;
  private mcpService: MCPClientService;
  private cacheService?: RedisCacheService;
  private config: MCPDiscoveryConfig;
  private discoveryInterval?: NodeJS.Timeout;

  private constructor() {
    super();
    this.mcpService = MCPClientService.getInstance();
    this.config = {
      enableCaching: true,
      cacheTTL: 300, // 5 minutes
      autoDiscovery: true,
      discoveryInterval: 60000, // 1 minute
    };
  }

  public static getInstance(): MCPResourceDiscoveryService {
    if (!MCPResourceDiscoveryService.instance) {
      MCPResourceDiscoveryService.instance = new MCPResourceDiscoveryService();
    }
    return MCPResourceDiscoveryService.instance;
  }

  async initialize(
    cacheService?: RedisCacheService,
    config?: Partial<MCPDiscoveryConfig>
  ): Promise<void> {
    this.cacheService = cacheService;
    if (config) {
      this.config = { ...this.config, ...config };
    }

    if (this.config.autoDiscovery) {
      this.startAutoDiscovery();
    }

    logger.info('MCP Resource Discovery Service initialized', this.config);
  }

  // Comprehensive Resource Discovery
  async discoverAllResources(serverName?: string): Promise<ResourceDiscoveryResult> {
    const cacheKey = `mcp:discovery:${serverName || 'all'}`;

    // Check cache first
    if (this.config.enableCaching && this.cacheService) {
      try {
        const cached = await this.cacheService.get<ResourceDiscoveryResult>(cacheKey);
        if (cached) {
          logger.debug('Retrieved discovery result from cache', { serverName });
          return cached;
        }
      } catch (error) {
        logger.warn('Cache retrieval failed, proceeding with discovery', { error });
      }
    }

    logger.info('Starting comprehensive MCP resource discovery', { serverName });

    try {
      // Parallel discovery for better performance
      const [resources, prompts, tools] = await Promise.all([
        this.discoverResourcesWithMetadata(serverName),
        this.discoverPromptsWithMetadata(serverName),
        this.discoverSelectableTools(serverName),
      ]);

      // Get server status information
      const servers = await this.getServerSummary(serverName);

      const result: ResourceDiscoveryResult = {
        resources,
        prompts,
        tools,
        servers,
      };

      // Cache the result
      if (this.config.enableCaching && this.cacheService) {
        try {
          await this.cacheService.set(cacheKey, result, this.config.cacheTTL);
          logger.debug('Cached discovery result', { serverName, ttl: this.config.cacheTTL });
        } catch (error) {
          logger.warn('Failed to cache discovery result', { error });
        }
      }

      this.emit('discoveryCompleted', { serverName, result });
      logger.info('MCP resource discovery completed', {
        serverName,
        resourceCount: resources.length,
        promptCount: prompts.length,
        toolCount: tools.length,
        serverCount: servers.length,
      });

      return result;
    } catch (error) {
      logger.error('MCP resource discovery failed', { serverName, error });
      this.emit('discoveryError', { serverName, error });
      throw error;
    }
  }

  // Enhanced resource discovery with categorization
  private async discoverResourcesWithMetadata(
    serverName?: string
  ): Promise<ResourceDiscoveryResult['resources']> {
    try {
      const rawResources = await this.mcpService.discoverResources(serverName);

      return rawResources.map((resource) => {
        const category = this.categorizeResource(resource);
        const tags = this.generateResourceTags(resource);

        return {
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
          serverName: resource.serverName,
          discoveredAt: resource.discoveredAt || new Date().toISOString(),
          category,
          tags,
        };
      });
    } catch (error) {
      logger.error('Failed to discover resources with metadata', { serverName, error });
      return [];
    }
  }

  // Enhanced prompt discovery with categorization
  private async discoverPromptsWithMetadata(
    serverName?: string
  ): Promise<ResourceDiscoveryResult['prompts']> {
    try {
      const rawPrompts = await this.mcpService.discoverPrompts(serverName);

      return rawPrompts.map((prompt) => {
        const category = this.categorizePrompt(prompt);
        const tags = this.generatePromptTags(prompt);

        return {
          name: prompt.name,
          description: prompt.description,
          serverName: prompt.serverName,
          arguments: prompt.arguments,
          discoveredAt: prompt.discoveredAt || new Date().toISOString(),
          category,
          tags,
        };
      });
    } catch (error) {
      logger.error('Failed to discover prompts with metadata', { serverName, error });
      return [];
    }
  }

  // Enhanced tool discovery for selective attachment
  private async discoverSelectableTools(
    serverName?: string
  ): Promise<ResourceDiscoveryResult['tools']> {
    try {
      const servers = serverName ? [serverName] : await this.getActiveServerNames();
      const tools: ResourceDiscoveryResult['tools'] = [];

      for (const server of servers) {
        const serverTools = await this.mcpService.getSelectableToolsFromServer(server);
        tools.push(
          ...serverTools.map((tool) => ({
            ...tool,
            capabilities: this.extractToolCapabilities(tool),
            category: this.categorizeToolByName(tool.name),
          }))
        );
      }

      return tools;
    } catch (error) {
      logger.error('Failed to discover selectable tools', { serverName, error });
      return [];
    }
  }

  // Server summary information
  private async getServerSummary(serverName?: string): Promise<ResourceDiscoveryResult['servers']> {
    try {
      const servers = serverName ? [serverName] : await this.getActiveServerNames();
      const summary: ResourceDiscoveryResult['servers'] = [];

      for (const server of servers) {
        const [tools, resources, prompts] = await Promise.all([
          this.mcpService.getSelectableToolsFromServer(server).catch(() => []),
          this.mcpService.discoverResources(server).catch(() => []),
          this.mcpService.discoverPrompts(server).catch(() => []),
        ]);

        // Get server status (assuming we can access server state)
        const status = 'running'; // This would come from mcpService.getServerStatus(server)

        summary.push({
          name: server,
          status,
          toolCount: tools.length,
          resourceCount: resources.length,
          promptCount: prompts.length,
        });
      }

      return summary;
    } catch (error) {
      logger.error('Failed to get server summary', { serverName, error });
      return [];
    }
  }

  // Resource categorization logic
  private categorizeResource(
    resource: any
  ): 'file' | 'database' | 'api' | 'document' | 'media' | 'unknown' {
    const { uri, mimeType, name } = resource;

    if (mimeType) {
      if (
        mimeType.startsWith('image/') ||
        mimeType.startsWith('video/') ||
        mimeType.startsWith('audio/')
      ) {
        return 'media';
      }
      if (mimeType.includes('json') || mimeType.includes('xml')) {
        return 'api';
      }
      if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text/')) {
        return 'document';
      }
    }

    if (uri.includes('://')) {
      if (uri.startsWith('http') || uri.startsWith('https')) {
        return 'api';
      }
      if (uri.startsWith('jdbc:') || uri.startsWith('postgresql:') || uri.startsWith('mysql:')) {
        return 'database';
      }
    }

    if (uri.includes('.') || name.includes('.')) {
      return 'file';
    }

    return 'unknown';
  }

  // Prompt categorization logic
  private categorizePrompt(
    prompt: any
  ): 'template' | 'generator' | 'analyzer' | 'transformer' | 'unknown' {
    const { name, description } = prompt;
    const text = `${name} ${description || ''}`.toLowerCase();

    if (text.includes('template') || text.includes('format')) {
      return 'template';
    }
    if (text.includes('generate') || text.includes('create') || text.includes('build')) {
      return 'generator';
    }
    if (text.includes('analyze') || text.includes('review') || text.includes('check')) {
      return 'analyzer';
    }
    if (text.includes('transform') || text.includes('convert') || text.includes('translate')) {
      return 'transformer';
    }

    return 'unknown';
  }

  // Tool categorization by name patterns
  private categorizeToolByName(name: string): string {
    const lowerName = name.toLowerCase();

    if (lowerName.includes('file') || lowerName.includes('read') || lowerName.includes('write')) {
      return 'filesystem';
    }
    if (lowerName.includes('web') || lowerName.includes('http') || lowerName.includes('fetch')) {
      return 'web';
    }
    if (
      lowerName.includes('database') ||
      lowerName.includes('sql') ||
      lowerName.includes('query')
    ) {
      return 'database';
    }
    if (lowerName.includes('git') || lowerName.includes('repo')) {
      return 'version-control';
    }
    if (lowerName.includes('email') || lowerName.includes('mail')) {
      return 'communication';
    }

    return 'mcp';
  }

  // Extract tool capabilities from schema
  private extractToolCapabilities(tool: any): string[] {
    const capabilities: string[] = [];
    const { inputSchema, name, description } = tool;

    // Add capabilities based on tool name patterns
    const lowerName = name.toLowerCase();
    if (lowerName.includes('read')) capabilities.push('read');
    if (lowerName.includes('write')) capabilities.push('write');
    if (lowerName.includes('search')) capabilities.push('search');
    if (lowerName.includes('create')) capabilities.push('create');
    if (lowerName.includes('delete')) capabilities.push('delete');
    if (lowerName.includes('update')) capabilities.push('update');

    // Add capabilities based on input schema
    if (inputSchema?.properties) {
      const properties = Object.keys(inputSchema.properties);
      if (properties.includes('path')) capabilities.push('file-operations');
      if (properties.includes('url')) capabilities.push('network-operations');
      if (properties.includes('query')) capabilities.push('data-operations');
    }

    return [...new Set(capabilities)]; // Remove duplicates
  }

  // Generate resource tags
  private generateResourceTags(resource: any): string[] {
    const tags: string[] = [];
    const { uri, mimeType, name, serverName } = resource;

    // Server-based tags
    tags.push(`server:${serverName}`);

    // MIME type tags
    if (mimeType) {
      tags.push(`mime:${mimeType.split('/')[0]}`);
    }

    // URI-based tags
    if (uri.startsWith('http')) tags.push('remote');
    else tags.push('local');

    // Extension-based tags
    const extension = uri.split('.').pop()?.toLowerCase();
    if (extension) {
      tags.push(`ext:${extension}`);
    }

    return tags;
  }

  // Generate prompt tags
  private generatePromptTags(prompt: any): string[] {
    const tags: string[] = [];
    const { name, description, serverName, arguments: args } = prompt;

    // Server-based tags
    tags.push(`server:${serverName}`);

    // Argument-based tags
    if (args && args.length > 0) {
      tags.push('parameterized');
      tags.push(`args:${args.length}`);
    } else {
      tags.push('static');
    }

    // Content-based tags
    const text = `${name} ${description || ''}`.toLowerCase();
    if (text.includes('code')) tags.push('code');
    if (text.includes('text')) tags.push('text');
    if (text.includes('format')) tags.push('formatting');

    return tags;
  }

  // Get active server names
  private async getActiveServerNames(): Promise<string[]> {
    // This would ideally come from MCPClientService
    // For now, we'll use a placeholder method
    try {
      // Assuming MCPClientService has a method to list active servers
      return []; // Placeholder - implement actual server listing
    } catch (error) {
      logger.error('Failed to get active server names', { error });
      return [];
    }
  }

  // Auto-discovery management
  private startAutoDiscovery(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }

    this.discoveryInterval = setInterval(async () => {
      try {
        logger.debug('Running automatic MCP resource discovery');
        await this.discoverAllResources();
      } catch (error) {
        logger.error('Auto-discovery failed', { error });
      }
    }, this.config.discoveryInterval);

    logger.info('Auto-discovery started', { interval: this.config.discoveryInterval });
  }

  // Stop auto-discovery
  stopAutoDiscovery(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = undefined;
      logger.info('Auto-discovery stopped');
    }
  }

  // Search functionality
  async searchResources(
    query: string,
    filters?: {
      serverName?: string;
      category?: string;
      mimeType?: string;
    }
  ): Promise<ResourceDiscoveryResult['resources']> {
    const discovery = await this.discoverAllResources(filters?.serverName);
    const lowerQuery = query.toLowerCase();

    return discovery.resources.filter((resource) => {
      // Text search
      const textMatch =
        resource.name.toLowerCase().includes(lowerQuery) ||
        resource.description?.toLowerCase().includes(lowerQuery) ||
        resource.uri.toLowerCase().includes(lowerQuery);

      // Filter matches
      const categoryMatch = !filters?.category || resource.category === filters.category;
      const mimeTypeMatch = !filters?.mimeType || resource.mimeType === filters.mimeType;

      return textMatch && categoryMatch && mimeTypeMatch;
    });
  }

  // Configuration management
  updateConfig(config: Partial<MCPDiscoveryConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };

    // Restart auto-discovery if interval changed
    if (
      oldConfig.autoDiscovery !== this.config.autoDiscovery ||
      oldConfig.discoveryInterval !== this.config.discoveryInterval
    ) {
      this.stopAutoDiscovery();
      if (this.config.autoDiscovery) {
        this.startAutoDiscovery();
      }
    }

    logger.info('MCP Discovery Service configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  // Cleanup
  async shutdown(): Promise<void> {
    this.stopAutoDiscovery();
    this.removeAllListeners();
    logger.info('MCP Resource Discovery Service shutdown completed');
  }
}
