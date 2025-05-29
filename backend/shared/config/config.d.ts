export interface DatabaseConfig {
    postgres: {
        host: string;
        port: number;
        user: string;
        password: string;
        database: string;
        ssl: boolean;
        maxConnections: number;
    };
}
export interface TimeoutConfig {
    database: number;
    api: number;
    external: number;
}
export interface LoggingConfig {
    level: string;
    enableDetailedLogging: boolean;
    serviceName: string;
    environment: string;
    version?: string;
}
export interface ExecutionConfig {
    operationTimeoutMax: number;
    stepTimeoutMax: number;
    maxConcurrentOperations: number;
    maxRetryAttempts: number;
    cleanupOrphanedOperationsInterval: number;
    checkpointInterval: number;
    resourceMonitoringInterval: number;
}
export interface Config {
    database: DatabaseConfig;
    timeouts: TimeoutConfig;
    logging: LoggingConfig;
    execution: ExecutionConfig;
    port: number;
    environment: string;
    getExecutionConfig(): ExecutionConfig;
}
export declare const config: Config;
//# sourceMappingURL=config.d.ts.map