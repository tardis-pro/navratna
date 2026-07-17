// MCP Client Service - Complete JSON-RPC 2.0 Implementation
// Handles MCP server lifecycle, communication, and tool execution
// Part of capability-registry microservice

import { spawn, ChildProcess } from 'child_process';
import { Readable } from 'stream';
import { EventEmitter } from 'events';
import { logger, ExternalServiceError, NotFoundError } from '@uaip/utils';
import { ToolCategory, MCPServerType, MCPServerCapabilities } from '@uaip/types';
import { ToolGraphDatabase, SecurityLevel, ToolService, AgentService, MCPOutputValidator, ADMIN_ORG_ID } from '@uaip/shared-services';
import type { NewMCPServer } from '@uaip/shared-services/drizzle/control';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra';
import { encryptHeaders, decryptHeaders, resolveEnvRefs } from '../utils/mcp_secrets.js';
import { McpRepository } from '../database/index.js';

import { promisify } from 'util';
import { exec, execFile } from 'child_process';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Stdio MCP servers are launched by spawning `command` with the gateway's full
 * environment. That makes `command` a remote-code-execution surface: even an
 * authenticated admin must only be able to start a known package launcher, never
 * an arbitrary host binary or absolute path. Only these launchers are permitted;
 * the actual server package is passed via `args` (which spawn treats as literal
 * argv, not shell input).
 */
const ALLOWED_STDIO_LAUNCHERS: ReadonlySet<string> = new Set([
  'npx',
  'bunx',
  'node',
  'bun',
  'deno',
  'python',
  'python3',
  'uv',
  'uvx',
  'docker',
]);

/**
 * Rejects any stdio launch command that is not an allowlisted launcher. Guards
 * against path traversal / absolute paths (`/bin/sh`, `../evil`), shell
 * metacharacters (defense-in-depth even though spawn runs without a shell), and
 * unknown binaries. Throws ExternalServiceError (surfaced as 4xx) on violation.
 */
function assertSafeStdioCommand(command: string | undefined): asserts command is string {
  const value = (command ?? '').trim();
  if (!value) {
    throw new ExternalServiceError('stdio MCP server requires a command');
  }
  if (/[/\\]/.test(value) || value.includes('..')) {
    throw new ExternalServiceError(
      `MCP command must be a bare launcher name, not a path: '${command}'`
    );
  }
  if (/[;&|`$(){}<>*?!\s'"]/.test(value)) {
    throw new ExternalServiceError(`MCP command contains disallowed characters: '${command}'`);
  }
  if (!ALLOWED_STDIO_LAUNCHERS.has(value)) {
    throw new ExternalServiceError(
      `MCP command '${command}' is not an allowed launcher. Allowed: ${[...ALLOWED_STDIO_LAUNCHERS].join(', ')}`
    );
  }
}

const toolCategoryValues = new Set<unknown>(Object.values(ToolCategory));
function isToolCategory(v: unknown): v is ToolCategory { return toolCategoryValues.has(v); }

// JSON-RPC 2.0 Message Types
interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

function isJSONRPCResponse(v: unknown): v is JSONRPCResponse {
  if (typeof v !== 'object' || v === null) return false;
  return 'jsonrpc' in v && (
    'result' in v || 'error' in v
  );
}

type MCPEventData = {
  serverName?: string;
  toolName?: string;
  parameters?: Record<string, unknown>;
  config?: MCPServerConfig;
  agentId?: string;
  userId?: string;
  conversationId?: string;
  operationId?: string;
  sessionId?: string;
  requestId?: string;
  toolId?: string;
};

function isMCPEventData(v: unknown): v is MCPEventData {
  return typeof v === 'object' && v !== null;
}

function isMCPServerCapabilities(v: unknown): v is MCPServerCapabilities {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  return Object.values(v).every((val: unknown) => typeof val === 'string');
}


interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

// MCP Server Configuration
interface MCPServerConfig {
  command?: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  transportType?: 'stdio' | 'http' | 'streamable-http';
  httpUrl?: string;
  httpHeaders?: Record<string, string>;
}

// MCP Resource Types
interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverName?: string;
  discoveredAt?: string;
  annotations?: {
    audience?: string[];
    priority?: number;
  };
}

interface MCPPrompt {
  name: string;
  description?: string;
  serverName?: string;
  discoveredAt?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema: unknown;
  capabilities?: string[];
}

// MCP Server State
interface MCPServerState {
  name: string;
  config: MCPServerConfig;
  process?: ChildProcess;
  transportType: 'stdio' | 'http' | 'streamable-http';
  httpUrl?: string;
  httpHeaders?: Record<string, string>;
  status: 'stopped' | 'starting' | 'running' | 'error' | 'stopping';
  pid?: number;
  startTime?: Date;
  lastHealthCheck?: Date;
  error?: string;
  capabilities?: MCPServerCapabilities;
  tools?: MCPTool[];
  resources?: MCPResource[];
  prompts?: MCPPrompt[];
  logs: string[];
  stats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    uptime: number;
  };
}

export class MCPClientService extends EventEmitter {
  private static instance: MCPClientService;
  private servers = new Map<string, MCPServerState>();
  private requestId = 0;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timestamp: number;
    }
  >();

  private healthCheckInterval?: NodeJS.Timeout;
  private eventBusService?: EventBusService;
  /** Kept for ToolService/AgentService usage (tool assignment to agents) */
  private databaseService?: DatabaseService;
  private toolGraphDatabase?: ToolGraphDatabase;
  /** Execution Plane repository — owns all MCP DB access. */
  private mcpRepo?: McpRepository;
  private mcpOutputValidator: MCPOutputValidator;

  private constructor() {
    super();
    this.mcpOutputValidator = MCPOutputValidator.getInstance();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private asRecordArray(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      : [];
  }

  private recordToMCPTool(r: Record<string, unknown>): MCPTool {
    return {
      name: typeof r.name === 'string' ? r.name : '',
      description: typeof r.description === 'string' ? r.description : undefined,
      inputSchema: r.inputSchema ?? {},
      capabilities: Array.isArray(r.capabilities) ? r.capabilities.map(String) : undefined,
    };
  }

  private recordToMCPResource(r: Record<string, unknown>): MCPResource {
    return {
      uri: typeof r.uri === 'string' ? r.uri : '',
      name: typeof r.name === 'string' ? r.name : '',
      description: typeof r.description === 'string' ? r.description : undefined,
      mimeType: typeof r.mimeType === 'string' ? r.mimeType : undefined,
      serverName: typeof r.serverName === 'string' ? r.serverName : undefined,
      discoveredAt: typeof r.discoveredAt === 'string' ? r.discoveredAt : undefined,
    };
  }

  private recordToMCPPrompt(r: Record<string, unknown>): MCPPrompt {
    return {
      name: typeof r.name === 'string' ? r.name : '',
      description: typeof r.description === 'string' ? r.description : undefined,
      serverName: typeof r.serverName === 'string' ? r.serverName : undefined,
      discoveredAt: typeof r.discoveredAt === 'string' ? r.discoveredAt : undefined,
      arguments: Array.isArray(r.arguments)
        ? r.arguments
            .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
            .map((a) => ({
              name: typeof a.name === 'string' ? a.name : '',
              description: typeof a.description === 'string' ? a.description : undefined,
              required: typeof a.required === 'boolean' ? a.required : undefined,
            }))
        : undefined,
    };
  }
  async initialize(
    eventBusService?: EventBusService,
    databaseService?: DatabaseService,
    mcpRepository?: McpRepository
  ): Promise<void> {
    this.eventBusService = eventBusService;
    this.databaseService = databaseService;
    this.mcpRepo = mcpRepository;

    // Initialize ToolGraphDatabase for Neo4j integration
    try {
      this.toolGraphDatabase = new ToolGraphDatabase();
      await this.toolGraphDatabase.verifyConnectivity();
      logger.info('ToolGraphDatabase initialized for MCP integration');
    } catch (error) {
      logger.warn(
        'ToolGraphDatabase initialization failed, continuing without graph features:',
        error
      );
    }

    // Setup event subscriptions for MCP management
    await this.setupEventSubscriptions();

    // Start health checking
    this.setupHealthChecking();

    // Auto-start configured servers
    await this.autoStartServers();

    logger.info('MCP Client Service initialized');
  }

  public static getInstance(): MCPClientService {
    if (!MCPClientService.instance) {
      MCPClientService.instance = new MCPClientService();
    }
    return MCPClientService.instance;
  }

  // Server Lifecycle Management
  async startServer(serverName: string): Promise<void> {
    let config = await this.loadServerConfig(serverName);
    if (!config) {
      throw new NotFoundError(`Server configuration not found: ${serverName}`);
    }

    if (this.servers.has(serverName)) {
      const server = this.servers.get(serverName)!;
      if (server.status === 'running') {
        logger.info(`MCP server ${serverName} is already running`);
        return;
      }
    }

    // For HTTP-based servers, skip command validation entirely
    const isHttp = config.transportType === 'http' || config.transportType === 'streamable-http';

    if (!isHttp) {
      // Fail closed on an unsafe launcher before doing anything else — this guards
      // both freshly-installed configs and any pre-existing/seeded config that
      // predates the allowlist.
      assertSafeStdioCommand(config.command);
      // Validate command exists before attempting to start
      const commandValidation = await this.validateCommand(config.command!);
      if (!commandValidation.isValid) {
        logger.warn(
          `Command '${config.command}' not found for server ${serverName}. ${commandValidation.suggestion}`
        );

        // Try fallback configuration if available
        if (commandValidation.fallbackConfig) {
          logger.info(`Attempting fallback configuration for ${serverName}`);
          config = commandValidation.fallbackConfig;

          // Validate the fallback command
          const fallbackValidation = await this.validateCommand(config.command!);
          if (!fallbackValidation.isValid) {
            const error = `Both primary and fallback commands failed for ${serverName}. ${commandValidation.suggestion}`;
            logger.error(error);
            throw new ExternalServiceError(error);
          }
        } else {
          const error = `Command '${config.command}' not found. ${commandValidation.suggestion}`;
          logger.error(`Cannot start MCP server ${serverName}: ${error}`);
          throw new ExternalServiceError(error);
        }
      }
    }

    logger.info(`Starting MCP server: ${serverName}`, config);

    const serverState: MCPServerState = {
      name: serverName,
      config,
      status: 'starting',
      transportType: config.transportType || 'stdio',
      httpUrl: config.httpUrl,
      httpHeaders: config.httpHeaders,
      logs: [],
      stats: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        uptime: 0,
      },
    };

    this.servers.set(serverName, serverState);

    try {
      if (isHttp) {
        // HTTP transport: the remote server is always 'running'.
        // Set status to running BEFORE initializeConnection so sendRequest
        // doesn't reject the call with 'not running'.
        serverState.startTime = new Date();
        serverState.status = 'running';
        try {
          await this.initializeConnection(serverName);
          this.emit('serverStarted', { serverName });
          await this.publishEvent('mcp.server.started', { serverName });
          logger.info(`MCP HTTP server connected: ${serverName} (${config.httpUrl})`);
        } catch (initErr) {
          // Remote endpoint reachable but init failed — log and keep 'running' so
          // retries are possible; capability discovery can be retried later.
          logger.warn(
            `MCP HTTP server ${serverName}: init failed, will retry on next health check`,
            initErr
          );
        }
      } else {
        const childProcess = spawn(config.command!, config.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...config.env },
          cwd: config.cwd || process.cwd(),
        });

        serverState.process = childProcess;
        serverState.pid = childProcess.pid;
        serverState.startTime = new Date();

        // Setup process event handlers
        this.setupProcessHandlers(serverName, childProcess);

        // Initialize MCP connection
        await this.initializeConnection(serverName);

        serverState.status = 'running';
        this.emit('serverStarted', { serverName, pid: childProcess.pid });
        await this.publishEvent('mcp.server.started', { serverName, pid: childProcess.pid });
        logger.info(`MCP server started successfully: ${serverName} (PID: ${childProcess.pid})`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      serverState.status = 'error';
      serverState.error = err.message;
      this.emit('serverError', { serverName, error: err.message });
      throw error;
    }
  }

  async stopServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) {
      logger.warn(`Attempted to stop non-running server: ${serverName}`);
      return;
    }

    // HTTP servers have no subprocess — just mark as stopped
    if (server.transportType !== 'stdio') {
      server.status = 'stopped';
      this.emit('serverStopped', { serverName });
      logger.info(`MCP HTTP server disconnected: ${serverName}`);
      return;
    }

    if (!server.process) {
      logger.warn(`Attempted to stop server with no process: ${serverName}`);
      return;
    }

    logger.info(`Stopping MCP server: ${serverName}`);
    server.status = 'stopping';

    return new Promise((resolve) => {
      const childProcess = server.process!;

      childProcess.on('exit', () => {
        server.status = 'stopped';
        server.process = undefined;
        server.pid = undefined;
        this.emit('serverStopped', { serverName });
        logger.info(`MCP server stopped: ${serverName}`);
        resolve();
      });

      // Try graceful shutdown first
      childProcess.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (server.status === 'stopping') {
          childProcess.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  async restartServer(serverName: string): Promise<void> {
    await this.stopServer(serverName);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Brief pause
    await this.startServer(serverName);
  }

  // JSON-RPC 2.0 Communication
  private async sendRequest(
    serverName: string,
    method: string,
    params?: unknown
  ): Promise<unknown> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') {
      throw new ExternalServiceError(`Server ${serverName} is not running`);
    }

    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    server.stats.totalRequests++;

    // HTTP / Streamable-HTTP transport
    if (server.transportType === 'http' || server.transportType === 'streamable-http') {
      const url = server.httpUrl!;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(server.httpHeaders || {}),
      };
      const startTime = Date.now();
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
        });
        if (!resp.ok) {
          throw new ExternalServiceError(`HTTP ${resp.status} ${resp.statusText}`);
        }
        const contentType = resp.headers.get('content-type') || '';
        let result: unknown;
        if (contentType.includes('text/event-stream')) {
          result = await this.readSSEResponse(resp);
        } else {
          const rawBody: unknown = await resp.json();
          if (!isJSONRPCResponse(rawBody)) {
            throw new ExternalServiceError('Invalid JSON-RPC response format');
          }
          if (rawBody.error) {
            throw new ExternalServiceError(`${rawBody.error.message} (${rawBody.error.code})`);
          }
          result = rawBody.result;
        }
        server.stats.successfulRequests++;
        server.stats.averageResponseTime =
          (server.stats.averageResponseTime + (Date.now() - startTime)) / 2;
        this.addLog(serverName, `→ ${method}: ${JSON.stringify(params)}`);
        return result;
      } catch (error) {
        server.stats.failedRequests++;
        throw error;
      }
    }

    // stdio transport — original promise-based approach
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        server.stats.failedRequests++;
        reject(new Error(`Request timeout for ${method} on ${serverName}`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          server.stats.successfulRequests++;
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          server.stats.failedRequests++;
          reject(error);
        },
        timestamp: Date.now(),
      });

      const message = JSON.stringify(request) + '\n';
      server.process!.stdin?.write(message);

      this.addLog(serverName, `→ ${method}: ${JSON.stringify(params)}`);
    });
  }

  private sendNotification(serverName: string, method: string, params?: unknown): void {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') {
      return;
    }
    // HTTP transport is request/response only — no notification channel
    if (server.transportType !== 'stdio' || !server.process) {
      return;
    }

    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification) + '\n';
    server.process!.stdin?.write(message);

    this.addLog(serverName, `→ ${method} (notification): ${JSON.stringify(params)}`);
  }

  // MCP Protocol Implementation
  private async initializeConnection(serverName: string): Promise<void> {
    try {
      const initializeParams = {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {},
        },
        clientInfo: {
          name: 'UAIP-MCPClient',
          version: '1.0.0',
        },
      };

      const response = await this.sendRequest(serverName, 'initialize', initializeParams);
      const responseData = this.asRecord(response);

      const server = this.servers.get(serverName)!;
      server.capabilities = isMCPServerCapabilities(responseData.capabilities)
        ? responseData.capabilities
        : undefined;

      // Send initialized notification
      this.sendNotification(serverName, 'initialized');

      // Discover available tools
      await this.discoverTools(serverName);

      logger.info(`MCP connection initialized for ${serverName}`, responseData);
    } catch (error) {
      logger.error(`Failed to initialize MCP connection for ${serverName}:`, error);
      throw error;
    }
  }

  private async discoverTools(serverName: string): Promise<void> {
    try {
      const server = this.servers.get(serverName)!;

      // Get available tools
      const capabilities = this.asRecord(server.capabilities);
      if (capabilities.tools) {
        const toolsResponse = await this.sendRequest(serverName, 'tools/list');
        const data = this.asRecord(toolsResponse);
        server.tools = this.asRecordArray(data.tools).map((r) => this.recordToMCPTool(r));
      }

      // Get available resources
      if (capabilities.resources) {
        const resourcesResponse = await this.sendRequest(serverName, 'resources/list');
        const data = this.asRecord(resourcesResponse);
        server.resources = this.asRecordArray(data.resources).map((r) => this.recordToMCPResource(r));
      }

      // Get available prompts
      if (capabilities.prompts) {
        const promptsResponse = await this.sendRequest(serverName, 'prompts/list');
        const data = this.asRecord(promptsResponse);
        server.prompts = this.asRecordArray(data.prompts).map((r) => this.recordToMCPPrompt(r));
      }

      // Auto-register discovered tools in the tool registry
      await this.registerDiscoveredTools(serverName, server.tools || []);

      this.emit('toolsDiscovered', {
        serverName,
        tools: server.tools,
        resources: server.resources,
        prompts: server.prompts,
      });

      await this.publishEvent('mcp.tools.discovered', {
        serverName,
        toolCount: server.tools?.length || 0,
        resourceCount: server.resources?.length || 0,
        promptCount: server.prompts?.length || 0,
        tools: server.tools,
        resources: server.resources,
        prompts: server.prompts,
      });
    } catch (error) {
      logger.error(`Failed to discover tools for ${serverName}:`, error);
    }
  }

  // Auto-register discovered MCP tools in the tool registry
  private async registerDiscoveredTools(serverName: string, tools: unknown[]): Promise<void> {
    try {
      for (const tool of tools) {
        const mcpTool = this.asRecord(tool);
        const toolRegistration = {
          id: `mcp-${serverName}-${String(mcpTool.name || '')}`,
          name: String(mcpTool.name || ''),
          description:
            (typeof mcpTool.description === 'string' ? mcpTool.description : undefined) ||
            `${String(mcpTool.name || '')} from ${serverName} MCP server`,
          category: ToolCategory.API,
          version: '1.0.0',
          isEnabled: true,
          requiresApproval: false,
          costEstimate: 0.01,
          executionTimeEstimate: 5000,
          metadata: {
            mcpServer: serverName,
            mcpTool: String(mcpTool.name || ''),
            inputSchema:
              mcpTool.inputSchema && typeof mcpTool.inputSchema === 'object'
                ? mcpTool.inputSchema
                : {},
            protocol: 'mcp',
            // serverConfig intentionally omitted — never publish secrets to event bus
          },
        };

        // Publish tool registration event for the tool registry
        // eslint-disable-next-line no-await-in-loop -- sequential processing required
        await this.publishEvent('tool.register', {
          tool: toolRegistration,
          source: 'mcp-discovery',
          serverName,
        });

        // Also publish to agents for dynamic discovery
        // eslint-disable-next-line no-await-in-loop -- sequential processing required
        await this.publishEvent('agent.tool.available', {
          toolId: toolRegistration.id,
          toolName: String(mcpTool.name || ''),
          serverName,
          description: mcpTool.description,
          inputSchema: mcpTool.inputSchema,
          capabilities: Array.isArray(mcpTool.capabilities) ? mcpTool.capabilities : [],
          source: 'mcp-discovery',
        });

        // Register tool in Neo4j knowledge graph if available
        // eslint-disable-next-line no-await-in-loop -- sequential processing required
        await this.registerToolInGraph(toolRegistration, serverName, mcpTool);

        logger.info(`Auto-registered MCP tool: ${toolRegistration.id} from ${serverName}`);
      }
    } catch (error) {
      logger.error(`Failed to register tools from ${serverName}:`, error);
    }
  }

  // Register tool in Neo4j knowledge graph
  private async registerToolInGraph(
    toolRegistration: Record<string, unknown>,
    serverName: string,
    mcpTool: Record<string, unknown>
  ): Promise<void> {
    if (!this.toolGraphDatabase) {
      return; // Gracefully skip if graph database not available
    }

    try {
      await this.toolGraphDatabase.createToolNode(
        {
          id: String(toolRegistration.id || ''),
          name: String(toolRegistration.name || ''),
          description: String(toolRegistration.description || ''),
          category: isToolCategory(toolRegistration.category) ? toolRegistration.category : ToolCategory.API,
          version: String(toolRegistration.version || '1.0.0'),
          tags: Array.isArray(mcpTool.capabilities) ? mcpTool.capabilities : [],
          securityLevel: SecurityLevel.LOW,
          isEnabled: Boolean(toolRegistration.isEnabled),
          requiresApproval: Boolean(toolRegistration.requiresApproval),
          dependencies: [],
          parameters:
            mcpTool.inputSchema && typeof mcpTool.inputSchema === 'object' ? mcpTool.inputSchema : {},
          returnType: {},
          examples: [],
          executionTimeEstimate:
            typeof toolRegistration.executionTimeEstimate === 'number'
              ? toolRegistration.executionTimeEstimate
              : 0,
          costEstimate:
            typeof toolRegistration.costEstimate === 'number' ? toolRegistration.costEstimate : 0,
          author: 'mcp-system',
        },
        ADMIN_ORG_ID
      );

      await this.toolGraphDatabase.createMcpServerNode(
        {
          id: serverName,
          name: serverName,
          type: 'mcp',
          status: 'active',
          capabilities: this.servers.get(serverName)?.capabilities,
          tags: ['mcp', 'external'],
          metadata: {
            config: this.servers.get(serverName)?.config,
            registeredAt: new Date().toISOString(),
          },
        },
        ADMIN_ORG_ID
      );

      // Link tool to MCP server
      await this.toolGraphDatabase.linkToolToMcpServer(
        String(toolRegistration.id || ''),
        serverName
      );

      // Analyze and create relationships with similar tools
      await this.createToolRelationships(String(toolRegistration.id || ''), mcpTool);

      logger.debug(
        `Tool ${String(toolRegistration.id || '')} successfully registered in knowledge graph`
      );
    } catch (error) {
      logger.warn(
        `Failed to register tool ${String(toolRegistration.id || '')} in knowledge graph:`,
        error
      );
      // Don't throw - this is supplementary functionality
    }
  }

  // Create relationships between tools based on capabilities and categories
  private async createToolRelationships(
    toolId: string,
    mcpTool: Record<string, unknown>
  ): Promise<void> {
    if (!this.toolGraphDatabase) {
      return;
    }

    try {
      // Find similar tools based on capabilities
      const capabilities = Array.isArray(mcpTool.capabilities)
        ? mcpTool.capabilities.map(String)
        : [];
      if (capabilities.length > 0) {
        const relatedTools = await this.toolGraphDatabase.getRelatedTools(
          toolId,
          'default',
          ['SIMILAR_TO'],
          0.4
        );

        // Create SIMILAR_TO relationships for tools with shared capabilities
        for (const relatedTool of relatedTools.slice(0, 3)) {
          // Limit to top 3 similar tools
          if (relatedTool.id !== toolId) {
            // eslint-disable-next-line no-await-in-loop -- sequential processing required
            await this.toolGraphDatabase.addToolRelationship(toolId, relatedTool.id, {
              type: 'SIMILAR_TO',
              strength: 0.7,
              reason: `Shared capabilities: ${capabilities.join(', ')}`,
              metadata: {
                sharedCapabilities: capabilities,
                createdBy: 'mcp-auto-discovery',
              },
            });
          }
        }
      }

      // Create enhancement relationships for complementary tools
      const enhancementKeywords = ['enhance', 'improve', 'extend', 'augment'];
      const toolName = typeof mcpTool.name === 'string' ? mcpTool.name.toLowerCase() : '';
      const toolDescription =
        typeof mcpTool.description === 'string' ? mcpTool.description.toLowerCase() : '';

      if (
        enhancementKeywords.some(
          (keyword) => toolName.includes(keyword) || toolDescription.includes(keyword)
        )
      ) {
        // Find tools that this tool might enhance
        const potentialTargets = await this.toolGraphDatabase.getRelatedTools(toolId, 'default', [], 0.3);
        for (const target of potentialTargets.slice(0, 2)) {
          if (target.id !== toolId && !target.id.startsWith('mcp-')) {
            // eslint-disable-next-line no-await-in-loop -- sequential processing required
            await this.toolGraphDatabase.addToolRelationship(toolId, target.id, {
              type: 'ENHANCES',
              strength: 0.6,
              reason: 'Tool appears to enhance functionality based on name/description',
              metadata: {
                detectionMethod: 'keyword-analysis',
                createdBy: 'mcp-auto-discovery',
              },
            });
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to create tool relationships for ${toolId}:`, error);
    }
  }

  // Tool Execution with Database Persistence
  async executeTool(
    serverName: string,
    toolName: string,
    parameters: unknown,
    context?: {
      agentId?: string;
      userId?: string;
      conversationId?: string;
      operationId?: string;
      sessionId?: string;
    }
  ): Promise<unknown> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') {
      throw new ExternalServiceError(`Server ${serverName} is not running`);
    }

    let jobId: string | null = null;

    try {
      // Create job record in database if DatabaseService is available
      if (this.mcpRepo) {
        const mcpService = this.mcpRepo;
        const toolCall = await mcpService.createToolCall({
          serverId: serverName,
          toolName,
          parameters,
          agentId: context?.agentId,
          userId: context?.userId,
          conversationId: context?.conversationId,
          operationId: context?.operationId,
          sessionId: context?.sessionId,
          securityLevel: 'medium',
        });
        jobId = toolCall.id;

        // Start the job
        await mcpService.startToolCall(jobId);
      }

      const startTime = Date.now();

      const response = await this.sendRequest(serverName, 'tools/call', {
        name: toolName,
        arguments: parameters,
      });

      const executionTime = Date.now() - startTime;
      server.stats.averageResponseTime = (server.stats.averageResponseTime + executionTime) / 2;

      this.addLog(serverName, `← ${toolName}: ${JSON.stringify(response).substring(0, 100)}...`);

      const tool = server.tools?.find((t) => t.name === toolName);
      const outputSchema = (tool && typeof tool === 'object' && 'outputSchema' in tool)
        ? (tool as { outputSchema: object }).outputSchema
        : {};
      const sanitized = this.mcpOutputValidator.sanitizeOutput(toolName, outputSchema, response);
      const safeResponse = sanitized.sanitized;

      if (sanitized.injectionFlags.length > 0) {
        logger.warn('MCP tool response quarantined due to injection flags', {
          serverName,
          toolName,
          injectionFlags: sanitized.injectionFlags,
        });
      }

      if (this.mcpRepo && jobId) {
        const mcpService = this.mcpRepo;
        await mcpService.completeToolCall(jobId, safeResponse, executionTime);
      }

      await this.trackToolExecution(
        serverName,
        toolName,
        executionTime,
        true,
        context?.agentId,
        jobId
      );

      await this.publishEvent('mcp.tool.executed', {
        serverName,
        toolName,
        parameters,
        result: safeResponse,
        executionTimeMs: executionTime,
        success: true,
        jobId,
        strippedFields: sanitized.stripped,
        injectionFlags: sanitized.injectionFlags,
        ...context,
      });

      return safeResponse;
    } catch (error) {
      this.addLog(
        serverName,
        `✗ ${toolName}: ${error instanceof Error ? error.message : String(error)}`
      );

      // Fail the job in database
      if (this.mcpRepo && jobId) {
        const mcpService = this.mcpRepo;
        await mcpService.failToolCall(
          jobId,
          error instanceof Error ? error.message : String(error),
          'EXECUTION_ERROR',
          'execution'
        );
      }

      // Track failed tool execution in Neo4j graph
      const executionTime = Date.now() - (Date.now() - 1000); // Approximate execution time
      await this.trackToolExecution(
        serverName,
        toolName,
        executionTime,
        false,
        context?.agentId,
        jobId
      );

      // Publish failure event
      await this.publishEvent('mcp.tool.failed', {
        serverName,
        toolName,
        parameters,
        error: error instanceof Error ? error.message : String(error),
        success: false,
        jobId,
        ...context,
      });

      throw error;
    }
  }

  // Track tool execution in Neo4j graph
  private async trackToolExecution(
    serverName: string,
    toolName: string,
    executionTime: number,
    success: boolean,
    agentId?: string,
    jobId?: string | null
  ): Promise<void> {
    if (!this.toolGraphDatabase) {
      return;
    }

    try {
      const toolId = `mcp-${serverName}-${toolName}`;

      // Update or create agent usage pattern if agentId provided
      if (agentId) {
        await this.toolGraphDatabase.incrementUsage(agentId, toolId, executionTime, success);

        await this.toolGraphDatabase.createAgentNode(
          {
            id: agentId,
            name: `Agent-${agentId}`,
            role: 'assistant',
            isActive: true,
            capabilities: [],
          },
          ADMIN_ORG_ID
        );
      }

      // Create MCP tool call record in Neo4j
      if (jobId) {
        await this.toolGraphDatabase.createMcpToolCallNode({
          id: jobId,
          serverId: serverName,
          toolName,
          status: success ? 'completed' : 'failed',
          duration: executionTime,
          agentId,
          timestamp: new Date(),
          metadata: {
            executionTimeMs: executionTime,
            success,
            serverName,
          },
        });
      }

      logger.debug(
        `Tool execution tracked: ${toolId} (success: ${success}, time: ${executionTime}ms)`
      );
    } catch (error) {
      logger.warn(`Failed to track tool execution in graph for ${toolName}:`, error);
    }
  }

  // Process Management
  private setupProcessHandlers(serverName: string, process: ChildProcess): void {
    const server = this.servers.get(serverName)!;

    process.stdout?.on('data', (data) => {
      const lines = data
        .toString()
        .split('\n')
        .filter((line: string) => line.trim());

      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(serverName, message);
        } catch {
          // Not JSON, treat as log
          this.addLog(serverName, `stdout: ${line}`);
        }
      }
    });

    process.stderr?.on('data', (data) => {
      const error = data.toString().trim();
      this.addLog(serverName, `stderr: ${error}`);
      logger.warn(`MCP server ${serverName} stderr:`, error);
    });

    process.on('exit', (code, signal) => {
      server.status = 'stopped';
      server.process = undefined;
      server.pid = undefined;

      this.addLog(serverName, `Process exited: code=${code}, signal=${signal}`);
      this.emit('serverStopped', { serverName, code, signal });

      if (code !== 0) {
        logger.error(`MCP server ${serverName} exited with code ${code}`);
        server.status = 'error';
        server.error = `Process exited with code ${code}`;
      }
    });

    process.on('error', (error) => {
      server.status = 'error';
      server.error = error.message;
      this.addLog(serverName, `Process error: ${error.message}`);
      this.emit('serverError', { serverName, error: error.message });
      logger.error(`MCP server ${serverName} process error:`, error);
    });
  }

  private handleMessage(serverName: string, message: unknown): void {
    const payload = this.asRecord(message);
    if (payload.id !== undefined) {
      // Response to our request
      const requestId = typeof payload.id === 'string' || typeof payload.id === 'number' ? payload.id : undefined;
      const pendingRequest = requestId !== undefined ? this.pendingRequests.get(requestId) : undefined;
      if (pendingRequest && requestId !== undefined) {
        this.pendingRequests.delete(requestId);

        const errorData = this.asRecord(payload.error);
        if (payload.error) {
          pendingRequest.reject(
            new Error(
              `${String(errorData.message || 'Unknown error')} (${String(errorData.code || 'UNKNOWN')})`
            )
          );
        } else {
          pendingRequest.resolve(payload.result);
        }
      }
    } else if (payload.method) {
      // Notification from server
      this.handleNotification(serverName, payload);
    }
  }

  private handleNotification(serverName: string, notification: unknown): void {
    const payload = this.asRecord(notification);
    this.addLog(serverName, `← ${String(payload.method)}: ${JSON.stringify(payload.params)}`);
    this.emit('notification', { serverName, notification: payload });

    // Handle specific notifications
    switch (payload.method) {
      case 'notifications/tools/list_changed':
        this.discoverTools(serverName);
        break;
      case 'notifications/resources/list_changed':
        this.discoverTools(serverName);
        break;
    }
  }

  // Command Validation with Fallback Options
  private async validateCommand(command: string): Promise<{
    isValid: boolean;
    suggestion?: string;
    fallbackConfig?: MCPServerConfig;
  }> {
    try {
      // Try to find the command using 'which' (Unix) or 'where' (Windows).
      // Pass the command as an argv element (execFile, no shell) so it can never
      // be interpreted as shell syntax.
      const whichCommand = process.platform === 'win32' ? 'where' : 'which';
      await execFileAsync(whichCommand, [command]);
      return { isValid: true };
    } catch {
      // Command not found, provide helpful suggestions and fallbacks
      let suggestion = '';
      let fallbackConfig: MCPServerConfig | undefined;

      switch (command) {
        case 'uvx':
          suggestion =
            'Install uv with: curl -LsSf https://astral.sh/uv/install.sh | sh, then restart your terminal.';
          // Try python fallback for MCP servers that support it
          const pythonAvailable =
            (await this.isCommandAvailable('python3')) || (await this.isCommandAvailable('python'));
          if (pythonAvailable) {
            const pythonCmd = (await this.isCommandAvailable('python3')) ? 'python3' : 'python';
            suggestion += ` Alternatively, you can try using python directly.`;
            fallbackConfig = {
              command: pythonCmd,
              args: [
                '-m',
                'pip',
                'install',
                '--user',
                'mcp-server-duckduckgo',
                '&&',
                pythonCmd,
                '-m',
                'mcp_server_duckduckgo',
              ],
              env: {},
            };
          }
          break;
        case 'npx':
          suggestion = 'Install Node.js and npm from https://nodejs.org/';
          // Try node fallback
          if (await this.isCommandAvailable('node')) {
            suggestion += ' Alternatively, install packages globally and use node directly.';
          }
          break;
        case 'python':
        case 'python3':
          suggestion =
            'Install Python from https://python.org/ or use your system package manager.';
          break;
        case 'node':
          suggestion = 'Install Node.js from https://nodejs.org/';
          break;
        default:
          suggestion = `Make sure '${command}' is installed and available in your PATH.`;
      }

      return { isValid: false, suggestion, fallbackConfig };
    }
  }

  private async isCommandAvailable(command: string): Promise<boolean> {
    try {
      const whichCommand = process.platform === 'win32' ? 'where' : 'which';
      await execFileAsync(whichCommand, [command]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execution Mesh (spec 11) — expose an MCP server's transport + launch spec so
   * the scheduler can source a ToolRuntimeDescriptor and route stdio servers to a
   * docker-mcp node. Reuses loadServerConfig (DB-backed). Returns null when the
   * server is unknown / repo uninitialised, so the caller falls back to native.
   * Secrets (httpHeaders, secret env refs) are intentionally NOT returned.
   */
  async getMeshServerConfig(serverName: string): Promise<{
    transportType: 'stdio' | 'http' | 'streamable-http';
    command?: string;
    args: string[];
    env?: Record<string, string>;
    httpUrl?: string;
  } | null> {
    const cfg = (await this.loadServerConfig(serverName)) ?? null;
    if (!cfg) return null;
    return {
      transportType: cfg.transportType || 'stdio',
      command: cfg.command,
      args: cfg.args || [],
      env: cfg.env,
      httpUrl: cfg.httpUrl,
    };
  }

  // Configuration Management
  private async loadServerConfig(serverName: string): Promise<MCPServerConfig | null> {
    try {
      if (!this.mcpRepo) return null;
      const mcpService = this.mcpRepo;
      const entity = await mcpService.getServerByName(serverName);
      if (!entity) return null;
      return this.entityToConfig(entity);
    } catch (error) {
      logger.error(`Failed to load MCP config for ${serverName}:`, error);
      return null;
    }
  }

  async updateServerConfig(serverName: string, config: MCPServerConfig): Promise<void> {
    try {
      if (!this.mcpRepo) {
        throw new Error(`MCP repository not initialized: cannot update server config for ${serverName}`);
      }
      const mcpService = this.mcpRepo;
      const existing = await mcpService.getServerByName(serverName);
      const payload: NewMCPServer = {
        name: serverName,
        description: `MCP server ${serverName}`,
        type: MCPServerType.CUSTOM,
        command: config.command,
        args: config.args || [],
        env: config.env,
        workingDirectory: config.cwd,
        transportType: config.transportType || 'stdio',
        url: config.httpUrl,
        headers: config.httpHeaders ? encryptHeaders(config.httpHeaders) : undefined,
        author: 'system',
        version: '1.0.0',
        securityLevel: SecurityLevel.LOW,
        enabled: true,
        autoStart: true,
        retryAttempts: 3,
        healthCheckInterval: 30000,
        timeout: 30000,
        tags: [],
        requiresApproval: false,
      };
      if (existing) {
        await mcpService.updateServer(existing.id, payload);
      } else {
        await mcpService.createServer(payload);
      }
      logger.info(`Updated MCP server config for ${serverName}`);
      this.emit('configUpdated', { serverName, config });
    } catch (error) {
      logger.error(`Failed to update MCP config for ${serverName}:`, error);
      throw error;
    }
  }

  async installServer(serverName: string, config: MCPServerConfig): Promise<void> {
    const isHttp = config.transportType === 'http' || config.transportType === 'streamable-http';
    if (!isHttp) {
      // Reject an unsafe launcher before persisting it, so a bad config never
      // reaches the DB or a spawn. HTTP transports carry no command.
      assertSafeStdioCommand(config.command);
    }
    // Audit trail for a privileged, RCE-adjacent operation.
    logger.info('MCP server install requested', {
      serverName,
      transportType: config.transportType ?? 'stdio',
      command: isHttp ? undefined : config.command,
    });
    await this.updateServerConfig(serverName, config);
    await this.startServer(serverName);
    logger.info(`Installed and started MCP server: ${serverName}`);
  }

  async uninstallServer(serverName: string): Promise<void> {
    await this.stopServer(serverName);
    try {
      if (!this.mcpRepo) {
        throw new Error(`MCP repository not initialized: cannot uninstall server ${serverName}`);
      }
      const mcpService = this.mcpRepo;
      const existing = await mcpService.getServerByName(serverName);
      if (existing) {
        await mcpService.deleteServer(existing.id);
      }
      this.servers.delete(serverName);
      logger.info(`Uninstalled MCP server: ${serverName}`);
      this.emit('serverUninstalled', { serverName });
    } catch (error) {
      logger.error(`Failed to uninstall MCP server ${serverName}:`, error);
      throw error;
    }
  }

  // Health Monitoring
  private setupHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [serverName, server] of Array.from(this.servers.entries())) {
        if (server.status === 'running') {
          // eslint-disable-next-line no-await-in-loop -- sequential processing required
          await this.performHealthCheck(serverName);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private async performHealthCheck(serverName: string): Promise<void> {
    try {
      await this.sendRequest(serverName, 'ping');
      const server = this.servers.get(serverName)!;
      server.lastHealthCheck = new Date();
      server.stats.uptime = Date.now() - (server.startTime?.getTime() || Date.now());
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Health check failed for ${serverName}:`, errMsg);
      const server = this.servers.get(serverName)!;
      server.status = 'error';
      server.error = `Health check failed: ${errMsg}`;
      this.emit('serverError', { serverName, error: errMsg });
    }
  }

  // Logging
  private addLog(serverName: string, message: string): void {
    const server = this.servers.get(serverName);
    if (server) {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}`;

      server.logs.push(logEntry);

      // Keep only last 1000 log entries
      if (server.logs.length > 1000) {
        server.logs = server.logs.slice(-1000);
      }

      this.emit('log', { serverName, message: logEntry });
    }
  }

  // Public API
  getServerStatus(serverName: string): MCPServerState | null {
    return this.servers.get(serverName) || null;
  }

  getAllServers(): MCPServerState[] {
    return Array.from(this.servers.values());
  }

  getServerLogs(serverName: string, limit?: number): string[] {
    const server = this.servers.get(serverName);
    if (!server) return [];

    const logs = server.logs;
    return limit ? logs.slice(-limit) : logs;
  }

  async startAllServers(): Promise<void> {
    const config = await this.loadAllConfigs();
    const startPromises = Object.keys(config.mcpServers || {}).map((serverName) =>
      this.startServer(serverName).catch((error) =>
        logger.error(`Failed to start ${serverName}:`, error)
      )
    );

    await Promise.allSettled(startPromises);
  }

  async stopAllServers(): Promise<void> {
    const stopPromises = Array.from(this.servers.keys()).map((serverName) =>
      this.stopServer(serverName)
    );

    await Promise.allSettled(stopPromises);
  }

  private async loadAllConfigs(): Promise<{ mcpServers: Record<string, MCPServerConfig> }> {
    try {
      if (!this.mcpRepo) return { mcpServers: {} };
      const mcpService = this.mcpRepo;
      const entities = await mcpService.getAllServers();
      const mcpServers: Record<string, MCPServerConfig> = {};
      for (const entity of entities) {
        if (entity.enabled) {
          mcpServers[entity.name] = this.entityToConfig(entity);
        }
      }
      return { mcpServers };
    } catch (error) {
      logger.warn('Failed to load MCP configs from DB, using empty config:', error);
      return { mcpServers: {} };
    }
  }

  private entityToConfig(entity: unknown): MCPServerConfig {
    const e = this.asRecord(entity);
    let httpHeaders: Record<string, string> | undefined;
    if (typeof e.headers === 'string') {
      const decrypted = decryptHeaders(e.headers);
      httpHeaders = resolveEnvRefs(decrypted);
    }
    return {
      command: typeof e.command === 'string' ? e.command : undefined,
      args: Array.isArray(e.args) ? e.args.map(String) : [],
      env: isStringRecord(e.env) ? e.env : undefined,
      cwd: typeof e.workingDirectory === 'string' ? e.workingDirectory : undefined,
      transportType:
        e.transportType === 'http' || e.transportType === 'streamable-http'
          ? e.transportType
          : 'stdio',
      httpUrl: typeof e.url === 'string' ? e.url : undefined,
      httpHeaders,
    };
  }

  private async readSSEResponse(response: Response): Promise<unknown> {
    // Use response.text() for Bun compatibility (streaming ReadableStream is unreliable in Bun).
    // z.ai returns a single SSE event per request so buffering the full body is fine.
    const text = await response.text();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      // SSE data lines: 'data: {...}' or 'data:{...}' (no space is valid per spec)
      if (trimmed.startsWith('data:')) {
        const payload = trimmed.slice(5).replace(/^ /, ''); // strip optional leading space
        try {
          const parsedData: unknown = JSON.parse(payload);
          if (isJSONRPCResponse(parsedData) && (parsedData.result !== undefined || parsedData.error !== undefined)) {
            if (parsedData.error) {
              throw new ExternalServiceError(`${parsedData.error.message} (${parsedData.error.code})`);
            }
            return parsedData.result;
          }
        } catch (e: unknown) {
          if (e instanceof Error && e.message.includes('(')) throw e; // re-throw real MCP errors
          // else: non-JSON line (id:, event:, comment), continue
        }
      }
    }
    throw new ExternalServiceError('SSE stream ended without result');
  }

  // MCP event data type helper
  private mcpData(event: { data: unknown }): MCPEventData {
    return isMCPEventData(event.data) ? event.data : {};
  }

  // Event System Integration
  private async setupEventSubscriptions(): Promise<void> {
    if (!this.eventBusService) return;

    try {
      // Subscribe to MCP management events
      await this.eventBusService.subscribe('mcp.server.start', async (event) => {
        const d = this.mcpData(event);
        await this.startServer(d.serverName!);
      });

      await this.eventBusService.subscribe('mcp.server.stop', async (event) => {
        const d = this.mcpData(event);
        await this.stopServer(d.serverName!);
      });

      await this.eventBusService.subscribe('mcp.server.restart', async (event) => {
        const d = this.mcpData(event);
        await this.restartServer(d.serverName!);
      });

      await this.eventBusService.subscribe('mcp.server.install', async (event) => {
        const d = this.mcpData(event);
        if (d.config) {
          await this.installServer(d.serverName!, d.config);
        }
      });

      await this.eventBusService.subscribe('mcp.server.uninstall', async (event) => {
        const d = this.mcpData(event);
        await this.uninstallServer(d.serverName!);
      });

      await this.eventBusService.subscribe('mcp.tool.execute', async (event) => {
        const d = this.mcpData(event);
        try {
          const result = await this.executeTool(
            d.serverName!,
            d.toolName!,
            d.parameters ?? {},
            {
              agentId: d.agentId,
              userId: d.userId,
              conversationId: d.conversationId,
              operationId: d.operationId,
              sessionId: d.sessionId,
            }
          );

          await this.publishEvent('mcp.tool.executed', {
            requestId: d.requestId,
            serverName: d.serverName,
            toolName: d.toolName,
            result,
            success: true,
            agentId: d.agentId,
            userId: d.userId,
            conversationId: d.conversationId,
            operationId: d.operationId,
            sessionId: d.sessionId,
          });
        } catch (error) {
          await this.publishEvent('mcp.tool.executed', {
            requestId: d.requestId,
            serverName: d.serverName,
            toolName: d.toolName,
            error: error instanceof Error ? error.message : String(error),
            success: false,
            agentId: d.agentId,
            userId: d.userId,
            conversationId: d.conversationId,
            operationId: d.operationId,
            sessionId: d.sessionId,
          });
        }
      });

      await this.eventBusService.subscribe('mcp.status.request', async (event) => {
        const d = this.mcpData(event);
        const servers = this.getAllServers();
        await this.publishEvent('mcp.status.response', {
          requestId: d.requestId,
          servers: servers.map((server) => ({
            name: server.name,
            status: server.status,
            pid: server.pid,
            uptime: server.stats.uptime,
            toolCount: server.tools?.length || 0,
            lastHealthCheck: server.lastHealthCheck,
          })),
        });
      });

      // Agent tool discovery requests
      await this.eventBusService.subscribe('agent.tools.request', async (event) => {
        const d = this.mcpData(event);
        const availableTools = this.getAvailableToolsForAgent(d.agentId!);
        await this.publishEvent('agent.tools.response', {
          requestId: d.requestId,
          agentId: d.agentId,
          tools: availableTools,
        });
      });

      // Tool execution requests from agents
      await this.eventBusService.subscribe('agent.tool.execute', async (event) => {
        const d = this.mcpData(event);
        const { toolId, parameters, agentId, userId, conversationId, operationId, sessionId } = d;

        // Parse MCP tool ID to get server and tool name
        const mcpToolMatch = toolId!.match(/^mcp-([^-]+)-(.+)$/);
        if (!mcpToolMatch) {
          await this.publishEvent('agent.tool.error', {
            requestId: d.requestId,
            agentId,
            error: 'Invalid MCP tool ID format',
            toolId,
          });
          return;
        }

        const [, serverName, toolName] = mcpToolMatch;

        try {
          const result = await this.executeTool(
            serverName,
            toolName,
            parameters ?? {},
            {
              agentId,
              userId,
              conversationId,
              operationId,
              sessionId,
            }
          );

          await this.publishEvent('agent.tool.result', {
            requestId: d.requestId,
            agentId,
            toolId,
            result,
            success: true,
          });
        } catch (error) {
          await this.publishEvent('agent.tool.error', {
            requestId: d.requestId,
            agentId,
            toolId,
            error: error instanceof Error ? error.message : String(error),
            success: false,
          });
        }
      });

      logger.info('MCP event subscriptions configured');
    } catch (error) {
      logger.error('Failed to setup MCP event subscriptions:', error);
    }
  }

  private async publishEvent(channel: string, data: unknown): Promise<void> {
    if (!this.eventBusService) return;

    try {
      await this.eventBusService.publish(channel, {
        ...this.asRecord(data),
        source: 'mcp-client-service',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to publish MCP event:', { channel, error });
    }
  }

  private async autoStartServers(): Promise<void> {
    try {
      if (!this.mcpRepo) {
        logger.warn('MCP repository not initialized, skipping auto-start');
        return;
      }
      const mcpService = this.mcpRepo;
      const entities = await mcpService.getAllServers();
      const toStart = entities.filter((e) => {
        const entity = this.asRecord(e);
        return entity.enabled === true && entity.autoStart === true;
      });

      logger.info(`Auto-starting ${toStart.length} MCP servers`);

      for (const entity of toStart) {
        const entityRecord = this.asRecord(entity);
        const serverName = String(entityRecord.name || '');
        try {
          // eslint-disable-next-line no-await-in-loop -- sequential processing required
          await this.startServer(serverName);
        } catch (error) {
          logger.warn(
            `Failed to auto-start server ${serverName}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    } catch (error) {
      logger.warn(
        'Failed to auto-start servers:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Tool Installation Helpers
  async installMissingTool(tool: string): Promise<boolean> {
    try {
      switch (tool) {
        case 'uvx':
          logger.info('Attempting to install uv...');
          if (process.platform === 'win32') {
            await execAsync('powershell -c "irm https://astral.sh/uv/install.ps1 | iex"');
          } else {
            await execAsync('curl -LsSf https://astral.sh/uv/install.sh | sh');
          }
          // Verify installation
          return await this.isCommandAvailable('uvx');

        case 'python':
        case 'python3':
          logger.warn(
            'Python installation requires manual setup. Please install from https://python.org/'
          );
          return false;

        case 'node':
        case 'npx':
          logger.warn(
            'Node.js installation requires manual setup. Please install from https://nodejs.org/'
          );
          return false;

        default:
          logger.warn(`Unknown tool '${tool}' - cannot auto-install`);
          return false;
      }
    } catch (error) {
      logger.error(`Failed to install ${tool}:`, error);
      return false;
    }
  }

  async checkSystemRequirements(): Promise<{
    system: string;
    requirements: Array<{
      tool: string;
      available: boolean;
      suggestion?: string;
    }>;
  }> {
    const commonTools = ['uvx', 'npx', 'python3', 'python', 'node'];
    const requirements = [];

    for (const tool of commonTools) {
      // eslint-disable-next-line no-await-in-loop -- sequential processing required
      const available = await this.isCommandAvailable(tool);
      let suggestion;

      if (!available) {
        switch (tool) {
          case 'uvx':
            suggestion = 'Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh';
            break;
          case 'npx':
          case 'node':
            suggestion = 'Install Node.js from https://nodejs.org/';
            break;
          case 'python3':
          case 'python':
            suggestion = 'Install Python from https://python.org/';
            break;
        }
      }

      requirements.push({
        tool,
        available,
        suggestion,
      });
    }

    return {
      system: `${process.platform} ${process.arch}`,
      requirements,
    };
  }

  // Enhanced status methods for frontend integration
  async getServerDetails(serverName: string): Promise<unknown> {
    const server = this.servers.get(serverName);
    if (!server) return null;

    return {
      name: server.name,
      status: server.status,
      transportType: server.transportType,
      httpUrl: server.httpUrl,
      // httpHeaders: never returned — contains live API keys
      pid: server.pid,
      startTime: server.startTime,
      lastHealthCheck: server.lastHealthCheck,
      error: server.error,
      capabilities: server.capabilities,
      tools: server.tools,
      resources: server.resources,
      prompts: server.prompts,
      stats: server.stats,
      recentLogs: server.logs.slice(-10),
    };
  }

  async getSystemStatus(): Promise<unknown> {
    const servers = this.getAllServers();
    const totalServers = servers.length;
    const runningServers = servers.filter((s) => s.status === 'running').length;
    const errorServers = servers.filter((s) => s.status === 'error').length;
    const totalTools = servers.reduce((sum, s) => sum + (s.tools?.length || 0), 0);

    return {
      totalServers,
      runningServers,
      errorServers,
      stoppedServers: totalServers - runningServers - errorServers,
      totalTools,
      uptime: process.uptime(),
      healthStatus: errorServers === 0 ? 'healthy' : 'degraded',
      servers: servers.map((server) => ({
        name: server.name,
        status: server.status,
        pid: server.pid,
        toolCount: server.tools?.length || 0,
        uptime: server.stats.uptime,
        lastHealthCheck: server.lastHealthCheck,
      })),
    };
  }

  // Agent tool discovery
  getAvailableToolsForAgent(_agentId?: string): unknown[] {
    const availableTools: unknown[] = [];

    for (const [serverName, server] of this.servers.entries()) {
      if (server.status === 'running' && server.tools) {
        for (const tool of server.tools) {
          availableTools.push({
            id: `mcp-${serverName}-${tool.name}`,
            name: tool.name,
            description: tool.description || `${tool.name} from ${serverName} MCP server`,
            serverName,
            category: 'mcp',
            inputSchema: tool.inputSchema || {},
            capabilities: tool.capabilities || [],
            executionTimeEstimate: server.stats.averageResponseTime || 5000,
            costEstimate: 0.01,
            metadata: {
              mcpServer: serverName,
              mcpTool: tool.name,
              protocol: 'mcp',
              serverStatus: server.status,
              lastHealthCheck: server.lastHealthCheck,
            },
          });
        }
      }
    }

    return availableTools;
  }

  // Get tools by category for agents
  getToolsByCategory(category: string): unknown[] {
    const tools = this.getAvailableToolsForAgent();
    return tools.filter((tool) => this.asRecord(tool).category === category);
  }

  // Get tools by server for agents
  getToolsByServer(serverName: string): unknown[] {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running' || !server.tools) {
      return [];
    }

    return server.tools.map((tool) => ({
      id: `mcp-${serverName}-${tool.name}`,
      name: tool.name,
      description: tool.description || `${tool.name} from ${serverName} MCP server`,
      serverName,
      category: 'mcp',
      inputSchema: tool.inputSchema || {},
      capabilities: tool.capabilities || [],
      executionTimeEstimate: server.stats.averageResponseTime || 5000,
      costEstimate: 0.01,
      metadata: {
        mcpServer: serverName,
        mcpTool: tool.name,
        protocol: 'mcp',
        serverStatus: server.status,
        lastHealthCheck: server.lastHealthCheck,
      },
    }));
  }

  // Real-time log streaming for frontend
  getLogStream(serverName: string): NodeJS.ReadableStream {
    const logStream = new Readable({ objectMode: true });

    const logHandler = (data: unknown) => {
      if (this.asRecord(data).serverName === serverName) {
        logStream.push(JSON.stringify(data) + '\n');
      }
    };

    this.on('log', logHandler);

    logStream._read = () => {};

    logStream.on('close', () => {
      this.off('log', logHandler);
    });

    return logStream;
  }

  // Comprehensive Resource Discovery
  async discoverResources(serverName?: string): Promise<MCPResource[]> {
    const resources: MCPResource[] = [];
    const serversToCheck = serverName ? [serverName] : Array.from(this.servers.keys());

    for (const name of serversToCheck) {
      const server = this.servers.get(name);
      if (!server || server.status !== 'running') {
        continue;
      }

      try {
        // eslint-disable-next-line no-await-in-loop -- sequential processing required
        const response = await this.sendRequest(name, 'resources/list', {});

        const payload = this.asRecord(response);
        const result = this.asRecord(payload.result);
        const resourcesValue = this.asRecordArray(result.resources);
        if (resourcesValue.length > 0) {
          const serverResources: MCPResource[] = resourcesValue.map((resource) => ({
            uri: typeof resource.uri === 'string' ? resource.uri : '',
            name: typeof resource.name === 'string' ? resource.name : 'resource',
            description:
              typeof resource.description === 'string' ? resource.description : undefined,
            mimeType: typeof resource.mimeType === 'string' ? resource.mimeType : undefined,
            serverName: name,
            discoveredAt: new Date().toISOString(),
          }));
          resources.push(...serverResources);

          // Cache resources on server state
          server.resources = serverResources;
        }
      } catch (error) {
        logger.error(`Failed to discover resources from server ${name}:`, error);
      }
    }

    return resources;
  }

  async getResource(serverName: string, uri: string): Promise<unknown> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') {
      throw new ExternalServiceError(`Server ${serverName} is not running`);
    }

    try {
      const response = await this.sendRequest(serverName, 'resources/read', { uri });
      return this.asRecord(response).result;
    } catch (error) {
      logger.error(`Failed to get resource ${uri} from server ${serverName}:`, error);
      throw error;
    }
  }

  async discoverPrompts(serverName?: string): Promise<MCPPrompt[]> {
    const prompts: MCPPrompt[] = [];
    const serversToCheck = serverName ? [serverName] : Array.from(this.servers.keys());

    for (const name of serversToCheck) {
      const server = this.servers.get(name);
      if (!server || server.status !== 'running') {
        continue;
      }

      try {
        // eslint-disable-next-line no-await-in-loop -- sequential processing required
        const response = await this.sendRequest(name, 'prompts/list', {});

        const payload = this.asRecord(response);
        const result = this.asRecord(payload.result);
        const promptsValue = this.asRecordArray(result.prompts);
        if (promptsValue.length > 0) {
          const serverPrompts: MCPPrompt[] = promptsValue.map((prompt) => ({
            ...this.recordToMCPPrompt(prompt),
            serverName: name,
            discoveredAt: new Date().toISOString(),
          }));
          prompts.push(...serverPrompts);

          // Cache prompts on server state
          server.prompts = serverPrompts;
        }
      } catch (error) {
        logger.error(`Failed to discover prompts from server ${name}:`, error);
      }
    }

    return prompts;
  }

  async getPrompt(
    serverName: string,
    name: string,
    promptArgs?: Record<string, unknown>
  ): Promise<unknown> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') {
      throw new ExternalServiceError(`Server ${serverName} is not running`);
    }

    try {
      const response = await this.sendRequest(serverName, 'prompts/get', {
        name,
        arguments: promptArgs,
      });

      return this.asRecord(response).result;
    } catch (error) {
      logger.error(`Failed to get prompt ${name} from server ${serverName}:`, error);
      throw error;
    }
  }

  // Single Tool Selection from Multi-Tool Servers
  async getSelectableToolsFromServer(serverName: string): Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      serverName: string;
      inputSchema: unknown;
      selectable: boolean;
    }>
  > {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') {
      return [];
    }

    const tools = server.tools || [];
    return tools.map((tool) => ({
      id: `${serverName}:${tool.name}`,
      name: tool.name,
      description: tool.description || `${tool.name} from ${serverName}`,
      serverName,
      inputSchema: tool.inputSchema,
      selectable: true,
    }));
  }

  async attachSingleToolToAgent(
    agentId: string,
    serverName: string,
    toolName: string
  ): Promise<{
    success: boolean;
    toolId: string;
    assignment?: unknown;
  }> {
    try {
      const server = this.servers.get(serverName);
      if (!server || server.status !== 'running') {
        throw new ExternalServiceError(`Server ${serverName} is not running`);
      }

      const tool = server.tools?.find((t) => t.name === toolName);
      if (!tool) {
        throw new NotFoundError(`Tool ${toolName} not found in server ${serverName}`);
      }

      const toolId = `mcp:${serverName}:${toolName}`;

      // Create tool assignment in database (using existing patterns)
      if (this.databaseService) {
        const toolService = ToolService.getInstance();
        const agentService = AgentService.getInstance();

        // Check if agent exists
        const agent = await agentService.findAgentById(agentId);
        if (!agent) {
          throw new NotFoundError(`Agent ${agentId} not found`);
        }

        // Create or update tool definition
        const toolDefinition = {
          name: tool.name,
          displayName: tool.name,
          description: tool.description || `${tool.name} from MCP server ${serverName}`,
          category: ToolCategory.API,
          inputSchema: this.asRecord(tool.inputSchema ?? {}),
          configuration: {
            mcpServer: serverName,
            mcpTool: toolName,
          },
          version: '1.0.0',
        };

        // Create the specific tool definition
        const createdTool = await toolService.createTool(toolDefinition);

        // Create tool assignment
        const assignment = await toolService.assignToolToAgent(agentId, String(createdTool.id), {
          canExecute: true,
          canRead: true,
          customConfig: {
            mcpServer: serverName,
            mcpTool: toolName,
            selectiveAttachment: true,
          },
        });

        logger.info(
          `Attached single tool ${toolName} from server ${serverName} to agent ${agentId}`
        );

        return {
          success: true,
          toolId: String(createdTool.id),
          assignment,
        };
      }

      // Fallback if no database service
      return {
        success: true,
        toolId,
      };
    } catch (error) {
      logger.error(
        `Failed to attach tool ${toolName} from server ${serverName} to agent ${agentId}:`,
        error
      );
      return {
        success: false,
        toolId: `mcp:${serverName}:${toolName}`,
      };
    }
  }

  // Enhanced error handling and recovery
  async recoverServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new NotFoundError(`Server ${serverName} not found`);
    }

    logger.info(`Attempting to recover server: ${serverName}`);

    try {
      // Stop if running
      if (server.status === 'running' || server.status === 'error') {
        await this.stopServer(serverName);
      }

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Restart
      await this.startServer(serverName);

      await this.publishEvent('mcp.server.recovered', { serverName });
      logger.info(`Server recovered successfully: ${serverName}`);
    } catch (error) {
      await this.publishEvent('mcp.server.recovery_failed', {
        serverName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Graph-based tool recommendations and analytics methods
  async getToolRecommendations(
    agentId: string,
    context?: string,
    limit: number = 5
  ): Promise<unknown[]> {
    if (!this.toolGraphDatabase) {
      logger.warn('Tool recommendations requested but graph database not available');
      return [];
    }

    try {
      if (context) {
        return await this.toolGraphDatabase.getContextualRecommendations(context, 'default', limit);
      } else {
        return await this.toolGraphDatabase.getRecommendations(agentId, 'default', undefined, limit);
      }
    } catch (error) {
      logger.error('Failed to get tool recommendations:', error);
      return [];
    }
  }

  async getRelatedTools(
    toolId: string,
    relationshipTypes?: string[],
    minStrength: number = 0.5,
    _limit: number = 10
  ): Promise<unknown[]> {
    if (!this.toolGraphDatabase) {
      logger.warn('Related tools requested but graph database not available');
      return [];
    }

    try {
      return await this.toolGraphDatabase.getRelatedTools(toolId, 'default', relationshipTypes, minStrength);
    } catch (error) {
      logger.error(`Failed to get related tools for ${toolId}:`, error);
      return [];
    }
  }

  async getUsageAnalytics(
    toolId?: string,
    agentId?: string,
    serverName?: string
  ): Promise<unknown[]> {
    if (!this.toolGraphDatabase) {
      logger.warn('Usage analytics requested but graph database not available');
      return [];
    }

    try {
      // If serverName provided, filter by MCP tools from that server
      if (serverName && !toolId) {
        // Get all tools from this server and aggregate their analytics
        const serverTools = Array.from(this.servers.get(serverName)?.tools || []);
        const analytics = [];

        for (const tool of serverTools) {
          const mcpToolId = `mcp-${serverName}-${tool.name}`;
          // eslint-disable-next-line no-await-in-loop -- sequential processing required
          const toolAnalytics = await this.toolGraphDatabase.getToolUsageAnalytics(
            mcpToolId,
            agentId
          );
          analytics.push(...toolAnalytics);
        }

        return analytics;
      } else {
        return await this.toolGraphDatabase.getToolUsageAnalytics(toolId ?? 'default', agentId);
      }
    } catch (error) {
      logger.error('Failed to get usage analytics:', error);
      return [];
    }
  }

  async getGraphStatus(): Promise<unknown> {
    if (!this.toolGraphDatabase) {
      return {
        connected: false,
        error: 'Graph database not initialized',
        features: {
          toolRecommendations: false,
          usageAnalytics: false,
          relationshipTracking: false,
        },
      };
    }

    try {
      const connectionStatus = this.toolGraphDatabase.getConnectionStatus();

      // Get some basic statistics if connected
      let statistics = {};
      if (connectionStatus.isConnected) {
        try {
          const popularTools = await this.toolGraphDatabase.getPopularTools('default', undefined, 5);
          statistics = {
            totalPopularTools: popularTools.length,
            samplePopularTools: popularTools.slice(0, 3).map((t) => ({
              toolId: t.toolId,
              totalUsage: t.totalUsage,
              avgSuccessRate: t.avgSuccessRate,
            })),
          };
        } catch (statError) {
          logger.warn('Failed to get graph statistics:', statError);
          statistics = { error: 'Failed to fetch statistics' };
        }
      }

      return {
        connected: connectionStatus.isConnected,
        database: connectionStatus.database,
        retries: connectionStatus.retries,
        features: {
          toolRecommendations: connectionStatus.isConnected,
          usageAnalytics: connectionStatus.isConnected,
          relationshipTracking: connectionStatus.isConnected,
          mcpIntegration: connectionStatus.isConnected,
        },
        statistics,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get graph status:', error);
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        features: {
          toolRecommendations: false,
          usageAnalytics: false,
          relationshipTracking: false,
        },
      };
    }
  }

  // Cleanup
  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP Client Service');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    await this.stopAllServers();
    await this.publishEvent('mcp.service.shutdown', { timestamp: new Date() });
    this.removeAllListeners();

    logger.info('MCP Client Service shutdown completed');
  }
}
