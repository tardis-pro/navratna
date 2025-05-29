import { z } from 'zod';
export declare const DatabaseConfigSchema: z.ZodObject<{
    host: z.ZodString;
    port: z.ZodNumber;
    database: z.ZodString;
    username: z.ZodString;
    password: z.ZodString;
    ssl: z.ZodDefault<z.ZodBoolean>;
    pool: z.ZodOptional<z.ZodObject<{
        min: z.ZodDefault<z.ZodNumber>;
        max: z.ZodDefault<z.ZodNumber>;
        idleTimeoutMillis: z.ZodDefault<z.ZodNumber>;
        connectionTimeoutMillis: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        min: number;
        max: number;
        idleTimeoutMillis: number;
        connectionTimeoutMillis: number;
    }, {
        min?: number | undefined;
        max?: number | undefined;
        idleTimeoutMillis?: number | undefined;
        connectionTimeoutMillis?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
    pool?: {
        min: number;
        max: number;
        idleTimeoutMillis: number;
        connectionTimeoutMillis: number;
    } | undefined;
}, {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean | undefined;
    pool?: {
        min?: number | undefined;
        max?: number | undefined;
        idleTimeoutMillis?: number | undefined;
        connectionTimeoutMillis?: number | undefined;
    } | undefined;
}>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export declare const Neo4jConfigSchema: z.ZodObject<{
    uri: z.ZodString;
    username: z.ZodString;
    password: z.ZodString;
    database: z.ZodDefault<z.ZodString>;
    maxConnectionPoolSize: z.ZodDefault<z.ZodNumber>;
    connectionAcquisitionTimeout: z.ZodDefault<z.ZodNumber>;
    connectionTimeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    database: string;
    username: string;
    password: string;
    uri: string;
    maxConnectionPoolSize: number;
    connectionAcquisitionTimeout: number;
    connectionTimeout: number;
}, {
    username: string;
    password: string;
    uri: string;
    database?: string | undefined;
    maxConnectionPoolSize?: number | undefined;
    connectionAcquisitionTimeout?: number | undefined;
    connectionTimeout?: number | undefined;
}>;
export type Neo4jConfig = z.infer<typeof Neo4jConfigSchema>;
export interface DatabaseQuery {
    text: string;
    values?: any[];
}
export interface Neo4jQuery {
    cypher: string;
    parameters?: Record<string, any>;
}
export declare enum TransactionIsolation {
    READ_UNCOMMITTED = "READ UNCOMMITTED",
    READ_COMMITTED = "READ COMMITTED",
    REPEATABLE_READ = "REPEATABLE READ",
    SERIALIZABLE = "SERIALIZABLE"
}
export interface TransactionOptions {
    isolation?: TransactionIsolation;
    timeout?: number;
    readOnly?: boolean;
}
//# sourceMappingURL=database.d.ts.map