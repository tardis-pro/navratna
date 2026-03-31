import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { AgentRole, SecurityLevel, AgentStatus } from '@uaip/types';
import type { AgentContext, AgentExecution } from '@uaip/types';

export type { AgentContext, AgentExecution };

// Agent validation schemas
const agentIdSchema = z.string().uuid();

function withAgentGuard(
  ctx: unknown,
  callback: (agentContext: AgentContext, set: { status: number }) => unknown
): unknown {
  const { agentContext, set } = ctx as unknown as {
    agentContext: AgentContext | null;
    set: { status: number };
  };
  if (!agentContext) {
    set.status = 401;
    return { error: 'Agent context required' };
  }
  return callback(agentContext, set);
}

export function loadAgentContext(app: Elysia): Elysia {
  return app.derive(({ params, ...ctx }) => {
    const user = (ctx as unknown as { user?: { id: string } }).user;
    const agentId = (params as Record<string, string>)?.agentId;

    if (!agentId) {
      return { agentContext: null as AgentContext | null };
    }

    const validation = agentIdSchema.safeParse(agentId);
    if (!validation.success) {
      return {
        agentContext: null as AgentContext | null,
        agentValidationError: {
          error: 'Invalid agent ID format',
          details: validation.error.errors,
        },
      };
    }

    // Set basic context - calling service should populate with actual agent data
    const context: AgentContext = {
      agentId,
      userId: user?.id || 'system',
      permissions: [],
      securityLevel: SecurityLevel.LOW,
      role: AgentRole.ASSISTANT,
      status: AgentStatus.ACTIVE,
      metadata: {},
    };

    logger.debug('Agent context initialized', {
      agentId,
      userId: user?.id,
    });

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
      .derive((ctx) => {
        const agentContext = (ctx as unknown as { agentContext?: AgentContext }).agentContext;
        const agentExecution: AgentExecution = {
          startTime: Date.now(),
          operations: [operationName],
          results: [],
        };

        logger.debug('Agent operation started', {
          agentId: agentContext?.agentId,
          operation: operationName,
          timestamp: new Date(),
        });

        return { agentExecution };
      })
      .onAfterResponse((ctx) => {
        const { agentContext, agentExecution, set } = ctx as unknown as {
          agentContext?: AgentContext;
          agentExecution?: AgentExecution;
          set: { status?: number | string };
        };
        if (agentExecution) {
          const result = {
            operation: operationName,
            duration: Date.now() - agentExecution.startTime,
            status: typeof set.status === 'number' ? set.status : 200,
          };

          agentExecution.results.push(result);

          logger.debug('Agent operation completed', {
            agentId: agentContext?.agentId,
            operation: operationName,
            duration: result.duration,
            status: result.status,
          });
        }
      });
  };
}

const agentRequestCounts = new Map<string, { count: number; resetTime: number }>();

export function agentRateLimit(maxRequests = 100, windowMs = 60000) {
  return (app: Elysia) => {
    return app.guard({
      beforeHandle(ctx) {
        return withAgentGuard(ctx, (agentContext, set) => {
          const { user } = ctx as unknown as { user?: { id: string } };
          const key = `${agentContext.agentId}:${user?.id || 'anonymous'}`;
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
      const { agentContext, body, query, params, set } = ctx as unknown as {
        agentContext?: AgentContext;
        body?: unknown;
        query?: Record<string, unknown>;
        params?: Record<string, unknown>;
        set: { status: number };
      };
      if (!agentContext) {
        set.status = 401;
        return {
          operationError: { error: 'Agent context required' },
        };
      }

      try {
        const result = await operationHandler(agentContext, {
          ...((body as object) || {}),
          ...(query || {}),
          ...(params || {}),
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
      const { agentContext, body } = ctx as unknown as {
        agentContext?: AgentContext;
        body?: unknown;
      };
      if (agentContext) {
        logger.debug('Agent tool execution started', {
          agentId: agentContext.agentId,
          toolName,
          parameters: body,
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
