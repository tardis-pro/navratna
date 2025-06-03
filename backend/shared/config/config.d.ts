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


declare module 'express-rate-limit' {
    export interface RateLimitRequestHandler {
        (req: Request, res: Response, next: NextFunction): void;
    }
}

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    maxRetriesPerRequest: number;
    retryDelayOnFailover: number;
    enableOfflineQueue: boolean;
}

export interface StateConfig {
    compressionEnabled: boolean;
    maxCheckpointSize: number;
    checkpointRetentionDays: number;
    cacheTimeout: number;
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

export interface RateLimitConfig {
    windowMs: number;
    max: number;
    standardHeaders: boolean;
    legacyHeaders: boolean;
}

export interface MonitoringConfig {
    metricsEnabled: boolean;
}

export interface AppConfig {
    version: string;
}

export interface ServicesConfig {
    agentIntelligence: {
        port: number;
        url: string;
    };
    orchestrationPipeline: {
        port: number;
        url: string;
    };
    capabilityRegistry: {
        port: number;
        url: string;
    };
    discussionOrchestration: {
        port: number;
        url: string;
    };
    securityGateway: {
        port: number;
        url: string;
    };
}

type Unit =
    | "Years"
    | "Year"
    | "Yrs"
    | "Yr"
    | "Y"
    | "Weeks"
    | "Week"
    | "W"
    | "Days"
    | "Day"
    | "D"
    | "Hours"
    | "Hour"
    | "Hrs"
    | "Hr"
    | "H"
    | "Minutes"
    | "Minute"
    | "Mins"
    | "Min"
    | "M"
    | "Seconds"
    | "Second"
    | "Secs"
    | "Sec"
    | "s"
    | "Milliseconds"
    | "Millisecond"
    | "Msecs"
    | "Msec"
    | "Ms";

type UnitAnyCase = Unit | Uppercase<Unit> | Lowercase<Unit>;

type StringValue =
    | `${number}`
    | `${number}${UnitAnyCase}`
    | `${number} ${UnitAnyCase}`;

export interface CorsConfig {
    allowedOrigins: string[];
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
}

export interface JwtConfig {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: StringValue;
    issuer: string;
    audience: string;
    accessTokenExpiry: StringValue;
    refreshSecret: string;
    refreshTokenExpiry: StringValue;
}

export interface EmailConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
    smtp?: {
        host: string;
        port: number;
        secure: boolean;
        user: string;
        password: string;
    };
}

export interface FrontendConfig {
    url: string;
    resetPasswordPath: string;
    verifyEmailPath: string;
    baseUrl: string;
}

export interface NotificationsConfig {
    enabled: boolean;
    channels: {
        email: boolean;
        push: boolean;
        sms: boolean;
    };
    retryAttempts: number;
    retryDelay: number;
    webhook?: {
        url: string;
        secret: string;
    };
    sms?: {
        provider: string;
    };
}

export interface Config {
    database: DatabaseConfig;
    redis: RedisConfig;
    state: StateConfig;
    timeouts: TimeoutConfig;
    logging: LoggingConfig;
    execution: ExecutionConfig;
    rateLimit: RateLimitConfig;
    monitoring: MonitoringConfig;
    app: AppConfig;
    services: ServicesConfig;
    cors: CorsConfig;
    jwt: JwtConfig;
    email: EmailConfig;
    frontend: FrontendConfig;
    notifications: NotificationsConfig;
    port: number;
    environment: string;
    
    getExecutionConfig(): ExecutionConfig;
    getRedisConfig(): RedisConfig;
    getStateConfig(): StateConfig;
}

export declare const config: Config;
//# sourceMappingURL=config.d.ts.map