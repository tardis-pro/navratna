import type { AnyElysia, Elysia } from 'elysia';
import { desc, getControlDb, getIntelligenceDb, agents, artifacts, auditEvents, discussions, knowledgeItems, sql } from '@uaip/shared-services';
import { withRequiredAuth } from '@uaip/middleware';
import { logger } from '@uaip/utils';
import os from 'node:os';

type HealthStatus = 'healthy' | 'degraded' | 'critical';
type ActivityType =
  | 'agent_created'
  | 'discussion_started'
  | 'discussion_ended'
  | 'knowledge_added'
  | 'artifact_generated'
  | 'security_event';

interface DashboardStats {
  system: {
    cpuUsage: number | null;
    memoryUsage: number | null;
    responseTimeMs: number | null;
    uptimePercent: number | null;
    status: HealthStatus;
  };
  counts: {
    activeAgents: number | null;
    activeDiscussions: number | null;
    knowledgeItems: number | null;
    artifacts: number | null;
    deltaSinceYesterday: {
      agents: number | null;
      discussions: number | null;
      knowledge: number | null;
      artifacts: number | null;
    };
  };
  recentActivity: Array<{
    id: string;
    type: ActivityType;
    summary: string;
    timestamp: string;
    severity: 'info' | 'warning' | 'error';
  }> | null;
  fetchedAt: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_MAX_REQUESTS = 12;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;
const rateLimitByUserId = new Map<string, RateLimitEntry>();
let nextRateLimitCleanupAt = 0;

const CPU_CORES = Math.max(1, os.cpus().length || 1);

const NAVRATNA_CORE_DEFAULT_URL = 'http://localhost:3001';
const NAVRATNA_CORE_HEALTH_ENDPOINT = '/api/v1/core/health';
const CORE_HEALTH_TIMEOUT_MS = 2_000;

function clampToPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function cleanupRateLimiter(now: number): void {
  if (now < nextRateLimitCleanupAt) {
    return;
  }

  for (const [key, value] of rateLimitByUserId.entries()) {
    if (value.resetAt <= now) {
      rateLimitByUserId.delete(key);
    }
  }

  nextRateLimitCleanupAt = now + RATE_LIMIT_CLEANUP_INTERVAL_MS;
}

function checkRateLimit(userId: string, now: number): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  cleanupRateLimiter(now);

  const existing = rateLimitByUserId.get(userId);
  if (!existing || existing.resetAt <= now) {
    rateLimitByUserId.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  existing.count += 1;
  rateLimitByUserId.set(userId, existing);
  return { allowed: true };
}

function getCpuUsagePercent(): number {
  const usage = process.cpuUsage();
  const totalCpuMicros = usage.user + usage.system;
  const uptimeSeconds = Math.max(1, process.uptime());
  const percent = (totalCpuMicros / (uptimeSeconds * 1_000_000 * CPU_CORES)) * 100;
  return clampToPercent(percent);
}

function getMemoryUsagePercent(): number {
  const memory = process.memoryUsage();
  const denominator = Math.max(1, memory.heapTotal);
  return clampToPercent((memory.heapUsed / denominator) * 100);
}

function getUptimePercent(): number {
  return clampToPercent((process.uptime() / 86_400) * 100);
}

function sanitizeCoreUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) {
    return NAVRATNA_CORE_DEFAULT_URL;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  return NAVRATNA_CORE_DEFAULT_URL;
}

function parseResponseTimeMs(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null || !('timing' in payload)) {
    return null;
  }

  const timing = payload.timing;
  if (typeof timing !== 'object' || timing === null || !('p95' in timing)) {
    return null;
  }

  const p95 = timing.p95;
  if (typeof p95 !== 'number' || Number.isNaN(p95)) {
    return null;
  }

  return p95;
}

async function fetchCoreP95ResponseTime(): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CORE_HEALTH_TIMEOUT_MS);

  try {
    const baseUrl = sanitizeCoreUrl(process.env.NAVRATNA_CORE_URL || NAVRATNA_CORE_DEFAULT_URL);
    const response = await fetch(`${baseUrl}${NAVRATNA_CORE_HEALTH_ENDPOINT}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      logger.warn('Dashboard stats: navratna-core health fetch returned non-OK status', {
        status: response.status,
      });
      return null;
    }

    const payload = (await response.json()) as unknown;
    return parseResponseTimeMs(payload);
  } catch (error) {
    logger.warn('Dashboard stats: failed to fetch navratna-core health', {
      error: error instanceof Error ? error.message : 'unknown-error',
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function deriveSystemStatus(system: DashboardStats['system']): HealthStatus {
  if (system.cpuUsage !== null && system.cpuUsage >= 90) {
    return 'critical';
  }
  if (system.memoryUsage !== null && system.memoryUsage >= 90) {
    return 'critical';
  }
  if (system.responseTimeMs !== null && system.responseTimeMs >= 2_000) {
    return 'critical';
  }

  if (system.cpuUsage !== null && system.cpuUsage >= 75) {
    return 'degraded';
  }
  if (system.memoryUsage !== null && system.memoryUsage >= 80) {
    return 'degraded';
  }
  if (system.responseTimeMs !== null && system.responseTimeMs >= 1_000) {
    return 'degraded';
  }

  return 'healthy';
}

function mapAuditEventType(eventType: string, action: string): ActivityType {
  const normalizedEventType = eventType.toLowerCase();
  const normalizedAction = action.toLowerCase();

  if (normalizedEventType.includes('agent') && (normalizedAction.includes('create') || normalizedEventType.includes('create'))) {
    return 'agent_created';
  }
  if (normalizedEventType.includes('discussion') && (normalizedAction.includes('start') || normalizedEventType.includes('start'))) {
    return 'discussion_started';
  }
  if (normalizedEventType.includes('discussion') && (normalizedAction.includes('end') || normalizedEventType.includes('end'))) {
    return 'discussion_ended';
  }
  if (normalizedEventType.includes('knowledge') && (normalizedAction.includes('add') || normalizedAction.includes('create'))) {
    return 'knowledge_added';
  }
  if (normalizedEventType.includes('artifact') && (normalizedAction.includes('generate') || normalizedAction.includes('create'))) {
    return 'artifact_generated';
  }

  return 'security_event';
}

function mapSeverity(outcome: string): 'info' | 'warning' | 'error' {
  const normalized = outcome.toLowerCase();
  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('deny')) {
    return 'error';
  }
  if (normalized.includes('warn')) {
    return 'warning';
  }
  return 'info';
}

async function safeQuery<T>(label: string, queryFn: () => Promise<T>): Promise<T | null> {
  try {
    return await queryFn();
  } catch (error) {
    logger.warn('Dashboard stats: sub-query failed', {
      query: label,
      error: error instanceof Error ? error.message : 'unknown-error',
    });
    return null;
  }
}

interface AuthUser {
  id: string;
}

function getAuthUser(value: unknown): AuthUser | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  if (!('id' in value) || typeof value.id !== 'string') {
    return null;
  }
  return { id: value.id };
}

export function registerDashboardRoutes(app: Elysia): void {
  app.group('/api/v1/dashboard', (groupedApp: AnyElysia) =>
    withRequiredAuth(groupedApp).get('/stats', async (context) => {
      const authUser = getAuthUser('user' in context ? context.user : undefined);
      if (!authUser) {
        context.set.status = 401;
        return { error: 'Authentication required' };
      }

      const now = Date.now();
      const rateLimitResult = checkRateLimit(authUser.id, now);
      if (!rateLimitResult.allowed) {
        const retryAfterSeconds =
          'retryAfterSeconds' in rateLimitResult ? rateLimitResult.retryAfterSeconds : 60;
        context.set.status = 429;
        context.set.headers['retry-after'] = String(retryAfterSeconds);
        return {
          error: 'Rate limit exceeded',
          message: 'Too many dashboard stats requests. Please retry later.',
        };
      }

      const intelligenceDb = getIntelligenceDb();
      const controlDb = getControlDb();

      const [responseTimeMs, activeAgents, activeDiscussions, knowledgeCount, artifactsCount, deltaAgents, deltaDiscussions, deltaKnowledge, deltaArtifacts, recentActivity] =
        await Promise.all([
          safeQuery('coreHealthP95', fetchCoreP95ResponseTime),
          safeQuery('activeAgents', async () => {
            const [row] = await intelligenceDb
              .select({ count: sql<number>`count(*)::int` })
              .from(agents)
              .where(sql`${agents.isActive} = true`);
            return row?.count ?? 0;
          }),
          safeQuery('activeDiscussions', async () => {
            const [row] = await intelligenceDb
              .select({ count: sql<number>`count(*)::int` })
              .from(discussions)
              .where(sql`${discussions.status} = 'active'`);
            return row?.count ?? 0;
          }),
          safeQuery('knowledgeItems', async () => {
            const [row] = await intelligenceDb
              .select({ count: sql<number>`count(*)::int` })
              .from(knowledgeItems);
            return row?.count ?? 0;
          }),
          safeQuery('artifacts', async () => {
            const [row] = await intelligenceDb
              .select({ count: sql<number>`count(*)::int` })
              .from(artifacts);
            return row?.count ?? 0;
          }),
          safeQuery('deltaAgents', async () => {
            const [row] = await intelligenceDb
              .select({ count: sql<number>`count(*)::int` })
              .from(agents)
              .where(sql`${agents.createdAt} >= NOW() - INTERVAL '24 hours'`);
            return row?.count ?? 0;
          }),
          safeQuery('deltaDiscussions', async () => {
            const [row] = await intelligenceDb
              .select({ count: sql<number>`count(*)::int` })
              .from(discussions)
              .where(sql`${discussions.createdAt} >= NOW() - INTERVAL '24 hours'`);
            return row?.count ?? 0;
          }),
          safeQuery('deltaKnowledge', async () => {
            const [row] = await intelligenceDb
              .select({ count: sql<number>`count(*)::int` })
              .from(knowledgeItems)
              .where(sql`${knowledgeItems.createdAt} >= NOW() - INTERVAL '24 hours'`);
            return row?.count ?? 0;
          }),
          safeQuery('deltaArtifacts', async () => {
            const [row] = await intelligenceDb
              .select({ count: sql<number>`count(*)::int` })
              .from(artifacts)
              .where(sql`${artifacts.createdAt} >= NOW() - INTERVAL '24 hours'`);
            return row?.count ?? 0;
          }),
          safeQuery('recentActivity', async () => {
            const rows = await controlDb
              .select({
                id: auditEvents.id,
                eventType: auditEvents.eventType,
                action: auditEvents.action,
                outcome: auditEvents.outcome,
                createdAt: auditEvents.createdAt,
              })
              .from(auditEvents)
              .orderBy(desc(auditEvents.createdAt))
              .limit(10);

            return rows.map((row) => ({
              id: row.id,
              type: mapAuditEventType(row.eventType, row.action),
              summary: `${row.eventType} ${row.action}`,
              timestamp: row.createdAt.toISOString(),
              severity: mapSeverity(row.outcome),
            }));
          }),
        ]);

      const system: DashboardStats['system'] = {
        cpuUsage: getCpuUsagePercent(),
        memoryUsage: getMemoryUsagePercent(),
        responseTimeMs,
        uptimePercent: getUptimePercent(),
        status: 'healthy',
      };

      system.status = deriveSystemStatus(system);

      const payload: DashboardStats = {
        system,
        counts: {
          activeAgents,
          activeDiscussions,
          knowledgeItems: knowledgeCount,
          artifacts: artifactsCount,
          deltaSinceYesterday: {
            agents: deltaAgents,
            discussions: deltaDiscussions,
            knowledge: deltaKnowledge,
            artifacts: deltaArtifacts,
          },
        },
        recentActivity,
        fetchedAt: new Date().toISOString(),
      };

      return payload;
    })
  );
}
