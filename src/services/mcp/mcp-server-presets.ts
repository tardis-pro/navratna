// MCP Server Presets for Council of Nycea
// Pre-configured settings for popular MCP servers from https://github.com/modelcontextprotocol/servers

import { MCPServerPreset } from '../../types/mcp';

export const mcpServerPresets: MCPServerPreset[] = [
  // File System Server
  {
    id: 'filesystem',
    name: 'File System',
    description: 'Secure file system access with configurable directory restrictions',
    config: {
      name: 'File System Server',
      description: 'Provides secure file system operations within specified directories',
      type: 'npx',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/files'],
      enabled: false,
      autoStart: false,
      retryAttempts: 3,
      healthCheckInterval: 30000,
      timeout: 10000,
      tags: ['filesystem', 'files', 'io'],
      author: 'Anthropic',
      version: 'latest',
      requiresApproval: true,
      securityLevel: 'restricted'
    },
    setupInstructions: 'Replace "/path/to/allowed/files" with the actual directory path you want to allow access to.',
    documentation: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem'
  },

  // GitHub Server
  {
    id: 'github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories, issues, and pull requests',
    config: {
      name: 'GitHub Server',
      description: 'Access GitHub repositories, create issues, manage pull requests',
      type: 'npx',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: '<YOUR_TOKEN>'
      },
      enabled: false,
      autoStart: false,
      retryAttempts: 3,
      healthCheckInterval: 60000,
      timeout: 15000,
      tags: ['github', 'git', 'repository', 'collaboration'],
      author: 'Anthropic',
      version: 'latest',
      requiresApproval: true,
      securityLevel: 'restricted'
    },
    setupInstructions: 'Set GITHUB_PERSONAL_ACCESS_TOKEN environment variable with your GitHub token.',
    requiredEnvVars: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    documentation: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github'
  },

  // Memory Server
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent memory storage for conversations and context',
    config: {
      name: 'Memory Server',
      description: 'Provides persistent memory storage across conversations',
      type: 'npx',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      enabled: true,
      autoStart: true,
      retryAttempts: 3,
      healthCheckInterval: 30000,
      timeout: 5000,
      tags: ['memory', 'persistence', 'context'],
      author: 'Anthropic',
      version: 'latest',
      requiresApproval: false,
      securityLevel: 'safe'
    },
    setupInstructions: 'No additional setup required. Memory will persist in local storage.',
    documentation: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory'
  },

  // PostgreSQL Server
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Execute read-only SQL queries against PostgreSQL databases',
    config: {
      name: 'PostgreSQL Server',
      description: 'Read-only access to PostgreSQL databases for data analysis',
      type: 'npx',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
      enabled: false,
      autoStart: false,
      retryAttempts: 3,
      healthCheckInterval: 60000,
      timeout: 20000,
      tags: ['database', 'postgresql', 'sql', 'analytics'],
      author: 'Anthropic',
      version: 'latest',
      requiresApproval: true,
      securityLevel: 'restricted'
    },
    setupInstructions: 'Replace the connection string with your PostgreSQL database URL.',
    documentation: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres'
  },

  // Git Server (Python)
  {
    id: 'git',
    name: 'Git Repository',
    description: 'Read and analyze Git repositories, commits, and diffs',
    config: {
      name: 'Git Server',
      description: 'Analyze Git repositories, view commits, diffs, and file history',
      type: 'uvx',
      command: 'uvx',
      args: ['mcp-server-git', '--repository', 'path/to/git/repo'],
      enabled: false,
      autoStart: false,
      retryAttempts: 3,
      healthCheckInterval: 30000,
      timeout: 10000,
      tags: ['git', 'repository', 'version-control', 'analysis'],
      author: 'Anthropic',
      version: 'latest',
      requiresApproval: false,
      securityLevel: 'moderate'
    },
    setupInstructions: 'Replace "path/to/git/repo" with the path to your Git repository.',
    documentation: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git'
  },

  // Brave Search Server
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web search capabilities using Brave Search API',
    config: {
      name: 'Brave Search Server',
      description: 'Perform web searches using the Brave Search API',
      type: 'npx',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: {
        BRAVE_API_KEY: '<YOUR_API_KEY>'
      },
      enabled: false,
      autoStart: false,
      retryAttempts: 3,
      healthCheckInterval: 60000,
      timeout: 15000,
      tags: ['search', 'web', 'brave', 'internet'],
      author: 'Anthropic',
      version: 'latest',
      requiresApproval: true,
      securityLevel: 'moderate'
    },
    setupInstructions: 'Get a Brave Search API key and set BRAVE_API_KEY environment variable.',
    requiredEnvVars: ['BRAVE_API_KEY'],
    documentation: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search'
  },

  // SQLite Server
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query SQLite databases with read-only access',
    config: {
      name: 'SQLite Server',
      description: 'Execute read-only queries against SQLite databases',
      type: 'npx',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', 'path/to/database.db'],
      enabled: false,
      autoStart: false,
      retryAttempts: 3,
      healthCheckInterval: 30000,
      timeout: 10000,
      tags: ['database', 'sqlite', 'sql', 'local'],
      author: 'Anthropic',
      version: 'latest',
      requiresApproval: false,
      securityLevel: 'moderate'
    },
    setupInstructions: 'Replace "path/to/database.db" with the path to your SQLite database file.',
    documentation: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite'
  },

  // Google Drive Server
  {
    id: 'gdrive',
    name: 'Google Drive',
    description: 'Access and search Google Drive files and folders',
    config: {
      name: 'Google Drive Server',
      description: 'Read and search files in Google Drive',
      type: 'npx',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-gdrive'],
      enabled: false,
      autoStart: false,
      retryAttempts: 3,
      healthCheckInterval: 60000,
      timeout: 20000,
      tags: ['gdrive', 'google', 'cloud', 'documents'],
      author: 'Anthropic',
      version: 'latest',
      requiresApproval: true,
      securityLevel: 'restricted'
    },
    setupInstructions: 'Requires Google OAuth setup and credentials configuration.',
    documentation: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive'
  },

  // Slack Server
  {
    id: 'slack',
    name: 'Slack',
    description: 'Read Slack messages and channel information',
    config: {
      name: 'Slack Server',
      description: 'Access Slack workspace messages and channels',
      type: 'npx',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      env: {
        SLACK_BOT_TOKEN: '<YOUR_BOT_TOKEN>'
      },
      enabled: false,
      autoStart: false,
      retryAttempts: 3,
      healthCheckInterval: 60000,
      timeout: 15000,
      tags: ['slack', 'communication', 'team', 'messages'],
      author: 'Anthropic',
      version: 'latest',
      requiresApproval: true,
      securityLevel: 'restricted'
    },
    setupInstructions: 'Create a Slack app and set SLACK_BOT_TOKEN environment variable.',
    requiredEnvVars: ['SLACK_BOT_TOKEN'],
    documentation: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack'
  },

  // Puppeteer Server
  {
    id: 'puppeteer',
    name: 'Web Scraping',
    description: 'Web scraping and browser automation with Puppeteer',
    config: {
      name: 'Puppeteer Server',
      description: 'Automated web browsing and scraping capabilities',
      type: 'npx',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
      enabled: false,
      autoStart: false,
      retryAttempts: 2,
      healthCheckInterval: 120000,
      timeout: 30000,
      tags: ['puppeteer', 'scraping', 'browser', 'automation'],
      author: 'Anthropic',
      version: 'latest',
      requiresApproval: true,
      securityLevel: 'dangerous'
    },
    setupInstructions: 'Requires Chromium browser. May need additional system dependencies.',
    documentation: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer'
  }
];

// Helper function to get preset by ID
export function getMCPServerPreset(presetId: string): MCPServerPreset | undefined {
  return mcpServerPresets.find(preset => preset.id === presetId);
}

// Helper function to get presets by category/tag
export function getMCPServerPresetsByTag(tag: string): MCPServerPreset[] {
  return mcpServerPresets.filter(preset => 
    preset.config.tags.includes(tag.toLowerCase())
  );
}

// Helper function to get safe presets (for default installation)
export function getSafeMCPServerPresets(): MCPServerPreset[] {
  return mcpServerPresets.filter(preset => 
    preset.config.securityLevel === 'safe'
  );
} 