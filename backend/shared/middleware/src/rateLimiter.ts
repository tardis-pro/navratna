// import { rateLimit } from 'express-rate-limit';
import { NextFunction, Request, Response } from 'express';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';

// Create rate limiter

//mock ratelimit funciton
const rateLimit = (options: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    next();
  };
};

// Rate limiter configuration interface
interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  message?: any;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  keyGenerator?: (req: Request) => string;
  handler?: (req: Request, res: Response) => void;
  skip?: (req: Request) => boolean;
}

// Function to create rate limiter middleware with custom options
export const createRateLimiter = (options: RateLimiterOptions = {}) => {
  return rateLimit({
    windowMs: options.windowMs || config.rateLimit.windowMs,
    max: options.max || config.rateLimit.max,
    standardHeaders: options.standardHeaders ?? config.rateLimit.standardHeaders,
    legacyHeaders: options.legacyHeaders ?? config.rateLimit.legacyHeaders,
    
    // Custom key generator (can be enhanced for user-specific limits)
    keyGenerator: options.keyGenerator || ((req: Request) => {
      return req.ip || 'unknown';
    }),
    
    // Custom handler for rate limit exceeded
    handler: options.handler || ((req: Request, res: Response) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.headers?.['user-agent'] || 'unknown',
        url: req.url,
        method: req.method
      });
      
      const message = options.message || {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        },
        meta: {
          timestamp: new Date(),
          retryAfter: Math.round((options.windowMs || config.rateLimit.windowMs) / 1000)
        }
      };
      
      res.status(429).json(message);
    }),
    
    // Skip successful requests in some cases
    skip: options.skip || ((req: Request) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    })
  });
};

// Default rate limiter middleware
export const rateLimiter = createRateLimiter(); 