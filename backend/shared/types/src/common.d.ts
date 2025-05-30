import { z } from 'zod';
export declare const UUIDSchema: z.ZodString;
export type UUID = z.infer<typeof UUIDSchema>;
export declare const TimestampSchema: z.ZodDate;
export type Timestamp = z.infer<typeof TimestampSchema>;
export declare enum ServiceStatus {
    HEALTHY = "healthy",
    DEGRADED = "degraded",
    UNHEALTHY = "unhealthy"
}
export declare enum LogLevel {
    ERROR = "error",
    WARN = "warn",
    INFO = "info",
    DEBUG = "debug"
}
export declare const BaseEntitySchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt?: Date | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt?: Date | undefined;
}>;
export type BaseEntity = z.infer<typeof BaseEntitySchema>;
export declare const PaginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    sortBy: z.ZodOptional<z.ZodString>;
    sortOrder: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    sortOrder: "asc" | "desc";
    sortBy?: string | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    sortBy?: string | undefined;
    sortOrder?: "asc" | "desc" | undefined;
}>;
export type Pagination = z.infer<typeof PaginationSchema>;
export declare const PaginatedResultSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodAny, "many">;
    pagination: z.ZodObject<{
        page: z.ZodNumber;
        limit: z.ZodNumber;
        total: z.ZodNumber;
        totalPages: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    }, {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    }>;
}, "strip", z.ZodTypeAny, {
    data: any[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}, {
    data: any[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}>;
export type PaginatedResult<T> = {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};
export declare const APIErrorSchema: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    timestamp: Date;
    details?: Record<string, any> | undefined;
}, {
    code: string;
    message: string;
    timestamp: Date;
    details?: Record<string, any> | undefined;
}>;
export type APIError = z.infer<typeof APIErrorSchema>;
export declare const HealthCheckSchema: z.ZodObject<{
    status: z.ZodNativeEnum<typeof ServiceStatus>;
    timestamp: z.ZodDate;
    uptime: z.ZodNumber;
    version: z.ZodString;
    dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNativeEnum<typeof ServiceStatus>>>;
}, "strip", z.ZodTypeAny, {
    status: ServiceStatus;
    timestamp: Date;
    uptime: number;
    version: string;
    dependencies?: Record<string, ServiceStatus> | undefined;
}, {
    status: ServiceStatus;
    timestamp: Date;
    uptime: number;
    version: string;
    dependencies?: Record<string, ServiceStatus> | undefined;
}>;
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
//# sourceMappingURL=common.d.ts.map