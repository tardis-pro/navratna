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
 *
 * Tool ids in this system come in two shapes and BOTH must be matchable. The
 * dotted ones ('process.run') are the taxonomy this file was originally written
 * against; the hyphenated ones ('shell-exec', 'mcp-<server>-<tool>') are what
 * BaseToolExecutor actually dispatches. When only the dotted forms were
 * matchable every hyphenated tool fell through to `null` and the approval
 * hierarchy was never consulted.
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
    return toolId.endsWith(`.${suffix}`) || toolId === suffix;
  }

  // Generic trailing wildcard — the only form that can express the hyphenated
  // dynamic families ('mcp-*', 'oauth-*', 'calendar-event-*').
  if (pattern.endsWith('*')) {
    return toolId.startsWith(pattern.slice(0, -1));
  }

  return false;
}

/**
 * Danger tool configurations
 * These tools require approval before execution
 */
export const DANGER_TOOLS: DangerToolConfig[] = [
  // ---------------------------------------------------------------------------
  // Native executor tools — the ids BaseToolExecutor actually dispatches.
  //
  // These MUST be listed first: getDangerToolConfig returns the FIRST match, so
  // a concrete id has to win over any trailing-wildcard family below it.
  //
  // Every id in BASE_TOOL_EXECUTOR_TOOL_IDS needs a row here, including the
  // harmless ones. An explicit LOW/NONE row is what distinguishes "reviewed and
  // considered safe" from "nobody classified this", and assertToolsClassified()
  // refuses to boot on the latter.
  // ---------------------------------------------------------------------------
  {
    // The dotted 'process.run' below describes a tool that does not exist. THIS
    // is the id that reaches execAsync(command) with the full process.env.
    toolIdPattern: 'shell-exec',
    riskLevel: 'CRITICAL',
    categories: ['PROCESS_EXECUTION', 'SYSTEM_CONFIG', 'CODE_EXECUTION'],
    reason: 'Can execute arbitrary commands on the system',
    requiredApproval: 'ADMIN',
    auditRequired: true,
  },
  {
    toolIdPattern: 'http-request',
    riskLevel: 'MEDIUM',
    categories: ['NETWORK', 'EXTERNAL_API'],
    reason: 'Can make HTTP requests to external services (SSRF surface)',
    requiredApproval: 'NONE',
    auditRequired: true,
  },
  {
    toolIdPattern: 'file-reader',
    riskLevel: 'LOW',
    categories: ['FILE_SYSTEM'],
    reason: 'Returns simulated file content; performs no real disk read',
    requiredApproval: 'NONE',
    auditRequired: false,
  },
  {
    toolIdPattern: 'web-search',
    riskLevel: 'LOW',
    categories: ['NETWORK'],
    reason: 'Returns simulated search results; issues no outbound request',
    requiredApproval: 'NONE',
    auditRequired: false,
  },
  {
    toolIdPattern: 'math-calculator',
    riskLevel: 'LOW',
    categories: [],
    reason: 'Pure arithmetic over supplied operands',
    requiredApproval: 'NONE',
    auditRequired: false,
  },
  {
    toolIdPattern: 'text-analysis',
    riskLevel: 'LOW',
    categories: [],
    reason: 'Pure string analysis over supplied text',
    requiredApproval: 'NONE',
    auditRequired: false,
  },
  {
    toolIdPattern: 'time-utility',
    riskLevel: 'LOW',
    categories: [],
    reason: 'Date arithmetic over supplied values',
    requiredApproval: 'NONE',
    auditRequired: false,
  },
  {
    toolIdPattern: 'id-generator',
    riskLevel: 'LOW',
    categories: [],
    reason: 'Generates opaque numeric ids',
    requiredApproval: 'NONE',
    auditRequired: false,
  },

  // ---------------------------------------------------------------------------
  // Project / task tools (PROJECT_TASK_TOOL_IDS). Scoped server-side to the
  // acting user, so writes are audited but not gated.
  // ---------------------------------------------------------------------------
  {
    toolIdPattern: 'task-create',
    riskLevel: 'MEDIUM',
    categories: ['DATABASE_WRITE'],
    reason: 'Creates task records on behalf of the acting user',
    requiredApproval: 'NONE',
    auditRequired: true,
  },
  {
    toolIdPattern: 'task-update',
    riskLevel: 'MEDIUM',
    categories: ['DATABASE_WRITE'],
    reason: 'Modifies task records on behalf of the acting user',
    requiredApproval: 'NONE',
    auditRequired: true,
  },
  {
    toolIdPattern: 'task-*',
    riskLevel: 'LOW',
    categories: [],
    reason: 'Reads task records scoped to the acting user',
    requiredApproval: 'NONE',
    auditRequired: false,
  },
  {
    toolIdPattern: 'project-*',
    riskLevel: 'LOW',
    categories: [],
    reason: 'Reads project records scoped to the acting user',
    requiredApproval: 'NONE',
    auditRequired: false,
  },

  // ---------------------------------------------------------------------------
  // Calendar tools (CALENDAR_TOOL_IDS). Act under the caller's own stored Google
  // credential against their own calendar, so writes are audited, not gated.
  // ---------------------------------------------------------------------------
  {
    toolIdPattern: 'calendar-event-create',
    riskLevel: 'MEDIUM',
    categories: ['EXTERNAL_API'],
    reason: "Creates events on the acting user's calendar",
    requiredApproval: 'NONE',
    auditRequired: true,
  },
  {
    toolIdPattern: 'calendar-event-update',
    riskLevel: 'MEDIUM',
    categories: ['EXTERNAL_API'],
    reason: "Modifies events on the acting user's calendar",
    requiredApproval: 'NONE',
    auditRequired: true,
  },
  {
    toolIdPattern: 'calendar-event-delete',
    riskLevel: 'HIGH',
    categories: ['EXTERNAL_API'],
    reason: "Deletes events from the acting user's calendar",
    requiredApproval: 'NONE',
    auditRequired: true,
  },
  {
    toolIdPattern: 'calendar-*',
    riskLevel: 'LOW',
    categories: ['EXTERNAL_API'],
    reason: "Reads the acting user's calendar",
    requiredApproval: 'NONE',
    auditRequired: false,
  },

  // ---------------------------------------------------------------------------
  // Dynamic families. Ids here are discovered at runtime, so they cannot be
  // enumerated — the wildcard row is what keeps them from tripping the
  // fail-closed default on every call.
  // ---------------------------------------------------------------------------
  {
    // 'mcp-<serverKey>-<toolName>' — see MCP_TOOL_PREFIX in utils/mcp_tool_key.ts.
    toolIdPattern: 'mcp-*',
    riskLevel: 'MEDIUM',
    categories: ['EXTERNAL_API'],
    reason: 'MCP tools can interact with external services',
    requiredApproval: 'NONE',
    auditRequired: true,
  },
  {
    // 'oauth-<provider>-<action>' — runs under the caller's own OAuth token.
    toolIdPattern: 'oauth-*',
    riskLevel: 'MEDIUM',
    categories: ['EXTERNAL_API', 'AUTH_SECURITY'],
    reason: "Acts on a third-party service under the caller's OAuth token",
    requiredApproval: 'NONE',
    auditRequired: true,
  },

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
  // 'mcp.server.*' MUST precede 'mcp.*': getDangerToolConfig returns the first
  // match, so with the broader pattern first every server-management tool was
  // silently classified MEDIUM/NONE instead of HIGH/MANAGER.
  {
    toolIdPattern: 'mcp.server.*',
    riskLevel: 'HIGH',
    categories: ['EXTERNAL_API', 'SYSTEM_CONFIG'],
    reason: 'MCP server management tools',
    requiredApproval: 'MANAGER',
    auditRequired: true,
  },
  {
    toolIdPattern: 'mcp.*',
    riskLevel: 'MEDIUM',
    categories: ['EXTERNAL_API'],
    reason: 'MCP tools can interact with external services',
    requiredApproval: 'NONE',
    auditRequired: false,
  },
];

/**
 * The classification applied to any tool id no row matches.
 *
 * This is the fail-closed default. Previously an unmatched id produced `null`
 * and every caller read that as "not dangerous, let it run" — which is how
 * `shell-exec` reached execAsync with the full process.env and no approval.
 * An unknown tool is now the MOST restricted thing in the system, not the
 * least: it demands SECURITY_TEAM approval, which nothing grants by default.
 *
 * The correct way to make a tool runnable is to add a row to DANGER_TOOLS —
 * including an explicit LOW/NONE row if it really is harmless.
 */
export const UNCLASSIFIED_TOOL: DangerToolConfig = {
  toolIdPattern: '<unclassified>',
  riskLevel: 'CRITICAL',
  categories: ['SYSTEM_CONFIG'],
  reason:
    'Tool is not present in the danger-tool classification list. Unclassified tools are refused rather than assumed safe.',
  requiredApproval: 'SECURITY_TEAM',
  auditRequired: true,
};

/**
 * Look up the explicit classification for a tool ID, or `null` when none exists.
 *
 * Prefer `classifyTool()` for anything that gates execution — this function
 * reports *whether a row exists*, which is only interesting to
 * `isToolClassified` / `assertToolsClassified`. Treating `null` as "safe" is the
 * exact bug this module was rewritten to remove.
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
 * The classification that governs a tool's execution. Never null: an id nothing
 * matches gets UNCLASSIFIED_TOOL, which requires SECURITY_TEAM approval.
 */
export function classifyTool(toolId: string): DangerToolConfig {
  return getDangerToolConfig(toolId) ?? UNCLASSIFIED_TOOL;
}

/** Whether an explicit row exists for this id (i.e. it is not falling back to deny). */
export function isToolClassified(toolId: string): boolean {
  return getDangerToolConfig(toolId) !== null;
}

/**
 * Boot-time guarantee that the service's own tool inventory is fully classified.
 *
 * Throws — the caller is expected to let it propagate and abort startup. A tool
 * added to BaseToolExecutor without a DANGER_TOOLS row is a security regression,
 * and failing at boot is how it gets noticed. At runtime an unclassified id is
 * still refused by classifyTool(); this only makes the failure loud and early
 * for the ids we can enumerate ahead of time.
 */
export function assertToolsClassified(toolIds: readonly string[]): void {
  const unclassified = toolIds.filter((id) => !isToolClassified(id));
  if (unclassified.length > 0) {
    throw new Error(
      `Refusing to start: ${unclassified.length} tool id(s) have no entry in DANGER_TOOLS ` +
        `and would be refused at execution time: ${unclassified.join(', ')}. ` +
        `Add a row to danger_tool_list.ts — use riskLevel 'LOW' / requiredApproval 'NONE' ` +
        `if the tool is genuinely harmless.`
    );
  }
}

/**
 * Check if a tool requires approval
 */
export function toolRequiresApproval(toolId: string): boolean {
  return classifyTool(toolId).requiredApproval !== 'NONE';
}

/**
 * Get required approval level for a tool
 */
export function getRequiredApprovalLevel(toolId: string): ApprovalLevel {
  return classifyTool(toolId).requiredApproval;
}

/**
 * Get risk level for a tool
 */
export function getToolRiskLevel(toolId: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  return classifyTool(toolId).riskLevel;
}

/**
 * Check if a tool requires audit logging
 */
export function toolRequiresAudit(toolId: string): boolean {
  return classifyTool(toolId).auditRequired;
}

/**
 * Get all danger categories for a tool
 */
export function getToolDangerCategories(toolId: string): DangerToolCategory[] {
  return classifyTool(toolId).categories;
}

/**
 * Check if execution should be blocked entirely (for CRITICAL risks without proper approval)
 */
export function toolRequiresSecurityTeamApproval(toolId: string): boolean {
  return classifyTool(toolId).requiredApproval === 'SECURITY_TEAM';
}
