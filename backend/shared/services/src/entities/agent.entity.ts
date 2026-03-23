export interface Agent {
  id: string;
  name: string;
  role: string;
  persona?: Record<string, unknown>;
  intelligenceConfig?: Record<string, unknown>;
  securityContext?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  createdBy?: string;
  lastActiveAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  modelId?: string;
  apiType?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  skills?: Array<{ name: string; description?: string; enabled?: boolean }>;
  capabilities?: string[];
  status?: string;
}
