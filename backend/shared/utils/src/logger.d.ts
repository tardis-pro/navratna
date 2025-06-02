import winston from 'winston';
declare const logLevels: {
    error: number;
    warn: number;
    info: number;
    http: number;
    debug: number;
};
interface LoggerConfig {
    serviceName: string;
    environment: string;
    logLevel: string;
    version?: string;
}
export declare const createLogger: (config: LoggerConfig) => winston.Logger;
export declare const createLoggerStream: (logger: winston.Logger) => {
    write: (message: string) => void;
};
export declare const createLogContext: (requestId?: string, userId?: string, operation?: string) => {
    requestId: string | undefined;
    userId: string | undefined;
    operation: string | undefined;
    timestamp: string;
};
export declare const logWithContext: (logger: winston.Logger, serviceName: string, level: keyof typeof logLevels, message: string, context?: Record<string, any>) => void;
export declare const logPerformance: (logger: winston.Logger, operation: string, startTime: number, context?: Record<string, any>) => void;
export declare const logError: (logger: winston.Logger, error: Error, context?: Record<string, any>) => void;
export declare const logSecurityEvent: (logger: winston.Logger, event: string, details?: Record<string, any>) => void;
export declare const logAudit: (logger: winston.Logger, action: string, userId: string, resource: string, details?: Record<string, any>) => void;
export declare const logMetric: (logger: winston.Logger, metric: string, value: number, unit?: string, tags?: Record<string, string>) => void;
export declare const logRequest: (logger: winston.Logger, method: string, path: string, statusCode: number, duration: number, userId?: string, requestId?: string) => void;
export declare const logger: winston.Logger;
export {};
//# sourceMappingURL=logger.d.ts.map