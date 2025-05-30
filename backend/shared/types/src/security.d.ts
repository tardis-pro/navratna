import { z } from 'zod';
export declare enum SecurityLevel {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum PermissionType {
    READ = "read",
    WRITE = "write",
    EXECUTE = "execute",
    ADMIN = "admin"
}
export declare enum ApprovalStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected",
    EXPIRED = "expired"
}
export declare enum RiskLevel {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare const RiskFactorSchema: z.ZodObject<{
    type: z.ZodString;
    level: z.ZodNativeEnum<typeof RiskLevel>;
    description: z.ZodString;
    score: z.ZodNumber;
    mitigations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: string;
    description: string;
    level: RiskLevel;
    score: number;
    mitigations?: string[] | undefined;
}, {
    type: string;
    description: string;
    level: RiskLevel;
    score: number;
    mitigations?: string[] | undefined;
}>;
export type RiskFactor = z.infer<typeof RiskFactorSchema>;
export declare const RiskAssessmentSchema: z.ZodObject<{
    overallRisk: z.ZodNativeEnum<typeof RiskLevel>;
    score: z.ZodNumber;
    factors: z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        level: z.ZodNativeEnum<typeof RiskLevel>;
        description: z.ZodString;
        score: z.ZodNumber;
        mitigations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        description: string;
        level: RiskLevel;
        score: number;
        mitigations?: string[] | undefined;
    }, {
        type: string;
        description: string;
        level: RiskLevel;
        score: number;
        mitigations?: string[] | undefined;
    }>, "many">;
    mitigations: z.ZodArray<z.ZodString, "many">;
    assessedAt: z.ZodDate;
    assessedBy: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    factors: {
        type: string;
        description: string;
        level: RiskLevel;
        score: number;
        mitigations?: string[] | undefined;
    }[];
    mitigations: string[];
    score: number;
    overallRisk: RiskLevel;
    assessedAt: Date;
    assessedBy?: string | undefined;
}, {
    factors: {
        type: string;
        description: string;
        level: RiskLevel;
        score: number;
        mitigations?: string[] | undefined;
    }[];
    mitigations: string[];
    score: number;
    overallRisk: RiskLevel;
    assessedAt: Date;
    assessedBy?: string | undefined;
}>;
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    email: z.ZodString;
    name: z.ZodString;
    role: z.ZodString;
    securityClearance: z.ZodDefault<z.ZodNativeEnum<typeof SecurityLevel>>;
    isActive: z.ZodDefault<z.ZodBoolean>;
    lastLoginAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    name: string;
    role: string;
    isActive: boolean;
    email: string;
    securityClearance: SecurityLevel;
    updatedAt?: Date | undefined;
    lastLoginAt?: Date | undefined;
}, {
    id: string;
    createdAt: Date;
    name: string;
    role: string;
    email: string;
    updatedAt?: Date | undefined;
    isActive?: boolean | undefined;
    securityClearance?: SecurityLevel | undefined;
    lastLoginAt?: Date | undefined;
}>;
export type User = z.infer<typeof UserSchema>;
export declare const PermissionSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    type: z.ZodNativeEnum<typeof PermissionType>;
    resource: z.ZodString;
    operations: z.ZodArray<z.ZodString, "many">;
    conditions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    type: PermissionType;
    id: string;
    createdAt: Date;
    resource: string;
    operations: string[];
    updatedAt?: Date | undefined;
    conditions?: Record<string, any> | undefined;
    expiresAt?: Date | undefined;
}, {
    type: PermissionType;
    id: string;
    createdAt: Date;
    resource: string;
    operations: string[];
    updatedAt?: Date | undefined;
    conditions?: Record<string, any> | undefined;
    expiresAt?: Date | undefined;
}>;
export type Permission = z.infer<typeof PermissionSchema>;
export declare const RoleSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    permissions: z.ZodArray<z.ZodString, "many">;
    isSystemRole: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    name: string;
    permissions: string[];
    isSystemRole: boolean;
    updatedAt?: Date | undefined;
    description?: string | undefined;
}, {
    id: string;
    createdAt: Date;
    name: string;
    permissions: string[];
    updatedAt?: Date | undefined;
    description?: string | undefined;
    isSystemRole?: boolean | undefined;
}>;
export type Role = z.infer<typeof RoleSchema>;
export declare const SecurityContextSchema: z.ZodObject<{
    userId: z.ZodString;
    agentId: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodString;
    permissions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodDate;
        updatedAt: z.ZodOptional<z.ZodDate>;
    } & {
        type: z.ZodNativeEnum<typeof PermissionType>;
        resource: z.ZodString;
        operations: z.ZodArray<z.ZodString, "many">;
        conditions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        expiresAt: z.ZodOptional<z.ZodDate>;
    }, "strip", z.ZodTypeAny, {
        type: PermissionType;
        id: string;
        createdAt: Date;
        resource: string;
        operations: string[];
        updatedAt?: Date | undefined;
        conditions?: Record<string, any> | undefined;
        expiresAt?: Date | undefined;
    }, {
        type: PermissionType;
        id: string;
        createdAt: Date;
        resource: string;
        operations: string[];
        updatedAt?: Date | undefined;
        conditions?: Record<string, any> | undefined;
        expiresAt?: Date | undefined;
    }>, "many">;
    securityLevel: z.ZodNativeEnum<typeof SecurityLevel>;
    ipAddress: z.ZodOptional<z.ZodString>;
    userAgent: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    timestamp: Date;
    securityLevel: SecurityLevel;
    userId: string;
    sessionId: string;
    permissions: {
        type: PermissionType;
        id: string;
        createdAt: Date;
        resource: string;
        operations: string[];
        updatedAt?: Date | undefined;
        conditions?: Record<string, any> | undefined;
        expiresAt?: Date | undefined;
    }[];
    agentId?: string | undefined;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
}, {
    timestamp: Date;
    securityLevel: SecurityLevel;
    userId: string;
    sessionId: string;
    permissions: {
        type: PermissionType;
        id: string;
        createdAt: Date;
        resource: string;
        operations: string[];
        updatedAt?: Date | undefined;
        conditions?: Record<string, any> | undefined;
        expiresAt?: Date | undefined;
    }[];
    agentId?: string | undefined;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
}>;
export type SecurityContext = z.infer<typeof SecurityContextSchema>;
export declare const SecurityValidationRequestSchema: z.ZodObject<{
    operation: z.ZodObject<{
        type: z.ZodString;
        resource: z.ZodString;
        action: z.ZodString;
        context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        action: string;
        resource: string;
        context?: Record<string, any> | undefined;
    }, {
        type: string;
        action: string;
        resource: string;
        context?: Record<string, any> | undefined;
    }>;
    securityContext: z.ZodObject<{
        userId: z.ZodString;
        agentId: z.ZodOptional<z.ZodString>;
        sessionId: z.ZodString;
        permissions: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            createdAt: z.ZodDate;
            updatedAt: z.ZodOptional<z.ZodDate>;
        } & {
            type: z.ZodNativeEnum<typeof PermissionType>;
            resource: z.ZodString;
            operations: z.ZodArray<z.ZodString, "many">;
            conditions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            expiresAt: z.ZodOptional<z.ZodDate>;
        }, "strip", z.ZodTypeAny, {
            type: PermissionType;
            id: string;
            createdAt: Date;
            resource: string;
            operations: string[];
            updatedAt?: Date | undefined;
            conditions?: Record<string, any> | undefined;
            expiresAt?: Date | undefined;
        }, {
            type: PermissionType;
            id: string;
            createdAt: Date;
            resource: string;
            operations: string[];
            updatedAt?: Date | undefined;
            conditions?: Record<string, any> | undefined;
            expiresAt?: Date | undefined;
        }>, "many">;
        securityLevel: z.ZodNativeEnum<typeof SecurityLevel>;
        ipAddress: z.ZodOptional<z.ZodString>;
        userAgent: z.ZodOptional<z.ZodString>;
        timestamp: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        timestamp: Date;
        securityLevel: SecurityLevel;
        userId: string;
        sessionId: string;
        permissions: {
            type: PermissionType;
            id: string;
            createdAt: Date;
            resource: string;
            operations: string[];
            updatedAt?: Date | undefined;
            conditions?: Record<string, any> | undefined;
            expiresAt?: Date | undefined;
        }[];
        agentId?: string | undefined;
        ipAddress?: string | undefined;
        userAgent?: string | undefined;
    }, {
        timestamp: Date;
        securityLevel: SecurityLevel;
        userId: string;
        sessionId: string;
        permissions: {
            type: PermissionType;
            id: string;
            createdAt: Date;
            resource: string;
            operations: string[];
            updatedAt?: Date | undefined;
            conditions?: Record<string, any> | undefined;
            expiresAt?: Date | undefined;
        }[];
        agentId?: string | undefined;
        ipAddress?: string | undefined;
        userAgent?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    securityContext: {
        timestamp: Date;
        securityLevel: SecurityLevel;
        userId: string;
        sessionId: string;
        permissions: {
            type: PermissionType;
            id: string;
            createdAt: Date;
            resource: string;
            operations: string[];
            updatedAt?: Date | undefined;
            conditions?: Record<string, any> | undefined;
            expiresAt?: Date | undefined;
        }[];
        agentId?: string | undefined;
        ipAddress?: string | undefined;
        userAgent?: string | undefined;
    };
    operation: {
        type: string;
        action: string;
        resource: string;
        context?: Record<string, any> | undefined;
    };
}, {
    securityContext: {
        timestamp: Date;
        securityLevel: SecurityLevel;
        userId: string;
        sessionId: string;
        permissions: {
            type: PermissionType;
            id: string;
            createdAt: Date;
            resource: string;
            operations: string[];
            updatedAt?: Date | undefined;
            conditions?: Record<string, any> | undefined;
            expiresAt?: Date | undefined;
        }[];
        agentId?: string | undefined;
        ipAddress?: string | undefined;
        userAgent?: string | undefined;
    };
    operation: {
        type: string;
        action: string;
        resource: string;
        context?: Record<string, any> | undefined;
    };
}>;
export type SecurityValidationRequest = z.infer<typeof SecurityValidationRequestSchema>;
export declare const SecurityValidationResultSchema: z.ZodObject<{
    allowed: z.ZodBoolean;
    approvalRequired: z.ZodBoolean;
    riskLevel: z.ZodNativeEnum<typeof SecurityLevel>;
    conditions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    reasoning: z.ZodOptional<z.ZodString>;
    requiredApprovers: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    validUntil: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    approvalRequired: boolean;
    riskLevel: SecurityLevel;
    allowed: boolean;
    reasoning?: string | undefined;
    conditions?: string[] | undefined;
    requiredApprovers?: string[] | undefined;
    validUntil?: Date | undefined;
}, {
    approvalRequired: boolean;
    riskLevel: SecurityLevel;
    allowed: boolean;
    reasoning?: string | undefined;
    conditions?: string[] | undefined;
    requiredApprovers?: string[] | undefined;
    validUntil?: Date | undefined;
}>;
export type SecurityValidationResult = z.infer<typeof SecurityValidationResultSchema>;
export declare const ApprovalWorkflowSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    operationId: z.ZodString;
    requiredApprovers: z.ZodArray<z.ZodString, "many">;
    currentApprovers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    status: z.ZodDefault<z.ZodNativeEnum<typeof ApprovalStatus>>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    status: ApprovalStatus;
    id: string;
    createdAt: Date;
    operationId: string;
    requiredApprovers: string[];
    currentApprovers: string[];
    updatedAt?: Date | undefined;
    metadata?: Record<string, any> | undefined;
    expiresAt?: Date | undefined;
}, {
    id: string;
    createdAt: Date;
    operationId: string;
    requiredApprovers: string[];
    status?: ApprovalStatus | undefined;
    updatedAt?: Date | undefined;
    metadata?: Record<string, any> | undefined;
    expiresAt?: Date | undefined;
    currentApprovers?: string[] | undefined;
}>;
export type ApprovalWorkflow = z.infer<typeof ApprovalWorkflowSchema>;
export declare const ApprovalDecisionSchema: z.ZodObject<{
    workflowId: z.ZodString;
    approverId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    conditions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    feedback: z.ZodOptional<z.ZodString>;
    decidedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    decision: "approve" | "reject";
    approverId: string;
    workflowId: string;
    decidedAt: Date;
    conditions?: string[] | undefined;
    feedback?: string | undefined;
}, {
    decision: "approve" | "reject";
    approverId: string;
    workflowId: string;
    decidedAt: Date;
    conditions?: string[] | undefined;
    feedback?: string | undefined;
}>;
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export declare enum AuditEventType {
    USER_LOGIN = "user_login",
    USER_LOGOUT = "user_logout",
    OPERATION_START = "operation_start",
    OPERATION_COMPLETE = "operation_complete",
    PERMISSION_GRANTED = "permission_granted",
    PERMISSION_DENIED = "permission_denied",
    APPROVAL_REQUESTED = "approval_requested",
    APPROVAL_GRANTED = "approval_granted",
    APPROVAL_DENIED = "approval_denied",
    SECURITY_VIOLATION = "security_violation",
    DATA_ACCESS = "data_access",
    CONFIGURATION_CHANGE = "configuration_change"
}
export declare const AuditEventSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    eventType: z.ZodNativeEnum<typeof AuditEventType>;
    userId: z.ZodOptional<z.ZodString>;
    agentId: z.ZodOptional<z.ZodString>;
    resourceType: z.ZodOptional<z.ZodString>;
    resourceId: z.ZodOptional<z.ZodString>;
    details: z.ZodRecord<z.ZodString, z.ZodAny>;
    ipAddress: z.ZodOptional<z.ZodString>;
    userAgent: z.ZodOptional<z.ZodString>;
    riskLevel: z.ZodOptional<z.ZodNativeEnum<typeof SecurityLevel>>;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    details: Record<string, any>;
    timestamp: Date;
    eventType: AuditEventType;
    updatedAt?: Date | undefined;
    agentId?: string | undefined;
    userId?: string | undefined;
    riskLevel?: SecurityLevel | undefined;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
    resourceType?: string | undefined;
    resourceId?: string | undefined;
}, {
    id: string;
    createdAt: Date;
    details: Record<string, any>;
    timestamp: Date;
    eventType: AuditEventType;
    updatedAt?: Date | undefined;
    agentId?: string | undefined;
    userId?: string | undefined;
    riskLevel?: SecurityLevel | undefined;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
    resourceType?: string | undefined;
    resourceId?: string | undefined;
}>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export declare const JWTPayloadSchema: z.ZodObject<{
    userId: z.ZodString;
    sessionId: z.ZodString;
    permissions: z.ZodArray<z.ZodString, "many">;
    securityLevel: z.ZodNativeEnum<typeof SecurityLevel>;
    iat: z.ZodNumber;
    exp: z.ZodNumber;
    iss: z.ZodOptional<z.ZodString>;
    aud: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    securityLevel: SecurityLevel;
    userId: string;
    sessionId: string;
    permissions: string[];
    iat: number;
    exp: number;
    iss?: string | undefined;
    aud?: string | undefined;
}, {
    securityLevel: SecurityLevel;
    userId: string;
    sessionId: string;
    permissions: string[];
    iat: number;
    exp: number;
    iss?: string | undefined;
    aud?: string | undefined;
}>;
export type JWTPayload = z.infer<typeof JWTPayloadSchema>;
export declare const RateLimitSchema: z.ZodObject<{
    identifier: z.ZodString;
    limit: z.ZodNumber;
    window: z.ZodNumber;
    current: z.ZodNumber;
    resetTime: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    limit: number;
    identifier: string;
    window: number;
    current: number;
    resetTime: Date;
}, {
    limit: number;
    identifier: string;
    window: number;
    current: number;
    resetTime: Date;
}>;
export type RateLimit = z.infer<typeof RateLimitSchema>;
//# sourceMappingURL=security.d.ts.map