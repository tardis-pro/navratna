import type { Actor, Tenant } from '@uaip/types';

// Tool Execution Contract
export interface ToolExecutionRequest {
  toolId: string;
  parameters: Record<string, unknown>;
  context: {
    operationId: string;
    stepId: string;
    actor: Actor;
    tenant: Tenant;
    correlationId?: string;
  };
}

export interface ToolExecutionResponse {
  success: boolean;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
  executionTime: number;
}

export interface ToolExecutionCoordinator {
  execute(request: ToolExecutionRequest): Promise<ToolExecutionResponse>;
  validateTool(toolId: string, parameters: Record<string, unknown>): Promise<boolean>;
  getToolCapabilities(): Promise<Array<{ id: string; name: string; version: string }>>;
}

// Capability Registry Contract
export interface CapabilityRegistry {
  registerCapability(capability: Capability): Promise<void>;
  unregisterCapability(capabilityId: string): Promise<void>;
  getCapabilities(filters?: CapabilityFilters): Promise<Capability[]>;
  discoverCapabilities(serviceName: string): Promise<Capability[]>;
}

export interface Capability {
  id: string;
  name: string;
  version: string;
  provider: string;
  type: 'tool' | 'agent' | 'transform' | 'integration';
  description: string;
  parameters: ParameterSchema[];
  returns: ParameterSchema[];
  metadata?: Record<string, unknown>;
}

export interface CapabilityFilters {
  type?: Capability['type'];
  provider?: string;
  tags?: string[];
}

export interface ParameterSchema {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

// Tool Contract Interface (for capability-registry service)
export interface ToolContract {
  id: string;
  name: string;
  description: string;
  version: string;
  execute(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  validate?(params: Record<string, unknown>): Promise<boolean>;
  getSchema(): ToolSchema;
}

export interface ToolSchema {
  input: Record<string, ParameterDefinition>;
  output: Record<string, ParameterDefinition>;
}

export interface ParameterDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description?: string;
  default?: unknown;
}
