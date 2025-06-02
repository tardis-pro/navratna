import { Request, Response, NextFunction } from 'express';
import { logger } from '@uaip/utils';

export interface RequestLoggerOptions {
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  includeBody?: boolean;
  includeHeaders?: boolean;
  excludePaths?: string[];
  maxBodyLength?: number;
}

const defaultOptions: RequestLoggerOptions = {
  logLevel: 'info',
  includeBody: false,
  includeHeaders: false,
  excludePaths: ['/health', '/metrics'],
  maxBodyLength: 1000
};

export function requestLogger(options: RequestLoggerOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
  const config = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Skip logging for excluded paths
    if (config.excludePaths?.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Add request ID to request object for tracking
    (req as any).requestId = requestId;

    // Log request start
    const requestData: any = {
      requestId,
      method: req.method,
      url: req.url,
      path: req.path,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    };

    if (config.includeHeaders) {
      requestData.headers = req.headers;
    }

    if (config.includeBody && req.body) {
      const bodyStr = JSON.stringify(req.body);
      requestData.body = bodyStr.length > (config.maxBodyLength || 1000) 
        ? bodyStr.substring(0, config.maxBodyLength) + '...[truncated]'
        : bodyStr;
    }

    logger[config.logLevel || 'info']('HTTP Request', requestData);

    // Capture response
    const originalSend = res.send;
    res.send = function(body: any) {
      const duration = Date.now() - startTime;
      
      const responseData: any = {
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('Content-Length') || (body ? Buffer.byteLength(body) : 0)
      };

      // Log response
      if (res.statusCode >= 400) {
        logger.warn('HTTP Response Error', responseData);
      } else {
        logger[config.logLevel || 'info']('HTTP Response', responseData);
      }

      return originalSend.call(this, body);
    };

    next();
  };
}

// Default export for convenience
export const defaultRequestLogger = requestLogger(); 