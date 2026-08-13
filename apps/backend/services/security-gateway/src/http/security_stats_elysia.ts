import { Elysia } from 'elysia';
import type { SecurityStatsResponse, UserRateLimitState } from '@uaip/types';
import { withAdminGuard } from '@uaip/middleware';
import { AuditService as DomainAuditService, getControlDb } from '@uaip/shared-services';
import { sql } from '@uaip/shared-services/drizzle/clients';
import { auditEvents, refreshTokens } from '@uaip/shared-services/drizzle/control';
import { logger } from '@uaip/utils';

import { getAuthUser } from './context_helpers.js';

let domainAuditServiceSingleton: DomainAuditService | null = null;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 6;
const userRateLimits = new Map<string, UserRateLimitState>();

function getRetryAfterSeconds(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

function consumeRateLimit(userId: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = userRateLimits.get(userId);

  if (!existing || existing.resetAt <= now) {
    userRateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: getRetryAfterSeconds(existing.resetAt, now),
    };
  }

  existing.count += 1;
  userRateLimits.set(userId, existing);
  return { allowed: true, retryAfterSeconds: 0 };
}

async function getServices(): Promise<{ domainAuditService: DomainAuditService }> {
  if (!domainAuditServiceSingleton) {
    domainAuditServiceSingleton = DomainAuditService.getInstance();
  }

  return { domainAuditService: domainAuditServiceSingleton };
}

function toCount(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export function registerSecurityStatsRoutes() {
  // The guard MUST wrap the group BEFORE the route is registered on it. Elysia's
  // .guard() only applies to routes added after the guard, so the older shape —
  // withAdminGuard(new Elysia().get(...)) — registered the route first and the
  // admin check never ran, leaving these stats readable by any authenticated user.
  return new Elysia().group('/api/v1/security', (group) =>
    withAdminGuard(group).get('/stats', async (ctx) => {
      const { request, set } = ctx;
      const userId = getAuthUser(ctx).id;

      const limitResult = consumeRateLimit(userId);
      if (!limitResult.allowed) {
        set.status = 429;
        return {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Maximum 6 requests per minute.',
          retryAfterSeconds: limitResult.retryAfterSeconds,
        };
      }

      try {
        const db = getControlDb();

        // ILIKE, not LIKE: AuditEventType.LOGIN_FAILED is the lowercase string
        // 'login_failed', so the previous uppercase LIKE '%LOGIN%FAIL%' matched
        // nothing and this counter was permanently zero — which also pinned
        // systemStatus at 'healthy' no matter how many logins failed.
        const [failedLoginsLastHourRow] = await db
          .select({ value: sql<number>`COUNT(*)` })
          .from(auditEvents)
          .where(
            sql`${auditEvents.eventType} ILIKE '%login%fail%' AND ${auditEvents.createdAt} >= NOW() - INTERVAL '1 hour'`
          );

        const [failedLoginsPreviousHourRow] = await db
          .select({ value: sql<number>`COUNT(*)` })
          .from(auditEvents)
          .where(
            sql`${auditEvents.eventType} ILIKE '%login%fail%' AND ${auditEvents.createdAt} >= NOW() - INTERVAL '2 hour' AND ${auditEvents.createdAt} < NOW() - INTERVAL '1 hour'`
          );

        const [criticalEventsUnresolvedRow] = await db
          .select({ value: sql<number>`COUNT(*)` })
          .from(auditEvents)
          .where(sql`${auditEvents.outcome} = 'failure' AND ${auditEvents.resolved} = false`);

        const [criticalEventsCurrentDayRow] = await db
          .select({ value: sql<number>`COUNT(*)` })
          .from(auditEvents)
          .where(
            sql`${auditEvents.outcome} = 'failure' AND ${auditEvents.createdAt} >= NOW() - INTERVAL '1 day'`
          );

        const [criticalEventsPreviousDayRow] = await db
          .select({ value: sql<number>`COUNT(*)` })
          .from(auditEvents)
          .where(
            sql`${auditEvents.outcome} = 'failure' AND ${auditEvents.createdAt} >= NOW() - INTERVAL '2 day' AND ${auditEvents.createdAt} < NOW() - INTERVAL '1 day'`
          );

        // Counted from refresh_tokens, not the sessions table: password login and
        // OAuth both mint a refresh token per sign-in and never write a sessions
        // row, so sessions is empty in practice and would report 0 forever.
        const [activeSessionsRow] = await db
          .select({ value: sql<number>`COUNT(*)` })
          .from(refreshTokens)
          .where(sql`${refreshTokens.revokedAt} IS NULL AND ${refreshTokens.expiresAt} > NOW()`);

        const failedLoginsLastHour = toCount(failedLoginsLastHourRow?.value);
        const failedLoginsPreviousHour = toCount(failedLoginsPreviousHourRow?.value);
        const criticalEventsUnresolved = toCount(criticalEventsUnresolvedRow?.value);
        const criticalEventsCurrentDay = toCount(criticalEventsCurrentDayRow?.value);
        const criticalEventsPreviousDay = toCount(criticalEventsPreviousDayRow?.value);
        const activeSessions = toCount(activeSessionsRow?.value);

        const systemStatus: SecurityStatsResponse['systemStatus'] =
          criticalEventsUnresolved > 0
            ? 'critical'
            : failedLoginsLastHour > 10
              ? 'warning'
              : 'healthy';

        const fetchedAt = new Date().toISOString();

        const response: SecurityStatsResponse = {
          activeSessions,
          failedLoginsLastHour,
          criticalEventsUnresolved,
          // Constants on purpose: nothing in this system scans for vulnerabilities
          // or measures encryption coverage yet, and inventing a number here would
          // be worse than reporting a known one. Wire these to a real source before
          // treating them as signal.
          openVulnerabilities: 0,
          dataEncryptedPercent: 100,
          systemStatus,
          trends: {
            failedLoginsVsPreviousHour: failedLoginsLastHour - failedLoginsPreviousHour,
            criticalEventsVsPreviousDay: criticalEventsCurrentDay - criticalEventsPreviousDay,
          },
          fetchedAt,
        };

        const { domainAuditService } = await getServices();
        const repo = domainAuditService.getAuditRepository();
        await repo.createAuditEvent({
          eventType: 'SENSITIVE_DATA_ACCESSED',
          userId,
          resourceType: 'security_portal',
          resourceId: 'stats',
          action: 'view_security_stats',
          outcome: 'success',
          details: {
            endpoint: '/api/v1/security/stats',
            systemStatus,
          },
          ipAddress: request.headers.get('x-forwarded-for') || '',
          userAgent: request.headers.get('user-agent') || '',
        });

        return response;
      } catch (error) {
        logger.error('Failed to fetch security stats', {
          error: error instanceof Error ? error.message : String(error),
          userId,
        });
        set.status = 500;
        return {
          error: 'Internal Server Error',
          message: 'Failed to fetch security stats',
        };
      }
    })
  );
}
