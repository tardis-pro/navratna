import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { AgentRole, SecurityLevel, AgentStatus } from '@uaip/types';
import type { AgentContext, AgentExecution } from '@uaip/types';

export type { AgentContext, AgentExecution };

// Agent validation schemas
const agentIdSchema = z.string().uuid();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAgentContext(value: unknown): value is AgentContext {
  if (!isRecord(value)) return false;
  return typeof value['agentId'] === 'string';
}

function isAgentExecution(value: unknown): value is AgentExecution {
  if (!isRecord(value)) return false;
  return typeof value['startTime'] === 'number';
}

type AgentGuardCtx = {
  agentContext: AgentContext | null;
  set: Record<string, unknown>;
};

function isAgentGuardCtx(value: unknown): value is AgentGuardCtx {
  if (!isRecord(value)) return false;
  const agentContext = value.agentContext;
  const set = value.set;
  return (agentContext === null || isAgentContext(agentContext)) && isRecord(set);
}

function makeTypedSet(rawSet: Record<string, unknown>): { status: number } {
  return {
    get status() { return typeof rawSet.status === 'number' ? rawSet.status : 200; },
    set status(v: number) { rawSet.status = v; },
  };
}

const nullAgentContext: AgentContext | null = null;

export function recordAgentOperationResult(
  agentExecution: unknown,
  operationName: string,
  status: number,
  now: number = Date.now()
): boolean {
  if (agentExecution === undefined) return false;

  if (!isAgentExecution(agentExecution)) {
    logger.warn('Invalid agent execution state ignored', {
      operation: operationName,
    });
    return false;
  }

  const result = {
    operation: operationName,
    duration: now - agentExecution.startTime,
    status,
  };

  agentExecution.results.push(result);

  logger.debug('Agent operation completed', {
    operation: operationName,
    duration: result.duration,
    status: result.status,
  });

  return true;
}

function withAgentGuard(
  ctx: unknown,
  callback: (agentContext: AgentContext, set: { status: number }) => unknown
): unknown {
  if (!isAgentGuardCtx(ctx)) {
    return { error: 'Agent context required' };
  }
  const set = makeTypedSet(ctx.set);
  if (!ctx.agentContext) {
    set.status = 401;
    return { error: 'Agent context required' };
  }
  return callback(ctx.agentContext, set);
}

export function loadAgentContext(app: Elysia): Elysia {
  return app.derive(({ params }) => {
    const agentId = typeof params['agentId'] === 'string' ? params['agentId'] : undefined;

    if (!agentId) {
      return { agentContext: nullAgentContext };
    }

    const validation = agentIdSchema.safeParse(agentId);
    if (!validation.success) {
      return {
        agentContext: nullAgentContext,
        agentValidationError: {
          error: 'Invalid agent ID format',
          details: validation.error.errors,
        },
      };
    }

    // Set basic context - calling service should populate with actual agent data
    const context: AgentContext = {
      agentId,
      userId: 'system',
      permissions: [],
      securityLevel: SecurityLevel.LOW,
      role: AgentRole.ASSISTANT,
      status: AgentStatus.ACTIVE,
      metadata: {},
    };

    logger.debug('Agent context initialized', { agentId });

    return { agentContext: context };
  });
}

export function requireAgentContext(app: Elysia): Elysia {
  return app.guard({
    beforeHandle(ctx) {
      return withAgentGuard(ctx, () => undefined);
    },
  });
}

export function requireAgentPermission(requiredPermission: string) {
  return (app: Elysia) => {
    return app.guard({
      beforeHandle(ctx) {
        return withAgentGuard(ctx, (agentContext, set) => {
          if (!agentContext.permissions.includes(requiredPermission)) {
            logger.warn(`Agent ${agentContext.agentId} lacks permission: ${requiredPermission}`);
            set.status = 403;
            return {
              error: 'Insufficient permissions',
              required: requiredPermission,
              available: agentContext.permissions,
            };
          }
        });
      },
    });
  };
}

export function requireSecurityLevel(minLevel: SecurityLevel) {
  return (app: Elysia) => {
    return app.guard({
      beforeHandle(ctx) {
        return withAgentGuard(ctx, (agentContext, set) => {
          if (agentContext.securityLevel < minLevel) {
            logger.warn(
              `Agent ${agentContext.agentId} security level ${agentContext.securityLevel} insufficient for required ${minLevel}`
            );
            set.status = 403;
            return {
              error: 'Insufficient security level',
              required: minLevel,
              current: agentContext.securityLevel,
            };
          }
        });
      },
    });
  };
}

export function trackAgentOperation(operationName: string) {
  return (app: Elysia) => {
    return app
      .derive(() => {
        const agentExecution: AgentExecution = {
          startTime: Date.now(),
          operations: [operationName],
          results: [],
        };

        logger.debug('Agent operation started', {
          operation: operationName,
          timestamp: new Date(),
        });

        return { agentExecution };
      })
      .onAfterResponse((ctx) => {
        const agentExecution = ctx.agentExecution;
        const statusRaw = isRecord(ctx.set) ? ctx.set['status'] : undefined;

        recordAgentOperationResult(
          agentExecution,
          operationName,
          typeof statusRaw === 'number' ? statusRaw : 200
        );
      });
  };
}

const agentRequestCounts = new Map<string, { count: number; resetTime: number }>();

export function agentRateLimit(maxRequests = 100, windowMs = 60000) {
  return (app: Elysia) => {
    return app.guard({
      beforeHandle(ctx) {
        return withAgentGuard(ctx, (agentContext, set) => {
          const key = `${agentContext.agentId}:anonymous`;
          const now = Date.now();
          const windowStart = now - windowMs;

          let requestData = agentRequestCounts.get(key);

          if (!requestData || requestData.resetTime < windowStart) {
            requestData = { count: 0, resetTime: now + windowMs };
            agentRequestCounts.set(key, requestData);
          }

          requestData.count++;

          if (requestData.count > maxRequests) {
            logger.warn(`Rate limit exceeded for agent ${agentContext.agentId}`);
            set.status = 429;
            return {
              error: 'Rate limit exceeded',
              retryAfter: Math.ceil((requestData.resetTime - now) / 1000),
            };
          }
        });
      },
    });
  };
}

export function requireAgentStatus(...allowedStatuses: AgentStatus[]) {
  return (app: Elysia) => {
    return app.guard({
      beforeHandle(ctx) {
        return withAgentGuard(ctx, (agentContext, set) => {
          if (!allowedStatuses.includes(agentContext.status)) {
            logger.warn(`Agent ${agentContext.agentId} has invalid status: ${agentContext.status}`);
            set.status = 403;
            return {
              error: 'Agent status not allowed',
              required: allowedStatuses,
              current: agentContext.status,
            };
          }
        });
      },
    });
  };
}

export function requireAgentCapability(requiredCapability: string) {
  return (app: Elysia) => {
    return app.guard({
      beforeHandle(ctx) {
        return withAgentGuard(ctx, (agentContext, set) => {
          if (!agentContext.permissions.includes(`capability:${requiredCapability}`)) {
            logger.warn(`Agent ${agentContext.agentId} lacks capability: ${requiredCapability}`);
            set.status = 403;
            return {
              error: 'Required capability not available',
              required: requiredCapability,
            };
          }
        });
      },
    });
  };
}

export function executeAgentOperation(
  operationHandler: (context: AgentContext, params: Record<string, unknown>) => Promise<unknown>
) {
  return (app: Elysia) => {
    return app.derive(async (ctx) => {
      const agentContextRaw: unknown = Reflect.get(ctx, 'agentContext');
      const agentContext = isAgentContext(agentContextRaw) ? agentContextRaw : undefined;

      if (!agentContext) {
        ctx.set.status = 401;
        return {
          operationError: { error: 'Agent context required' },
        };
      }

      try {
        const bodyObj = isRecord(ctx.body) ? ctx.body : {};
        const queryObj: Record<string, unknown> = ctx.query;
        const paramsObj: Record<string, unknown> = ctx.params;
        const result = await operationHandler(agentContext, {
          ...bodyObj,
          ...queryObj,
          ...paramsObj,
        });

        return {
          operationResult: {
            success: true,
            data: result,
            metadata: {
              agentId: agentContext.agentId,
              timestamp: new Date(),
            },
          },
        };
      } catch (error) {
        logger.error('Agent operation failed:', error);
        return {
          operationError: {
            error: error instanceof Error ? error.message : 'Operation failed',
          },
        };
      }
    });
  };
}

export function executeAgentTool(toolName: string) {
  return (app: Elysia) => {
    return app.derive((ctx) => {
      const agentContextRaw: unknown = Reflect.get(ctx, 'agentContext');
      const agentContext = isAgentContext(agentContextRaw) ? agentContextRaw : undefined;
      if (agentContext) {
        logger.debug('Agent tool execution started', {
          agentId: agentContext.agentId,
          toolName,
          parameters: ctx.body,
        });
      }
      return { executingTool: toolName };
    });
  };
}

export function agentOperationChain(config: {
  requiredPermission?: string;
  requiredCapability?: string;
  minSecurityLevel?: SecurityLevel;
  allowedStatuses?: AgentStatus[];
  trackOperation?: string;
  rateLimit?: boolean;
}) {
  return (app: Elysia) => {
    let result = loadAgentContext(app);
    result = requireAgentContext(result);

    if (config.requiredPermission) {
      result = requireAgentPermission(config.requiredPermission)(result);
    }

    if (config.requiredCapability) {
      result = requireAgentCapability(config.requiredCapability)(result);
    }

    if (config.minSecurityLevel) {
      result = requireSecurityLevel(config.minSecurityLevel)(result);
    }

    if (config.allowedStatuses) {
      result = requireAgentStatus(...config.allowedStatuses)(result);
    }

    if (config.trackOperation) {
      result = trackAgentOperation(config.trackOperation)(result);
    }

    if (config.rateLimit) {
      result = agentRateLimit()(result);
    }

    return result;
  };
}
