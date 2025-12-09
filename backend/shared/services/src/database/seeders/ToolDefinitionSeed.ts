import { DataSource, DeepPartial } from 'typeorm';
import { BaseSeed } from './BaseSeed.js';
import { ToolDefinition } from '../../entities/toolDefinition.entity.js';
import { UserEntity } from '../../entities/user.entity.js';
import { ToolCategory, SecurityLevel } from '@uaip/types';

/**
 * Tool Definition seeder
 */
export class ToolDefinitionSeed extends BaseSeed<ToolDefinition> {
  private users: UserEntity[] = [];

  constructor(dataSource: DataSource, users: UserEntity[]) {
    super(dataSource, dataSource.getRepository(ToolDefinition), 'ToolDefinitions');
    this.users = users;
  }

  getUniqueField(): keyof ToolDefinition {
    return 'name';
  }

  async getSeedData(): Promise<DeepPartial<ToolDefinition>[]> {
    const adminUser = this.users.find((u) => u.role === 'system_admin') || this.users[0];
    const developerUser = this.users.find((u) => u.role === 'developer') || this.users[0];

    return [
      {
        name: 'File System Reader',
        description: 'Tool for reading files and directories from the file system',
        category: ToolCategory.SYSTEM,
        version: '1.0.0',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file or directory to read',
            },
            encoding: {
              type: 'string',
              description: 'File encoding (default: utf-8)',
              default: 'utf-8',
            },
          },
          required: ['path'],
        },
        returnType: {
          type: 'string',
          description: 'File content or directory listing',
        },
        securityLevel: SecurityLevel.MEDIUM,
        author: 'UAIP System',
        tags: ['filesystem', 'read', 'utility'],
        examples: [
          {
            name: 'Read text file',
            description: 'Read a text file from the filesystem',
            input: { path: '/home/user/document.txt' },
            expectedOutput: 'File content as string',
          },
        ],
        rateLimits: {
          maxCallsPerMinute: 60,
          maxCallsPerHour: 1000,
        },
        dependencies: [],
        isEnabled: true,
        requiresApproval: false,
      },
      {
        name: 'HTTP Request',
        description: 'Tool for making HTTP requests to external APIs',
        category: ToolCategory.NETWORK,
        version: '2.1.0',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to make the request to',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
              description: 'HTTP method',
              default: 'GET',
            },
            headers: {
              type: 'object',
              description: 'HTTP headers',
            },
            body: {
              type: 'object',
              description: 'Request body for POST/PUT requests',
            },
            timeout: {
              type: 'number',
              description: 'Request timeout in milliseconds',
              default: 30000,
            },
          },
          required: ['url'],
        },
        returnType: {
          type: 'object',
          properties: {
            status: { type: 'number' },
            headers: { type: 'object' },
            body: { type: 'any' },
          },
        },
        securityLevel: SecurityLevel.HIGH,
        author: 'UAIP System',
        tags: ['http', 'api', 'network', 'request'],
        examples: [
          {
            name: 'GET API request',
            description: 'Make a GET request to an external API',
            input: {
              url: 'https://api.example.com/data',
              method: 'GET',
              headers: { Authorization: 'Bearer token' },
            },
            expectedOutput: 'HTTP response object with status, headers, and body',
          },
        ],
        rateLimits: {
          maxCallsPerMinute: 30,
          maxCallsPerHour: 500,
        },
        dependencies: [],
        isEnabled: true,
        requiresApproval: true,
      },
      {
        name: 'Database Query',
        description: 'Tool for executing database queries',
        category: ToolCategory.DATABASE,
        version: '1.5.0',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'SQL query to execute',
            },
            parameters: {
              type: 'array',
              description: 'Query parameters for prepared statements',
            },
            database: {
              type: 'string',
              description: 'Database connection name',
              default: 'default',
            },
          },
          required: ['query'],
        },
        returnType: {
          type: 'array',
          items: { type: 'object' },
          description: 'Query results as array of objects',
        },
        securityLevel: SecurityLevel.CRITICAL,
        author: 'UAIP System',
        tags: ['database', 'sql', 'query'],
        examples: [
          {
            name: 'Select query',
            description: 'Execute a SELECT query with parameters',
            input: {
              query: 'SELECT * FROM users WHERE id = ?',
              parameters: [123],
            },
            expectedOutput: 'Query results as array of objects',
          },
        ],
        rateLimits: {
          maxCallsPerMinute: 10,
          maxCallsPerHour: 100,
        },
        dependencies: [],
        isEnabled: true,
        requiresApproval: true,
      },
      {
        name: 'Code Executor',
        description: 'Tool for executing code in sandboxed environments',
        category: ToolCategory.DEVELOPMENT,
        version: '3.0.0',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Code to execute',
            },
            language: {
              type: 'string',
              enum: ['python', 'javascript', 'typescript', 'bash'],
              description: 'Programming language',
            },
            timeout: {
              type: 'number',
              description: 'Execution timeout in milliseconds',
              default: 30000,
            },
            environment: {
              type: 'object',
              description: 'Environment variables',
            },
          },
          required: ['code', 'language'],
        },
        returnType: {
          type: 'object',
          properties: {
            stdout: { type: 'string' },
            stderr: { type: 'string' },
            exitCode: { type: 'number' },
          },
        },
        securityLevel: SecurityLevel.CRITICAL,
        author: 'UAIP System',
        tags: ['code', 'execution', 'sandbox', 'development'],
        examples: [
          {
            name: 'Python code execution',
            description: 'Execute Python code in a sandbox',
            input: {
              code: 'print("Hello, World!")',
              language: 'python',
            },
            expectedOutput: 'Execution result with stdout, stderr, and exit code',
          },
        ],
        rateLimits: {
          maxCallsPerMinute: 5,
          maxCallsPerHour: 50,
        },
        dependencies: [],
        isEnabled: true,
        requiresApproval: true,
      },
    ];
  }
}
