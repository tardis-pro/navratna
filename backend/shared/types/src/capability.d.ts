import { z } from 'zod';
export declare enum CapabilityType {
    TOOL = "tool",
    ARTIFACT = "artifact",
    HYBRID = "hybrid"
}
export declare enum CapabilityStatus {
    ACTIVE = "active",
    DEPRECATED = "deprecated",
    DISABLED = "disabled",
    EXPERIMENTAL = "experimental"
}
export declare const ToolCapabilitySchema: z.ZodObject<{
    endpoint: z.ZodString;
    method: z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>;
    authentication: z.ZodObject<{
        type: z.ZodEnum<["none", "api_key", "oauth", "jwt", "basic"]>;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        type: "basic" | "none" | "api_key" | "oauth" | "jwt";
        config?: Record<string, any> | undefined;
    }, {
        type: "basic" | "none" | "api_key" | "oauth" | "jwt";
        config?: Record<string, any> | undefined;
    }>;
    parameters: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
        required: z.ZodDefault<z.ZodBoolean>;
        description: z.ZodOptional<z.ZodString>;
        validation: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        type: "string" | "number" | "boolean" | "object" | "array";
        name: string;
        required: boolean;
        validation?: Record<string, any> | undefined;
        description?: string | undefined;
    }, {
        type: "string" | "number" | "boolean" | "object" | "array";
        name: string;
        validation?: Record<string, any> | undefined;
        description?: string | undefined;
        required?: boolean | undefined;
    }>, "many">;
    responseSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    timeout: z.ZodDefault<z.ZodNumber>;
    retryPolicy: z.ZodOptional<z.ZodObject<{
        maxRetries: z.ZodDefault<z.ZodNumber>;
        backoffStrategy: z.ZodDefault<z.ZodEnum<["fixed", "exponential"]>>;
    }, "strip", z.ZodTypeAny, {
        maxRetries: number;
        backoffStrategy: "fixed" | "exponential";
    }, {
        maxRetries?: number | undefined;
        backoffStrategy?: "fixed" | "exponential" | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    timeout: number;
    parameters: {
        type: "string" | "number" | "boolean" | "object" | "array";
        name: string;
        required: boolean;
        validation?: Record<string, any> | undefined;
        description?: string | undefined;
    }[];
    endpoint: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    authentication: {
        type: "basic" | "none" | "api_key" | "oauth" | "jwt";
        config?: Record<string, any> | undefined;
    };
    retryPolicy?: {
        maxRetries: number;
        backoffStrategy: "fixed" | "exponential";
    } | undefined;
    responseSchema?: Record<string, any> | undefined;
}, {
    parameters: {
        type: "string" | "number" | "boolean" | "object" | "array";
        name: string;
        validation?: Record<string, any> | undefined;
        description?: string | undefined;
        required?: boolean | undefined;
    }[];
    endpoint: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    authentication: {
        type: "basic" | "none" | "api_key" | "oauth" | "jwt";
        config?: Record<string, any> | undefined;
    };
    timeout?: number | undefined;
    retryPolicy?: {
        maxRetries?: number | undefined;
        backoffStrategy?: "fixed" | "exponential" | undefined;
    } | undefined;
    responseSchema?: Record<string, any> | undefined;
}>;
export type ToolCapability = z.infer<typeof ToolCapabilitySchema>;
export declare const ArtifactTemplateSchema: z.ZodObject<{
    templateEngine: z.ZodDefault<z.ZodEnum<["handlebars", "mustache", "jinja2", "ejs"]>>;
    template: z.ZodString;
    outputFormat: z.ZodEnum<["text", "json", "yaml", "xml", "html", "markdown", "code"]>;
    variables: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
        required: z.ZodDefault<z.ZodBoolean>;
        description: z.ZodOptional<z.ZodString>;
        defaultValue: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        type: "string" | "number" | "boolean" | "object" | "array";
        name: string;
        required: boolean;
        description?: string | undefined;
        defaultValue?: any;
    }, {
        type: "string" | "number" | "boolean" | "object" | "array";
        name: string;
        description?: string | undefined;
        required?: boolean | undefined;
        defaultValue?: any;
    }>, "many">;
    validationRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        rule: z.ZodString;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        message: string;
        field: string;
        rule: string;
    }, {
        message: string;
        field: string;
        rule: string;
    }>, "many">>;
    postProcessing: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["format", "validate", "transform"]>;
        config: z.ZodRecord<z.ZodString, z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        type: "format" | "validate" | "transform";
        config: Record<string, any>;
    }, {
        type: "format" | "validate" | "transform";
        config: Record<string, any>;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    variables: {
        type: "string" | "number" | "boolean" | "object" | "array";
        name: string;
        required: boolean;
        description?: string | undefined;
        defaultValue?: any;
    }[];
    templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
    template: string;
    outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
    validationRules?: {
        message: string;
        field: string;
        rule: string;
    }[] | undefined;
    postProcessing?: {
        type: "format" | "validate" | "transform";
        config: Record<string, any>;
    }[] | undefined;
}, {
    variables: {
        type: "string" | "number" | "boolean" | "object" | "array";
        name: string;
        description?: string | undefined;
        required?: boolean | undefined;
        defaultValue?: any;
    }[];
    template: string;
    outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
    validationRules?: {
        message: string;
        field: string;
        rule: string;
    }[] | undefined;
    templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
    postProcessing?: {
        type: "format" | "validate" | "transform";
        config: Record<string, any>;
    }[] | undefined;
}>;
export type ArtifactTemplate = z.infer<typeof ArtifactTemplateSchema>;
export declare const CapabilityMetadataSchema: z.ZodObject<{
    version: z.ZodString;
    author: z.ZodOptional<z.ZodString>;
    license: z.ZodOptional<z.ZodString>;
    documentation: z.ZodOptional<z.ZodString>;
    examples: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">>;
    tags: z.ZodArray<z.ZodString, "many">;
    category: z.ZodString;
    subcategory: z.ZodOptional<z.ZodString>;
    trustScore: z.ZodDefault<z.ZodNumber>;
    usageCount: z.ZodDefault<z.ZodNumber>;
    lastUsed: z.ZodOptional<z.ZodDate>;
    performance: z.ZodOptional<z.ZodObject<{
        averageLatency: z.ZodOptional<z.ZodNumber>;
        successRate: z.ZodOptional<z.ZodNumber>;
        errorRate: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        errorRate?: number | undefined;
        averageLatency?: number | undefined;
        successRate?: number | undefined;
    }, {
        errorRate?: number | undefined;
        averageLatency?: number | undefined;
        successRate?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    version: string;
    tags: string[];
    category: string;
    trustScore: number;
    usageCount: number;
    author?: string | undefined;
    license?: string | undefined;
    documentation?: string | undefined;
    examples?: Record<string, any>[] | undefined;
    subcategory?: string | undefined;
    lastUsed?: Date | undefined;
    performance?: {
        errorRate?: number | undefined;
        averageLatency?: number | undefined;
        successRate?: number | undefined;
    } | undefined;
}, {
    version: string;
    tags: string[];
    category: string;
    author?: string | undefined;
    license?: string | undefined;
    documentation?: string | undefined;
    examples?: Record<string, any>[] | undefined;
    subcategory?: string | undefined;
    trustScore?: number | undefined;
    usageCount?: number | undefined;
    lastUsed?: Date | undefined;
    performance?: {
        errorRate?: number | undefined;
        averageLatency?: number | undefined;
        successRate?: number | undefined;
    } | undefined;
}>;
export type CapabilityMetadata = z.infer<typeof CapabilityMetadataSchema>;
export declare const CapabilitySchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    name: z.ZodString;
    description: z.ZodString;
    type: z.ZodNativeEnum<typeof CapabilityType>;
    status: z.ZodDefault<z.ZodNativeEnum<typeof CapabilityStatus>>;
    metadata: z.ZodObject<{
        version: z.ZodString;
        author: z.ZodOptional<z.ZodString>;
        license: z.ZodOptional<z.ZodString>;
        documentation: z.ZodOptional<z.ZodString>;
        examples: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">>;
        tags: z.ZodArray<z.ZodString, "many">;
        category: z.ZodString;
        subcategory: z.ZodOptional<z.ZodString>;
        trustScore: z.ZodDefault<z.ZodNumber>;
        usageCount: z.ZodDefault<z.ZodNumber>;
        lastUsed: z.ZodOptional<z.ZodDate>;
        performance: z.ZodOptional<z.ZodObject<{
            averageLatency: z.ZodOptional<z.ZodNumber>;
            successRate: z.ZodOptional<z.ZodNumber>;
            errorRate: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        }, {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        version: string;
        tags: string[];
        category: string;
        trustScore: number;
        usageCount: number;
        author?: string | undefined;
        license?: string | undefined;
        documentation?: string | undefined;
        examples?: Record<string, any>[] | undefined;
        subcategory?: string | undefined;
        lastUsed?: Date | undefined;
        performance?: {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        } | undefined;
    }, {
        version: string;
        tags: string[];
        category: string;
        author?: string | undefined;
        license?: string | undefined;
        documentation?: string | undefined;
        examples?: Record<string, any>[] | undefined;
        subcategory?: string | undefined;
        trustScore?: number | undefined;
        usageCount?: number | undefined;
        lastUsed?: Date | undefined;
        performance?: {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        } | undefined;
    }>;
    toolConfig: z.ZodOptional<z.ZodObject<{
        endpoint: z.ZodString;
        method: z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>;
        authentication: z.ZodObject<{
            type: z.ZodEnum<["none", "api_key", "oauth", "jwt", "basic"]>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            type: "basic" | "none" | "api_key" | "oauth" | "jwt";
            config?: Record<string, any> | undefined;
        }, {
            type: "basic" | "none" | "api_key" | "oauth" | "jwt";
            config?: Record<string, any> | undefined;
        }>;
        parameters: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
            required: z.ZodDefault<z.ZodBoolean>;
            description: z.ZodOptional<z.ZodString>;
            validation: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            required: boolean;
            validation?: Record<string, any> | undefined;
            description?: string | undefined;
        }, {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            validation?: Record<string, any> | undefined;
            description?: string | undefined;
            required?: boolean | undefined;
        }>, "many">;
        responseSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        timeout: z.ZodDefault<z.ZodNumber>;
        retryPolicy: z.ZodOptional<z.ZodObject<{
            maxRetries: z.ZodDefault<z.ZodNumber>;
            backoffStrategy: z.ZodDefault<z.ZodEnum<["fixed", "exponential"]>>;
        }, "strip", z.ZodTypeAny, {
            maxRetries: number;
            backoffStrategy: "fixed" | "exponential";
        }, {
            maxRetries?: number | undefined;
            backoffStrategy?: "fixed" | "exponential" | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        timeout: number;
        parameters: {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            required: boolean;
            validation?: Record<string, any> | undefined;
            description?: string | undefined;
        }[];
        endpoint: string;
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
        authentication: {
            type: "basic" | "none" | "api_key" | "oauth" | "jwt";
            config?: Record<string, any> | undefined;
        };
        retryPolicy?: {
            maxRetries: number;
            backoffStrategy: "fixed" | "exponential";
        } | undefined;
        responseSchema?: Record<string, any> | undefined;
    }, {
        parameters: {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            validation?: Record<string, any> | undefined;
            description?: string | undefined;
            required?: boolean | undefined;
        }[];
        endpoint: string;
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
        authentication: {
            type: "basic" | "none" | "api_key" | "oauth" | "jwt";
            config?: Record<string, any> | undefined;
        };
        timeout?: number | undefined;
        retryPolicy?: {
            maxRetries?: number | undefined;
            backoffStrategy?: "fixed" | "exponential" | undefined;
        } | undefined;
        responseSchema?: Record<string, any> | undefined;
    }>>;
    artifactConfig: z.ZodOptional<z.ZodObject<{
        templateEngine: z.ZodDefault<z.ZodEnum<["handlebars", "mustache", "jinja2", "ejs"]>>;
        template: z.ZodString;
        outputFormat: z.ZodEnum<["text", "json", "yaml", "xml", "html", "markdown", "code"]>;
        variables: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
            required: z.ZodDefault<z.ZodBoolean>;
            description: z.ZodOptional<z.ZodString>;
            defaultValue: z.ZodOptional<z.ZodAny>;
        }, "strip", z.ZodTypeAny, {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            required: boolean;
            description?: string | undefined;
            defaultValue?: any;
        }, {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            description?: string | undefined;
            required?: boolean | undefined;
            defaultValue?: any;
        }>, "many">;
        validationRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
            field: z.ZodString;
            rule: z.ZodString;
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            message: string;
            field: string;
            rule: string;
        }, {
            message: string;
            field: string;
            rule: string;
        }>, "many">>;
        postProcessing: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["format", "validate", "transform"]>;
            config: z.ZodRecord<z.ZodString, z.ZodAny>;
        }, "strip", z.ZodTypeAny, {
            type: "format" | "validate" | "transform";
            config: Record<string, any>;
        }, {
            type: "format" | "validate" | "transform";
            config: Record<string, any>;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        variables: {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            required: boolean;
            description?: string | undefined;
            defaultValue?: any;
        }[];
        templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
        template: string;
        outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
        validationRules?: {
            message: string;
            field: string;
            rule: string;
        }[] | undefined;
        postProcessing?: {
            type: "format" | "validate" | "transform";
            config: Record<string, any>;
        }[] | undefined;
    }, {
        variables: {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            description?: string | undefined;
            required?: boolean | undefined;
            defaultValue?: any;
        }[];
        template: string;
        outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
        validationRules?: {
            message: string;
            field: string;
            rule: string;
        }[] | undefined;
        templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
        postProcessing?: {
            type: "format" | "validate" | "transform";
            config: Record<string, any>;
        }[] | undefined;
    }>>;
    dependencies: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    securityRequirements: z.ZodObject<{
        minimumSecurityLevel: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
        requiredPermissions: z.ZodArray<z.ZodString, "many">;
        sensitiveData: z.ZodDefault<z.ZodBoolean>;
        auditRequired: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        minimumSecurityLevel: "low" | "medium" | "high" | "critical";
        requiredPermissions: string[];
        sensitiveData: boolean;
        auditRequired: boolean;
    }, {
        requiredPermissions: string[];
        minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
        sensitiveData?: boolean | undefined;
        auditRequired?: boolean | undefined;
    }>;
    resourceRequirements: z.ZodOptional<z.ZodObject<{
        cpu: z.ZodOptional<z.ZodNumber>;
        memory: z.ZodOptional<z.ZodNumber>;
        storage: z.ZodOptional<z.ZodNumber>;
        network: z.ZodDefault<z.ZodBoolean>;
        estimatedDuration: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        network: boolean;
        estimatedDuration?: number | undefined;
        cpu?: number | undefined;
        memory?: number | undefined;
        storage?: number | undefined;
    }, {
        estimatedDuration?: number | undefined;
        cpu?: number | undefined;
        memory?: number | undefined;
        storage?: number | undefined;
        network?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    type: CapabilityType;
    status: CapabilityStatus;
    id: string;
    createdAt: Date;
    name: string;
    description: string;
    metadata: {
        version: string;
        tags: string[];
        category: string;
        trustScore: number;
        usageCount: number;
        author?: string | undefined;
        license?: string | undefined;
        documentation?: string | undefined;
        examples?: Record<string, any>[] | undefined;
        subcategory?: string | undefined;
        lastUsed?: Date | undefined;
        performance?: {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        } | undefined;
    };
    securityRequirements: {
        minimumSecurityLevel: "low" | "medium" | "high" | "critical";
        requiredPermissions: string[];
        sensitiveData: boolean;
        auditRequired: boolean;
    };
    updatedAt?: Date | undefined;
    dependencies?: string[] | undefined;
    resourceRequirements?: {
        network: boolean;
        estimatedDuration?: number | undefined;
        cpu?: number | undefined;
        memory?: number | undefined;
        storage?: number | undefined;
    } | undefined;
    toolConfig?: {
        timeout: number;
        parameters: {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            required: boolean;
            validation?: Record<string, any> | undefined;
            description?: string | undefined;
        }[];
        endpoint: string;
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
        authentication: {
            type: "basic" | "none" | "api_key" | "oauth" | "jwt";
            config?: Record<string, any> | undefined;
        };
        retryPolicy?: {
            maxRetries: number;
            backoffStrategy: "fixed" | "exponential";
        } | undefined;
        responseSchema?: Record<string, any> | undefined;
    } | undefined;
    artifactConfig?: {
        variables: {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            required: boolean;
            description?: string | undefined;
            defaultValue?: any;
        }[];
        templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
        template: string;
        outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
        validationRules?: {
            message: string;
            field: string;
            rule: string;
        }[] | undefined;
        postProcessing?: {
            type: "format" | "validate" | "transform";
            config: Record<string, any>;
        }[] | undefined;
    } | undefined;
}, {
    type: CapabilityType;
    id: string;
    createdAt: Date;
    name: string;
    description: string;
    metadata: {
        version: string;
        tags: string[];
        category: string;
        author?: string | undefined;
        license?: string | undefined;
        documentation?: string | undefined;
        examples?: Record<string, any>[] | undefined;
        subcategory?: string | undefined;
        trustScore?: number | undefined;
        usageCount?: number | undefined;
        lastUsed?: Date | undefined;
        performance?: {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        } | undefined;
    };
    securityRequirements: {
        requiredPermissions: string[];
        minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
        sensitiveData?: boolean | undefined;
        auditRequired?: boolean | undefined;
    };
    status?: CapabilityStatus | undefined;
    updatedAt?: Date | undefined;
    dependencies?: string[] | undefined;
    resourceRequirements?: {
        estimatedDuration?: number | undefined;
        cpu?: number | undefined;
        memory?: number | undefined;
        storage?: number | undefined;
        network?: boolean | undefined;
    } | undefined;
    toolConfig?: {
        parameters: {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            validation?: Record<string, any> | undefined;
            description?: string | undefined;
            required?: boolean | undefined;
        }[];
        endpoint: string;
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
        authentication: {
            type: "basic" | "none" | "api_key" | "oauth" | "jwt";
            config?: Record<string, any> | undefined;
        };
        timeout?: number | undefined;
        retryPolicy?: {
            maxRetries?: number | undefined;
            backoffStrategy?: "fixed" | "exponential" | undefined;
        } | undefined;
        responseSchema?: Record<string, any> | undefined;
    } | undefined;
    artifactConfig?: {
        variables: {
            type: "string" | "number" | "boolean" | "object" | "array";
            name: string;
            description?: string | undefined;
            required?: boolean | undefined;
            defaultValue?: any;
        }[];
        template: string;
        outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
        validationRules?: {
            message: string;
            field: string;
            rule: string;
        }[] | undefined;
        templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
        postProcessing?: {
            type: "format" | "validate" | "transform";
            config: Record<string, any>;
        }[] | undefined;
    } | undefined;
}>;
export type Capability = z.infer<typeof CapabilitySchema>;
export declare const CapabilitySearchRequestSchema: z.ZodObject<{
    query: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodNativeEnum<typeof CapabilityType>>;
    category: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    securityLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    includeDeprecated: z.ZodDefault<z.ZodBoolean>;
    sortBy: z.ZodDefault<z.ZodEnum<["relevance", "name", "usage_count", "trust_score", "created_at"]>>;
    sortOrder: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
}, "strip", z.ZodTypeAny, {
    sortBy: "name" | "created_at" | "relevance" | "usage_count" | "trust_score";
    sortOrder: "asc" | "desc";
    includeDeprecated: boolean;
    type?: CapabilityType | undefined;
    securityLevel?: "low" | "medium" | "high" | "critical" | undefined;
    tags?: string[] | undefined;
    category?: string | undefined;
    query?: string | undefined;
}, {
    type?: CapabilityType | undefined;
    sortBy?: "name" | "created_at" | "relevance" | "usage_count" | "trust_score" | undefined;
    sortOrder?: "asc" | "desc" | undefined;
    securityLevel?: "low" | "medium" | "high" | "critical" | undefined;
    tags?: string[] | undefined;
    category?: string | undefined;
    query?: string | undefined;
    includeDeprecated?: boolean | undefined;
}>;
export type CapabilitySearchRequest = z.infer<typeof CapabilitySearchRequestSchema>;
export declare const CapabilityRecommendationSchema: z.ZodObject<{
    capability: z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodDate;
        updatedAt: z.ZodOptional<z.ZodDate>;
    } & {
        name: z.ZodString;
        description: z.ZodString;
        type: z.ZodNativeEnum<typeof CapabilityType>;
        status: z.ZodDefault<z.ZodNativeEnum<typeof CapabilityStatus>>;
        metadata: z.ZodObject<{
            version: z.ZodString;
            author: z.ZodOptional<z.ZodString>;
            license: z.ZodOptional<z.ZodString>;
            documentation: z.ZodOptional<z.ZodString>;
            examples: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">>;
            tags: z.ZodArray<z.ZodString, "many">;
            category: z.ZodString;
            subcategory: z.ZodOptional<z.ZodString>;
            trustScore: z.ZodDefault<z.ZodNumber>;
            usageCount: z.ZodDefault<z.ZodNumber>;
            lastUsed: z.ZodOptional<z.ZodDate>;
            performance: z.ZodOptional<z.ZodObject<{
                averageLatency: z.ZodOptional<z.ZodNumber>;
                successRate: z.ZodOptional<z.ZodNumber>;
                errorRate: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            }, {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        }, {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        }>;
        toolConfig: z.ZodOptional<z.ZodObject<{
            endpoint: z.ZodString;
            method: z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>;
            authentication: z.ZodObject<{
                type: z.ZodEnum<["none", "api_key", "oauth", "jwt", "basic"]>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            }, "strip", z.ZodTypeAny, {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            }, {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            }>;
            parameters: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
                required: z.ZodDefault<z.ZodBoolean>;
                description: z.ZodOptional<z.ZodString>;
                validation: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            }, "strip", z.ZodTypeAny, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }>, "many">;
            responseSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            timeout: z.ZodDefault<z.ZodNumber>;
            retryPolicy: z.ZodOptional<z.ZodObject<{
                maxRetries: z.ZodDefault<z.ZodNumber>;
                backoffStrategy: z.ZodDefault<z.ZodEnum<["fixed", "exponential"]>>;
            }, "strip", z.ZodTypeAny, {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            }, {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        }, {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        }>>;
        artifactConfig: z.ZodOptional<z.ZodObject<{
            templateEngine: z.ZodDefault<z.ZodEnum<["handlebars", "mustache", "jinja2", "ejs"]>>;
            template: z.ZodString;
            outputFormat: z.ZodEnum<["text", "json", "yaml", "xml", "html", "markdown", "code"]>;
            variables: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
                required: z.ZodDefault<z.ZodBoolean>;
                description: z.ZodOptional<z.ZodString>;
                defaultValue: z.ZodOptional<z.ZodAny>;
            }, "strip", z.ZodTypeAny, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }>, "many">;
            validationRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
                field: z.ZodString;
                rule: z.ZodString;
                message: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                message: string;
                field: string;
                rule: string;
            }, {
                message: string;
                field: string;
                rule: string;
            }>, "many">>;
            postProcessing: z.ZodOptional<z.ZodArray<z.ZodObject<{
                type: z.ZodEnum<["format", "validate", "transform"]>;
                config: z.ZodRecord<z.ZodString, z.ZodAny>;
            }, "strip", z.ZodTypeAny, {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }, {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        }, {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        }>>;
        dependencies: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        securityRequirements: z.ZodObject<{
            minimumSecurityLevel: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
            requiredPermissions: z.ZodArray<z.ZodString, "many">;
            sensitiveData: z.ZodDefault<z.ZodBoolean>;
            auditRequired: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        }, {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        }>;
        resourceRequirements: z.ZodOptional<z.ZodObject<{
            cpu: z.ZodOptional<z.ZodNumber>;
            memory: z.ZodOptional<z.ZodNumber>;
            storage: z.ZodOptional<z.ZodNumber>;
            network: z.ZodDefault<z.ZodBoolean>;
            estimatedDuration: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        }, {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        type: CapabilityType;
        status: CapabilityStatus;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        };
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        } | undefined;
        toolConfig?: {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }, {
        type: CapabilityType;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        };
        status?: CapabilityStatus | undefined;
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        } | undefined;
        toolConfig?: {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }>;
    relevanceScore: z.ZodNumber;
    reasoning: z.ZodString;
    alternatives: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    usageExamples: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">>;
}, "strip", z.ZodTypeAny, {
    reasoning: string;
    capability: {
        type: CapabilityType;
        status: CapabilityStatus;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        };
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        } | undefined;
        toolConfig?: {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    };
    relevanceScore: number;
    alternatives?: string[] | undefined;
    usageExamples?: Record<string, any>[] | undefined;
}, {
    reasoning: string;
    capability: {
        type: CapabilityType;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        };
        status?: CapabilityStatus | undefined;
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        } | undefined;
        toolConfig?: {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    };
    relevanceScore: number;
    alternatives?: string[] | undefined;
    usageExamples?: Record<string, any>[] | undefined;
}>;
export type CapabilityRecommendation = z.infer<typeof CapabilityRecommendationSchema>;
export declare enum RelationshipType {
    DEPENDS_ON = "depends_on",
    PROVIDES = "provides",
    COMPOSES = "composes",
    EXTENDS = "extends",
    REPLACES = "replaces",
    CONFLICTS_WITH = "conflicts_with"
}
export declare const CapabilityRelationshipSchema: z.ZodObject<{
    id: z.ZodString;
    sourceId: z.ZodString;
    targetId: z.ZodString;
    type: z.ZodNativeEnum<typeof RelationshipType>;
    strength: z.ZodDefault<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    type: RelationshipType;
    id: string;
    createdAt: Date;
    sourceId: string;
    targetId: string;
    strength: number;
    metadata?: Record<string, any> | undefined;
}, {
    type: RelationshipType;
    id: string;
    createdAt: Date;
    sourceId: string;
    targetId: string;
    metadata?: Record<string, any> | undefined;
    strength?: number | undefined;
}>;
export type CapabilityRelationship = z.infer<typeof CapabilityRelationshipSchema>;
export declare const DependencyGraphSchema: z.ZodObject<{
    capabilities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodDate;
        updatedAt: z.ZodOptional<z.ZodDate>;
    } & {
        name: z.ZodString;
        description: z.ZodString;
        type: z.ZodNativeEnum<typeof CapabilityType>;
        status: z.ZodDefault<z.ZodNativeEnum<typeof CapabilityStatus>>;
        metadata: z.ZodObject<{
            version: z.ZodString;
            author: z.ZodOptional<z.ZodString>;
            license: z.ZodOptional<z.ZodString>;
            documentation: z.ZodOptional<z.ZodString>;
            examples: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">>;
            tags: z.ZodArray<z.ZodString, "many">;
            category: z.ZodString;
            subcategory: z.ZodOptional<z.ZodString>;
            trustScore: z.ZodDefault<z.ZodNumber>;
            usageCount: z.ZodDefault<z.ZodNumber>;
            lastUsed: z.ZodOptional<z.ZodDate>;
            performance: z.ZodOptional<z.ZodObject<{
                averageLatency: z.ZodOptional<z.ZodNumber>;
                successRate: z.ZodOptional<z.ZodNumber>;
                errorRate: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            }, {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        }, {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        }>;
        toolConfig: z.ZodOptional<z.ZodObject<{
            endpoint: z.ZodString;
            method: z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>;
            authentication: z.ZodObject<{
                type: z.ZodEnum<["none", "api_key", "oauth", "jwt", "basic"]>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            }, "strip", z.ZodTypeAny, {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            }, {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            }>;
            parameters: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
                required: z.ZodDefault<z.ZodBoolean>;
                description: z.ZodOptional<z.ZodString>;
                validation: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            }, "strip", z.ZodTypeAny, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }>, "many">;
            responseSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            timeout: z.ZodDefault<z.ZodNumber>;
            retryPolicy: z.ZodOptional<z.ZodObject<{
                maxRetries: z.ZodDefault<z.ZodNumber>;
                backoffStrategy: z.ZodDefault<z.ZodEnum<["fixed", "exponential"]>>;
            }, "strip", z.ZodTypeAny, {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            }, {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        }, {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        }>>;
        artifactConfig: z.ZodOptional<z.ZodObject<{
            templateEngine: z.ZodDefault<z.ZodEnum<["handlebars", "mustache", "jinja2", "ejs"]>>;
            template: z.ZodString;
            outputFormat: z.ZodEnum<["text", "json", "yaml", "xml", "html", "markdown", "code"]>;
            variables: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
                required: z.ZodDefault<z.ZodBoolean>;
                description: z.ZodOptional<z.ZodString>;
                defaultValue: z.ZodOptional<z.ZodAny>;
            }, "strip", z.ZodTypeAny, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }>, "many">;
            validationRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
                field: z.ZodString;
                rule: z.ZodString;
                message: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                message: string;
                field: string;
                rule: string;
            }, {
                message: string;
                field: string;
                rule: string;
            }>, "many">>;
            postProcessing: z.ZodOptional<z.ZodArray<z.ZodObject<{
                type: z.ZodEnum<["format", "validate", "transform"]>;
                config: z.ZodRecord<z.ZodString, z.ZodAny>;
            }, "strip", z.ZodTypeAny, {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }, {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        }, {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        }>>;
        dependencies: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        securityRequirements: z.ZodObject<{
            minimumSecurityLevel: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
            requiredPermissions: z.ZodArray<z.ZodString, "many">;
            sensitiveData: z.ZodDefault<z.ZodBoolean>;
            auditRequired: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        }, {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        }>;
        resourceRequirements: z.ZodOptional<z.ZodObject<{
            cpu: z.ZodOptional<z.ZodNumber>;
            memory: z.ZodOptional<z.ZodNumber>;
            storage: z.ZodOptional<z.ZodNumber>;
            network: z.ZodDefault<z.ZodBoolean>;
            estimatedDuration: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        }, {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        type: CapabilityType;
        status: CapabilityStatus;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        };
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        } | undefined;
        toolConfig?: {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }, {
        type: CapabilityType;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        };
        status?: CapabilityStatus | undefined;
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        } | undefined;
        toolConfig?: {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }>, "many">;
    relationships: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        sourceId: z.ZodString;
        targetId: z.ZodString;
        type: z.ZodNativeEnum<typeof RelationshipType>;
        strength: z.ZodDefault<z.ZodNumber>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        createdAt: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        type: RelationshipType;
        id: string;
        createdAt: Date;
        sourceId: string;
        targetId: string;
        strength: number;
        metadata?: Record<string, any> | undefined;
    }, {
        type: RelationshipType;
        id: string;
        createdAt: Date;
        sourceId: string;
        targetId: string;
        metadata?: Record<string, any> | undefined;
        strength?: number | undefined;
    }>, "many">;
    executionOrder: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    potentialConflicts: z.ZodOptional<z.ZodArray<z.ZodObject<{
        capabilityIds: z.ZodArray<z.ZodString, "many">;
        conflictType: z.ZodString;
        resolution: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        capabilityIds: string[];
        conflictType: string;
        resolution?: string | undefined;
    }, {
        capabilityIds: string[];
        conflictType: string;
        resolution?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    capabilities: {
        type: CapabilityType;
        status: CapabilityStatus;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        };
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        } | undefined;
        toolConfig?: {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }[];
    relationships: {
        type: RelationshipType;
        id: string;
        createdAt: Date;
        sourceId: string;
        targetId: string;
        strength: number;
        metadata?: Record<string, any> | undefined;
    }[];
    executionOrder?: string[] | undefined;
    potentialConflicts?: {
        capabilityIds: string[];
        conflictType: string;
        resolution?: string | undefined;
    }[] | undefined;
}, {
    capabilities: {
        type: CapabilityType;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        };
        status?: CapabilityStatus | undefined;
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        } | undefined;
        toolConfig?: {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }[];
    relationships: {
        type: RelationshipType;
        id: string;
        createdAt: Date;
        sourceId: string;
        targetId: string;
        metadata?: Record<string, any> | undefined;
        strength?: number | undefined;
    }[];
    executionOrder?: string[] | undefined;
    potentialConflicts?: {
        capabilityIds: string[];
        conflictType: string;
        resolution?: string | undefined;
    }[] | undefined;
}>;
export type DependencyGraph = z.infer<typeof DependencyGraphSchema>;
export declare const CapabilitySearchQuerySchema: z.ZodObject<{
    query: z.ZodString;
    type: z.ZodOptional<z.ZodNativeEnum<typeof CapabilityType>>;
    agentContext: z.ZodOptional<z.ZodObject<{
        agentId: z.ZodString;
        specializations: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        agentId: string;
        specializations: string[];
    }, {
        agentId: string;
        specializations: string[];
    }>>;
    securityContext: z.ZodOptional<z.ZodObject<{
        securityLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "critical"]>>;
        allowedCapabilities: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        securityLevel?: "low" | "medium" | "high" | "critical" | undefined;
        allowedCapabilities?: string[] | undefined;
    }, {
        securityLevel?: "low" | "medium" | "high" | "critical" | undefined;
        allowedCapabilities?: string[] | undefined;
    }>>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    query: string;
    type?: CapabilityType | undefined;
    securityContext?: {
        securityLevel?: "low" | "medium" | "high" | "critical" | undefined;
        allowedCapabilities?: string[] | undefined;
    } | undefined;
    agentContext?: {
        agentId: string;
        specializations: string[];
    } | undefined;
}, {
    query: string;
    type?: CapabilityType | undefined;
    limit?: number | undefined;
    securityContext?: {
        securityLevel?: "low" | "medium" | "high" | "critical" | undefined;
        allowedCapabilities?: string[] | undefined;
    } | undefined;
    agentContext?: {
        agentId: string;
        specializations: string[];
    } | undefined;
}>;
export type CapabilitySearchQuery = z.infer<typeof CapabilitySearchQuerySchema>;
export declare const CapabilitySearchResultSchema: z.ZodObject<{
    capabilities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodDate;
        updatedAt: z.ZodOptional<z.ZodDate>;
    } & {
        name: z.ZodString;
        description: z.ZodString;
        type: z.ZodNativeEnum<typeof CapabilityType>;
        status: z.ZodDefault<z.ZodNativeEnum<typeof CapabilityStatus>>;
        metadata: z.ZodObject<{
            version: z.ZodString;
            author: z.ZodOptional<z.ZodString>;
            license: z.ZodOptional<z.ZodString>;
            documentation: z.ZodOptional<z.ZodString>;
            examples: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">>;
            tags: z.ZodArray<z.ZodString, "many">;
            category: z.ZodString;
            subcategory: z.ZodOptional<z.ZodString>;
            trustScore: z.ZodDefault<z.ZodNumber>;
            usageCount: z.ZodDefault<z.ZodNumber>;
            lastUsed: z.ZodOptional<z.ZodDate>;
            performance: z.ZodOptional<z.ZodObject<{
                averageLatency: z.ZodOptional<z.ZodNumber>;
                successRate: z.ZodOptional<z.ZodNumber>;
                errorRate: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            }, {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        }, {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        }>;
        toolConfig: z.ZodOptional<z.ZodObject<{
            endpoint: z.ZodString;
            method: z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>;
            authentication: z.ZodObject<{
                type: z.ZodEnum<["none", "api_key", "oauth", "jwt", "basic"]>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            }, "strip", z.ZodTypeAny, {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            }, {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            }>;
            parameters: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
                required: z.ZodDefault<z.ZodBoolean>;
                description: z.ZodOptional<z.ZodString>;
                validation: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            }, "strip", z.ZodTypeAny, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }>, "many">;
            responseSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            timeout: z.ZodDefault<z.ZodNumber>;
            retryPolicy: z.ZodOptional<z.ZodObject<{
                maxRetries: z.ZodDefault<z.ZodNumber>;
                backoffStrategy: z.ZodDefault<z.ZodEnum<["fixed", "exponential"]>>;
            }, "strip", z.ZodTypeAny, {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            }, {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        }, {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        }>>;
        artifactConfig: z.ZodOptional<z.ZodObject<{
            templateEngine: z.ZodDefault<z.ZodEnum<["handlebars", "mustache", "jinja2", "ejs"]>>;
            template: z.ZodString;
            outputFormat: z.ZodEnum<["text", "json", "yaml", "xml", "html", "markdown", "code"]>;
            variables: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
                required: z.ZodDefault<z.ZodBoolean>;
                description: z.ZodOptional<z.ZodString>;
                defaultValue: z.ZodOptional<z.ZodAny>;
            }, "strip", z.ZodTypeAny, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }>, "many">;
            validationRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
                field: z.ZodString;
                rule: z.ZodString;
                message: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                message: string;
                field: string;
                rule: string;
            }, {
                message: string;
                field: string;
                rule: string;
            }>, "many">>;
            postProcessing: z.ZodOptional<z.ZodArray<z.ZodObject<{
                type: z.ZodEnum<["format", "validate", "transform"]>;
                config: z.ZodRecord<z.ZodString, z.ZodAny>;
            }, "strip", z.ZodTypeAny, {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }, {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        }, {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        }>>;
        dependencies: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        securityRequirements: z.ZodObject<{
            minimumSecurityLevel: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
            requiredPermissions: z.ZodArray<z.ZodString, "many">;
            sensitiveData: z.ZodDefault<z.ZodBoolean>;
            auditRequired: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        }, {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        }>;
        resourceRequirements: z.ZodOptional<z.ZodObject<{
            cpu: z.ZodOptional<z.ZodNumber>;
            memory: z.ZodOptional<z.ZodNumber>;
            storage: z.ZodOptional<z.ZodNumber>;
            network: z.ZodDefault<z.ZodBoolean>;
            estimatedDuration: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        }, {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        type: CapabilityType;
        status: CapabilityStatus;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        };
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        } | undefined;
        toolConfig?: {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }, {
        type: CapabilityType;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        };
        status?: CapabilityStatus | undefined;
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        } | undefined;
        toolConfig?: {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }>, "many">;
    totalCount: z.ZodNumber;
    recommendations: z.ZodArray<z.ZodString, "many">;
    searchTime: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    capabilities: {
        type: CapabilityType;
        status: CapabilityStatus;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        };
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        } | undefined;
        toolConfig?: {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }[];
    totalCount: number;
    recommendations: string[];
    searchTime: number;
}, {
    capabilities: {
        type: CapabilityType;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        };
        status?: CapabilityStatus | undefined;
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        } | undefined;
        toolConfig?: {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }[];
    totalCount: number;
    recommendations: string[];
    searchTime: number;
}>;
export type CapabilitySearchResult = z.infer<typeof CapabilitySearchResultSchema>;
export declare const CapabilityRegistrationRequestSchema: z.ZodObject<{
    capability: z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodDate;
        updatedAt: z.ZodOptional<z.ZodDate>;
    } & {
        name: z.ZodString;
        description: z.ZodString;
        type: z.ZodNativeEnum<typeof CapabilityType>;
        status: z.ZodDefault<z.ZodNativeEnum<typeof CapabilityStatus>>;
        metadata: z.ZodObject<{
            version: z.ZodString;
            author: z.ZodOptional<z.ZodString>;
            license: z.ZodOptional<z.ZodString>;
            documentation: z.ZodOptional<z.ZodString>;
            examples: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">>;
            tags: z.ZodArray<z.ZodString, "many">;
            category: z.ZodString;
            subcategory: z.ZodOptional<z.ZodString>;
            trustScore: z.ZodDefault<z.ZodNumber>;
            usageCount: z.ZodDefault<z.ZodNumber>;
            lastUsed: z.ZodOptional<z.ZodDate>;
            performance: z.ZodOptional<z.ZodObject<{
                averageLatency: z.ZodOptional<z.ZodNumber>;
                successRate: z.ZodOptional<z.ZodNumber>;
                errorRate: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            }, {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        }, {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        }>;
        toolConfig: z.ZodOptional<z.ZodObject<{
            endpoint: z.ZodString;
            method: z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>;
            authentication: z.ZodObject<{
                type: z.ZodEnum<["none", "api_key", "oauth", "jwt", "basic"]>;
                config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            }, "strip", z.ZodTypeAny, {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            }, {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            }>;
            parameters: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
                required: z.ZodDefault<z.ZodBoolean>;
                description: z.ZodOptional<z.ZodString>;
                validation: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            }, "strip", z.ZodTypeAny, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }>, "many">;
            responseSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            timeout: z.ZodDefault<z.ZodNumber>;
            retryPolicy: z.ZodOptional<z.ZodObject<{
                maxRetries: z.ZodDefault<z.ZodNumber>;
                backoffStrategy: z.ZodDefault<z.ZodEnum<["fixed", "exponential"]>>;
            }, "strip", z.ZodTypeAny, {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            }, {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        }, {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        }>>;
        artifactConfig: z.ZodOptional<z.ZodObject<{
            templateEngine: z.ZodDefault<z.ZodEnum<["handlebars", "mustache", "jinja2", "ejs"]>>;
            template: z.ZodString;
            outputFormat: z.ZodEnum<["text", "json", "yaml", "xml", "html", "markdown", "code"]>;
            variables: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodEnum<["string", "number", "boolean", "array", "object"]>;
                required: z.ZodDefault<z.ZodBoolean>;
                description: z.ZodOptional<z.ZodString>;
                defaultValue: z.ZodOptional<z.ZodAny>;
            }, "strip", z.ZodTypeAny, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }, {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }>, "many">;
            validationRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
                field: z.ZodString;
                rule: z.ZodString;
                message: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                message: string;
                field: string;
                rule: string;
            }, {
                message: string;
                field: string;
                rule: string;
            }>, "many">>;
            postProcessing: z.ZodOptional<z.ZodArray<z.ZodObject<{
                type: z.ZodEnum<["format", "validate", "transform"]>;
                config: z.ZodRecord<z.ZodString, z.ZodAny>;
            }, "strip", z.ZodTypeAny, {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }, {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        }, {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        }>>;
        dependencies: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        securityRequirements: z.ZodObject<{
            minimumSecurityLevel: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
            requiredPermissions: z.ZodArray<z.ZodString, "many">;
            sensitiveData: z.ZodDefault<z.ZodBoolean>;
            auditRequired: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        }, {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        }>;
        resourceRequirements: z.ZodOptional<z.ZodObject<{
            cpu: z.ZodOptional<z.ZodNumber>;
            memory: z.ZodOptional<z.ZodNumber>;
            storage: z.ZodOptional<z.ZodNumber>;
            network: z.ZodDefault<z.ZodBoolean>;
            estimatedDuration: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        }, {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        type: CapabilityType;
        status: CapabilityStatus;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        };
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        } | undefined;
        toolConfig?: {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }, {
        type: CapabilityType;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        };
        status?: CapabilityStatus | undefined;
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        } | undefined;
        toolConfig?: {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    }>;
    metadata: z.ZodOptional<z.ZodObject<{
        version: z.ZodString;
        author: z.ZodOptional<z.ZodString>;
        license: z.ZodOptional<z.ZodString>;
        documentation: z.ZodOptional<z.ZodString>;
        examples: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">>;
        tags: z.ZodArray<z.ZodString, "many">;
        category: z.ZodString;
        subcategory: z.ZodOptional<z.ZodString>;
        trustScore: z.ZodDefault<z.ZodNumber>;
        usageCount: z.ZodDefault<z.ZodNumber>;
        lastUsed: z.ZodOptional<z.ZodDate>;
        performance: z.ZodOptional<z.ZodObject<{
            averageLatency: z.ZodOptional<z.ZodNumber>;
            successRate: z.ZodOptional<z.ZodNumber>;
            errorRate: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        }, {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        version: string;
        tags: string[];
        category: string;
        trustScore: number;
        usageCount: number;
        author?: string | undefined;
        license?: string | undefined;
        documentation?: string | undefined;
        examples?: Record<string, any>[] | undefined;
        subcategory?: string | undefined;
        lastUsed?: Date | undefined;
        performance?: {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        } | undefined;
    }, {
        version: string;
        tags: string[];
        category: string;
        author?: string | undefined;
        license?: string | undefined;
        documentation?: string | undefined;
        examples?: Record<string, any>[] | undefined;
        subcategory?: string | undefined;
        trustScore?: number | undefined;
        usageCount?: number | undefined;
        lastUsed?: Date | undefined;
        performance?: {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        } | undefined;
    }>>;
    securityPolicy: z.ZodOptional<z.ZodObject<{
        allowedUsers: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowedRoles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        restrictedOperations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        auditLevel: z.ZodDefault<z.ZodEnum<["none", "basic", "detailed"]>>;
    }, "strip", z.ZodTypeAny, {
        auditLevel: "basic" | "none" | "detailed";
        allowedUsers?: string[] | undefined;
        allowedRoles?: string[] | undefined;
        restrictedOperations?: string[] | undefined;
    }, {
        auditLevel?: "basic" | "none" | "detailed" | undefined;
        allowedUsers?: string[] | undefined;
        allowedRoles?: string[] | undefined;
        restrictedOperations?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    capability: {
        type: CapabilityType;
        status: CapabilityStatus;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            trustScore: number;
            usageCount: number;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            minimumSecurityLevel: "low" | "medium" | "high" | "critical";
            requiredPermissions: string[];
            sensitiveData: boolean;
            auditRequired: boolean;
        };
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            network: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        } | undefined;
        toolConfig?: {
            timeout: number;
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            retryPolicy?: {
                maxRetries: number;
                backoffStrategy: "fixed" | "exponential";
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                required: boolean;
                description?: string | undefined;
                defaultValue?: any;
            }[];
            templateEngine: "handlebars" | "mustache" | "jinja2" | "ejs";
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    };
    metadata?: {
        version: string;
        tags: string[];
        category: string;
        trustScore: number;
        usageCount: number;
        author?: string | undefined;
        license?: string | undefined;
        documentation?: string | undefined;
        examples?: Record<string, any>[] | undefined;
        subcategory?: string | undefined;
        lastUsed?: Date | undefined;
        performance?: {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        } | undefined;
    } | undefined;
    securityPolicy?: {
        auditLevel: "basic" | "none" | "detailed";
        allowedUsers?: string[] | undefined;
        allowedRoles?: string[] | undefined;
        restrictedOperations?: string[] | undefined;
    } | undefined;
}, {
    capability: {
        type: CapabilityType;
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        metadata: {
            version: string;
            tags: string[];
            category: string;
            author?: string | undefined;
            license?: string | undefined;
            documentation?: string | undefined;
            examples?: Record<string, any>[] | undefined;
            subcategory?: string | undefined;
            trustScore?: number | undefined;
            usageCount?: number | undefined;
            lastUsed?: Date | undefined;
            performance?: {
                errorRate?: number | undefined;
                averageLatency?: number | undefined;
                successRate?: number | undefined;
            } | undefined;
        };
        securityRequirements: {
            requiredPermissions: string[];
            minimumSecurityLevel?: "low" | "medium" | "high" | "critical" | undefined;
            sensitiveData?: boolean | undefined;
            auditRequired?: boolean | undefined;
        };
        status?: CapabilityStatus | undefined;
        updatedAt?: Date | undefined;
        dependencies?: string[] | undefined;
        resourceRequirements?: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
        } | undefined;
        toolConfig?: {
            parameters: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                validation?: Record<string, any> | undefined;
                description?: string | undefined;
                required?: boolean | undefined;
            }[];
            endpoint: string;
            method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            authentication: {
                type: "basic" | "none" | "api_key" | "oauth" | "jwt";
                config?: Record<string, any> | undefined;
            };
            timeout?: number | undefined;
            retryPolicy?: {
                maxRetries?: number | undefined;
                backoffStrategy?: "fixed" | "exponential" | undefined;
            } | undefined;
            responseSchema?: Record<string, any> | undefined;
        } | undefined;
        artifactConfig?: {
            variables: {
                type: "string" | "number" | "boolean" | "object" | "array";
                name: string;
                description?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: any;
            }[];
            template: string;
            outputFormat: "code" | "text" | "json" | "yaml" | "xml" | "html" | "markdown";
            validationRules?: {
                message: string;
                field: string;
                rule: string;
            }[] | undefined;
            templateEngine?: "handlebars" | "mustache" | "jinja2" | "ejs" | undefined;
            postProcessing?: {
                type: "format" | "validate" | "transform";
                config: Record<string, any>;
            }[] | undefined;
        } | undefined;
    };
    metadata?: {
        version: string;
        tags: string[];
        category: string;
        author?: string | undefined;
        license?: string | undefined;
        documentation?: string | undefined;
        examples?: Record<string, any>[] | undefined;
        subcategory?: string | undefined;
        trustScore?: number | undefined;
        usageCount?: number | undefined;
        lastUsed?: Date | undefined;
        performance?: {
            errorRate?: number | undefined;
            averageLatency?: number | undefined;
            successRate?: number | undefined;
        } | undefined;
    } | undefined;
    securityPolicy?: {
        auditLevel?: "basic" | "none" | "detailed" | undefined;
        allowedUsers?: string[] | undefined;
        allowedRoles?: string[] | undefined;
        restrictedOperations?: string[] | undefined;
    } | undefined;
}>;
export type CapabilityRegistrationRequest = z.infer<typeof CapabilityRegistrationRequestSchema>;
//# sourceMappingURL=capability.d.ts.map