// MCP Server Manager for Council of Nycea
// Manages lifecycle and communication with MCP servers

import { 
  MCPServerConfig,
  MCPServerInstance,
  MCPServerManager,
  MCPServerCapabilities,
  MCPToolCall,
  MCPToolResult,
  MCPServerEvent,
  MCPServerEventHandler,
  MCPRequest,
  MCPResponse
} from '../../types/mcp';

export class InMemoryMCPServerManager implements MCPServerManager {
  private servers: Map<string, MCPServerInstance> = new Map();
  private processes: Map<string, any> = new Map(); // Store process references
  private eventHandlers: Set<MCPServerEventHandler> = new Set();
  private requestId = 0;

  async start(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (server.status === 'running') {
      return; // Already running
    }

    if (server.status === 'starting') {
      throw new Error(`Server ${serverId} is already starting`);
    }

    try {
      server.status = 'starting';
      server.error = undefined;

      // Check if required commands are available
      await this.validateCommand(server.config.type);

      // Start the MCP server process
      const process = await this.startProcess(server);
      this.processes.set(serverId, process);

      // Update server status
      server.status = 'running';
      server.pid = process.pid;
      server.startTime = new Date();
      server.lastHealthCheck = new Date();

      // Start health check interval
      this.setupHealthCheck(serverId);

      // Discover capabilities
      await this.discoverCapabilities(serverId);

      // Emit start event
      await this.emitEvent({
        type: 'server-started',
        payload: { serverId, pid: process.pid }
      });

      console.log(`MCP Server ${serverId} started successfully with PID ${process.pid}`);
    } catch (error) {
      server.status = 'error';
      server.error = error instanceof Error ? error.message : 'Unknown error';
      
      await this.emitEvent({
        type: 'server-error',
        payload: { serverId, error: server.error }
      });

      throw error;
    }
  }

  async stop(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (server.status === 'stopped') {
      return; // Already stopped
    }

    try {
      server.status = 'stopping';

      const process = this.processes.get(serverId);
      if (process) {
        // Gracefully terminate the process
        process.terminate?.();
        this.processes.delete(serverId);
      }

      server.status = 'stopped';
      server.pid = undefined;
      server.error = undefined;

      await this.emitEvent({
        type: 'server-stopped',
        payload: { serverId, reason: 'Manual stop' }
      });

      console.log(`MCP Server ${serverId} stopped`);
    } catch (error) {
      server.status = 'error';
      server.error = error instanceof Error ? error.message : 'Failed to stop';
      throw error;
    }
  }

  async restart(serverId: string): Promise<void> {
    await this.stop(serverId);
    // Wait a moment before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.start(serverId);
  }

  async getStatus(serverId: string): Promise<MCPServerInstance | null> {
    return this.servers.get(serverId) || null;
  }

  async getAllServers(): Promise<MCPServerInstance[]> {
    return Array.from(this.servers.values());
  }

  async getCapabilities(serverId: string): Promise<MCPServerCapabilities | null> {
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'running') {
      return null;
    }

    try {
      const response = await this.sendRequest(serverId, {
        id: this.generateRequestId(),
        method: 'tools/list',
        params: {}
      });

      return {
        tools: response.result?.tools || [],
        resources: response.result?.resources || [],
        prompts: response.result?.prompts || [],
        supportsStreaming: false,
        supportsProgress: false
      };
    } catch (error) {
      console.error(`Failed to get capabilities for ${serverId}:`, error);
      return null;
    }
  }

  async callTool(serverId: string, toolCall: MCPToolCall): Promise<MCPToolResult> {
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'running') {
      throw new Error(`Server ${serverId} is not running`);
    }

    const startTime = Date.now();

    try {
      const response = await this.sendRequest(serverId, {
        id: this.generateRequestId(),
        method: 'tools/call',
        params: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      });

      const duration = Date.now() - startTime;

      // Update stats
      server.stats.requestCount++;
      server.stats.successCount++;
      server.stats.averageResponseTime = 
        (server.stats.averageResponseTime * (server.stats.requestCount - 1) + duration) / server.stats.requestCount;

      // Emit tool called event
      await this.emitEvent({
        type: 'tool-called',
        payload: { serverId, tool: toolCall.name, duration }
      });

      return {
        content: response.result?.content || [{ type: 'text', text: 'No content returned' }],
        isError: false
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Update error stats
      server.stats.requestCount++;
      server.stats.errorCount++;
      server.stats.lastError = error instanceof Error ? error.message : 'Unknown error';
      server.stats.lastErrorTime = new Date();

      return {
        content: [{ 
          type: 'text', 
          text: `Tool execution failed: ${server.stats.lastError}` 
        }],
        isError: true
      };
    }
  }

  // Server registry methods
  registerServer(config: MCPServerConfig): void {
    const instance: MCPServerInstance = {
      id: config.id,
      config,
      status: 'stopped',
      stats: {
        uptime: 0,
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        averageResponseTime: 0
      }
    };

    this.servers.set(config.id, instance);
    console.log(`Registered MCP server: ${config.name} (${config.id})`);
  }

  unregisterServer(serverId: string): void {
    // Stop server if running
    if (this.servers.get(serverId)?.status === 'running') {
      this.stop(serverId).catch(console.error);
    }

    this.servers.delete(serverId);
    this.processes.delete(serverId);
    console.log(`Unregistered MCP server: ${serverId}`);
  }

  // Event system
  addEventListener(handler: MCPServerEventHandler): void {
    this.eventHandlers.add(handler);
  }

  removeEventListener(handler: MCPServerEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  private async emitEvent(event: MCPServerEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error('Error in MCP server event handler:', error);
      }
    }
  }

  // Private helper methods
  private async validateCommand(type: 'npx' | 'uvx' | 'node' | 'python'): Promise<void> {
    // In a real implementation, this would check if the command exists
    // For now, we'll assume they're available
    const commands = {
      npx: 'npx',
      uvx: 'uvx',
      node: 'node',
      python: 'python'
    };

    const command = commands[type];
    if (!command) {
      throw new Error(`Unsupported MCP server type: ${type}`);
    }

    // TODO: Actually check command availability
    // const { execSync } = require('child_process');
    // try {
    //   execSync(`which ${command}`, { stdio: 'ignore' });
    // } catch {
    //   throw new Error(`Command ${command} not found. Please install it first.`);
    // }
  }

  private async startProcess(server: MCPServerInstance): Promise<any> {
    // In a browser environment, we can't actually start processes
    // This would be implemented on the backend/server side
    // For now, we'll simulate a process
    
    const mockProcess = {
      pid: Math.floor(Math.random() * 10000) + 1000,
      terminate: () => {
        console.log(`Terminating process ${mockProcess.pid}`);
      },
      send: (data: any) => {
        console.log(`Sending to ${server.id}:`, data);
        // Mock response
        return Promise.resolve({
          id: data.id,
          result: { content: [{ type: 'text', text: 'Mock response' }] }
        });
      }
    };

    // Simulate startup delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return mockProcess;
  }

  private setupHealthCheck(serverId: string): void {
    const server = this.servers.get(serverId);
    if (!server) return;

    const interval = setInterval(async () => {
      if (server.status !== 'running') {
        clearInterval(interval);
        return;
      }

      try {
        // Simple ping to check if server is responsive
        await this.sendRequest(serverId, {
          id: this.generateRequestId(),
          method: 'ping',
          params: {}
        });

        server.lastHealthCheck = new Date();
      } catch (error) {
        console.warn(`Health check failed for ${serverId}:`, error);
        
        // If health check fails multiple times, mark as error
        const timeSinceLastCheck = Date.now() - (server.lastHealthCheck?.getTime() || 0);
        if (timeSinceLastCheck > server.config.healthCheckInterval * 2) {
          server.status = 'error';
          server.error = 'Health check failed';
          
          await this.emitEvent({
            type: 'server-error',
            payload: { serverId, error: 'Health check failed' }
          });
        }
      }
    }, server.config.healthCheckInterval);
  }

  private async discoverCapabilities(serverId: string): Promise<void> {
    try {
      const capabilities = await this.getCapabilities(serverId);
      if (capabilities) {
        await this.emitEvent({
          type: 'capabilities-updated',
          payload: { serverId, capabilities }
        });
      }
    } catch (error) {
      console.warn(`Failed to discover capabilities for ${serverId}:`, error);
    }
  }

  private async sendRequest(serverId: string, request: MCPRequest): Promise<MCPResponse> {
    const process = this.processes.get(serverId);
    if (!process) {
      throw new Error(`No process found for server ${serverId}`);
    }

    try {
      // In a real implementation, this would use stdio or WebSocket communication
      const response = await process.send(request);
      return response;
    } catch (error) {
      throw new Error(`Failed to communicate with server ${serverId}: ${error}`);
    }
  }

  private generateRequestId(): string {
    return `req_${++this.requestId}_${Date.now()}`;
  }

  // Statistics and monitoring
  async getServerStats(): Promise<{
    totalServers: number;
    runningServers: number;
    errorServers: number;
    totalRequests: number;
    totalErrors: number;
    averageUptime: number;
  }> {
    const servers = Array.from(this.servers.values());
    const running = servers.filter(s => s.status === 'running');
    const errors = servers.filter(s => s.status === 'error');
    
    const totalRequests = servers.reduce((sum, s) => sum + s.stats.requestCount, 0);
    const totalErrors = servers.reduce((sum, s) => sum + s.stats.errorCount, 0);
    
    const uptimes = running
      .filter(s => s.startTime)
      .map(s => Date.now() - s.startTime!.getTime());
    const averageUptime = uptimes.length > 0 
      ? uptimes.reduce((sum, time) => sum + time, 0) / uptimes.length 
      : 0;

    return {
      totalServers: servers.length,
      runningServers: running.length,
      errorServers: errors.length,
      totalRequests,
      totalErrors,
      averageUptime
    };
  }
}

// Singleton instance
export const mcpServerManager = new InMemoryMCPServerManager(); 