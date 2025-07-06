import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { AgentRole, SecurityLevel, AgentStatus } from '@uaip/types';

// Agent context interface - simplified for middleware use
export interface AgentContext {
  agentId: string;
  userId: string;
  permissions: string[];
  securityLevel: SecurityLevel;
  role: AgentRole;
  status: AgentStatus;
  metadata?: Record<string, unknown>;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      agentContext?: AgentContext;
      agentExecution?: {
        startTime: number;
        operations: string[];
        results: Array<{
          operation: string;
          duration: number;
          status: number;
        }>;
      };
    }
  }
}

// Agent validation schemas
const agentIdSchema = z.string().uuid();

// Simple agent context loader - expects context to be set by calling service
export const loadAgentContext = (req: Request, res: Response, next: NextFunction) => {
  const { agentId } = req.params;

  if (!agentId) {
    res.status(400).json({ error: 'Agent ID required' });
    return;
  }

  // Validate agent ID format
  const validation = agentIdSchema.safeParse(agentId);
  if (!validation.success) {
    res.status(400).json({
      error: 'Invalid agent ID format',
      details: validation.error.errors
    });
    return;
  }

  // Set basic context - calling service should populate this with actual agent data
  if (!req.agentContext) {
    req.agentContext = {
      agentId,
      userId: req.user?.id || 'system',
      permissions: [],
      securityLevel: SecurityLevel.LOW,
      role: AgentRole.ASSISTANT,
      status: AgentStatus.ACTIVE,
      metadata: {}
    };
  }

  logger.debug('Agent context initialized', {
    agentId,
    userId: req.user?.id
  });

  next();
};

// Validate agent permissions middleware
export const requireAgentPermission = (requiredPermission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.agentContext) {
      res.status(401).json({ error: 'Agent context required' });
      return;
    }

    const hasPermission = req.agentContext.permissions.includes(requiredPermission);

    if (!hasPermission) {
      logger.warn(`Agent ${req.agentContext.agentId} lacks permission: ${requiredPermission}`);
      res.status(403).json({
        error: 'Insufficient permissions',
        required: requiredPermission,
        available: req.agentContext.permissions
      });
      return;
    }

    next();
  };
};

// Validate security level middleware
export const requireSecurityLevel = (minLevel: SecurityLevel) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.agentContext) {
      res.status(401).json({ error: 'Agent context required' });
      return;
    }

    const currentLevel = req.agentContext.securityLevel;
    const hasAccess = currentLevel >= minLevel;

    if (!hasAccess) {
      logger.warn(`Agent ${req.agentContext.agentId} security level ${currentLevel} insufficient for required ${minLevel}`);
      res.status(403).json({
        error: 'Insufficient security level',
        required: minLevel,
        current: currentLevel
      });
      return;
    }

    next();
  };
};

// Track agent operations middleware
export const trackAgentOperation = (operationName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.agentExecution) {
      req.agentExecution = {
        startTime: Date.now(),
        operations: [],
        results: []
      };
    }

    req.agentExecution.operations.push(operationName);

    logger.debug('Agent operation started', {
      agentId: req.agentContext?.agentId,
      operation: operationName,
      userId: req.user?.id,
      timestamp: new Date()
    });

    // Track response
    const originalSend = res.send;
    res.send = function (data: unknown) {
      if (req.agentExecution) {
        req.agentExecution.results.push({
          operation: operationName,
          duration: Date.now() - req.agentExecution.startTime,
          status: res.statusCode
        });

        logger.debug('Agent operation completed', {
          agentId: req.agentContext?.agentId,
          operation: operationName,
          duration: Date.now() - req.agentExecution.startTime,
          status: res.statusCode
        });
      }

      return originalSend.call(this, data);
    };

    next();
  };
};

// Simple rate limiting for agent operations
export const agentRateLimit = (maxRequests = 100, windowMs = 60000) => {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.agentContext) {
      res.status(401).json({ error: 'Agent context required' });
      return;
    }

    const key = `${req.agentContext.agentId}:${req.user?.id || 'anonymous'}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    let requestData = requestCounts.get(key);

    if (!requestData || requestData.resetTime < windowStart) {
      requestData = { count: 0, resetTime: now + windowMs };
      requestCounts.set(key, requestData);
    }

    requestData.count++;

    if (requestData.count > maxRequests) {
      logger.warn(`Rate limit exceeded for agent ${req.agentContext.agentId}`);
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((requestData.resetTime - now) / 1000)
      });
      return;
    }

    next();
  };
};

// Agent status validation middleware
export const requireAgentStatus = (...allowedStatuses: AgentStatus[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.agentContext) {
      res.status(401).json({ error: 'Agent context required' });
      return;
    }

    if (!allowedStatuses.includes(req.agentContext.status)) {
      logger.warn(`Agent ${req.agentContext.agentId} has invalid status: ${req.agentContext.status}`);
      res.status(403).json({
        error: 'Agent status not allowed',
        required: allowedStatuses,
        current: req.agentContext.status
      });
      return;
    }

    next();
  };
};

// Agent capability validation middleware
export const requireAgentCapability = (requiredCapability: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.agentContext) {
      res.status(401).json({ error: 'Agent context required' });
      return;
    }

    const hasCapability = req.agentContext.permissions.includes(`capability:${requiredCapability}`);

    if (!hasCapability) {
      logger.warn(`Agent ${req.agentContext.agentId} lacks capability: ${requiredCapability}`);
      res.status(403).json({
        error: 'Required capability not available',
        required: requiredCapability
      });
      return;
    }

    next();
  };
};

// Generic agent operation executor
export const executeAgentOperation = (
  operationHandler: (context: AgentContext, params: Record<string, unknown>) => Promise<unknown>
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.agentContext) {
        res.status(401).json({ error: 'Agent context required' });
      return;
      }

      const result = await operationHandler(req.agentContext, {
        ...req.body,
        ...req.query,
        ...req.params
      });

      res.json({
        success: true,
        data: result,
        metadata: {
          agentId: req.agentContext.agentId,
          operation: req.route?.path,
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Agent operation failed:', error);
      next(error);
    }
  };
};

// Tool execution setup middleware
export const executeAgentTool = (toolName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.agentContext) {
      res.status(401).json({ error: 'Agent context required' });
      return;
    }

    logger.debug('Agent tool execution started', {
      agentId: req.agentContext.agentId,
      toolName,
      parameters: req.body
    });

    next();
  };
};

// Composite middleware chain builder
export const agentOperationChain = (config: {
  requiredPermission?: string;
  requiredCapability?: string;
  minSecurityLevel?: SecurityLevel;
  allowedStatuses?: AgentStatus[];
  trackOperation?: string;
  rateLimit?: boolean;
}) => {
  const middlewares: Array<(req: Request, res: Response, next: NextFunction) => void> = [];

  // Always load agent context first
  middlewares.push(loadAgentContext);

  // Add permission check
  if (config.requiredPermission) {
    middlewares.push(requireAgentPermission(config.requiredPermission));
  }

  // Add capability check
  if (config.requiredCapability) {
    middlewares.push(requireAgentCapability(config.requiredCapability));
  }

  // Add security level check
  if (config.minSecurityLevel) {
    middlewares.push(requireSecurityLevel(config.minSecurityLevel));
  }

  // Add status check
  if (config.allowedStatuses) {
    middlewares.push(requireAgentStatus(...config.allowedStatuses));
  }

  // Add operation tracking
  if (config.trackOperation) {
    middlewares.push(trackAgentOperation(config.trackOperation));
  }

  // Add rate limiting
  if (config.rateLimit) {
    middlewares.push(agentRateLimit());
  }

  return middlewares;
};