import * as winston from 'winston';

// Define custom log levels with corresponding colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Add colors for custom levels
winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'cyan'
});

// Logger configuration interface
interface LoggerConfig {
  serviceName: string;
  environment: string;
  logLevel: string;
  version?: string;
}

// Create logger factory function
export const createLogger = (config: LoggerConfig) => {
  // Custom format for development
  const developmentFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf((info) => {
      const { timestamp, level, message, ...meta } = info;
      const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
      return `${timestamp} [${level}] [${config.serviceName}]: ${message}${metaString}`;
    })
  );

  // Custom format for production
  const productionFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf((info) => {
      const { timestamp, level, message, ...meta } = info;
      return JSON.stringify({
        timestamp,
        level,
        message,
        service: config.serviceName,
        environment: config.environment,
        version: config.version || '1.0.0',
        ...meta
      });
    })
  );

  // Define which transports to use based on environment
  const getTransports = (): winston.transport[] => {
    const transports: winston.transport[] = [];

    // Console transport (always present)
    transports.push(
      new winston.transports.Console({
        level: config.logLevel,
        format: config.environment === 'development' ? developmentFormat : productionFormat
      })
    );

    // File transports for production
    if (config.environment === 'production') {
      // Error log file
      transports.push(
        new winston.transports.File({
          filename: `logs/${config.serviceName}-error.log`,
          level: 'error',
          format: productionFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
      );

      // Combined log file
      transports.push(
        new winston.transports.File({
          filename: `logs/${config.serviceName}-combined.log`,
          format: productionFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 10
        })
      );
    }

    return transports;
  };

  // Create the logger instance
  const logger = winston.createLogger({
    level: config.logLevel,
    levels: logLevels,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true })
    ),
    transports: getTransports(),
    exitOnError: false
  });

  // Handle uncaught exceptions and unhandled rejections
  if (config.environment === 'production') {
    logger.exceptions.handle(
      new winston.transports.File({
        filename: `logs/${config.serviceName}-exceptions.log`,
        format: productionFormat
      })
    );

    logger.rejections.handle(
      new winston.transports.File({
        filename: `logs/${config.serviceName}-rejections.log`,
        format: productionFormat
      })
    );
  }

  return logger;
};

// Create a stream object for Morgan HTTP logger
export const createLoggerStream = (logger: winston.Logger) => ({
  write: (message: string) => {
    logger.http(message.trim());
  }
});

// Helper functions for structured logging
export const createLogContext = (
  requestId?: string,
  userId?: string,
  operation?: string
) => ({
  requestId,
  userId,
  operation,
  timestamp: new Date().toISOString()
});

export const logWithContext = (
  logger: winston.Logger,
  serviceName: string,
  level: keyof typeof logLevels,
  message: string,
  context: Record<string, any> = {}
) => {
  logger.log(level, message, {
    ...context,
    service: serviceName
  });
};

// Performance logging helper
export const logPerformance = (
  logger: winston.Logger,
  operation: string,
  startTime: number,
  context: Record<string, any> = {}
) => {
  const duration = Date.now() - startTime;
  logger.info(`Performance: ${operation}`, {
    operation,
    duration,
    ...context
  });
};

// Error logging helper with stack trace
export const logError = (
  logger: winston.Logger,
  error: Error,
  context: Record<string, any> = {}
) => {
  logger.error('Error occurred', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    ...context
  });
};

// Security event logging
export const logSecurityEvent = (
  logger: winston.Logger,
  event: string,
  details: Record<string, any> = {}
) => {
  logger.warn(`Security Event: ${event}`, {
    event,
    severity: 'security',
    ...details
  });
};

// Audit logging for important actions
export const logAudit = (
  logger: winston.Logger,
  action: string,
  userId: string,
  resource: string,
  details: Record<string, any> = {}
) => {
  logger.info(`Audit: ${action}`, {
    action,
    userId,
    resource,
    timestamp: new Date().toISOString(),
    auditType: 'action',
    ...details
  });
};

// Business metrics logging
export const logMetric = (
  logger: winston.Logger,
  metric: string,
  value: number,
  unit: string = 'count',
  tags: Record<string, string> = {}
) => {
  logger.info(`Metric: ${metric}`, {
    metric,
    value,
    unit,
    tags,
    timestamp: new Date().toISOString()
  });
};

// HTTP request logging
export const logRequest = (
  logger: winston.Logger,
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId?: string,
  requestId?: string
) => {
  logger.http(`${method} ${path} ${statusCode}`, {
    method,
    path,
    statusCode,
    duration,
    userId,
    requestId,
    timestamp: new Date().toISOString()
  });
};

// Default logger configuration
const defaultConfig: LoggerConfig = {
  serviceName: process.env.SERVICE_NAME || 'uaip-service',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  version: process.env.VERSION || '1.0.0'
};

// Export default logger instance
export const logger = createLogger(defaultConfig); 