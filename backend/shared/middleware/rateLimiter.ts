import { rateLimit } from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils/logger';

// Create rate limiter
export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: config.rateLimit.standardHeaders,
  legacyHeaders: config.rateLimit.legacyHeaders,
  
  // Custom key generator (can be enhanced for user-specific limits)
  keyGenerator: (req: Request) => {
    return req.ip || 'unknown';
  },
  
  // Custom handler for rate limit exceeded
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      url: req.url,
      method: req.method
    });
    
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later'
      },
      meta: {
        timestamp: new Date(),
        retryAfter: Math.round(config.rateLimit.windowMs / 1000)
      }
    });
  },
  
  // Skip successful requests in some cases
  skip: (req: Request) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
}); 