import { z } from 'zod';
export declare const APIResponseSchema: z.ZodObject<{
    success: z.ZodBoolean;
    data: z.ZodOptional<z.ZodAny>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        details?: Record<string, any> | undefined;
    }, {
        code: string;
        message: string;
        details?: Record<string, any> | undefined;
    }>>;
    meta: z.ZodObject<{
        timestamp: z.ZodDate;
        requestId: z.ZodOptional<z.ZodString>;
        version: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        timestamp: Date;
        version?: string | undefined;
        requestId?: string | undefined;
    }, {
        timestamp: Date;
        version?: string | undefined;
        requestId?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    success: boolean;
    meta: {
        timestamp: Date;
        version?: string | undefined;
        requestId?: string | undefined;
    };
    error?: {
        code: string;
        message: string;
        details?: Record<string, any> | undefined;
    } | undefined;
    data?: any;
}, {
    success: boolean;
    meta: {
        timestamp: Date;
        version?: string | undefined;
        requestId?: string | undefined;
    };
    error?: {
        code: string;
        message: string;
        details?: Record<string, any> | undefined;
    } | undefined;
    data?: any;
}>;
export type APIResponse<T = any> = {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: Record<string, any>;
    };
    meta: {
        timestamp: Date;
        requestId?: string;
        version?: string;
    };
};
export interface APIEndpoint {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    requestSchema?: z.ZodSchema;
    responseSchema?: z.ZodSchema;
    description?: string;
}
export declare enum HTTPStatus {
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
export declare const AgentAnalysisRequestSchema: z.ZodObject<{
    conversationContext: z.ZodAny;
    userRequest: z.ZodString;
    constraints: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    userRequest: string;
    constraints?: Record<string, any> | undefined;
    conversationContext?: any;
}, {
    userRequest: string;
    constraints?: Record<string, any> | undefined;
    conversationContext?: any;
}>;
export type AgentAnalysisRequest = z.infer<typeof AgentAnalysisRequestSchema>;
export declare const AgentPlanRequestSchema: z.ZodObject<{
    analysis: z.ZodAny;
    userPreferences: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    securityContext: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    securityContext?: Record<string, any> | undefined;
    analysis?: any;
    userPreferences?: Record<string, any> | undefined;
}, {
    securityContext?: Record<string, any> | undefined;
    analysis?: any;
    userPreferences?: Record<string, any> | undefined;
}>;
export type AgentPlanRequest = z.infer<typeof AgentPlanRequestSchema>;
export declare const AgentAnalysisResponseSchema: z.ZodObject<{
    analysis: z.ZodAny;
    recommendedActions: z.ZodArray<z.ZodAny, "many">;
    confidence: z.ZodNumber;
    explanation: z.ZodString;
    availableCapabilities: z.ZodArray<z.ZodAny, "many">;
    securityAssessment: z.ZodAny;
    meta: z.ZodObject<{
        timestamp: z.ZodDate;
        processingTime: z.ZodNumber;
        agentId: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        timestamp: Date;
        version: string;
        agentId: string;
        processingTime: number;
    }, {
        timestamp: Date;
        version: string;
        agentId: string;
        processingTime: number;
    }>;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    recommendedActions: any[];
    explanation: string;
    meta: {
        timestamp: Date;
        version: string;
        agentId: string;
        processingTime: number;
    };
    availableCapabilities: any[];
    analysis?: any;
    securityAssessment?: any;
}, {
    confidence: number;
    recommendedActions: any[];
    explanation: string;
    meta: {
        timestamp: Date;
        version: string;
        agentId: string;
        processingTime: number;
    };
    availableCapabilities: any[];
    analysis?: any;
    securityAssessment?: any;
}>;
export type AgentAnalysisResponse = z.infer<typeof AgentAnalysisResponseSchema>;
export declare const AgentPlanResponseSchema: z.ZodObject<{
    operationPlan: z.ZodAny;
    estimatedDuration: z.ZodNumber;
    riskAssessment: z.ZodAny;
    approvalRequired: z.ZodBoolean;
    dependencies: z.ZodArray<z.ZodString, "many">;
    meta: z.ZodObject<{
        timestamp: z.ZodDate;
        processingTime: z.ZodNumber;
        agentId: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        timestamp: Date;
        version: string;
        agentId: string;
        processingTime: number;
    }, {
        timestamp: Date;
        version: string;
        agentId: string;
        processingTime: number;
    }>;
}, "strip", z.ZodTypeAny, {
    dependencies: string[];
    approvalRequired: boolean;
    estimatedDuration: number;
    meta: {
        timestamp: Date;
        version: string;
        agentId: string;
        processingTime: number;
    };
    riskAssessment?: any;
    operationPlan?: any;
}, {
    dependencies: string[];
    approvalRequired: boolean;
    estimatedDuration: number;
    meta: {
        timestamp: Date;
        version: string;
        agentId: string;
        processingTime: number;
    };
    riskAssessment?: any;
    operationPlan?: any;
}>;
export type AgentPlanResponse = z.infer<typeof AgentPlanResponseSchema>;
//# sourceMappingURL=api.d.ts.map