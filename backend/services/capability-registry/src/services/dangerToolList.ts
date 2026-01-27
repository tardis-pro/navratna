/**
 * Danger Tool List
 *
 * Defines high-risk tools that require approval before execution.
 * These tools typically involve:
 * - System-level operations (file system, network, process execution)
 * - Data modification (database writes, deletion)
 * - External integrations (API calls with credentials)
 * - Security-sensitive operations (authentication, authorization)
 */

export interface DangerToolConfig {
  /** Tool ID pattern (supports wildcards like 'file.*') */
  toolIdPattern: string;
  /** Risk level: LOW, MEDIUM, HIGH, CRITICAL */
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Categories of risk */
  categories: DangerToolCategory[];
  /** Description of why this tool is dangerous */
  reason: string;
  /** Required approval level */
  requiredApproval: ApprovalLevel;
  /** Whether execution should be logged for audit */
  auditRequired: boolean;
}

export type DangerToolCategory =
  | 'FILE_SYSTEM'
  | 'NETWORK'
  | 'PROCESS_EXECUTION'
  | 'DATABASE_WRITE'
  | 'DATABASE_DELETE'
  | 'SYSTEM_CONFIG'
  | 'EXTERNAL_API'
  | 'AUTH_SECURITY'
  | 'DATA_EXPORT'
  | 'CODE_EXECUTION';

export type ApprovalLevel =
  | 'NONE' // No approval needed
  | 'USER_CONSENT' // User must explicitly consent
  | 'MANAGER' // Requires manager approval
  | 'ADMIN' // Requires admin approval
  | 'SECURITY_TEAM'; // Requires security team approval;

/**
 * Check if a tool ID matches a danger tool pattern
 */
export function matchesDangerToolPattern(toolId: string, pattern: string): boolean {
  if (pattern === toolId) return true;

  // Handle wildcard patterns
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return toolId.startsWith(`${prefix}.`) || toolId === prefix;
  }

  // Handle prefix wildcards
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return toolId.endsWith(suffix) || toolId === suffix;
  }

  return false;
}

/**
 * Danger tool configurations
 * These tools require approval before execution
 */
export const DANGER_TOOLS: DangerToolConfig[] = [
  // File System Operations
  {
    toolIdPattern: 'file.write',
    riskLevel: 'HIGH',
    categories: ['FILE_SYSTEM', 'DATA_EXPORT'],
    reason: 'Can write files to disk, potentially overwriting system files or exfiltrating data',
    requiredApproval: 'USER_CONSENT',
    auditRequired: true,
  },
  {
    toolIdPattern: 'file.delete',
    riskLevel: 'HIGH',
    categories: ['FILE_SYSTEM'],
    reason: 'Can delete files from disk, potentially causing data loss',
    requiredApproval: 'USER_CONSENT',
    auditRequired: true,
  },
  {
    toolIdPattern: 'file.mkdir',
    riskLevel: 'MEDIUM',
    categories: ['FILE_SYSTEM'],
    reason: 'Can create directories, potentially in unexpected locations',
    requiredApproval: 'NONE',
    auditRequired: false,
  },

  // Process Execution
  {
    toolIdPattern: 'process.run',
    riskLevel: 'CRITICAL',
    categories: ['PROCESS_EXECUTION', 'SYSTEM_CONFIG'],
    reason: 'Can execute arbitrary commands on the system',
    requiredApproval: 'ADMIN',
    auditRequired: true,
  },
  {
    toolIdPattern: 'process.kill',
    riskLevel: 'HIGH',
    categories: ['PROCESS_EXECUTION'],
    reason: 'Can terminate running processes',
    requiredApproval: 'MANAGER',
    auditRequired: true,
  },

  // Database Operations
  {
    toolIdPattern: 'database.delete',
    riskLevel: 'CRITICAL',
    categories: ['DATABASE_DELETE'],
    reason: 'Can delete data from database, potentially causing permanent data loss',
    requiredApproval: 'MANAGER',
    auditRequired: true,
  },
  {
    toolIdPattern: 'database.update',
    riskLevel: 'HIGH',
    categories: ['DATABASE_WRITE'],
    reason: 'Can modify database records',
    requiredApproval: 'USER_CONSENT',
    auditRequired: true,
  },
  {
    toolIdPattern: 'database.insert',
    riskLevel: 'MEDIUM',
    categories: ['DATABASE_WRITE'],
    reason: 'Can insert new records into database',
    requiredApproval: 'NONE',
    auditRequired: false,
  },

  // Network Operations
  {
    toolIdPattern: 'http.request',
    riskLevel: 'MEDIUM',
    categories: ['NETWORK', 'EXTERNAL_API'],
    reason: 'Can make HTTP requests to external services',
    requiredApproval: 'NONE',
    auditRequired: false,
  },
  {
    toolIdPattern: 'http.post',
    riskLevel: 'MEDIUM',
    categories: ['NETWORK', 'EXTERNAL_API'],
    reason: 'Can send data to external endpoints',
    requiredApproval: 'NONE',
    auditRequired: false,
  },

  // System Configuration
  {
    toolIdPattern: 'system.env',
    riskLevel: 'HIGH',
    categories: ['SYSTEM_CONFIG', 'AUTH_SECURITY'],
    reason: 'Can access or modify environment variables (may contain secrets)',
    requiredApproval: 'MANAGER',
    auditRequired: true,
  },
  {
    toolIdPattern: 'system.config',
    riskLevel: 'CRITICAL',
    categories: ['SYSTEM_CONFIG'],
    reason: 'Can modify system configuration',
    requiredApproval: 'SECURITY_TEAM',
    auditRequired: true,
  },

  // Authentication & Security
  {
    toolIdPattern: 'auth.createToken',
    riskLevel: 'HIGH',
    categories: ['AUTH_SECURITY'],
    reason: 'Can create authentication tokens',
    requiredApproval: 'ADMIN',
    auditRequired: true,
  },
  {
    toolIdPattern: 'auth.impersonate',
    riskLevel: 'CRITICAL',
    categories: ['AUTH_SECURITY'],
    reason: 'Can impersonate other users - major security risk',
    requiredApproval: 'SECURITY_TEAM',
    auditRequired: true,
  },

  // Code Execution
  {
    toolIdPattern: 'code.execute',
    riskLevel: 'CRITICAL',
    categories: ['CODE_EXECUTION', 'PROCESS_EXECUTION'],
    reason: 'Can execute arbitrary code',
    requiredApproval: 'SECURITY_TEAM',
    auditRequired: true,
  },
  {
    toolIdPattern: 'eval.*',
    riskLevel: 'CRITICAL',
    categories: ['CODE_EXECUTION'],
    reason: 'Eval-based execution is inherently dangerous',
    requiredApproval: 'SECURITY_TEAM',
    auditRequired: true,
  },

  // Data Export
  {
    toolIdPattern: 'data.export',
    riskLevel: 'HIGH',
    categories: ['DATA_EXPORT'],
    reason: 'Can export sensitive data',
    requiredApproval: 'MANAGER',
    auditRequired: true,
  },
  {
    toolIdPattern: 'data.download',
    riskLevel: 'MEDIUM',
    categories: ['DATA_EXPORT'],
    reason: 'Can download data to local machine',
    requiredApproval: 'NONE',
    auditRequired: false,
  },

  // MCP Tools (Model Context Protocol)
  {
    toolIdPattern: 'mcp.*',
    riskLevel: 'MEDIUM',
    categories: ['EXTERNAL_API'],
    reason: 'MCP tools can interact with external services',
    requiredApproval: 'NONE',
    auditRequired: false,
  },
  {
    toolIdPattern: 'mcp.server.*',
    riskLevel: 'HIGH',
    categories: ['EXTERNAL_API', 'SYSTEM_CONFIG'],
    reason: 'MCP server management tools',
    requiredApproval: 'MANAGER',
    auditRequired: true,
  },
];

/**
 * Get danger tool configuration for a specific tool ID
 */
export function getDangerToolConfig(toolId: string): DangerToolConfig | null {
  for (const config of DANGER_TOOLS) {
    if (matchesDangerToolPattern(toolId, config.toolIdPattern)) {
      return config;
    }
  }
  return null;
}

/**
 * Check if a tool requires approval
 */
export function toolRequiresApproval(toolId: string): boolean {
  const config = getDangerToolConfig(toolId);
  return config !== null && config.requiredApproval !== 'NONE';
}

/**
 * Get required approval level for a tool
 */
export function getRequiredApprovalLevel(toolId: string): ApprovalLevel {
  const config = getDangerToolConfig(toolId);
  return config?.requiredApproval ?? 'NONE';
}

/**
 * Get risk level for a tool
 */
export function getToolRiskLevel(toolId: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const config = getDangerToolConfig(toolId);
  return config?.riskLevel ?? 'LOW';
}

/**
 * Check if a tool requires audit logging
 */
export function toolRequiresAudit(toolId: string): boolean {
  const config = getDangerToolConfig(toolId);
  return config?.auditRequired ?? false;
}

/**
 * Get all danger categories for a tool
 */
export function getToolDangerCategories(toolId: string): DangerToolCategory[] {
  const config = getDangerToolConfig(toolId);
  return config?.categories ?? [];
}

/**
 * Check if execution should be blocked entirely (for CRITICAL risks without proper approval)
 */
export function toolRequiresSecurityTeamApproval(toolId: string): boolean {
  const config = getDangerToolConfig(toolId);
  return config?.requiredApproval === 'SECURITY_TEAM';
}
