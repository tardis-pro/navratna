import * as winston from 'winston';
export declare class ApiError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: any;
    readonly isOperational: boolean;
    constructor(statusCode: number, message: string, code?: string, details?: any, stack?: string);
    toJSON(): {
        name: string;
        message: string;
        statusCode: number;
        code: string;
        details: any;
        stack: string | undefined;
    };
}
export declare class ValidationError extends ApiError {
    constructor(message: string, details?: any);
}
export declare class AuthenticationError extends ApiError {
    constructor(message?: string, details?: any);
}
export declare class AuthorizationError extends ApiError {
    constructor(message?: string, details?: any);
}
export declare class NotFoundError extends ApiError {
    constructor(message?: string, details?: any);
}
export declare class ConflictError extends ApiError {
    constructor(message?: string, details?: any);
}
export declare class RateLimitError extends ApiError {
    constructor(message?: string, details?: any);
}
export declare class InternalServerError extends ApiError {
    constructor(message?: string, details?: any);
}
export declare class DatabaseError extends ApiError {
    constructor(message?: string, details?: any);
}
export declare class ExternalServiceError extends ApiError {
    constructor(message?: string, details?: any);
}
export declare class SecurityError extends ApiError {
    constructor(message?: string, details?: any);
}
export declare const createValidationError: (field: string, value: any, constraint: string) => ValidationError;
export declare const createNotFoundError: (resource: string, identifier: string) => NotFoundError;
export declare const createConflictError: (resource: string, field: string, value: any) => ConflictError;
export declare const ErrorCodes: {
    readonly INVALID_TOKEN: "INVALID_TOKEN";
    readonly TOKEN_EXPIRED: "TOKEN_EXPIRED";
    readonly MISSING_TOKEN: "MISSING_TOKEN";
    readonly INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly INVALID_INPUT: "INVALID_INPUT";
    readonly MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD";
    readonly RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND";
    readonly RESOURCE_ALREADY_EXISTS: "RESOURCE_ALREADY_EXISTS";
    readonly RESOURCE_LOCKED: "RESOURCE_LOCKED";
    readonly OPERATION_FAILED: "OPERATION_FAILED";
    readonly OPERATION_NOT_ALLOWED: "OPERATION_NOT_ALLOWED";
    readonly OPERATION_TIMEOUT: "OPERATION_TIMEOUT";
    readonly AGENT_NOT_FOUND: "AGENT_NOT_FOUND";
    readonly AGENT_DISABLED: "AGENT_DISABLED";
    readonly ANALYSIS_FAILED: "ANALYSIS_FAILED";
    readonly PLAN_GENERATION_FAILED: "PLAN_GENERATION_FAILED";
    readonly SECURITY_VIOLATION: "SECURITY_VIOLATION";
    readonly APPROVAL_REQUIRED: "APPROVAL_REQUIRED";
    readonly RISK_TOO_HIGH: "RISK_TOO_HIGH";
    readonly DATABASE_ERROR: "DATABASE_ERROR";
    readonly EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
    readonly SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE";
};
export declare const isOperationalError: (error: Error) => boolean;
export declare const getStatusCodeFromError: (error: Error) => number;
export declare const sanitizeErrorDetails: (error: ApiError) => any;
export declare const createErrorResponse: (error: Error, requestId?: string) => {
    statusCode: number;
    response: any;
};
export declare const asyncHandler: (fn: Function) => (req: any, res: any, next: any) => void;
export declare const logAndCreateError: (logger: winston.Logger, statusCode: number, message: string, code: string, context?: Record<string, any>, details?: any) => ApiError;
export declare const createAndLogValidationError: (logger: winston.Logger, message: string, context?: Record<string, any>) => ApiError;
export declare const createAndLogNotFoundError: (logger: winston.Logger, resource: string, identifier: string) => ApiError;
export declare const createAndLogAuthError: (logger: winston.Logger, message: string, context?: Record<string, any>) => ApiError;
export declare const createAndLogAuthzError: (logger: winston.Logger, message: string, context?: Record<string, any>) => ApiError;
export declare const createAndLogDatabaseError: (logger: winston.Logger, message: string, context?: Record<string, any>) => ApiError;
export declare const transformDatabaseError: (error: any) => ApiError;
export declare const errorHandler: (error: Error, req: any, res: any, next: any) => void;
export declare const isApiError: (error: any) => error is ApiError;
export declare const isValidationError: (error: any) => error is ValidationError;
export declare const isAuthenticationError: (error: any) => error is AuthenticationError;
export declare const isAuthorizationError: (error: any) => error is AuthorizationError;
export declare const isNotFoundError: (error: any) => error is NotFoundError;
//# sourceMappingURL=errors.d.ts.map