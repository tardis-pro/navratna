/**
 * Legacy API wrapper for backward compatibility
 * This file maintains the old API structure while delegating to the new modular API
 * 
 * @deprecated Use the modular API imports from @/api instead
 */

import { api } from '@/api';

// Re-export specific types for backward compatibility
export type {
  Agent,
  Persona,
  Operation,
  Capability,
  SecurityLevel,
  User,
  Discussion,
  DiscussionParticipant,
  KnowledgeItem
} from '@uaip/types';
export * from '@/api';

// Create legacy API structure
export const API = {
  // Auth namespace
  auth: api.auth,

  // Agents namespace
  agents: {
    ...api.agents,
    health: api.agents.health
  },

  // Personas namespace
  personas: api.personas,

  // Capabilities namespace
  capabilities: api.capabilities,

  // Tools namespace
  tools: api.tools,

  // Orchestration namespace
  orchestration: api.orchestration,

  // Discussions namespace
  discussions: api.discussions,

  // Security namespace
  security: api.security,

  // Approvals namespace
  approvals: api.approvals,

  // Users namespace
  users: api.users,

  // Audit namespace
  audit: api.audit,

  // LLM namespace
  llm: {
    ...api.llm,
    userLLM: api.llm.userLLM
  },

  // Knowledge namespace
  knowledge: api.knowledge
};

// Legacy helper functions
export const isAPIError = (error: any): error is Error => {
  return error instanceof Error;
};

export const extractErrorMessage = (error: any): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error?.message) {
    return error.message;
  }
  if (error?.error) {
    return error.error;
  }
  return 'An unknown error occurred';
};

// Default export for backward compatibility
export default API;