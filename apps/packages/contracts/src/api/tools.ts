export type {
  ToolCategory,
  ToolExecutionStatus,
  ToolDefinition,
  ToolRecommendation,
  ToolAnalytics,
  ToolListOptions,
  ToolExecutionRequest,
  ToolExecutionResponse,
} from '@uaip/types';

export type ToolSecurityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Tool {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  parameters: Record<string, unknown>;
  returnType?: Record<string, unknown>;
  securityLevel: ToolSecurityLevel;
  requiresApproval: boolean;
  isEnabled: boolean;
  executionTimeEstimate?: number;
  costEstimate?: number;
  author: string;
  tags: string[];
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ToolCreate {
  name: string;
  description: string;
  version: string;
  category: string;
  parameters: Record<string, unknown>;
  returnType?: Record<string, unknown>;
  securityLevel?: ToolSecurityLevel;
  requiresApproval?: boolean;
  author?: string;
  tags?: string[];
  dependencies?: string[];
}

export interface ToolUpdate {
  name?: string;
  description?: string;
  version?: string;
  category?: string;
  parameters?: Record<string, unknown>;
  returnType?: Record<string, unknown>;
  securityLevel?: ToolSecurityLevel;
  requiresApproval?: boolean;
  isEnabled?: boolean;
  tags?: string[];
  dependencies?: string[];
}

export interface ToolRelation {
  toolId: string;
  relatedToolId: string;
  relationType: 'DEPENDS_ON' | 'SIMILAR_TO' | 'REPLACES' | 'ENHANCES' | 'REQUIRES';
  strength?: number;
  reason?: string;
}
