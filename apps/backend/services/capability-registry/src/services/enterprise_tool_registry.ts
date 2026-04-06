/**
 * Enterprise Tool Registry
 * Manages tool integrations with Zero Trust security
 * Handles Jira, Confluence, Slack, and other enterprise tools
 */

import { logger, AuthorizationError, InternalServerError, NotFoundError, RateLimitError, ValidationError } from '@uaip/utils';
import { SERVICE_ACCESS_MATRIX, validateServiceAccess, AccessLevel } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra';
import type {
  EnterpriseToolDefinition as ToolDefinition,
  EnterpriseToolOperation as ToolOperation,
  EnterpriseToolAuth as ToolAuthentication,
  EnterpriseRateLimitConfig as RateLimitConfig,
  EnterpriseSandboxConfig as SandboxConfig,
  EnterpriseComplianceConfig as ComplianceConfig,
} from '@uaip/types';

export type {
  EnterpriseToolDefinition as ToolDefinition,
  EnterpriseToolOperation as ToolOperation,
  EnterpriseToolAuth as ToolAuthentication,
  EnterpriseRateLimitConfig as RateLimitConfig,
  EnterpriseSandboxConfig as SandboxConfig,
  EnterpriseComplianceConfig as ComplianceConfig,
} from '@uaip/types';

interface AdapterWithExecute {
  execute: (operationId: string, params: unknown) => Promise<unknown>;
}

function isAdapterWithExecute(v: unknown): v is AdapterWithExecute {
  return isRecord(v) && typeof v.execute === 'function';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isToolDefinition(v: unknown): v is ToolDefinition {
  return isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string';
}

export class EnterpriseToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private toolInstances = new Map<string, unknown>();
  private eventBusService: EventBusService;
  private databaseService: DatabaseService;
  private serviceName: string;
  private rateLimiters = new Map<string, RateLimiter>();

  constructor(config: {
    eventBusService: EventBusService;
    databaseService: DatabaseService;
    serviceName: string;
  }) {
    this.eventBusService = config.eventBusService;
    this.databaseService = config.databaseService;
    this.serviceName = config.serviceName;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
  }

  async initialize(): Promise<void> {
    // Import config here to avoid circular dependencies
    const { config } = await import('@uaip/config');

    // Safely access enterprise configuration with fallback
    const enterpriseConfig = config.enterprise || {
      enabled: false,
      zeroTrustMode: false,
      serviceAccessMatrix: 'standard',
    };

    // Determine database instance name based on enterprise mode
    const databaseInstance = enterpriseConfig.enabled ? 'postgres-application' : 'postgres';
    const useEnterpriseMatrix = enterpriseConfig.enabled;

    // Validate service access using appropriate matrix
    if (
      !validateServiceAccess(
        this.serviceName,
        'postgresql',
        databaseInstance,
        AccessLevel.WRITE,
        useEnterpriseMatrix
      )
    ) {
      throw new ValidationError(
        `Service lacks required database permissions for tool registry (instance: ${databaseInstance}, enterprise: ${useEnterpriseMatrix})`
      );
    }

    // Set up event subscriptions
    await this.setupEventSubscriptions();

    // Initialize default enterprise tools
    await this.initializeDefaultTools();

    logger.info('Enterprise Tool Registry initialized', {
      service: this.serviceName,
      toolCount: this.tools.size,
      enterpriseMode: enterpriseConfig.enabled,
      databaseInstance,
    });
  }

  /**
   * Register a new tool
   */
  async registerTool(tool: ToolDefinition): Promise<void> {
    try {
      // Validate tool definition
      this.validateToolDefinition(tool);

      // Check permissions
      if (!this.hasPermissionToRegister(tool)) {
        throw new AuthorizationError(`Insufficient permissions to register tool: ${tool.id}`);
      }

      // Initialize rate limiter if configured
      if (tool.rateLimit) {
        this.rateLimiters.set(tool.id, new RateLimiter(tool.rateLimit));
      }

      // Store tool definition
      this.tools.set(tool.id, tool);

      // Initialize tool adapter
      await this.initializeToolAdapter(tool);

      // Publish registration event
      await this.eventBusService.publish('tool.registry.registered', {
        toolId: tool.id,
        toolName: tool.name,
        category: tool.category,
        operations: tool.operations.map((op) => op.id),
        timestamp: new Date().toISOString(),
      });

      this.auditLog('TOOL_REGISTERED', {
        toolId: tool.id,
        toolName: tool.name,
        vendor: tool.vendor,
      });
    } catch (error) {
      logger.error('Failed to register tool', { error, toolId: tool.id });
      throw error;
    }
  }

  /**
   * Execute a tool operation
   */
  async executeTool(request: {
    toolId: string;
    operation: string;
    parameters: unknown;
    userId?: string;
    agentId?: string;
    securityContext: {
      level: number;
      permissions?: string[];
    };
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const executionId = this.generateExecutionId();

      logger.info('Tool execution requested', {
        executionId,
        toolId: request.toolId,
        operation: request.operation,
        userId: request.userId,
        agentId: request.agentId,
      });

      // Validate tool exists
      const tool = this.tools.get(request.toolId);
      if (!tool) {
        throw new NotFoundError(`Tool not found: ${request.toolId}`);
      }

      // Validate operation exists
      const operation = tool.operations.find((op) => op.id === request.operation);
      if (!operation) {
        throw new NotFoundError(`Operation not found: ${request.operation}`);
      }

      // Security checks
      this.validateSecurityContext(operation, request.securityContext);

      // Rate limiting
      if (tool.rateLimit) {
        await this.checkRateLimit(request.toolId, request.userId || 'anonymous');
      }

      // Validate input
      this.validateInput(request.parameters, operation.inputSchema);

      // Execute in sandbox if configured
      let result;
      if (tool.sandboxing.enabled) {
        result = await this.executeSandboxed(tool, operation, request);
      } else {
        result = await this.executeDirectly(tool, operation, request);
      }

      // Validate output
      this.validateOutput(result, operation.outputSchema);

      // Audit execution
      this.auditToolExecution(executionId, request, operation, true);

      return { success: true, data: result };
    } catch (error) {
      logger.error('Tool execution failed', { error, request });

      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.auditToolExecution(this.generateExecutionId(), request, null, false, errMsg);

      return { success: false, error: 'Tool execution failed' };
    }
  }

  /**
   * Initialize default enterprise tools
   */
  private async initializeDefaultTools(): Promise<void> {
    // Jira Integration
    await this.registerTool({
      id: 'jira_api',
      name: 'Atlassian Jira',
      description: 'Issue tracking and project management',
      category: 'project_management',
      vendor: 'Atlassian',
      version: '8.x',
      operations: [
        {
          id: 'createIssue',
          name: 'Create Issue',
          description: 'Create a new Jira issue',
          requiredPermissions: ['jira:issue:create'],
          inputSchema: {
            type: 'object',
            required: ['fields'],
            properties: {
              fields: {
                type: 'object',
                required: ['project', 'summary', 'issuetype'],
                properties: {
                  project: { type: 'object' },
                  summary: { type: 'string' },
                  description: { type: 'string' },
                  issuetype: { type: 'object' },
                },
              },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              key: { type: 'string' },
              self: { type: 'string' },
            },
          },
          securityLevel: 3,
          auditLevel: 'comprehensive',
        },
        {
          id: 'updateIssue',
          name: 'Update Issue',
          description: 'Update an existing Jira issue',
          requiredPermissions: ['jira:issue:edit'],
          inputSchema: {
            type: 'object',
            required: ['issueIdOrKey', 'fields'],
            properties: {
              issueIdOrKey: { type: 'string' },
              fields: { type: 'object' },
            },
          },
          outputSchema: { type: 'object' },
          securityLevel: 3,
          auditLevel: 'comprehensive',
        },
        {
          id: 'searchIssues',
          name: 'Search Issues',
          description: 'Search for Jira issues using JQL',
          requiredPermissions: ['jira:issue:read'],
          inputSchema: {
            type: 'object',
            required: ['jql'],
            properties: {
              jql: { type: 'string' },
              maxResults: { type: 'number' },
              fields: { type: 'array' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              issues: { type: 'array' },
              total: { type: 'number' },
            },
          },
          securityLevel: 2,
          auditLevel: 'standard',
        },
      ],
      authentication: {
        type: 'oauth2',
        config: {
          authorizationUrl: 'https://auth.atlassian.com/authorize',
          tokenUrl: 'https://auth.atlassian.com/oauth/token',
          scope: 'read:jira-work write:jira-work',
        },
        scopes: ['read:jira-work', 'write:jira-work'],
        refreshable: true,
      },
      rateLimit: {
        requests: 100,
        window: 60000,
        burstAllowance: 20,
        perUser: true,
      },
      sandboxing: {
        enabled: true,
        executionTimeout: 30000,
        memoryLimit: 256,
        networkAccess: 'restricted',
        allowedDomains: ['*.atlassian.net', '*.jira.com'],
      },
      compliance: {
        dataClassification: 'confidential',
        piiHandling: true,
        encryptionRequired: true,
        auditRetention: 365,
        gdprCompliant: true,
        hipaaCompliant: false,
      },
    });

    // Confluence Integration
    await this.registerTool({
      id: 'confluence_api',
      name: 'Atlassian Confluence',
      description: 'Documentation and knowledge management',
      category: 'documentation',
      vendor: 'Atlassian',
      version: '7.x',
      operations: [
        {
          id: 'createPage',
          name: 'Create Page',
          description: 'Create a new Confluence page',
          requiredPermissions: ['confluence:page:create'],
          inputSchema: {
            type: 'object',
            required: ['title', 'space', 'body'],
            properties: {
              title: { type: 'string' },
              space: { type: 'object' },
              body: { type: 'object' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              _links: { type: 'object' },
            },
          },
          securityLevel: 3,
          auditLevel: 'comprehensive',
        },
        {
          id: 'searchContent',
          name: 'Search Content',
          description: 'Search Confluence content',
          requiredPermissions: ['confluence:content:read'],
          inputSchema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: { type: 'string' },
              filters: { type: 'object' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              results: { type: 'array' },
              totalSize: { type: 'number' },
            },
          },
          securityLevel: 2,
          auditLevel: 'standard',
        },
      ],
      authentication: {
        type: 'oauth2',
        config: {
          authorizationUrl: 'https://auth.atlassian.com/authorize',
          tokenUrl: 'https://auth.atlassian.com/oauth/token',
          scope: 'read:confluence-content.all write:confluence-content',
        },
        scopes: ['read:confluence-content.all', 'write:confluence-content'],
        refreshable: true,
      },
      rateLimit: {
        requests: 50,
        window: 60000,
        perUser: true,
      },
      sandboxing: {
        enabled: true,
        executionTimeout: 30000,
        memoryLimit: 256,
        networkAccess: 'restricted',
        allowedDomains: ['*.atlassian.net', '*.confluence.com'],
      },
      compliance: {
        dataClassification: 'internal',
        piiHandling: false,
        encryptionRequired: true,
        auditRetention: 180,
        gdprCompliant: true,
        hipaaCompliant: false,
      },
    });

    // Slack Integration
    await this.registerTool({
      id: 'slack_api',
      name: 'Slack',
      description: 'Team communication platform',
      category: 'communication',
      vendor: 'Slack Technologies',
      version: 'v2',
      operations: [
        {
          id: 'postMessage',
          name: 'Post Message',
          description: 'Post a message to a Slack channel',
          requiredPermissions: ['slack:chat:write'],
          inputSchema: {
            type: 'object',
            required: ['channel', 'text'],
            properties: {
              channel: { type: 'string' },
              text: { type: 'string' },
              attachments: { type: 'array' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              ts: { type: 'string' },
            },
          },
          securityLevel: 2,
          auditLevel: 'standard',
        },
      ],
      authentication: {
        type: 'oauth2',
        config: {
          authorizationUrl: 'https://slack.com/oauth/v2/authorize',
          tokenUrl: 'https://slack.com/api/oauth.v2.access',
          scope: 'chat:write chat:write.public',
        },
        scopes: ['chat:write', 'chat:write.public'],
        refreshable: false,
      },
      rateLimit: {
        requests: 60,
        window: 60000,
        perUser: false,
      },
      sandboxing: {
        enabled: true,
        executionTimeout: 10000,
        memoryLimit: 128,
        networkAccess: 'restricted',
        allowedDomains: ['slack.com', '*.slack.com'],
      },
      compliance: {
        dataClassification: 'internal',
        piiHandling: true,
        encryptionRequired: true,
        auditRetention: 90,
        gdprCompliant: true,
        hipaaCompliant: false,
      },
    });
  }

  /**
   * Initialize tool adapter
   */
  private async initializeToolAdapter(tool: ToolDefinition): Promise<void> {
    switch (tool.id) {
      case 'jira_api':
        const jiraAdapter = await import('../adapters/jira_adapter');
        this.toolInstances.set(tool.id, new jiraAdapter.JiraAdapter(tool));
        break;
      case 'confluence_api':
        const confluenceAdapter = await import('../adapters/confluence_adapter');
        this.toolInstances.set(tool.id, new confluenceAdapter.ConfluenceAdapter(tool));
        break;
      case 'slack_api':
        const slackAdapter = await import('../adapters/slack_adapter');
        this.toolInstances.set(tool.id, new slackAdapter.SlackAdapter(tool));
        break;
      default:
        logger.warn('No adapter found for tool', { toolId: tool.id });
    }
  }

  /**
   * Execute tool in sandbox
   */
  private async executeSandboxed(
    tool: ToolDefinition,
    operation: ToolOperation,
    request: unknown
  ): Promise<unknown> {
    const req = this.asRecord(request);
    const sandbox = {
      toolId: tool.id,
      operation: operation.id,
      parameters: req.parameters,
      timeout: tool.sandboxing.executionTimeout,
      memoryLimit: tool.sandboxing.memoryLimit,
      networkAccess: tool.sandboxing.networkAccess,
      allowedDomains: tool.sandboxing.allowedDomains,
    };

    // Execute through sandbox service
    const response = await this.eventBusService.publishAndWait('sandbox.execute', sandbox, 30000);
    const responseData = this.asRecord(response);

    if (!responseData.success) {
      throw new InternalServerError(`Sandbox execution failed: ${String(responseData.error || 'unknown error')}`);
    }

    return responseData.data;
  }

  /**
   * Execute tool directly
   */
  private async executeDirectly(
    tool: ToolDefinition,
    operation: ToolOperation,
    request: unknown
  ): Promise<unknown> {
    const adapter = this.toolInstances.get(tool.id);
    if (!adapter) {
      throw new NotFoundError(`No adapter found for tool: ${tool.id}`);
    }

    const req = this.asRecord(request);
    if (!isAdapterWithExecute(adapter)) {
      throw new NotFoundError(`Adapter for tool ${tool.id} does not have an execute method`);
    }
    return await adapter.execute(operation.id, req.parameters);
  }

  /**
   * Validation methods
   */
  private validateToolDefinition(tool: ToolDefinition): void {
    if (!tool.id || !tool.name) {
      throw new ValidationError('Tool must have id and name');
    }
    if (!tool.operations || tool.operations.length === 0) {
      throw new ValidationError('Tool must have at least one operation');
    }
    if (!tool.authentication) {
      throw new ValidationError('Tool must define authentication method');
    }
    if (!tool.sandboxing) {
      throw new ValidationError('Tool must define sandboxing configuration');
    }
    if (!tool.compliance) {
      throw new ValidationError('Tool must define compliance configuration');
    }
  }

  private hasPermissionToRegister(tool: ToolDefinition): boolean {
    // Check if service has permission to register tools
    const serviceAccess = isRecord(SERVICE_ACCESS_MATRIX) ? SERVICE_ACCESS_MATRIX[this.serviceName] : undefined;
    if (!serviceAccess) return false;

    // Check security level requirement
    const requiredLevel = tool.compliance.dataClassification === 'restricted' ? 4 : 3;
    const access = this.asRecord(serviceAccess);
    const securityLevel = typeof access.securityLevel === 'number' ? access.securityLevel : 0;
    return securityLevel >= requiredLevel;
  }

  private validateSecurityContext(operation: ToolOperation, securityContext: unknown): void {
    const context = this.asRecord(securityContext);
    const level = typeof context.level === 'number' ? context.level : 0;
    if (level < operation.securityLevel) {
      throw new ValidationError(
        `Insufficient security level. Required: ${operation.securityLevel}, Provided: ${level}`
      );
    }

    // Check required permissions
    if (operation.requiredPermissions.length > 0) {
      const permissions = Array.isArray(context.permissions) ? context.permissions.map(String) : [];
      const hasPermissions = operation.requiredPermissions.every((perm) =>
        permissions.includes(perm)
      );
      if (!hasPermissions) {
        throw new AuthorizationError('Missing required permissions');
      }
    }
  }

  private validateInput(input: unknown, _schema: unknown): void {
    // Implement JSON Schema validation
    // For now, basic validation
    if (!input) {
      throw new ValidationError('Input parameters required');
    }
  }

  private validateOutput(output: unknown, _schema: unknown): void {
    // Implement JSON Schema validation
    // For now, basic validation
    if (output === undefined || output === null) {
      throw new InternalServerError('Tool returned no output');
    }
  }

  /**
   * Rate limiting
   */
  private async checkRateLimit(toolId: string, userId: string): Promise<void> {
    const limiter = this.rateLimiters.get(toolId);
    if (!limiter) return;

    const allowed = await limiter.checkLimit(userId);
    if (!allowed) {
      throw new RateLimitError('Rate limit exceeded');
    }
  }

  /**
   * Event handling
   */
  private async setupEventSubscriptions(): Promise<void> {
    await this.eventBusService.subscribe('tool.register', this.handleToolRegistration.bind(this));
    await this.eventBusService.subscribe(
      'tool.execute.request',
      this.handleToolExecution.bind(this)
    );
    await this.eventBusService.subscribe('tool.status.check', this.handleStatusCheck.bind(this));
  }

  private async handleToolRegistration(event: unknown): Promise<void> {
    const eventData = this.asRecord(event);
    const toolData = eventData.tool;
    if (!isToolDefinition(toolData)) {
      logger.warn('handleToolRegistration: invalid tool payload', { event });
      return;
    }
    try {
      await this.registerTool(toolData);
    } catch (error) {
      logger.error('Failed to handle tool registration', { error, toolData });
    }
  }

  private async handleToolExecution(event: unknown): Promise<void> {
    const eventData = this.asRecord(event);
    const requestId = typeof eventData.requestId === 'string' ? eventData.requestId : '';
    const securityContextRaw = this.asRecord(eventData.securityContext);
    const securityContext = {
      level: typeof securityContextRaw.level === 'number' ? securityContextRaw.level : 0,
      permissions: Array.isArray(securityContextRaw.permissions)
        ? securityContextRaw.permissions.filter((p): p is string => typeof p === 'string')
        : undefined,
    };
    const toolId = typeof eventData.toolId === 'string' ? eventData.toolId : '';
    const operation = typeof eventData.operation === 'string' ? eventData.operation : '';
    try {
      const result = await this.executeTool({
        toolId,
        operation,
        parameters: eventData.parameters,
        userId: typeof eventData.userId === 'string' ? eventData.userId : undefined,
        agentId: typeof eventData.agentId === 'string' ? eventData.agentId : undefined,
        securityContext,
      });
      await this.eventBusService.publish(`tool.response.${requestId}`, result);
    } catch (error) {
      await this.eventBusService.publish(`tool.response.${requestId}`, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleStatusCheck(event: unknown): Promise<void> {
    const eventData = this.asRecord(event);
    const requestId = typeof eventData.requestId === 'string' ? eventData.requestId : '';
    const status = {
      tools: Array.from(this.tools.keys()),
      toolCount: this.tools.size,
      adaptersLoaded: this.toolInstances.size,
    };
    await this.eventBusService.publish(`tool.status.response.${requestId}`, status);
  }

  /**
   * Utility methods
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private auditLog(event: string, data: unknown): void {
    const auditData = this.asRecord(data);
    logger.info(`AUDIT: ${event}`, {
      ...auditData,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true,
    });
  }

  private auditToolExecution(
    executionId: string,
    request: unknown,
    operation: ToolOperation | null,
    success: boolean,
    error?: string
  ): void {
    const req = this.asRecord(request);
    const securityContext = this.asRecord(req.securityContext);
    const auditEntry: Record<string, unknown> = {
      executionId,
      toolId: req.toolId,
      operation: req.operation,
      userId: req.userId,
      agentId: req.agentId,
      success,
      error,
      securityLevel: securityContext.level,
      auditLevel: operation?.auditLevel || 'standard',
      timestamp: new Date().toISOString(),
    };

    if (operation?.auditLevel === 'comprehensive') {
      // Include request/response data for comprehensive auditing
      auditEntry['requestData'] = req.parameters;
    }

    this.auditLog('TOOL_EXECUTION', auditEntry);
  }
}

/**
 * Simple rate limiter implementation
 */
class RateLimiter {
  private config: RateLimitConfig;
  private requests = new Map<string, number[]>();

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  async checkLimit(userId: string): Promise<boolean> {
    const key = this.config.perUser ? userId : 'global';
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];

    // Remove old requests outside window
    const validRequests = userRequests.filter((time) => now - time < this.config.window);

    if (validRequests.length >= this.config.requests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(key, validRequests);

    return true;
  }
}
