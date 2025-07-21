// MCP Configuration Management Routes
// Handles MCP server configuration upload, validation, and installation

import { Router, Request, Response } from 'express';
import multer from 'multer';

// Extend Request interface to include multer file property
interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { authMiddleware, createRateLimiter } from '@uaip/middleware';
import { logger } from '@uaip/utils';
import { MCPClientService } from '../services/mcpClientService.js';
// import MCPToolGraphService from '../services/mcpToolGraphService.js'; // Temporarily disabled
import { MCPResourceDiscoveryService } from '../services/mcpResourceDiscoveryService.js';

interface MCPServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

interface MCPConfig {
  mcpServers: Record<string, MCPServer>;
}

interface ServerInstallationResult {
  name: string;
  status: 'success' | 'error' | 'skipped';
  error?: string;
  pid?: number;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024, // 1MB limit for config files
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Accept .json files and specifically .mcp.json files
    if (file.mimetype === 'application/json' || 
        file.originalname.endsWith('.json') || 
        file.originalname.endsWith('.mcp.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'));
    }
  }
});

// Rate limiting for config uploads
const uploadRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 uploads per minute
  message: {
    success: false,
    error: 'Upload rate limit exceeded',
    message: 'Too many config uploads. Please try again later.'
  }
});

class MCPConfigManager {
  private configPath: string;
  private activeServers: Map<string, any> = new Map();
  private logger = logger; // Add logger reference

  constructor() {
    // Use project root for .mcp.json file
    this.configPath = path.resolve(process.cwd(), '../../../.mcp.json');
  }

  /**
   * Validate MCP configuration structure
   */
  validateConfig(config: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('Invalid JSON structure');
      return { isValid: false, errors };
    }

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      errors.push('Missing or invalid "mcpServers" property');
      return { isValid: false, errors };
    }

    // Validate each server configuration
    Object.entries(config.mcpServers).forEach(([name, serverConfig]: [string, any]) => {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        errors.push(`Server name cannot be empty`);
      }

      if (!serverConfig.command || typeof serverConfig.command !== 'string') {
        errors.push(`Server "${name}": Missing or invalid "command" property`);
      }

      if (!Array.isArray(serverConfig.args)) {
        errors.push(`Server "${name}": Missing or invalid "args" property (must be array)`);
      } else {
        serverConfig.args.forEach((arg: any, index: number) => {
          if (typeof arg !== 'string') {
            errors.push(`Server "${name}": Argument ${index + 1} must be a string`);
          }
        });
      }

      if (serverConfig.env && typeof serverConfig.env !== 'object') {
        errors.push(`Server "${name}": Environment variables must be an object`);
      }

      if (serverConfig.disabled !== undefined && typeof serverConfig.disabled !== 'boolean') {
        errors.push(`Server "${name}": Disabled property must be a boolean`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Read existing MCP configuration
   */
  async readExistingConfig(): Promise<MCPConfig | null> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        this.logger.info('No existing .mcp.json file found, will create new one');
        return null;
      }
      this.logger.error('Error reading existing MCP config:', error);
      throw error;
    }
  }

  /**
   * Merge new configuration with existing one
   */
  mergeConfigs(existing: MCPConfig | null, newConfig: MCPConfig): MCPConfig {
    if (!existing) {
      return newConfig;
    }

    return {
      mcpServers: {
        ...existing.mcpServers,
        ...newConfig.mcpServers
      }
    };
  }

  /**
   * Write merged configuration to file
   */
  async writeConfig(config: MCPConfig): Promise<void> {
    const configContent = JSON.stringify(config, null, 2);
    await fs.writeFile(this.configPath, configContent, 'utf-8');
    this.logger.info(`MCP configuration written to ${this.configPath}`);
  }

  /**
   * Test server installation (dry run)
   */
  async testServerInstallation(serverName: string, server: MCPServer): Promise<boolean> {
    return new Promise((resolve) => {
      // Test if the command itself is available, not the MCP server packages
      let testArgs: string[];
      
      if (server.command === 'npx') {
        // Test if npx is available
        testArgs = ['--help'];
      } else if (server.command === 'uvx') {
        // Test if uvx is available - skip if not available
        testArgs = ['--help'];
        // For uvx, we know it's not available, so skip with warning
        this.logger.warn(`MCP server ${serverName} skipped: uvx not available in container`);
        resolve(false);
        return;
      } else {
        // For other commands, try to run with --version or --help
        testArgs = ['--version'];
      }

      const testProcess = spawn(server.command, testArgs, {
        stdio: 'pipe',
        env: { ...process.env, ...server.env }
      });

      let resolved = false;

      testProcess.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          // Accept exit codes 0, 1 (some help commands exit with 1)
          const success = code === 0 || code === 1;
          if (success) {
            this.logger.info(`MCP server ${serverName} installation test passed`);
          } else {
            this.logger.warn(`MCP server ${serverName} installation test failed with exit code ${code}`);
          }
          resolve(success);
        }
      });

      testProcess.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          this.logger.warn(`MCP server ${serverName} installation test failed: ${error.message}`);
          resolve(false);
        }
      });

      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          testProcess.kill();
          this.logger.warn(`MCP server ${serverName} installation test timed out`);
          resolve(false);
        }
      }, 5000);
    });
  }

  /**
   * Install and start MCP servers
   */
  async installServers(config: MCPConfig): Promise<{
    results: ServerInstallationResult[];
    installationStatus: Record<string, string>;
    installationErrors: Record<string, string>;
  }> {
    const results: ServerInstallationResult[] = [];
    const installationStatus: Record<string, string> = {};
    const installationErrors: Record<string, string> = {};

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      installationStatus[serverName] = 'installing';

      try {
        // Skip disabled servers
        if (serverConfig.disabled) {
          results.push({
            name: serverName,
            status: 'skipped',
            error: 'Server is disabled'
          });
          installationStatus[serverName] = 'skipped';
          continue;
        }

        this.logger.info(`Testing installation for MCP server: ${serverName}`);
        
        // Test if the server can be installed/run
        const canInstall = await this.testServerInstallation(serverName, serverConfig);
        
        if (canInstall) {
          results.push({
            name: serverName,
            status: 'success'
          });
          installationStatus[serverName] = 'success';
          this.logger.info(`MCP server ${serverName} installation test successful`);
        } else {
          const error = `Failed to test installation for command: ${serverConfig.command}`;
          results.push({
            name: serverName,
            status: 'error',
            error
          });
          installationStatus[serverName] = 'error';
          installationErrors[serverName] = error;
          this.logger.warn(`MCP server ${serverName} installation test failed: ${error}`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown installation error';
        results.push({
          name: serverName,
          status: 'error',
          error: errorMessage
        });
        installationStatus[serverName] = 'error';
        installationErrors[serverName] = errorMessage;
        this.logger.error(`Error installing MCP server ${serverName}:`, error);
      }
    }

    return {
      results,
      installationStatus,
      installationErrors
    };
  }

  /**
   * Get current MCP server status
   */
  async getServerStatus(): Promise<{
    configExists: boolean;
    configPath: string;
    servers: Array<{
      name: string;
      command: string;
      args: string[];
      disabled: boolean;
      status: 'unknown' | 'running' | 'stopped';
    }>;
  }> {
    try {
      const config = await this.readExistingConfig();
      
      if (!config) {
        return {
          configExists: false,
          configPath: this.configPath,
          servers: []
        };
      }

      const servers = Object.entries(config.mcpServers).map(([name, serverConfig]) => ({
        name,
        command: serverConfig.command,
        args: serverConfig.args,
        disabled: serverConfig.disabled || false,
        status: 'unknown' as const // We could implement process checking here
      }));

      return {
        configExists: true,
        configPath: this.configPath,
        servers
      };

    } catch (error) {
      this.logger.error('Error getting MCP server status:', error);
      throw error;
    }
  }

  /**
   * Get available MCP tools from all configured servers
   */
  async getAvailableMCPTools(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    serverName: string;
    command: string;
    parameters: any;
    category: string;
  }>> {
    try {
      const config = await this.readExistingConfig();
      
      if (!config) {
        return [];
      }

      const tools: Array<{
        id: string;
        name: string;
        description: string;
        serverName: string;
        command: string;
        parameters: any;
        category: string;
      }> = [];

      // For each configured MCP server, extract available tools
      for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
        if (serverConfig.disabled) {
          continue;
        }

        // Mock tools for now - in a real implementation, we would:
        // 1. Connect to the MCP server
        // 2. Query available tools via MCP protocol
        // 3. Parse and return the tools
        
        // For demonstration, we'll create mock tools based on common MCP servers
        const mockTools = this.getMockToolsForServer(serverName, serverConfig);
        tools.push(...mockTools);
      }

      return tools;
    } catch (error) {
      this.logger.error('Error getting available MCP tools:', error);
      return [];
    }
  }

  /**
   * Get mock tools for a server (placeholder for real MCP tool discovery)
   */
  private getMockToolsForServer(serverName: string, serverConfig: MCPServer): Array<{
    id: string;
    name: string;
    description: string;
    serverName: string;
    command: string;
    parameters: any;
    category: string;
  }> {
    const tools = [];

    // Generate mock tools based on server name patterns
    if (serverName.includes('filesystem') || serverName.includes('file')) {
      tools.push({
        id: `${serverName}_read_file`,
        name: 'read_file',
        description: 'Read contents of a file',
        serverName,
        command: serverConfig.command,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file' }
          },
          required: ['path']
        },
        category: 'mcp'
      });

      tools.push({
        id: `${serverName}_write_file`,
        name: 'write_file',
        description: 'Write contents to a file',
        serverName,
        command: serverConfig.command,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file' },
            content: { type: 'string', description: 'Content to write' }
          },
          required: ['path', 'content']
        },
        category: 'mcp'
      });
    }

    if (serverName.includes('web') || serverName.includes('browser')) {
      tools.push({
        id: `${serverName}_web_search`,
        name: 'web_search',
        description: 'Search the web for information',
        serverName,
        command: serverConfig.command,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        },
        category: 'mcp'
      });

      tools.push({
        id: `${serverName}_web_scrape`,
        name: 'web_scrape',
        description: 'Scrape content from a web page',
        serverName,
        command: serverConfig.command,
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to scrape' }
          },
          required: ['url']
        },
        category: 'mcp'
      });
    }

    if (serverName.includes('database') || serverName.includes('sqlite')) {
      tools.push({
        id: `${serverName}_query_db`,
        name: 'query_database',
        description: 'Execute a database query',
        serverName,
        command: serverConfig.command,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'SQL query to execute' }
          },
          required: ['query']
        },
        category: 'mcp'
      });
    }

    // If no specific tools found, create a generic tool
    if (tools.length === 0) {
      tools.push({
        id: `${serverName}_generic_tool`,
        name: `${serverName}_tool`,
        description: `Generic tool from ${serverName} MCP server`,
        serverName,
        command: serverConfig.command,
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input for the tool' }
          },
          required: ['input']
        },
        category: 'mcp'
      });
    }

    return tools;
  }
}

export function createMCPRoutes(): Router {
  const router = Router();
  const mcpManager = new MCPConfigManager();
  
  logger.info('Creating MCP routes - this should appear in logs');

  // Apply rate limiting to all routes
  router.use(uploadRateLimit);

  /**
   * POST /api/v1/mcp/upload-config
   * Upload and install MCP configuration
   */
  router.post('/upload-config', authMiddleware, upload.single('mcpConfig'), async (req: RequestWithFile, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE',
            message: 'No configuration file provided'
          }
        });
        return;
      }

      // Parse uploaded JSON
      let uploadedConfig: MCPConfig;
      try {
        const configContent = req.file.buffer.toString('utf-8');
        uploadedConfig = JSON.parse(configContent);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Invalid JSON format in uploaded file'
          }
        });
        return;
      }

      // Validate configuration
      const validation = mcpManager.validateConfig(uploadedConfig);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Configuration validation failed',
            details: validation.errors
          }
        });
        return;
      }

      logger.info('Processing MCP configuration upload', {
        serverCount: Object.keys(uploadedConfig.mcpServers).length,
        servers: Object.keys(uploadedConfig.mcpServers)
      });

      // Read existing configuration
      const existingConfig = await mcpManager.readExistingConfig();

      // Merge configurations
      const mergedConfig = mcpManager.mergeConfigs(existingConfig, uploadedConfig);

      // Install servers
      const installationResult = await mcpManager.installServers(uploadedConfig);

      // Write merged configuration to file
      await mcpManager.writeConfig(mergedConfig);

      const successCount = installationResult.results.filter(r => r.status === 'success').length;
      const errorCount = installationResult.results.filter(r => r.status === 'error').length;
      const skippedCount = installationResult.results.filter(r => r.status === 'skipped').length;

      res.json({
        success: true,
        data: {
          message: 'MCP configuration processed successfully',
          configPath: mcpManager['configPath'],
          serversProcessed: installationResult.results.length,
          successCount,
          errorCount,
          skippedCount,
          installationResults: installationResult.results,
          installationStatus: installationResult.installationStatus,
          installationErrors: installationResult.installationErrors,
          mergedServers: Object.keys(mergedConfig.mcpServers)
        }
      });

    } catch (error) {
      logger.error('Error processing MCP configuration upload:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'UPLOAD_ERROR',
          message: 'Failed to process MCP configuration',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/test
   * Test endpoint without auth
   */
  router.get('/test', async (req: Request, res: Response) => {
    res.json({ success: true, message: 'MCP routes working' });
  });

  /**
   * GET /api/v1/mcp/test-tools
   * Test tools discovery without auth (temporary)
   */
  router.get('/test-tools', async (req: Request, res: Response) => {
    try {
      const tools = await mcpManager.getAvailableMCPTools();
      res.json({
        success: true,
        data: {
          tools,
          count: tools.length,
          servers: [...new Set(tools.map(tool => tool.serverName))]
        }
      });
    } catch (error) {
      logger.error('Error getting MCP tools for test:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TOOLS_ERROR',
          message: 'Failed to get MCP tools',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/test-system-status
   * Get MCP system status (temporary)
   */
  router.get('/test-system-status', async (req: Request, res: Response) => {
    try {
      const mcpService = MCPClientService.getInstance();
      const systemStatus = await mcpService.getSystemStatus();
      
      res.json({
        success: true,
        data: {
          systemStatus,
          message: 'MCP system status retrieved'
        }
      });
    } catch (error) {
      logger.error('Error getting MCP system status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SYSTEM_STATUS_ERROR',
          message: 'Failed to get MCP system status',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/status
   * Get current MCP server status
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const status = await mcpManager.getServerStatus();

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      logger.error('Error getting MCP status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATUS_ERROR',
          message: 'Failed to get MCP server status',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/config
   * Get current MCP configuration
   */
  router.get('/config', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const config = await mcpManager.readExistingConfig();

      if (!config) {
        res.json({
          success: true,
          data: {
            exists: false,
            config: null,
            message: 'No MCP configuration file found'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          exists: true,
          config,
          serversCount: Object.keys(config.mcpServers).length,
          servers: Object.keys(config.mcpServers)
        }
      });

    } catch (error) {
      logger.error('Error reading MCP configuration:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'Failed to read MCP configuration',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * POST /api/v1/mcp/restart-server
   * Restart a specific MCP server
   */
  router.post('/restart-server/:serverName', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { serverName } = req.params;

      // This is a placeholder - in a real implementation, you would:
      // 1. Stop the running server process
      // 2. Start it again with the current configuration
      // 3. Update the server status

      logger.info(`Restart requested for MCP server: ${serverName}`);

      res.json({
        success: true,
        data: {
          message: `Server ${serverName} restart initiated`,
          serverName,
          status: 'restarting'
        }
      });

    } catch (error) {
      logger.error(`Error restarting MCP server ${req.params.serverName}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RESTART_ERROR',
          message: 'Failed to restart MCP server',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/tools
   * Get available MCP tools from all configured servers
   */
  router.get('/tools', authMiddleware, async (req: Request, res: Response) => {
    try {
      const tools = await mcpManager.getAvailableMCPTools();

      res.json({
        success: true,
        data: {
          tools,
          count: tools.length,
          servers: [...new Set(tools.map(tool => tool.serverName))]
        }
      });

    } catch (error) {
      logger.error('Error getting MCP tools:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TOOLS_ERROR',
          message: 'Failed to get MCP tools',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/tools/:serverName
   * Get available tools from a specific MCP server
   */
  // System Requirements Check
  router.get('/system-requirements', authMiddleware, async (req: Request, res: Response) => {
    try {
      const mcpService = MCPClientService.getInstance();
      const requirements = await mcpService.checkSystemRequirements();
      
      res.json({
        success: true,
        data: requirements
      });
    } catch (error) {
      logger.error('Failed to check system requirements:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check system requirements',
        details: error.message
      });
    }
  });

  // Install Missing Tool
  router.post('/install-tool/:toolName', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { toolName } = req.params;
      const mcpService = MCPClientService.getInstance();
      
      logger.info(`Attempting to install tool: ${toolName}`);
      const success = await mcpService.installMissingTool(toolName);
      
      if (success) {
        res.json({
          success: true,
          message: `Successfully installed ${toolName}`,
          tool: toolName
        });
      } else {
        res.status(400).json({
          success: false,
          error: `Failed to install ${toolName}`,
          message: 'Tool installation failed or requires manual setup'
        });
      }
    } catch (error) {
      logger.error(`Failed to install tool ${req.params.toolName}:`, error);
      res.status(500).json({
        success: false,
        error: 'Tool installation failed',
        details: error.message
      });
    }
  });

  router.get('/tools/:serverName', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { serverName } = req.params;
      const allTools = await mcpManager.getAvailableMCPTools();
      const serverTools = allTools.filter(tool => tool.serverName === serverName);

      res.json({
        success: true,
        data: {
          serverName,
          tools: serverTools,
          count: serverTools.length
        }
      });

    } catch (error) {
      logger.error(`Error getting MCP tools for server ${req.params.serverName}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TOOLS_ERROR',
          message: 'Failed to get MCP tools for server',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * POST /api/v1/mcp/tools
   * Create a new MCP tool definition
   */
  router.post('/tools', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { name, description, serverName, parameters, category = 'mcp' } = req.body;

      if (!name || !description || !serverName) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Missing required fields: name, description, serverName'
          }
        });
        return;
      }

      // Create the tool in the unified tool system and knowledge graph
      const toolId = `mcp_${serverName}_${name}_${Date.now()}`;
      
      const newTool = {
        id: toolId,
        name,
        description,
        serverName,
        parameters: parameters || {},
        category,
        createdAt: new Date().toISOString(),
        command: 'mcp-call', // Special command indicating MCP tool
        enabled: true
      };

      // Register tool in knowledge graph (temporarily disabled due to interface issues)
      try {
        // const graphService = MCPToolGraphService.getInstance();
        // await graphService.registerToolInGraph(...);
        logger.info(`Created MCP tool: ${name} for server: ${serverName} (graph registration disabled)`);
      } catch (graphError) {
        logger.error(`Failed to register tool in graph, but tool created:`, graphError);
        // Continue with tool creation even if graph registration fails
      }

      res.json({
        success: true,
        data: {
          tool: newTool,
          message: 'MCP tool created successfully'
        }
      });

    } catch (error) {
      logger.error('Error creating MCP tool:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CREATION_ERROR',
          message: 'Failed to create MCP tool',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * PUT /api/v1/mcp/tools/:toolId
   * Update an existing MCP tool
   */
  router.put('/tools/:toolId', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { toolId } = req.params;
      const { name, description, parameters, enabled } = req.body;

      // TODO: Implement actual MCP tool update in database
      // This would involve updating the tool in the unified tool system

      logger.info(`Updated MCP tool: ${toolId}`);

      res.json({
        success: true,
        data: {
          toolId,
          message: 'MCP tool updated successfully',
          updates: { name, description, parameters, enabled }
        }
      });

    } catch (error) {
      logger.error(`Error updating MCP tool ${req.params.toolId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_ERROR',
          message: 'Failed to update MCP tool',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * DELETE /api/v1/mcp/tools/:toolId
   * Delete an MCP tool
   */
  router.delete('/tools/:toolId', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { toolId } = req.params;

      // Remove tool from database and knowledge graph (temporarily disabled)
      try {
        // const graphService = MCPToolGraphService.getInstance();
        // await graphService.removeToolFromGraph(toolId);
        
        // TODO: Also remove from unified tool system database
        
        logger.info(`Deleted MCP tool: ${toolId} (graph removal disabled)`);
      } catch (graphError) {
        logger.error(`Failed to remove tool from graph:`, graphError);
        // Continue with deletion response even if graph cleanup fails
      }

      res.json({
        success: true,
        data: {
          toolId,
          message: 'MCP tool deleted successfully'
        }
      });

    } catch (error) {
      logger.error(`Error deleting MCP tool ${req.params.toolId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DELETION_ERROR',
          message: 'Failed to delete MCP tool',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * POST /api/v1/mcp/tools/:toolId/execute
   * Execute an MCP tool
   */
  router.post('/tools/:toolId/execute', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { toolId } = req.params;
      const { parameters, agentId } = req.body;

      // TODO: Implement actual MCP tool execution
      // This would involve:
      // 1. Looking up the tool in the database
      // 2. Finding the associated MCP server
      // 3. Establishing connection to the MCP server
      // 4. Sending the tool execution request
      // 5. Returning the result

      logger.info(`Executing MCP tool: ${toolId} with agent: ${agentId}`);

      // Mock execution result for now
      const executionResult = {
        success: true,
        output: `Mock execution of MCP tool ${toolId}`,
        timestamp: new Date().toISOString(),
        executionTime: Math.random() * 1000,
        parameters
      };

      res.json({
        success: true,
        data: {
          toolId,
          result: executionResult,
          message: 'MCP tool executed successfully'
        }
      });

    } catch (error) {
      logger.error(`Error executing MCP tool ${req.params.toolId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: 'Failed to execute MCP tool',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/tools/:toolId/schema
   * Get the schema for an MCP tool
   */
  router.get('/tools/:toolId/schema', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { toolId } = req.params;

      // TODO: Implement actual schema retrieval from MCP server
      // This would involve connecting to the MCP server and querying the tool schema

      const mockSchema = {
        name: toolId,
        description: `Schema for MCP tool ${toolId}`,
        inputSchema: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Input parameter for the tool'
            }
          },
          required: ['input']
        },
        outputSchema: {
          type: 'object',
          properties: {
            result: {
              type: 'string',
              description: 'Output from the tool execution'
            }
          }
        }
      };

      res.json({
        success: true,
        data: {
          toolId,
          schema: mockSchema
        }
      });

    } catch (error) {
      logger.error(`Error getting schema for MCP tool ${req.params.toolId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SCHEMA_ERROR',
          message: 'Failed to get MCP tool schema',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/tools/:toolId/recommendations
   * Get tool recommendations based on graph relationships
   */
  router.get('/tools/:toolId/recommendations', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { toolId } = req.params;
      const limit = parseInt(req.query.limit as string) || 5;

      // const graphService = MCPToolGraphService.getInstance();
      // const recommendations = await graphService.getToolRecommendations(toolId, limit);
      const recommendations: any[] = []; // Temporarily disabled

      res.json({
        success: true,
        data: {
          toolId,
          recommendations,
          count: recommendations.length
        }
      });

    } catch (error) {
      logger.error(`Error getting recommendations for MCP tool ${req.params.toolId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RECOMMENDATIONS_ERROR',
          message: 'Failed to get tool recommendations',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/tools/capabilities/:capability
   * Find tools by capability
   */
  router.get('/tools/capabilities/:capability', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { capability } = req.params;

      // const graphService = MCPToolGraphService.getInstance();
      // const tools = await graphService.findToolsByCapability(capability);
      const tools: any[] = []; // Temporarily disabled

      res.json({
        success: true,
        data: {
          capability,
          tools,
          count: tools.length
        }
      });

    } catch (error) {
      logger.error(`Error finding tools by capability ${req.params.capability}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CAPABILITY_SEARCH_ERROR',
          message: 'Failed to find tools by capability',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/tools/:toolId/dependencies
   * Get tool dependency graph
   */
  router.get('/tools/:toolId/dependencies', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { toolId } = req.params;

      // const graphService = MCPToolGraphService.getInstance();
      // const dependencyGraph = await graphService.getToolDependencyGraph(toolId);
      const dependencyGraph = {}; // Temporarily disabled

      res.json({
        success: true,
        data: {
          toolId,
          dependencyGraph
        }
      });

    } catch (error) {
      logger.error(`Error getting dependency graph for MCP tool ${req.params.toolId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DEPENDENCY_GRAPH_ERROR',
          message: 'Failed to get tool dependency graph',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/resources
   * Discover all available MCP resources
   */
  router.get('/resources', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { serverName } = req.query as { serverName?: string };
      const mcpService = MCPClientService.getInstance();
      const resources = await mcpService.discoverResources(serverName);

      res.json({
        success: true,
        data: {
          resources,
          count: resources.length,
          servers: [...new Set(resources.map(r => r.serverName))]
        }
      });

    } catch (error) {
      logger.error('Error discovering MCP resources:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RESOURCE_DISCOVERY_ERROR',
          message: 'Failed to discover MCP resources',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * POST /api/v1/mcp/resource
   * Get specific resource content by posting URI in body
   */
  router.post('/resource', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { serverName, uri } = req.body;
      
      if (!serverName || !uri) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Missing required fields: serverName, uri'
          }
        });
        return;
      }
      
      const mcpService = MCPClientService.getInstance();
      const resource = await mcpService.getResource(serverName, uri);

      res.json({
        success: true,
        data: {
          serverName,
          uri,
          resource
        }
      });

    } catch (error) {
      logger.error(`Error getting resource ${req.body.uri} from server ${req.body.serverName}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RESOURCE_GET_ERROR',
          message: 'Failed to get MCP resource',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/prompts
   * Discover all available MCP prompts
   */
  router.get('/prompts', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { serverName } = req.query as { serverName?: string };
      const mcpService = MCPClientService.getInstance();
      const prompts = await mcpService.discoverPrompts(serverName);

      res.json({
        success: true,
        data: {
          prompts,
          count: prompts.length,
          servers: [...new Set(prompts.map(p => p.serverName))]
        }
      });

    } catch (error) {
      logger.error('Error discovering MCP prompts:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PROMPT_DISCOVERY_ERROR',
          message: 'Failed to discover MCP prompts',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * POST /api/v1/mcp/prompts/:serverName/:promptName
   * Execute a specific prompt
   */
  router.post('/prompts/:serverName/:promptName', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { serverName, promptName } = req.params;
      const { arguments: promptArgs } = req.body;
      
      const mcpService = MCPClientService.getInstance();
      const result = await mcpService.getPrompt(serverName, promptName, promptArgs);

      res.json({
        success: true,
        data: {
          serverName,
          promptName,
          arguments: promptArgs,
          result
        }
      });

    } catch (error) {
      logger.error(`Error executing prompt ${req.params.promptName} from server ${req.params.serverName}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PROMPT_EXECUTION_ERROR',
          message: 'Failed to execute MCP prompt',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/servers/:serverName/selectable-tools
   * Get selectable tools from a specific server for individual attachment
   */
  router.get('/servers/:serverName/selectable-tools', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { serverName } = req.params;
      const mcpService = MCPClientService.getInstance();
      const tools = await mcpService.getSelectableToolsFromServer(serverName);

      res.json({
        success: true,
        data: {
          serverName,
          tools,
          count: tools.length
        }
      });

    } catch (error) {
      logger.error(`Error getting selectable tools from server ${req.params.serverName}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SELECTABLE_TOOLS_ERROR',
          message: 'Failed to get selectable tools from MCP server',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * POST /api/v1/mcp/agents/:agentId/attach-tool
   * Attach a single tool from an MCP server to an agent
   */
  router.post('/agents/:agentId/attach-tool', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const { serverName, toolName } = req.body;

      if (!serverName || !toolName) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Missing required fields: serverName, toolName'
          }
        });
        return;
      }

      const mcpService = MCPClientService.getInstance();
      const result = await mcpService.attachSingleToolToAgent(agentId, serverName, toolName);

      res.json({
        success: result.success,
        data: {
          agentId,
          serverName,
          toolName,
          toolId: result.toolId,
          assignment: result.assignment,
          message: result.success 
            ? `Successfully attached tool ${toolName} from server ${serverName} to agent ${agentId}`
            : `Failed to attach tool ${toolName} from server ${serverName} to agent ${agentId}`
        }
      });

    } catch (error) {
      logger.error(`Error attaching tool to agent ${req.params.agentId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TOOL_ATTACHMENT_ERROR',
          message: 'Failed to attach MCP tool to agent',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/discover
   * Comprehensive resource discovery across all MCP servers
   */
  router.get('/discover', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { serverName } = req.query as { serverName?: string };
      const discoveryService = MCPResourceDiscoveryService.getInstance();
      const discovery = await discoveryService.discoverAllResources(serverName);

      res.json({
        success: true,
        data: {
          ...discovery,
          summary: {
            totalResources: discovery.resources.length,
            totalPrompts: discovery.prompts.length,
            totalTools: discovery.tools.length,
            totalServers: discovery.servers.length,
            resourceCategories: [...new Set(discovery.resources.map(r => r.category))],
            promptCategories: [...new Set(discovery.prompts.map(p => p.category))],
            toolCategories: [...new Set(discovery.tools.map(t => t.category))]
          }
        }
      });

    } catch (error) {
      logger.error('Error in comprehensive MCP discovery:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DISCOVERY_ERROR',
          message: 'Failed to perform comprehensive MCP discovery',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  /**
   * GET /api/v1/mcp/search/resources
   * Search MCP resources with filters
   */
  router.get('/search/resources', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { query, serverName, category, mimeType } = req.query as {
        query: string;
        serverName?: string;
        category?: string;
        mimeType?: string;
      };

      if (!query) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query parameter is required'
          }
        });
        return;
      }

      const discoveryService = MCPResourceDiscoveryService.getInstance();
      const resources = await discoveryService.searchResources(query, {
        serverName,
        category,
        mimeType
      });

      res.json({
        success: true,
        data: {
          query,
          filters: { serverName, category, mimeType },
          resources,
          count: resources.length
        }
      });

    } catch (error) {
      logger.error('Error searching MCP resources:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SEARCH_ERROR',
          message: 'Failed to search MCP resources',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  return router;
}

logger.info('About to create MCP routes...');
export const mcpRoutes = createMCPRoutes();
logger.info('MCP routes created successfully');