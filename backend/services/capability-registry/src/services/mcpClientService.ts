// MCP Client Service - Complete JSON-RPC 2.0 Implementation
// Handles MCP server lifecycle, communication, and tool execution
// Part of capability-registry microservice

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '@uaip/utils';
import { EventBusService, DatabaseService } from '@uaip/shared-services';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// JSON-RPC 2.0 Message Types
interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

// MCP Server Configuration
interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
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
  inputSchema: any;
  capabilities?: string[];
}

// MCP Server State
interface MCPServerState {
  name: string;
  config: MCPServerConfig;
  process?: ChildProcess;
  status: 'stopped' | 'starting' | 'running' | 'error' | 'stopping';
  pid?: number;
  startTime?: Date;
  lastHealthCheck?: Date;
  error?: string;
  capabilities?: any;
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
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }>();
  private configPath: string;
  private healthCheckInterval?: NodeJS.Timeout;
  private eventBusService?: EventBusService;
  private databaseService?: DatabaseService;

  private constructor() {
    super();
    this.configPath = path.resolve(process.cwd(), '../../../.mcp.json');
  }

  async initialize(eventBusService?: EventBusService, databaseService?: DatabaseService): Promise<void> {
    this.eventBusService = eventBusService;
    this.databaseService = databaseService;
    
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
      throw new Error(`Server configuration not found: ${serverName}`);
    }

    if (this.servers.has(serverName)) {
      const server = this.servers.get(serverName)!;
      if (server.status === 'running') {
        logger.info(`MCP server ${serverName} is already running`);
        return;
      }
    }

    // Validate command exists before attempting to start
    const commandValidation = await this.validateCommand(config.command);
    if (!commandValidation.isValid) {
      logger.warn(`Command '${config.command}' not found for server ${serverName}. ${commandValidation.suggestion}`);
      
      // Try fallback configuration if available
      if (commandValidation.fallbackConfig) {
        logger.info(`Attempting fallback configuration for ${serverName}`);
        config = commandValidation.fallbackConfig;
        
        // Validate the fallback command
        const fallbackValidation = await this.validateCommand(config.command);
        if (!fallbackValidation.isValid) {
          const error = `Both primary and fallback commands failed for ${serverName}. ${commandValidation.suggestion}`;
          logger.error(error);
          throw new Error(error);
        }
      } else {
        const error = `Command '${config.command}' not found. ${commandValidation.suggestion}`;
        logger.error(`Cannot start MCP server ${serverName}: ${error}`);
        throw new Error(error);
      }
    }

    logger.info(`Starting MCP server: ${serverName}`, config);

    const serverState: MCPServerState = {
      name: serverName,
      config,
      status: 'starting',
      logs: [],
      stats: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        uptime: 0
      }
    };

    this.servers.set(serverName, serverState);

    try {
      const childProcess = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...config.env },
        cwd: config.cwd || process.cwd()
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

    } catch (error) {
      serverState.status = 'error';
      serverState.error = error.message;
      this.emit('serverError', { serverName, error: error.message });
      throw error;
    }
  }

  async stopServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server || !server.process) {
      logger.warn(`Attempted to stop non-running server: ${serverName}`);
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
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
    await this.startServer(serverName);
  }

  // JSON-RPC 2.0 Communication
  private async sendRequest(serverName: string, method: string, params?: any): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running' || !server.process) {
      throw new Error(`Server ${serverName} is not running`);
    }

    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

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
        timestamp: Date.now()
      });

      server.stats.totalRequests++;
      
      const message = JSON.stringify(request) + '\n';
      server.process!.stdin?.write(message);
      
      this.addLog(serverName, `→ ${method}: ${JSON.stringify(params)}`);
    });
  }

  private sendNotification(serverName: string, method: string, params?: any): void {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running' || !server.process) {
      return;
    }

    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params
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
          sampling: {}
        },
        clientInfo: {
          name: 'UAIP-MCPClient',
          version: '1.0.0'
        }
      };

      const response = await this.sendRequest(serverName, 'initialize', initializeParams);
      
      const server = this.servers.get(serverName)!;
      server.capabilities = response.capabilities;
      
      // Send initialized notification
      this.sendNotification(serverName, 'initialized');

      // Discover available tools
      await this.discoverTools(serverName);
      
      logger.info(`MCP connection initialized for ${serverName}`, response);
    } catch (error) {
      logger.error(`Failed to initialize MCP connection for ${serverName}:`, error);
      throw error;
    }
  }

  private async discoverTools(serverName: string): Promise<void> {
    try {
      const server = this.servers.get(serverName)!;
      
      // Get available tools
      if (server.capabilities?.tools) {
        const toolsResponse = await this.sendRequest(serverName, 'tools/list');
        server.tools = toolsResponse.tools || [];
      }

      // Get available resources
      if (server.capabilities?.resources) {
        const resourcesResponse = await this.sendRequest(serverName, 'resources/list');
        server.resources = resourcesResponse.resources || [];
      }

      // Get available prompts
      if (server.capabilities?.prompts) {
        const promptsResponse = await this.sendRequest(serverName, 'prompts/list');
        server.prompts = promptsResponse.prompts || [];
      }

      // Auto-register discovered tools in the tool registry
      await this.registerDiscoveredTools(serverName, server.tools || []);

      this.emit('toolsDiscovered', { 
        serverName, 
        tools: server.tools,
        resources: server.resources,
        prompts: server.prompts
      });
      
      await this.publishEvent('mcp.tools.discovered', {
        serverName,
        toolCount: server.tools?.length || 0,
        resourceCount: server.resources?.length || 0,
        promptCount: server.prompts?.length || 0,
        tools: server.tools,
        resources: server.resources,
        prompts: server.prompts
      });

    } catch (error) {
      logger.error(`Failed to discover tools for ${serverName}:`, error);
    }
  }

  // Auto-register discovered MCP tools in the tool registry
  private async registerDiscoveredTools(serverName: string, tools: any[]): Promise<void> {
    try {
      for (const tool of tools) {
        const toolRegistration = {
          id: `mcp-${serverName}-${tool.name}`,
          name: tool.name,
          description: tool.description || `${tool.name} from ${serverName} MCP server`,
          category: 'mcp' as any,
          version: '1.0.0',
          isEnabled: true,
          requiresApproval: false,
          costEstimate: 0.01,
          executionTimeEstimate: 5000,
          metadata: {
            mcpServer: serverName,
            mcpTool: tool.name,
            inputSchema: tool.inputSchema || {},
            protocol: 'mcp',
            serverConfig: this.servers.get(serverName)?.config
          }
        };

        // Publish tool registration event for the tool registry
        await this.publishEvent('tool.register', {
          tool: toolRegistration,
          source: 'mcp-discovery',
          serverName
        });

        // Also publish to agents for dynamic discovery
        await this.publishEvent('agent.tool.available', {
          toolId: toolRegistration.id,
          toolName: tool.name,
          serverName,
          description: tool.description,
          inputSchema: tool.inputSchema,
          capabilities: tool.capabilities || [],
          source: 'mcp-discovery'
        });

        logger.info(`Auto-registered MCP tool: ${toolRegistration.id} from ${serverName}`);
      }
    } catch (error) {
      logger.error(`Failed to register tools from ${serverName}:`, error);
    }
  }

  // Tool Execution with Database Persistence
  async executeTool(serverName: string, toolName: string, parameters: any, context?: {
    agentId?: string;
    userId?: string;
    conversationId?: string;
    operationId?: string;
    sessionId?: string;
  }): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') {
      throw new Error(`Server ${serverName} is not running`);
    }

    let jobId: string | null = null;

    try {
      // Create job record in database if DatabaseService is available
      if (this.databaseService) {
        const mcpService = this.databaseService.getMCPService();
        const toolCall = await mcpService.createToolCall({
          serverId: serverName,
          toolName,
          parameters,
          agentId: context?.agentId,
          userId: context?.userId,
          conversationId: context?.conversationId,
          operationId: context?.operationId,
          sessionId: context?.sessionId,
          securityLevel: 'medium'
        });
        jobId = toolCall.id;
        
        // Start the job
        await mcpService.startToolCall(jobId);
      }

      const startTime = Date.now();
      
      const response = await this.sendRequest(serverName, 'tools/call', {
        name: toolName,
        arguments: parameters
      });

      const executionTime = Date.now() - startTime;
      server.stats.averageResponseTime = 
        (server.stats.averageResponseTime + executionTime) / 2;

      this.addLog(serverName, `← ${toolName}: ${JSON.stringify(response).substring(0, 100)}...`);
      
      // Complete the job in database
      if (this.databaseService && jobId) {
        const mcpService = this.databaseService.getMCPService();
        await mcpService.completeToolCall(jobId, response, executionTime);
      }

      // Publish success event
      await this.publishEvent('mcp.tool.executed', {
        serverName,
        toolName,
        parameters,
        result: response,
        executionTimeMs: executionTime,
        success: true,
        jobId,
        ...context
      });
      
      return response;
    } catch (error) {
      this.addLog(serverName, `✗ ${toolName}: ${error.message}`);
      
      // Fail the job in database
      if (this.databaseService && jobId) {
        const mcpService = this.databaseService.getMCPService();
        await mcpService.failToolCall(jobId, error.message, 'EXECUTION_ERROR', 'execution');
      }

      // Publish failure event
      await this.publishEvent('mcp.tool.failed', {
        serverName,
        toolName,
        parameters,
        error: error.message,
        success: false,
        jobId,
        ...context
      });

      throw error;
    }
  }

  // Process Management
  private setupProcessHandlers(serverName: string, process: ChildProcess): void {
    const server = this.servers.get(serverName)!;

    process.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(serverName, message);
        } catch (error) {
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

  private handleMessage(serverName: string, message: any): void {
    if (message.id !== undefined) {
      // Response to our request
      const pendingRequest = this.pendingRequests.get(message.id);
      if (pendingRequest) {
        this.pendingRequests.delete(message.id);
        
        if (message.error) {
          pendingRequest.reject(new Error(`${message.error.message} (${message.error.code})`));
        } else {
          pendingRequest.resolve(message.result);
        }
      }
    } else if (message.method) {
      // Notification from server
      this.handleNotification(serverName, message);
    }
  }

  private handleNotification(serverName: string, notification: any): void {
    this.addLog(serverName, `← ${notification.method}: ${JSON.stringify(notification.params)}`);
    this.emit('notification', { serverName, notification });
    
    // Handle specific notifications
    switch (notification.method) {
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
      // Try to find the command using 'which' (Unix) or 'where' (Windows)
      const whichCommand = process.platform === 'win32' ? 'where' : 'which';
      await execAsync(`${whichCommand} ${command}`);
      return { isValid: true };
    } catch (error) {
      // Command not found, provide helpful suggestions and fallbacks
      let suggestion = '';
      let fallbackConfig: MCPServerConfig | undefined;
      
      switch (command) {
        case 'uvx':
          suggestion = 'Install uv with: curl -LsSf https://astral.sh/uv/install.sh | sh, then restart your terminal.';
          // Try python fallback for MCP servers that support it
          const pythonAvailable = await this.isCommandAvailable('python3') || await this.isCommandAvailable('python');
          if (pythonAvailable) {
            const pythonCmd = await this.isCommandAvailable('python3') ? 'python3' : 'python';
            suggestion += ` Alternatively, you can try using python directly.`;
            fallbackConfig = {
              command: pythonCmd,
              args: ['-m', 'pip', 'install', '--user', 'mcp-server-duckduckgo', '&&', pythonCmd, '-m', 'mcp_server_duckduckgo'],
              env: {}
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
          suggestion = 'Install Python from https://python.org/ or use your system package manager.';
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
      await execAsync(`${whichCommand} ${command}`);
      return true;
    } catch {
      return false;
    }
  }

  // Configuration Management
  private async loadServerConfig(serverName: string): Promise<MCPServerConfig | null> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configContent);
      return config.mcpServers?.[serverName] || null;
    } catch (error) {
      logger.error(`Failed to load MCP config:`, error);
      return null;
    }
  }

  async updateServerConfig(serverName: string, config: MCPServerConfig): Promise<void> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const fullConfig = JSON.parse(configContent);
      
      if (!fullConfig.mcpServers) {
        fullConfig.mcpServers = {};
      }
      
      fullConfig.mcpServers[serverName] = config;
      
      await fs.writeFile(this.configPath, JSON.stringify(fullConfig, null, 2));
      logger.info(`Updated MCP server config for ${serverName}`);
      
      this.emit('configUpdated', { serverName, config });
    } catch (error) {
      logger.error(`Failed to update MCP config for ${serverName}:`, error);
      throw error;
    }
  }

  async installServer(serverName: string, config: MCPServerConfig): Promise<void> {
    await this.updateServerConfig(serverName, config);
    await this.startServer(serverName);
    logger.info(`Installed and started MCP server: ${serverName}`);
  }

  async uninstallServer(serverName: string): Promise<void> {
    await this.stopServer(serverName);
    
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const fullConfig = JSON.parse(configContent);
      
      if (fullConfig.mcpServers) {
        delete fullConfig.mcpServers[serverName];
        await fs.writeFile(this.configPath, JSON.stringify(fullConfig, null, 2));
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
      logger.warn(`Health check failed for ${serverName}:`, error.message);
      const server = this.servers.get(serverName)!;
      server.status = 'error';
      server.error = `Health check failed: ${error.message}`;
      this.emit('serverError', { serverName, error: error.message });
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
    const startPromises = Object.keys(config.mcpServers || {}).map(
      serverName => this.startServer(serverName).catch(error => 
        logger.error(`Failed to start ${serverName}:`, error)
      )
    );
    
    await Promise.allSettled(startPromises);
  }

  async stopAllServers(): Promise<void> {
    const stopPromises = Array.from(this.servers.keys()).map(
      serverName => this.stopServer(serverName)
    );
    
    await Promise.allSettled(stopPromises);
  }

  private async loadAllConfigs(): Promise<any> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(configContent);
    } catch (error) {
      logger.warn('No MCP config found, using empty config');
      return { mcpServers: {} };
    }
  }

  // Event System Integration
  private async setupEventSubscriptions(): Promise<void> {
    if (!this.eventBusService) return;

    try {
      // Subscribe to MCP management events
      await this.eventBusService.subscribe('mcp.server.start', async (event) => {
        await this.startServer(event.data.serverName);
      });

      await this.eventBusService.subscribe('mcp.server.stop', async (event) => {
        await this.stopServer(event.data.serverName);
      });

      await this.eventBusService.subscribe('mcp.server.restart', async (event) => {
        await this.restartServer(event.data.serverName);
      });

      await this.eventBusService.subscribe('mcp.server.install', async (event) => {
        await this.installServer(event.data.serverName, event.data.config);
      });

      await this.eventBusService.subscribe('mcp.server.uninstall', async (event) => {
        await this.uninstallServer(event.data.serverName);
      });

      await this.eventBusService.subscribe('mcp.tool.execute', async (event) => {
        try {
          const result = await this.executeTool(
            event.data.serverName, 
            event.data.toolName, 
            event.data.parameters,
            {
              agentId: event.data.agentId,
              userId: event.data.userId,
              conversationId: event.data.conversationId,
              operationId: event.data.operationId,
              sessionId: event.data.sessionId
            }
          );
          
          await this.publishEvent('mcp.tool.executed', {
            requestId: event.data.requestId,
            serverName: event.data.serverName,
            toolName: event.data.toolName,
            result,
            success: true,
            agentId: event.data.agentId,
            userId: event.data.userId,
            conversationId: event.data.conversationId,
            operationId: event.data.operationId,
            sessionId: event.data.sessionId
          });
        } catch (error) {
          await this.publishEvent('mcp.tool.executed', {
            requestId: event.data.requestId,
            serverName: event.data.serverName,
            toolName: event.data.toolName,
            error: error.message,
            success: false,
            agentId: event.data.agentId,
            userId: event.data.userId,
            conversationId: event.data.conversationId,
            operationId: event.data.operationId,
            sessionId: event.data.sessionId
          });
        }
      });

      await this.eventBusService.subscribe('mcp.status.request', async (event) => {
        const servers = this.getAllServers();
        await this.publishEvent('mcp.status.response', {
          requestId: event.data.requestId,
          servers: servers.map(server => ({
            name: server.name,
            status: server.status,
            pid: server.pid,
            uptime: server.stats.uptime,
            toolCount: server.tools?.length || 0,
            lastHealthCheck: server.lastHealthCheck
          }))
        });
      });

      // Agent tool discovery requests
      await this.eventBusService.subscribe('agent.tools.request', async (event) => {
        const availableTools = this.getAvailableToolsForAgent(event.data.agentId);
        await this.publishEvent('agent.tools.response', {
          requestId: event.data.requestId,
          agentId: event.data.agentId,
          tools: availableTools
        });
      });

      // Tool execution requests from agents
      await this.eventBusService.subscribe('agent.tool.execute', async (event) => {
        const { toolId, parameters, agentId, userId, conversationId, operationId, sessionId } = event.data;
        
        // Parse MCP tool ID to get server and tool name
        const mcpToolMatch = toolId.match(/^mcp-([^-]+)-(.+)$/);
        if (!mcpToolMatch) {
          await this.publishEvent('agent.tool.error', {
            requestId: event.data.requestId,
            agentId,
            error: 'Invalid MCP tool ID format',
            toolId
          });
          return;
        }

        const [, serverName, toolName] = mcpToolMatch;
        
        try {
          const result = await this.executeTool(serverName, toolName, parameters, {
            agentId,
            userId,
            conversationId,
            operationId,
            sessionId
          });

          await this.publishEvent('agent.tool.result', {
            requestId: event.data.requestId,
            agentId,
            toolId,
            result,
            success: true
          });
        } catch (error) {
          await this.publishEvent('agent.tool.error', {
            requestId: event.data.requestId,
            agentId,
            toolId,
            error: error.message,
            success: false
          });
        }
      });

      logger.info('MCP event subscriptions configured');
    } catch (error) {
      logger.error('Failed to setup MCP event subscriptions:', error);
    }
  }

  private async publishEvent(channel: string, data: any): Promise<void> {
    if (!this.eventBusService) return;

    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: 'mcp-client-service',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to publish MCP event:', { channel, error });
    }
  }

  private async autoStartServers(): Promise<void> {
    try {
      const config = await this.loadAllConfigs();
      const serverNames = Object.keys(config.mcpServers || {});
      
      logger.info(`Auto-starting ${serverNames.length} MCP servers`);
      
      for (const serverName of serverNames) {
        try {
          await this.startServer(serverName);
        } catch (error) {
          logger.warn(`Failed to auto-start server ${serverName}:`, error.message);
        }
      }
    } catch (error) {
      logger.warn('Failed to auto-start servers:', error.message);
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
          logger.warn('Python installation requires manual setup. Please install from https://python.org/');
          return false;
          
        case 'node':
        case 'npx':
          logger.warn('Node.js installation requires manual setup. Please install from https://nodejs.org/');
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
        suggestion
      });
    }
    
    return {
      system: `${process.platform} ${process.arch}`,
      requirements
    };
  }

  // Enhanced status methods for frontend integration
  async getServerDetails(serverName: string): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server) return null;

    return {
      name: server.name,
      status: server.status,
      config: server.config,
      pid: server.pid,
      startTime: server.startTime,
      lastHealthCheck: server.lastHealthCheck,
      error: server.error,
      capabilities: server.capabilities,
      tools: server.tools,
      resources: server.resources,
      prompts: server.prompts,
      stats: server.stats,
      recentLogs: server.logs.slice(-10) // Last 10 log entries
    };
  }

  async getSystemStatus(): Promise<any> {
    const servers = this.getAllServers();
    const totalServers = servers.length;
    const runningServers = servers.filter(s => s.status === 'running').length;
    const errorServers = servers.filter(s => s.status === 'error').length;
    const totalTools = servers.reduce((sum, s) => sum + (s.tools?.length || 0), 0);

    return {
      totalServers,
      runningServers,
      errorServers,
      stoppedServers: totalServers - runningServers - errorServers,
      totalTools,
      uptime: process.uptime(),
      healthStatus: errorServers === 0 ? 'healthy' : 'degraded',
      servers: servers.map(server => ({
        name: server.name,
        status: server.status,
        pid: server.pid,
        toolCount: server.tools?.length || 0,
        uptime: server.stats.uptime,
        lastHealthCheck: server.lastHealthCheck
      }))
    };
  }

  // Agent tool discovery
  getAvailableToolsForAgent(agentId?: string): any[] {
    const availableTools: any[] = [];
    
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
              lastHealthCheck: server.lastHealthCheck
            }
          });
        }
      }
    }
    
    return availableTools;
  }

  // Get tools by category for agents
  getToolsByCategory(category: string): any[] {
    const tools = this.getAvailableToolsForAgent();
    return tools.filter(tool => tool.category === category);
  }

  // Get tools by server for agents
  getToolsByServer(serverName: string): any[] {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running' || !server.tools) {
      return [];
    }

    return server.tools.map(tool => ({
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
        lastHealthCheck: server.lastHealthCheck
      }
    }));
  }

  // Real-time log streaming for frontend
  getLogStream(serverName: string): NodeJS.ReadableStream {
    const { Readable } = require('stream');
    const logStream = new Readable({ objectMode: true });

    const logHandler = (data: any) => {
      if (data.serverName === serverName) {
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
        const response = await this.sendRequest(name, 'resources/list', {});

        if (response.result?.resources) {
          const serverResources = response.result.resources.map((resource: any) => ({
            ...resource,
            serverName: name,
            discoveredAt: new Date().toISOString()
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

  async getResource(serverName: string, uri: string): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') {
      throw new Error(`Server ${serverName} is not running`);
    }

    try {
      const response = await this.sendRequest(serverName, 'resources/read', { uri });

      return response.result;
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
        const response = await this.sendRequest(name, 'prompts/list', {});

        if (response.result?.prompts) {
          const serverPrompts = response.result.prompts.map((prompt: any) => ({
            ...prompt,
            serverName: name,
            discoveredAt: new Date().toISOString()
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

  async getPrompt(serverName: string, name: string, promptArgs?: Record<string, any>): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') {
      throw new Error(`Server ${serverName} is not running`);
    }

    try {
      const response = await this.sendRequest(serverName, 'prompts/get', { name, arguments: promptArgs });

      return response.result;
    } catch (error) {
      logger.error(`Failed to get prompt ${name} from server ${serverName}:`, error);
      throw error;
    }
  }

  // Single Tool Selection from Multi-Tool Servers
  async getSelectableToolsFromServer(serverName: string): Promise<Array<{
    id: string;
    name: string;
    description: string;
    serverName: string;
    inputSchema: any;
    selectable: boolean;
  }>> {
    const server = this.servers.get(serverName);
    if (!server || server.status !== 'running') {
      return [];
    }

    const tools = server.tools || [];
    return tools.map(tool => ({
      id: `${serverName}:${tool.name}`,
      name: tool.name,
      description: tool.description || `${tool.name} from ${serverName}`,
      serverName,
      inputSchema: tool.inputSchema,
      selectable: true
    }));
  }

  async attachSingleToolToAgent(agentId: string, serverName: string, toolName: string): Promise<{
    success: boolean;
    toolId: string;
    assignment?: any;
  }> {
    try {
      const server = this.servers.get(serverName);
      if (!server || server.status !== 'running') {
        throw new Error(`Server ${serverName} is not running`);
      }

      const tool = server.tools?.find(t => t.name === toolName);
      if (!tool) {
        throw new Error(`Tool ${toolName} not found in server ${serverName}`);
      }

      const toolId = `mcp:${serverName}:${toolName}`;
      
      // Create tool assignment in database (using existing patterns)
      if (this.databaseService) {
        const toolService = this.databaseService.tools;
        const agentService = this.databaseService.agents;
        
        // Check if agent exists
        const agent = await agentService.findAgentById(agentId);
        if (!agent) {
          throw new Error(`Agent ${agentId} not found`);
        }

        // Create or update tool definition
        const toolDefinition = {
          name: tool.name,
          displayName: tool.name,
          description: tool.description || `${tool.name} from MCP server ${serverName}`,
          category: 'mcp' as any,
          inputSchema: tool.inputSchema,
          configuration: {
            mcpServer: serverName,
            mcpTool: toolName
          },
          version: '1.0.0'
        };

        // Create the specific tool definition
        const createdTool = await toolService.createTool(toolDefinition);

        // Create tool assignment
        const assignment = await toolService.assignToolToAgent(agentId, createdTool.id, {
          canExecute: true,
          canRead: true,
          customConfig: {
            mcpServer: serverName,
            mcpTool: toolName,
            selectiveAttachment: true
          }
        });

        logger.info(`Attached single tool ${toolName} from server ${serverName} to agent ${agentId}`);

        return {
          success: true,
          toolId: createdTool.id,
          assignment
        };
      }

      // Fallback if no database service
      return {
        success: true,
        toolId
      };

    } catch (error) {
      logger.error(`Failed to attach tool ${toolName} from server ${serverName} to agent ${agentId}:`, error);
      return {
        success: false,
        toolId: `mcp:${serverName}:${toolName}`
      };
    }
  }

  // Enhanced error handling and recovery
  async recoverServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    logger.info(`Attempting to recover server: ${serverName}`);
    
    try {
      // Stop if running
      if (server.status === 'running' || server.status === 'error') {
        await this.stopServer(serverName);
      }

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Restart
      await this.startServer(serverName);
      
      await this.publishEvent('mcp.server.recovered', { serverName });
      logger.info(`Server recovered successfully: ${serverName}`);
    } catch (error) {
      await this.publishEvent('mcp.server.recovery_failed', { 
        serverName, 
        error: error.message 
      });
      throw error;
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