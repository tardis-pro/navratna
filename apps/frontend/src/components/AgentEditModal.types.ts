import type React from 'react';
import type { Agent, AgentSkill, AgentUpdate, FrontendAgentState } from '@uaip/types';

export interface AgentEditModalProps {
  agentId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (agentId: string, updates: Partial<Agent>) => void;
}

export interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}

export interface AgentLLMPreference {
  id?: string;
  taskType: string;
  preferredProvider: string;
  preferredModel: string;
  fallbackModel?: string;
  settings?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    systemPrompt?: string;
  };
  isActive: boolean;
  priority: number;
}

export interface AvailableMCPTool {
  id: string;
  name: string;
  serverName: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export type AssignedMCPTool = NonNullable<Agent['assignedMCPTools']>[number];
export type MCPToolSettings = NonNullable<Agent['mcpToolSettings']>;

export type AgentEditFormData = Partial<AgentUpdate> & {
  capabilities?: string[];
  tags?: string[];
  preferences?: Record<string, unknown>;
  toolPermissions?: FrontendAgentState['toolPermissions'];
  toolPreferences?: FrontendAgentState['toolPreferences'];
};

export type MCPToolsResponse = {
  tools?: unknown[];
};

export type AssignedMCPToolsResponse = {
  assignedMCPTools?: unknown[];
  mcpToolSettings?: unknown;
};

export interface ToolsTabProps {
  agentId: string;
  isOpen: boolean;
}

export interface SkillsTabProps {
  skills: AgentSkill[];
  updateSkills: (updated: AgentSkill[]) => void;
}
