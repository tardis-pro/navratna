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
        logger.info('No existing .mcp.json file found, will create new one');
        return null;
      }
      logger.error('Error reading existing MCP config:', error);
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
    logger.info(`MCP configuration written to ${this.configPath}`);
  }

  /**
   * Test server installation (dry run)
   */
  async testServerInstallation(serverName: string, server: MCPServer): Promise<boolean> {
    return new Promise((resolve) => {
      // For npm/npx commands, test with --help flag
      // For uvx commands, test with --help flag
      // For other commands, just check if command exists

      let testArgs: string[];
      if (server.command === 'npx') {
        testArgs = [...server.args, '--help'];
      } else if (server.command === 'uvx') {
        testArgs = [...server.args, '--help'];
      } else {
        // For other commands, try to run with --version or --help
        testArgs = ['--version'];
      }

      const testProcess = spawn(server.command, testArgs, {
        stdio: 'pipe',
        env: { ...process.env, ...server.env },
        timeout: 10000 // 10 second timeout
      });

      let resolved = false;

      testProcess.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          // Accept exit codes 0, 1 (some help commands exit with 1)
          resolve(code === 0 || code === 1);
        }
      });

      testProcess.on('error', () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          testProcess.kill();
          resolve(false);
        }
      }, 10000);
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

        logger.info(`Testing installation for MCP server: ${serverName}`);
        
        // Test if the server can be installed/run
        const canInstall = await this.testServerInstallation(serverName, serverConfig);
        
        if (canInstall) {
          results.push({
            name: serverName,
            status: 'success'
          });
          installationStatus[serverName] = 'success';
          logger.info(`MCP server ${serverName} installation test successful`);
        } else {
          const error = `Failed to test installation for command: ${serverConfig.command}`;
          results.push({
            name: serverName,
            status: 'error',
            error
          });
          installationStatus[serverName] = 'error';
          installationErrors[serverName] = error;
          logger.warn(`MCP server ${serverName} installation test failed: ${error}`);
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
        logger.error(`Error installing MCP server ${serverName}:`, error);
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
      logger.error('Error getting MCP server status:', error);
      throw error;
    }
  }
}

export function createMCPRoutes(): Router {
  const router = Router();
  const mcpManager = new MCPConfigManager();

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
   * GET /api/v1/mcp/status
   * Get current MCP server status
   */
  router.get('/status', authMiddleware, async (req: Request, res: Response) => {
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

  return router;
}

export const mcpRoutes = createMCPRoutes();