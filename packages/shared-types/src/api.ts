import { z } from 'zod';
import { IDSchema } from './common.js';


// Standard API response wrapper
export const APIResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional()
  }).optional(),
  meta: z.object({
    timestamp: z.date(),
    requestId: z.string().optional(),
    version: z.string().optional()
  })
});

export type APIResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    timestamp: Date;
    requestId?: string;
    version?: string;
  };
};

// API endpoints
export interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  requestSchema?: z.ZodSchema;
  responseSchema?: z.ZodSchema;
  description?: string;
}

// Common HTTP status codes
export enum HTTPStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503
}

// Agent Intelligence API Types
export const AgentAnalysisRequestSchema = z.object({
  conversationContext: z.any(), // ConversationContext
  userRequest: z.string(),
  constraints: z.record(z.any()).optional()
});

export type AgentAnalysisRequest = z.infer<typeof AgentAnalysisRequestSchema>;

export const AgentPlanRequestSchema = z.object({
  analysis: z.any(), // AgentAnalysis 
  userPreferences: z.record(z.any()).optional(),
  securityContext: z.record(z.any()).optional()
});

export type AgentPlanRequest = z.infer<typeof AgentPlanRequestSchema>;

export const AgentAnalysisResponseSchema = z.object({
  analysis: z.any(),
  recommendedActions: z.array(z.any()),
  confidence: z.number(),
  explanation: z.string(),
  availableCapabilities: z.array(z.any()),
  securityAssessment: z.any(),
  meta: z.object({
    timestamp: z.date(),
    processingTime: z.number(),
    agentId: IDSchema,
    version: z.string()
  })
});

export type AgentAnalysisResponse = z.infer<typeof AgentAnalysisResponseSchema>;

export const AgentPlanResponseSchema = z.object({
  operationPlan: z.any(), // ExecutionPlan
  estimatedDuration: z.number(),
  riskAssessment: z.any(), // RiskAssessment
  approvalRequired: z.boolean(),
  dependencies: z.array(z.string()),
  meta: z.object({
    timestamp: z.date(),
    processingTime: z.number(),
    agentId: IDSchema,
    version: z.string()
  })
});

export type AgentPlanResponse = z.infer<typeof AgentPlanResponseSchema>; 