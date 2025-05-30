import { z } from 'zod';
export declare enum AgentRole {
    ASSISTANT = "assistant",
    ANALYZER = "analyzer",
    ORCHESTRATOR = "orchestrator",
    SPECIALIST = "specialist"
}
export declare const AgentPersonaSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    capabilities: z.ZodArray<z.ZodString, "many">;
    constraints: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    preferences: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    capabilities: string[];
    constraints?: Record<string, any> | undefined;
    preferences?: Record<string, any> | undefined;
}, {
    name: string;
    description: string;
    capabilities: string[];
    constraints?: Record<string, any> | undefined;
    preferences?: Record<string, any> | undefined;
}>;
export type AgentPersona = z.infer<typeof AgentPersonaSchema>;
export declare const AgentIntelligenceConfigSchema: z.ZodObject<{
    analysisDepth: z.ZodDefault<z.ZodEnum<["basic", "intermediate", "advanced"]>>;
    contextWindowSize: z.ZodDefault<z.ZodNumber>;
    decisionThreshold: z.ZodDefault<z.ZodNumber>;
    learningEnabled: z.ZodDefault<z.ZodBoolean>;
    collaborationMode: z.ZodDefault<z.ZodEnum<["independent", "collaborative", "supervised"]>>;
}, "strip", z.ZodTypeAny, {
    analysisDepth: "basic" | "intermediate" | "advanced";
    contextWindowSize: number;
    decisionThreshold: number;
    learningEnabled: boolean;
    collaborationMode: "independent" | "collaborative" | "supervised";
}, {
    analysisDepth?: "basic" | "intermediate" | "advanced" | undefined;
    contextWindowSize?: number | undefined;
    decisionThreshold?: number | undefined;
    learningEnabled?: boolean | undefined;
    collaborationMode?: "independent" | "collaborative" | "supervised" | undefined;
}>;
export type AgentIntelligenceConfig = z.infer<typeof AgentIntelligenceConfigSchema>;
export declare const AgentSecurityContextSchema: z.ZodObject<{
    securityLevel: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    allowedCapabilities: z.ZodArray<z.ZodString, "many">;
    restrictedDomains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    approvalRequired: z.ZodDefault<z.ZodBoolean>;
    auditLevel: z.ZodDefault<z.ZodEnum<["minimal", "standard", "comprehensive"]>>;
}, "strip", z.ZodTypeAny, {
    securityLevel: "low" | "medium" | "high" | "critical";
    allowedCapabilities: string[];
    approvalRequired: boolean;
    auditLevel: "minimal" | "standard" | "comprehensive";
    restrictedDomains?: string[] | undefined;
}, {
    allowedCapabilities: string[];
    securityLevel?: "low" | "medium" | "high" | "critical" | undefined;
    restrictedDomains?: string[] | undefined;
    approvalRequired?: boolean | undefined;
    auditLevel?: "minimal" | "standard" | "comprehensive" | undefined;
}>;
export type AgentSecurityContext = z.infer<typeof AgentSecurityContextSchema>;
export declare const AgentSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    name: z.ZodString;
    role: z.ZodNativeEnum<typeof AgentRole>;
    persona: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        capabilities: z.ZodArray<z.ZodString, "many">;
        constraints: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        preferences: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        capabilities: string[];
        constraints?: Record<string, any> | undefined;
        preferences?: Record<string, any> | undefined;
    }, {
        name: string;
        description: string;
        capabilities: string[];
        constraints?: Record<string, any> | undefined;
        preferences?: Record<string, any> | undefined;
    }>;
    intelligenceConfig: z.ZodObject<{
        analysisDepth: z.ZodDefault<z.ZodEnum<["basic", "intermediate", "advanced"]>>;
        contextWindowSize: z.ZodDefault<z.ZodNumber>;
        decisionThreshold: z.ZodDefault<z.ZodNumber>;
        learningEnabled: z.ZodDefault<z.ZodBoolean>;
        collaborationMode: z.ZodDefault<z.ZodEnum<["independent", "collaborative", "supervised"]>>;
    }, "strip", z.ZodTypeAny, {
        analysisDepth: "basic" | "intermediate" | "advanced";
        contextWindowSize: number;
        decisionThreshold: number;
        learningEnabled: boolean;
        collaborationMode: "independent" | "collaborative" | "supervised";
    }, {
        analysisDepth?: "basic" | "intermediate" | "advanced" | undefined;
        contextWindowSize?: number | undefined;
        decisionThreshold?: number | undefined;
        learningEnabled?: boolean | undefined;
        collaborationMode?: "independent" | "collaborative" | "supervised" | undefined;
    }>;
    securityContext: z.ZodObject<{
        securityLevel: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
        allowedCapabilities: z.ZodArray<z.ZodString, "many">;
        restrictedDomains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        approvalRequired: z.ZodDefault<z.ZodBoolean>;
        auditLevel: z.ZodDefault<z.ZodEnum<["minimal", "standard", "comprehensive"]>>;
    }, "strip", z.ZodTypeAny, {
        securityLevel: "low" | "medium" | "high" | "critical";
        allowedCapabilities: string[];
        approvalRequired: boolean;
        auditLevel: "minimal" | "standard" | "comprehensive";
        restrictedDomains?: string[] | undefined;
    }, {
        allowedCapabilities: string[];
        securityLevel?: "low" | "medium" | "high" | "critical" | undefined;
        restrictedDomains?: string[] | undefined;
        approvalRequired?: boolean | undefined;
        auditLevel?: "minimal" | "standard" | "comprehensive" | undefined;
    }>;
    isActive: z.ZodDefault<z.ZodBoolean>;
    createdBy: z.ZodString;
    lastActiveAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    name: string;
    role: AgentRole;
    persona: {
        name: string;
        description: string;
        capabilities: string[];
        constraints?: Record<string, any> | undefined;
        preferences?: Record<string, any> | undefined;
    };
    intelligenceConfig: {
        analysisDepth: "basic" | "intermediate" | "advanced";
        contextWindowSize: number;
        decisionThreshold: number;
        learningEnabled: boolean;
        collaborationMode: "independent" | "collaborative" | "supervised";
    };
    securityContext: {
        securityLevel: "low" | "medium" | "high" | "critical";
        allowedCapabilities: string[];
        approvalRequired: boolean;
        auditLevel: "minimal" | "standard" | "comprehensive";
        restrictedDomains?: string[] | undefined;
    };
    isActive: boolean;
    createdBy: string;
    updatedAt?: Date | undefined;
    lastActiveAt?: Date | undefined;
}, {
    id: string;
    createdAt: Date;
    name: string;
    role: AgentRole;
    persona: {
        name: string;
        description: string;
        capabilities: string[];
        constraints?: Record<string, any> | undefined;
        preferences?: Record<string, any> | undefined;
    };
    intelligenceConfig: {
        analysisDepth?: "basic" | "intermediate" | "advanced" | undefined;
        contextWindowSize?: number | undefined;
        decisionThreshold?: number | undefined;
        learningEnabled?: boolean | undefined;
        collaborationMode?: "independent" | "collaborative" | "supervised" | undefined;
    };
    securityContext: {
        allowedCapabilities: string[];
        securityLevel?: "low" | "medium" | "high" | "critical" | undefined;
        restrictedDomains?: string[] | undefined;
        approvalRequired?: boolean | undefined;
        auditLevel?: "minimal" | "standard" | "comprehensive" | undefined;
    };
    createdBy: string;
    updatedAt?: Date | undefined;
    isActive?: boolean | undefined;
    lastActiveAt?: Date | undefined;
}>;
export type Agent = z.infer<typeof AgentSchema>;
export declare enum MessageRole {
    USER = "user",
    ASSISTANT = "assistant",
    SYSTEM = "system"
}
export declare const MessageSchema: z.ZodObject<{
    id: z.ZodString;
    role: z.ZodNativeEnum<typeof MessageRole>;
    content: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    timestamp: Date;
    role: MessageRole;
    content: string;
    metadata?: Record<string, any> | undefined;
}, {
    id: string;
    timestamp: Date;
    role: MessageRole;
    content: string;
    metadata?: Record<string, any> | undefined;
}>;
export type Message = z.infer<typeof MessageSchema>;
export declare const ConversationContextSchema: z.ZodObject<{
    id: z.ZodString;
    agentId: z.ZodString;
    userId: z.ZodString;
    messages: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        role: z.ZodNativeEnum<typeof MessageRole>;
        content: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        timestamp: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        id: string;
        timestamp: Date;
        role: MessageRole;
        content: string;
        metadata?: Record<string, any> | undefined;
    }, {
        id: string;
        timestamp: Date;
        role: MessageRole;
        content: string;
        metadata?: Record<string, any> | undefined;
    }>, "many">;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    startedAt: z.ZodDate;
    lastActivityAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    agentId: string;
    userId: string;
    messages: {
        id: string;
        timestamp: Date;
        role: MessageRole;
        content: string;
        metadata?: Record<string, any> | undefined;
    }[];
    startedAt: Date;
    lastActivityAt: Date;
    metadata?: Record<string, any> | undefined;
}, {
    id: string;
    agentId: string;
    userId: string;
    messages: {
        id: string;
        timestamp: Date;
        role: MessageRole;
        content: string;
        metadata?: Record<string, any> | undefined;
    }[];
    startedAt: Date;
    lastActivityAt: Date;
    metadata?: Record<string, any> | undefined;
}>;
export type ConversationContext = z.infer<typeof ConversationContextSchema>;
export declare const ContextAnalysisSchema: z.ZodObject<{
    conversationContext: z.ZodObject<{
        id: z.ZodString;
        agentId: z.ZodString;
        userId: z.ZodString;
        messages: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            role: z.ZodNativeEnum<typeof MessageRole>;
            content: z.ZodString;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            timestamp: z.ZodDate;
        }, "strip", z.ZodTypeAny, {
            id: string;
            timestamp: Date;
            role: MessageRole;
            content: string;
            metadata?: Record<string, any> | undefined;
        }, {
            id: string;
            timestamp: Date;
            role: MessageRole;
            content: string;
            metadata?: Record<string, any> | undefined;
        }>, "many">;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        startedAt: z.ZodDate;
        lastActivityAt: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        id: string;
        agentId: string;
        userId: string;
        messages: {
            id: string;
            timestamp: Date;
            role: MessageRole;
            content: string;
            metadata?: Record<string, any> | undefined;
        }[];
        startedAt: Date;
        lastActivityAt: Date;
        metadata?: Record<string, any> | undefined;
    }, {
        id: string;
        agentId: string;
        userId: string;
        messages: {
            id: string;
            timestamp: Date;
            role: MessageRole;
            content: string;
            metadata?: Record<string, any> | undefined;
        }[];
        startedAt: Date;
        lastActivityAt: Date;
        metadata?: Record<string, any> | undefined;
    }>;
    userRequest: z.ZodString;
    constraints: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "urgent"]>>;
}, "strip", z.ZodTypeAny, {
    conversationContext: {
        id: string;
        agentId: string;
        userId: string;
        messages: {
            id: string;
            timestamp: Date;
            role: MessageRole;
            content: string;
            metadata?: Record<string, any> | undefined;
        }[];
        startedAt: Date;
        lastActivityAt: Date;
        metadata?: Record<string, any> | undefined;
    };
    userRequest: string;
    priority: "low" | "medium" | "high" | "urgent";
    constraints?: Record<string, any> | undefined;
}, {
    conversationContext: {
        id: string;
        agentId: string;
        userId: string;
        messages: {
            id: string;
            timestamp: Date;
            role: MessageRole;
            content: string;
            metadata?: Record<string, any> | undefined;
        }[];
        startedAt: Date;
        lastActivityAt: Date;
        metadata?: Record<string, any> | undefined;
    };
    userRequest: string;
    constraints?: Record<string, any> | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
}>;
export type ContextAnalysis = z.infer<typeof ContextAnalysisSchema>;
export declare const ActionRecommendationSchema: z.ZodObject<{
    type: z.ZodEnum<["tool_execution", "artifact_generation", "hybrid_workflow", "clarification"]>;
    confidence: z.ZodNumber;
    reasoning: z.ZodString;
    estimatedDuration: z.ZodOptional<z.ZodNumber>;
    requiredCapabilities: z.ZodArray<z.ZodString, "many">;
    riskLevel: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
}, "strip", z.ZodTypeAny, {
    type: "tool_execution" | "artifact_generation" | "hybrid_workflow" | "clarification";
    confidence: number;
    reasoning: string;
    requiredCapabilities: string[];
    riskLevel: "low" | "medium" | "high";
    estimatedDuration?: number | undefined;
}, {
    type: "tool_execution" | "artifact_generation" | "hybrid_workflow" | "clarification";
    confidence: number;
    reasoning: string;
    requiredCapabilities: string[];
    estimatedDuration?: number | undefined;
    riskLevel?: "low" | "medium" | "high" | undefined;
}>;
export type ActionRecommendation = z.infer<typeof ActionRecommendationSchema>;
export declare const AgentAnalysisResultSchema: z.ZodObject<{
    analysis: z.ZodObject<{
        intent: z.ZodString;
        entities: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">;
        sentiment: z.ZodOptional<z.ZodEnum<["positive", "neutral", "negative"]>>;
        complexity: z.ZodEnum<["simple", "moderate", "complex"]>;
        urgency: z.ZodEnum<["low", "medium", "high"]>;
    }, "strip", z.ZodTypeAny, {
        intent: string;
        entities: Record<string, any>[];
        complexity: "simple" | "moderate" | "complex";
        urgency: "low" | "medium" | "high";
        sentiment?: "positive" | "neutral" | "negative" | undefined;
    }, {
        intent: string;
        entities: Record<string, any>[];
        complexity: "simple" | "moderate" | "complex";
        urgency: "low" | "medium" | "high";
        sentiment?: "positive" | "neutral" | "negative" | undefined;
    }>;
    recommendedActions: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["tool_execution", "artifact_generation", "hybrid_workflow", "clarification"]>;
        confidence: z.ZodNumber;
        reasoning: z.ZodString;
        estimatedDuration: z.ZodOptional<z.ZodNumber>;
        requiredCapabilities: z.ZodArray<z.ZodString, "many">;
        riskLevel: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
    }, "strip", z.ZodTypeAny, {
        type: "tool_execution" | "artifact_generation" | "hybrid_workflow" | "clarification";
        confidence: number;
        reasoning: string;
        requiredCapabilities: string[];
        riskLevel: "low" | "medium" | "high";
        estimatedDuration?: number | undefined;
    }, {
        type: "tool_execution" | "artifact_generation" | "hybrid_workflow" | "clarification";
        confidence: number;
        reasoning: string;
        requiredCapabilities: string[];
        estimatedDuration?: number | undefined;
        riskLevel?: "low" | "medium" | "high" | undefined;
    }>, "many">;
    confidence: z.ZodNumber;
    explanation: z.ZodString;
    suggestedCapabilities: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    analysis: {
        intent: string;
        entities: Record<string, any>[];
        complexity: "simple" | "moderate" | "complex";
        urgency: "low" | "medium" | "high";
        sentiment?: "positive" | "neutral" | "negative" | undefined;
    };
    recommendedActions: {
        type: "tool_execution" | "artifact_generation" | "hybrid_workflow" | "clarification";
        confidence: number;
        reasoning: string;
        requiredCapabilities: string[];
        riskLevel: "low" | "medium" | "high";
        estimatedDuration?: number | undefined;
    }[];
    explanation: string;
    suggestedCapabilities?: string[] | undefined;
}, {
    confidence: number;
    analysis: {
        intent: string;
        entities: Record<string, any>[];
        complexity: "simple" | "moderate" | "complex";
        urgency: "low" | "medium" | "high";
        sentiment?: "positive" | "neutral" | "negative" | undefined;
    };
    recommendedActions: {
        type: "tool_execution" | "artifact_generation" | "hybrid_workflow" | "clarification";
        confidence: number;
        reasoning: string;
        requiredCapabilities: string[];
        estimatedDuration?: number | undefined;
        riskLevel?: "low" | "medium" | "high" | undefined;
    }[];
    explanation: string;
    suggestedCapabilities?: string[] | undefined;
}>;
export type AgentAnalysisResult = z.infer<typeof AgentAnalysisResultSchema>;
export declare const AgentAnalysisSchema: z.ZodObject<{
    analysis: z.ZodObject<{
        context: z.ZodObject<{
            messageCount: z.ZodNumber;
            participants: z.ZodArray<z.ZodString, "many">;
            topics: z.ZodArray<z.ZodString, "many">;
            sentiment: z.ZodString;
            complexity: z.ZodString;
            urgency: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            sentiment: string;
            complexity: string;
            urgency: string;
            messageCount: number;
            participants: string[];
            topics: string[];
        }, {
            sentiment: string;
            complexity: string;
            urgency: string;
            messageCount: number;
            participants: string[];
            topics: string[];
        }>;
        intent: z.ZodObject<{
            primary: z.ZodString;
            secondary: z.ZodArray<z.ZodString, "many">;
            confidence: z.ZodNumber;
            entities: z.ZodArray<z.ZodAny, "many">;
            complexity: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            confidence: number;
            entities: any[];
            complexity: string;
            primary: string;
            secondary: string[];
        }, {
            confidence: number;
            entities: any[];
            complexity: string;
            primary: string;
            secondary: string[];
        }>;
        agentCapabilities: z.ZodObject<{
            tools: z.ZodArray<z.ZodString, "many">;
            artifacts: z.ZodArray<z.ZodString, "many">;
            specializations: z.ZodArray<z.ZodString, "many">;
            limitations: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            tools: string[];
            artifacts: string[];
            specializations: string[];
            limitations: string[];
        }, {
            tools: string[];
            artifacts: string[];
            specializations: string[];
            limitations: string[];
        }>;
        environmentFactors: z.ZodObject<{
            timeOfDay: z.ZodNumber;
            userLoad: z.ZodNumber;
            systemLoad: z.ZodString;
            availableResources: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            timeOfDay: number;
            userLoad: number;
            systemLoad: string;
            availableResources: string;
        }, {
            timeOfDay: number;
            userLoad: number;
            systemLoad: string;
            availableResources: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        intent: {
            confidence: number;
            entities: any[];
            complexity: string;
            primary: string;
            secondary: string[];
        };
        context: {
            sentiment: string;
            complexity: string;
            urgency: string;
            messageCount: number;
            participants: string[];
            topics: string[];
        };
        agentCapabilities: {
            tools: string[];
            artifacts: string[];
            specializations: string[];
            limitations: string[];
        };
        environmentFactors: {
            timeOfDay: number;
            userLoad: number;
            systemLoad: string;
            availableResources: string;
        };
    }, {
        intent: {
            confidence: number;
            entities: any[];
            complexity: string;
            primary: string;
            secondary: string[];
        };
        context: {
            sentiment: string;
            complexity: string;
            urgency: string;
            messageCount: number;
            participants: string[];
            topics: string[];
        };
        agentCapabilities: {
            tools: string[];
            artifacts: string[];
            specializations: string[];
            limitations: string[];
        };
        environmentFactors: {
            timeOfDay: number;
            userLoad: number;
            systemLoad: string;
            availableResources: string;
        };
    }>;
    recommendedActions: z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        confidence: z.ZodNumber;
        description: z.ZodString;
        estimatedDuration: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        type: string;
        description: string;
        confidence: number;
        estimatedDuration: number;
    }, {
        type: string;
        description: string;
        confidence: number;
        estimatedDuration: number;
    }>, "many">;
    confidence: z.ZodNumber;
    explanation: z.ZodString;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    timestamp: Date;
    confidence: number;
    analysis: {
        intent: {
            confidence: number;
            entities: any[];
            complexity: string;
            primary: string;
            secondary: string[];
        };
        context: {
            sentiment: string;
            complexity: string;
            urgency: string;
            messageCount: number;
            participants: string[];
            topics: string[];
        };
        agentCapabilities: {
            tools: string[];
            artifacts: string[];
            specializations: string[];
            limitations: string[];
        };
        environmentFactors: {
            timeOfDay: number;
            userLoad: number;
            systemLoad: string;
            availableResources: string;
        };
    };
    recommendedActions: {
        type: string;
        description: string;
        confidence: number;
        estimatedDuration: number;
    }[];
    explanation: string;
}, {
    timestamp: Date;
    confidence: number;
    analysis: {
        intent: {
            confidence: number;
            entities: any[];
            complexity: string;
            primary: string;
            secondary: string[];
        };
        context: {
            sentiment: string;
            complexity: string;
            urgency: string;
            messageCount: number;
            participants: string[];
            topics: string[];
        };
        agentCapabilities: {
            tools: string[];
            artifacts: string[];
            specializations: string[];
            limitations: string[];
        };
        environmentFactors: {
            timeOfDay: number;
            userLoad: number;
            systemLoad: string;
            availableResources: string;
        };
    };
    recommendedActions: {
        type: string;
        description: string;
        confidence: number;
        estimatedDuration: number;
    }[];
    explanation: string;
}>;
export type AgentAnalysis = z.infer<typeof AgentAnalysisSchema>;
export declare const ExecutionPlanSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    agentId: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        description: z.ZodString;
        estimatedDuration: z.ZodNumber;
        required: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: string;
        description: string;
        estimatedDuration: number;
        required: boolean;
    }, {
        type: string;
        id: string;
        description: string;
        estimatedDuration: number;
        required: boolean;
    }>, "many">;
    dependencies: z.ZodArray<z.ZodString, "many">;
    estimatedDuration: z.ZodNumber;
    priority: z.ZodString;
    constraints: z.ZodArray<z.ZodString, "many">;
    metadata: z.ZodObject<{
        generatedBy: z.ZodString;
        basedOnAnalysis: z.ZodDate;
        userPreferences: z.ZodOptional<z.ZodAny>;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        version: string;
        generatedBy: string;
        basedOnAnalysis: Date;
        userPreferences?: any;
    }, {
        version: string;
        generatedBy: string;
        basedOnAnalysis: Date;
        userPreferences?: any;
    }>;
    created_at: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    type: string;
    id: string;
    dependencies: string[];
    constraints: string[];
    metadata: {
        version: string;
        generatedBy: string;
        basedOnAnalysis: Date;
        userPreferences?: any;
    };
    agentId: string;
    priority: string;
    estimatedDuration: number;
    steps: {
        type: string;
        id: string;
        description: string;
        estimatedDuration: number;
        required: boolean;
    }[];
    created_at: Date;
}, {
    type: string;
    id: string;
    dependencies: string[];
    constraints: string[];
    metadata: {
        version: string;
        generatedBy: string;
        basedOnAnalysis: Date;
        userPreferences?: any;
    };
    agentId: string;
    priority: string;
    estimatedDuration: number;
    steps: {
        type: string;
        id: string;
        description: string;
        estimatedDuration: number;
        required: boolean;
    }[];
    created_at: Date;
}>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
export declare const LearningResultSchema: z.ZodObject<{
    learningApplied: z.ZodBoolean;
    confidenceAdjustments: z.ZodObject<{
        overallAdjustment: z.ZodNumber;
        specificAdjustments: z.ZodRecord<z.ZodString, z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        overallAdjustment: number;
        specificAdjustments: Record<string, any>;
    }, {
        overallAdjustment: number;
        specificAdjustments: Record<string, any>;
    }>;
    newKnowledge: z.ZodArray<z.ZodString, "many">;
    improvedCapabilities: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    learningApplied: boolean;
    confidenceAdjustments: {
        overallAdjustment: number;
        specificAdjustments: Record<string, any>;
    };
    newKnowledge: string[];
    improvedCapabilities: string[];
}, {
    learningApplied: boolean;
    confidenceAdjustments: {
        overallAdjustment: number;
        specificAdjustments: Record<string, any>;
    };
    newKnowledge: string[];
    improvedCapabilities: string[];
}>;
export type LearningResult = z.infer<typeof LearningResultSchema>;
//# sourceMappingURL=agent.d.ts.map