import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '@uaip/utils/logger';
import { AgentRole, SecurityLevel, AgentStatus } from '@uaip/types';
import { DatabaseService } from '@uaip/shared-services/databaseService';
import { EventBusService } from '@uaip/shared-services/eventBusService';
import { validateRequest } from './validation';

// Agent context interface
export interface AgentContext {
  agentId: string;
  agent: any;
  userId: string;
  permissions: string[];
  securityLevel: SecurityLevel;
  metadata?: Record<string, any>;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      agentContext?: AgentContext;
      agentExecution?: {
        startTime: number;
        operations: string[];
        results: any[];
      };
    }
  }
}

// Agent validation schemas
const agentIdSchema = z.object({
  agentId: z.string().uuid()
});

const agentOperationSchema = z.object({
  operation: z.string(),
  parameters: z.record(z.any()).optional(),
  context: z.record(z.any()).optional()
});

// Load agent context middleware
export const loadAgentContext = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.params;
    
    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID required' });
    }

    const db = DatabaseService.getInstance();
    const agent = await db.getAgentRepository().findOne({
      where: { id: agentId },
      relations: ['capabilities', 'toolAssignments', 'toolAssignments.tool']
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Build agent context
    req.agentContext = {
      agentId: agent.id,
      agent,
      userId: req.user?.id || 'system',
      permissions: agent.capabilities?.map(cap => cap.name) || [],
      securityLevel: agent.securityLevel as SecurityLevel,
      metadata: {
        role: agent.role,
        status: agent.status,
        modelProvider: agent.modelProvider,
        temperature: agent.temperature
      }
    };

    next();
  } catch (error) {
    logger.error('Failed to load agent context:', error);
    res.status(500).json({ error: 'Failed to load agent context' });
  }
};

// Validate agent permissions middleware
export const requireAgentPermission = (requiredPermission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.agentContext) {
      return res.status(401).json({ error: 'Agent context required' });
    }

    const hasPermission = req.agentContext.permissions.includes(requiredPermission);
    
    if (!hasPermission) {
      logger.warn(`Agent ${req.agentContext.agentId} lacks permission: ${requiredPermission}`);
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: requiredPermission,
        available: req.agentContext.permissions
      });
    }

    next();
  };
};

// Validate agent security level middleware
export const requireSecurityLevel = (minLevel: SecurityLevel) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.agentContext) {
      return res.status(401).json({ error: 'Agent context required' });
    }

    const levelOrder = {
      [SecurityLevel.LOW]: 1,
      [SecurityLevel.MEDIUM]: 2,
      [SecurityLevel.HIGH]: 3,
      [SecurityLevel.CRITICAL]: 4
    };

    const agentLevel = levelOrder[req.agentContext.securityLevel] || 0;
    const requiredLevel = levelOrder[minLevel] || 0;

    if (agentLevel < requiredLevel) {
      return res.status(403).json({
        error: 'Insufficient security level',
        required: minLevel,
        current: req.agentContext.securityLevel
      });
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

    // Track in event bus
    const eventBus = EventBusService.getInstance();
    eventBus.emit('agent.operation.started', {
      agentId: req.agentContext?.agentId,
      operation: operationName,
      userId: req.user?.id,
      timestamp: new Date()
    });

    // Track response
    const originalSend = res.send;
    res.send = function(data: any) {
      req.agentExecution!.results.push({
        operation: operationName,
        duration: Date.now() - req.agentExecution!.startTime,
        status: res.statusCode
      });

      eventBus.emit('agent.operation.completed', {
        agentId: req.agentContext?.agentId,
        operation: operationName,
        duration: Date.now() - req.agentExecution!.startTime,
        status: res.statusCode
      });

      return originalSend.call(this, data);
    };

    next();
  };
};

// Agent rate limiting middleware
export const agentRateLimit = (config?: {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (req: Request) => string;
}) => {
  const requests = new Map<string, { count: number; resetTime: number }>();
  const windowMs = config?.windowMs || 60000; // 1 minute
  const maxRequests = config?.maxRequests || 100;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = config?.keyGenerator 
      ? config.keyGenerator(req)
      : req.agentContext?.agentId || req.ip;

    const now = Date.now();
    const record = requests.get(key);

    if (!record || record.resetTime < now) {
      requests.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter
      });
    }

    record.count++;
    next();
  };
};

// Agent execution middleware (replaces controller logic)
export const executeAgentOperation = (
  operationHandler: (context: AgentContext, params: any) => Promise<any>
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.agentContext) {
        return res.status(401).json({ error: 'Agent context required' });
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

// Agent capability check middleware
export const requireAgentCapability = (capability: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.agentContext) {
      return res.status(401).json({ error: 'Agent context required' });
    }

    const hasCapability = req.agentContext.agent.capabilities?.some(
      (cap: any) => cap.name === capability || cap.category === capability
    );

    if (!hasCapability) {
      return res.status(403).json({
        error: 'Agent lacks required capability',
        required: capability,
        available: req.agentContext.agent.capabilities?.map((c: any) => c.name) || []
      });
    }

    next();
  };
};

// Agent status validation middleware
export const requireAgentStatus = (...allowedStatuses: AgentStatus[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.agentContext) {
      return res.status(401).json({ error: 'Agent context required' });
    }

    const agentStatus = req.agentContext.agent.status as AgentStatus;
    
    if (!allowedStatuses.includes(agentStatus)) {
      return res.status(400).json({
        error: 'Invalid agent status',
        current: agentStatus,
        required: allowedStatuses
      });
    }

    next();
  };
};

// Agent tool execution middleware
export const executeAgentTool = (toolName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.agentContext) {
        return res.status(401).json({ error: 'Agent context required' });
      }

      // Check if agent has access to tool
      const hasTool = req.agentContext.agent.toolAssignments?.some(
        (assignment: any) => assignment.tool.name === toolName && assignment.canExecute
      );

      if (!hasTool) {
        return res.status(403).json({
          error: 'Agent cannot execute this tool',
          tool: toolName
        });
      }

      // Emit tool execution event
      const eventBus = EventBusService.getInstance();
      const executionId = `${req.agentContext.agentId}-${toolName}-${Date.now()}`;

      eventBus.emit('agent.tool.execution.started', {
        executionId,
        agentId: req.agentContext.agentId,
        toolName,
        parameters: req.body,
        timestamp: new Date()
      });

      // Add execution tracking to request
      req.agentExecution = {
        ...req.agentExecution,
        startTime: Date.now(),
        operations: [...(req.agentExecution?.operations || []), `tool:${toolName}`],
        results: req.agentExecution?.results || []
      };

      next();
    } catch (error) {
      logger.error('Agent tool execution setup failed:', error);
      res.status(500).json({ error: 'Tool execution failed' });
    }
  };
};

// Composite middleware for common agent operations
export const agentOperationChain = (config: {
  requireAuth?: boolean;
  requiredPermission?: string;
  requiredCapability?: string;
  minSecurityLevel?: SecurityLevel;
  allowedStatuses?: AgentStatus[];
  trackOperation?: string;
  rateLimit?: boolean;
}) => {
  const middlewares: any[] = [];

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

// Export all middleware
export default {
  loadAgentContext,
  requireAgentPermission,
  requireSecurityLevel,
  trackAgentOperation,
  agentRateLimit,
  executeAgentOperation,
  requireAgentCapability,
  requireAgentStatus,
  executeAgentTool,
  agentOperationChain
};