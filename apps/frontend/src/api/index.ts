/**
 * Unified API Export
 * Re-exports all API modules for convenient importing
 */

// Core client
export { APIClient, APIClientError, type APIError } from './client';

// Eden treaty clients
export {
  coreClient,
  gatewayClient,
  unwrapEden,
  edenWithCSRFRetry,
  edenRequest,
  EdenClientError,
  type NavratnaCoreApp,
  type NavratnaGatewayApp,
} from './eden';

// Domain APIs
export * from './auth_api';
export * from './agents_api';
export * from './tools_api';
export * from './discussions_api';
export * from './projects_api';
export * from './users_api';
export * from './security_api';
export * from './audit_api';
export * from './approvals_api';
export * from './personas_api';
export * from './capabilities_api';
export * from './orchestration_api';
export * from './knowledge_api';
export * from './constellation_api';
export * from './llm_api';
export * from './mcp_api';
export * from './tasks_api';
export * from './conversation_enhancement_api';
export * from './user_persona_api';
export * from './query_config';

// Convenience namespace exports
import { authAPI } from './auth_api';
import { agentsAPI } from './agents_api';
import { toolsAPI } from './tools_api';
import { discussionsAPI } from './discussions_api';
import { projectsAPI } from './projects_api';
import { usersAPI } from './users_api';
import { securityAPI } from './security_api';
import { auditAPI } from './audit_api';
import { approvalsAPI } from './approvals_api';
import { personasAPI } from './personas_api';
import { capabilitiesAPI } from './capabilities_api';
import { orchestrationAPI } from './orchestration_api';
import { knowledgeAPI } from './knowledge_api';
import { constellationAPI } from './constellation_api';
import { llmAPI } from './llm_api';
import { mcpAPI } from './mcp_api';

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
  constellation: constellationAPI,
  llm: llmAPI,
  mcp: mcpAPI,
};
