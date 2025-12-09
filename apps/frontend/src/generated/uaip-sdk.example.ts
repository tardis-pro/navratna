/**
 * UAIP Backend SDK Client
 *
 * Auto-generated on: 2024-12-18T21:16:59.026Z
 * Services: agent-intelligence, llm-service, security-gateway, capability-registry, orchestration-pipeline, discussion-orchestration, artifact-service
 *
 * ⚠️  This is an EXAMPLE file showing what the generated SDK will look like.
 * Run `pnpm generate:sdk` from the root to generate the actual SDK.
 */

export interface AuthConfig {
  token?: string;
  apiKey?: string;
  baseURL?: string;
}

export interface RequestConfig {
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: Date;
    requestId?: string;
  };
}

export class UAIPClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string> = {};
  private authToken?: string;

  constructor(config: RequestConfig & AuthConfig = {}) {
    this.baseURL = config.baseURL || 'http://localhost:8081';
    this.authToken = config.token;

    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    if (this.authToken) {
      this.defaultHeaders['Authorization'] = `Bearer ${this.authToken}`;
    }
  }

  setAuthToken(token: string): void {
    this.authToken = token;
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  clearAuth(): void {
    this.authToken = undefined;
    delete this.defaultHeaders['Authorization'];
  }

  private async request<T>(
    method: string,
    path: string,
    data?: any,
    config?: RequestConfig
  ): Promise<APIResponse<T>> {
    const url = `${this.baseURL}${path}`;
    const headers = { ...this.defaultHeaders, ...config?.headers };

    const requestInit: RequestInit = {
      method,
      headers,
      ...(data && { body: JSON.stringify(data) }),
    };

    try {
      const response = await fetch(url, requestInit);
      const result = await response.json();

      return {
        success: response.ok,
        data: response.ok ? result.data : undefined,
        error: !response.ok ? result.error : undefined,
        meta: {
          timestamp: new Date(),
          requestId: response.headers.get('x-request-id') || undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        meta: {
          timestamp: new Date(),
        },
      };
    }
  }

  // Agent Intelligence Service
  agentIntelligence = {
    /**
     * Create a new agent
     */
    postAgents: async (data: any) => {
      const path = '/api/v1/agents';
      return this.request<any>('POST', path, data);
    },

    /**
     * Get all agents
     */
    getAgents: async () => {
      const path = '/api/v1/agents';
      return this.request('GET', path);
    },

    /**
     * Analyze agent context
     */
    postAgentsAnalyze: async (params: { agentId: string }, data: any) => {
      let path = '/api/v1/agents/:agentId/analyze';
      path = path.replace(':agentId', String(params.agentId));
      return this.request<any>('POST', path, data);
    },

    /**
     * Generate agent plan
     */
    postAgentsPlan: async (params: { agentId: string }, data: any) => {
      let path = '/api/v1/agents/:agentId/plan';
      path = path.replace(':agentId', String(params.agentId));
      return this.request<any>('POST', path, data);
    },

    /**
     * Get agent by ID
     */
    getAgentsById: async (params: { agentId: string }) => {
      let path = '/api/v1/agents/:agentId';
      path = path.replace(':agentId', String(params.agentId));
      return this.request('GET', path);
    },

    /**
     * Update agent
     */
    putAgentsById: async (params: { agentId: string }, data: any) => {
      let path = '/api/v1/agents/:agentId';
      path = path.replace(':agentId', String(params.agentId));
      return this.request<any>('PUT', path, data);
    },

    /**
     * Delete agent
     */
    deleteAgentsById: async (params: { agentId: string }) => {
      let path = '/api/v1/agents/:agentId';
      path = path.replace(':agentId', String(params.agentId));
      return this.request('DELETE', path);
    },
  };

  // LLM Service
  llmService = {
    /**
     * Generate LLM response
     */
    postGenerate: async (data: any) => {
      const path = '/api/v1/llm/generate';
      return this.request<any>('POST', path, data);
    },

    /**
     * Generate agent response
     */
    postAgentResponse: async (data: any) => {
      const path = '/api/v1/llm/agent-response';
      return this.request<any>('POST', path, data);
    },

    /**
     * Generate artifact
     */
    postArtifact: async (data: any) => {
      const path = '/api/v1/llm/artifact';
      return this.request<any>('POST', path, data);
    },

    /**
     * Get provider statistics
     */
    getProvidersStats: async () => {
      const path = '/api/v1/llm/providers/stats';
      return this.request('GET', path);
    },
  };

  // Security Gateway
  securityGateway = {
    /**
     * Get all LLM providers
     */
    getProviders: async () => {
      const path = '/api/v1/admin/providers';
      return this.request('GET', path);
    },

    /**
     * Get active LLM providers
     */
    getProvidersActive: async () => {
      const path = '/api/v1/admin/providers/active';
      return this.request('GET', path);
    },

    /**
     * Create new LLM provider
     */
    postProviders: async (data: any) => {
      const path = '/api/v1/admin/providers';
      return this.request<any>('POST', path, data);
    },

    /**
     * Get LLM provider by ID
     */
    getProvidersById: async (params: { id: string }) => {
      let path = '/api/v1/admin/providers/:id';
      path = path.replace(':id', String(params.id));
      return this.request('GET', path);
    },

    /**
     * Update LLM provider
     */
    putProvidersById: async (params: { id: string }, data: any) => {
      let path = '/api/v1/admin/providers/:id';
      path = path.replace(':id', String(params.id));
      return this.request<any>('PUT', path, data);
    },

    /**
     * Test provider connection
     */
    postProvidersTest: async (params: { id: string }) => {
      let path = '/api/v1/admin/providers/:id/test';
      path = path.replace(':id', String(params.id));
      return this.request<any>('POST', path);
    },
  };

  // Capability Registry
  capabilityRegistry = {
    /**
     * Get all tools
     */
    getTools: async () => {
      const path = '/api/v1/capabilities';
      return this.request('GET', path);
    },

    /**
     * Register new tool
     */
    postTools: async (data: any) => {
      const path = '/api/v1/capabilities';
      return this.request<any>('POST', path, data);
    },

    /**
     * Get tool categories
     */
    getToolCategories: async () => {
      const path = '/api/v1/capabilities/categories';
      return this.request('GET', path);
    },

    /**
     * Execute tool
     */
    postToolExecute: async (params: { id: string }, data: any) => {
      let path = '/api/v1/capabilities/:id/execute';
      path = path.replace(':id', String(params.id));
      return this.request<any>('POST', path, data);
    },
  };

  // Orchestration Pipeline
  orchestrationPipeline = {
    /**
     * Execute operation
     */
    postOperations: async (data: any) => {
      const path = '/api/v1/operations';
      return this.request<any>('POST', path, data);
    },

    /**
     * Get operation status
     */
    getOperationsStatus: async (params: { operationId: string }) => {
      let path = '/api/v1/operations/:operationId/status';
      path = path.replace(':operationId', String(params.operationId));
      return this.request('GET', path);
    },

    /**
     * Pause operation
     */
    postOperationsPause: async (params: { operationId: string }) => {
      let path = '/api/v1/operations/:operationId/pause';
      path = path.replace(':operationId', String(params.operationId));
      return this.request<any>('POST', path);
    },

    /**
     * Resume operation
     */
    postOperationsResume: async (params: { operationId: string }) => {
      let path = '/api/v1/operations/:operationId/resume';
      path = path.replace(':operationId', String(params.operationId));
      return this.request<any>('POST', path);
    },

    /**
     * Cancel operation
     */
    postOperationsCancel: async (params: { operationId: string }) => {
      let path = '/api/v1/operations/:operationId/cancel';
      path = path.replace(':operationId', String(params.operationId));
      return this.request<any>('POST', path);
    },
  };

  // Artifact Service
  artifactService = {
    /**
     * Generate artifact
     */
    postGenerate: async (data: any) => {
      const path = '/api/v1/artifacts/generate';
      return this.request<any>('POST', path, data);
    },

    /**
     * Get templates
     */
    getTemplates: async () => {
      const path = '/api/v1/artifacts/templates';
      return this.request('GET', path);
    },

    /**
     * Validate artifact
     */
    postValidate: async (data: any) => {
      const path = '/api/v1/artifacts/validate';
      return this.request<any>('POST', path, data);
    },

    /**
     * Get artifact types
     */
    getTypes: async () => {
      const path = '/api/v1/artifacts/types';
      return this.request('GET', path);
    },
  };
}

export default UAIPClient;

// Convenience factory function
export function createClient(config?: RequestConfig & AuthConfig): UAIPClient {
  return new UAIPClient(config);
}

// Usage examples:
/*
// Basic usage
const client = new UAIPClient({
  baseURL: 'http://localhost:8081',
  token: 'your-auth-token'
});

// Create an agent
const agentResponse = await client.agentIntelligence.postAgents({
  name: 'My Agent',
  role: 'assistant',
  persona: { ... }
});

// Generate LLM response
const llmResponse = await client.llmService.postGenerate({
  prompt: 'Hello, world!',
  maxTokens: 100
});

// Get all tools
const toolsResponse = await client.capabilityRegistry.getTools();

// Execute an operation
const operationResponse = await client.orchestrationPipeline.postOperations({
  type: 'tool_execution',
  agentId: 'agent-123',
  // ... other operation data
});
*/
