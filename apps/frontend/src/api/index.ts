/**
 * Unified API Export
 * Re-exports all API modules for convenient importing
 */

// Core client
export { APIClient, APIClientError, type APIError } from './client';

// Domain APIs
export * from './auth.api';
export * from './agents.api';
export * from './tools.api';
export * from './discussions.api';
export * from './projects.api';
export * from './users.api';
export * from './security.api';
export * from './audit.api';
export * from './approvals.api';
export * from './personas.api';
export * from './capabilities.api';
export * from './orchestration.api';
export * from './knowledge.api';
export * from './llm.api';
export * from './mcp.api';

// Convenience namespace exports
import { authAPI } from './auth.api';
import { agentsAPI } from './agents.api';
import { toolsAPI } from './tools.api';
import { discussionsAPI } from './discussions.api';
import { projectsAPI } from './projects.api';
import { usersAPI } from './users.api';
import { securityAPI } from './security.api';
import { auditAPI } from './audit.api';
import { approvalsAPI } from './approvals.api';
import { personasAPI } from './personas.api';
import { capabilitiesAPI } from './capabilities.api';
import { orchestrationAPI } from './orchestration.api';
import { knowledgeAPI } from './knowledge.api';
import { llmAPI } from './llm.api';
import { mcpAPI } from './mcp.api';

export const api = {
  auth: authAPI,
  agents: agentsAPI,
  tools: toolsAPI,
  discussions: discussionsAPI,
  projects: projectsAPI,
  users: usersAPI,
  security: securityAPI,
  audit: auditAPI,
  approvals: approvalsAPI,
  personas: personasAPI,
  capabilities: capabilitiesAPI,
  orchestration: orchestrationAPI,
  knowledge: knowledgeAPI,
  llm: llmAPI,
  mcp: mcpAPI,
};
