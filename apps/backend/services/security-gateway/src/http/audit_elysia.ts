import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger as _logger } from '@uaip/utils';
import { withAdminGuard, withRequiredAuth } from '@uaip/middleware';
import { AuditService as DomainAuditService, getControlDb } from '@uaip/shared-services';
import { auditEvents } from '@uaip/shared-services/drizzle/control';
import { sql } from '@uaip/shared-services/drizzle/clients';
import { AuditService } from '../services/audit_service.js';
import { AuditEventType } from '@uaip/types';

let domainAuditServiceSingleton: DomainAuditService | null = null;
let auditServiceSingleton: AuditService | null = null;

async function getServices() {
  if (!domainAuditServiceSingleton) {
    domainAuditServiceSingleton = DomainAuditService.getInstance();
    auditServiceSingleton = new AuditService();
  }
  return { domainAuditService: domainAuditServiceSingleton!, auditService: auditServiceSingleton! };
}

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  eventType: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  ipAddress: z.string().optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['timestamp', 'eventType', 'userId']).default('timestamp'),
  sortOrder: z.enum(['ASC', 'DESC']).default('DESC'),
});

const exportSchema = z.object({
  format: z.enum(['json', 'csv', 'xml']).default('json'),
  eventType: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  includeDetails: z.boolean().default(true),
});

const complianceReportSchema = z.object({
  reportType: z.enum(['security_events', 'user_activity', 'policy_compliance', 'risk_assessment']),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
  includeCharts: z.boolean().default(false),
});

const logIdParamsSchema = z.object({ logId: z.string().min(1) });
const userActivityParamsSchema = z.object({ userId: z.string().min(1) });
const statsQuerySchema = z.object({ timeframe: z.enum(['1h', '24h', '7d', '30d']).optional() });
const userActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  eventType: z.nativeEnum(AuditEventType).optional(),
});

function validateWithZod<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { error: { details: { message: string; path: string }[] } | null; value: T | null } {
  const result = schema.safeParse(data);
  if (result.success) return { error: null, value: result.data };
  return {
    error: {
      details: result.error.errors.map((e) => ({ message: e.message, path: e.path.join('.') })),
    },
    value: null,
  };
}

export function registerAuditRoutes<T extends Elysia>(elysiaApp: T): T {
  elysiaApp.group('/api/v1/audit', (app: any) =>
    withRequiredAuth(app).group('', (g: any) =>
      withAdminGuard(g)
        // GET /logs
        .get('/logs', async ({ set, query }) => {
          const { error, value } = validateWithZod(auditQuerySchema, query);
          if (error) {
            set.status = 400;
            return {
              error: 'Validation Error',
              details: error.details.map((d) => d.message),
            };
          }
          try {
            const { domainAuditService } = await getServices();
            const offset = (value.page - 1) * value.limit;
            const repo = domainAuditService.getAuditRepository();
            const result = await repo.searchAuditLogs({
              ...value,
              offset,
              eventType: value.eventType as AuditEventType | undefined,
            });
            return {
              message: 'Audit logs retrieved successfully',
              logs: result.logs,
              pagination: {
                page: value.page,
                limit: value.limit,
                total: result.total,
                pages: Math.ceil(result.total / value.limit),
              },
              filters: {
                eventType: value.eventType,
                userId: value.userId,
                startDate: value.startDate,
                endDate: value.endDate,
                ipAddress: value.ipAddress,
                search: value.search,
              },
            };
          } catch {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to retrieve audit logs' };
          }
        })

        // GET /logs/:logId
        .get('/logs/:logId', async ({ set, params }) => {
          try {
            const { domainAuditService } = await getServices();
            const { logId } = logIdParamsSchema.parse(params);
            const repo = domainAuditService.getAuditRepository();
            // @ts-expect-error -- Property does not exist on inferred type
            const log = await repo.getAuditLogById(logId);
            if (!log) {
              set.status = 404;
              return { error: 'Log Not Found', message: 'Audit log entry not found' };
            }
            return { message: 'Audit log retrieved successfully', log };
          } catch {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to retrieve audit log' };
          }
        })

        // GET /events/types
        .get('/events/types', async ({ set }) => {
          try {
            const { domainAuditService } = await getServices();
            const repo = domainAuditService.getAuditRepository();
            const eventTypes = await repo.getEventTypes();
            return { message: 'Event types retrieved successfully', eventTypes };
          } catch {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to retrieve event types' };
          }
        })

        // GET /stats
        .get('/stats', async ({ set, query }) => {
          try {
            const parsedQuery = statsQuerySchema.safeParse(query);
            const selected = parsedQuery.success ? (parsedQuery.data.timeframe ?? '24h') : '24h';
            const { domainAuditService } = await getServices();
            const repo = domainAuditService.getAuditRepository();
            const statistics = await repo.getStats(selected);
            return {
              message: 'Audit statistics retrieved successfully',
              timeframe: selected,
              statistics,
            };
          } catch {
            set.status = 500;
            return {
              error: 'Internal Server Error',
              message: 'Failed to retrieve audit statistics',
            };
          }
        })

        // POST /export
        // @ts-expect-error -- Property does not exist on inferred type
        .post('/export', async ({ set, body, user, request, headers }) => {
          const { error, value } = validateWithZod(exportSchema, body);
          if (error) {
            set.status = 400;
            return {
              error: 'Validation Error',
              details: error.details.map((d) => d.message),
            };
          }
          try {
            const { auditService } = await getServices();
            const exportData = await auditService.exportLogs(
              value.startDate,
              value.endDate,
              value.format
            );
            let parsedData: unknown;
            try {
              parsedData = typeof exportData === 'string' ? JSON.parse(exportData) : exportData;
            } catch {
              parsedData = { data: exportData, recordCount: 0 };
            }
            await auditService.logSecurityEvent({
              eventType: AuditEventType.AUDIT_EXPORT,
              userId: user!.id,
              details: {
                format: value.format,
                eventType: value.eventType,
                startDate: value.startDate,
                endDate: value.endDate,
                // @ts-expect-error -- Property does not exist on inferred type
                recordCount: parsedData.recordCount,
              },
              ipAddress: request.headers.get('x-forwarded-for') || '',
              userAgent: headers['user-agent'],
            });
            return {
              message: 'Audit logs exported successfully',
              format: value.format,
              // @ts-expect-error -- Property does not exist on inferred type
              recordCount: parsedData.recordCount,
              exportedAt: new Date().toISOString(),
              // @ts-expect-error -- Property does not exist on inferred type
              data: parsedData.data || exportData,
            };
          } catch {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to export audit logs' };
          }
        })

        // POST /compliance-report
        // @ts-expect-error -- Property does not exist on inferred type
        .post('/compliance-report', async ({ set, body, user, request, headers }) => {
          const { error, value } = validateWithZod(complianceReportSchema, body);
          if (error) {
            set.status = 400;
            return {
              error: 'Validation Error',
              details: error.details.map((d) => d.message),
            };
          }
          try {
            const { auditService } = await getServices();
            const report = await auditService.generateComplianceReport({
              startDate: value.startDate,
              endDate: value.endDate,
              includeDetails: value.includeCharts,
              complianceFramework: undefined,
            });
            await auditService.logSecurityEvent({
              eventType: AuditEventType.COMPLIANCE_REPORT_GENERATED,
              userId: user!.id,
              details: {
                reportType: value.reportType,
                startDate: value.startDate,
                endDate: value.endDate,
                format: value.format,
              },
              ipAddress: request.headers.get('x-forwarded-for') || '',
              userAgent: headers['user-agent'],
            });
            return value.format === 'json' ? report : { data: report };
          } catch {
            set.status = 500;
            return {
              error: 'Internal Server Error',
              message: 'Failed to generate compliance report',
            };
          }
        })

        // GET /user-activity/:userId
        .get('/user-activity/:userId', async ({ set, params, query }) => {
          try {
            const { domainAuditService } = await getServices();
            const { userId } = userActivityParamsSchema.parse(params);
            const parsedQuery = userActivityQuerySchema.safeParse(query);
            const parsedData = parsedQuery.success
              ? parsedQuery.data
              : userActivityQuerySchema.parse({});
            const { page, limit, startDate, endDate, eventType } = parsedData;
            const offset = (page - 1) * limit;
            const repo = domainAuditService.getAuditRepository();
            // @ts-expect-error -- Property does not exist on inferred type
            const result = await repo.getUserActivityAuditTrail({
              userId,
              startDate,
              endDate,
              eventType,
              limit,
              offset,
            });
            return {
              message: 'User activity retrieved successfully',
              userId,
              userEmail: result.activities[0]?.user?.email || null,
              userRole: result.activities[0]?.user?.role || null,
              activities: result.activities,
              pagination: {
                page,
                limit,
                total: result.total,
                pages: Math.ceil(result.total / limit),
              },
            };
          } catch {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to retrieve user activity' };
          }
        })

        // DELETE /cleanup
        // @ts-expect-error -- Property does not exist on inferred type
        .delete('/cleanup', async ({ set, user, request, headers }) => {
          try {
            const { auditService } = await getServices();
            const result = await auditService.cleanupOldLogs();
            await auditService.logSecurityEvent({
              eventType: AuditEventType.AUDIT_CLEANUP,
              userId: user!.id,
              details: { deletedCount: result.deleted, oldestRetainedDate: result.archived },
              ipAddress: request.headers.get('x-forwarded-for') || '',
              userAgent: headers['user-agent'],
            });
            return { message: 'Audit cleanup completed successfully', result };
          } catch {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to cleanup audit logs' };
          }
        })
        .patch('/logs/:logId/resolve', async ({ params, request, set }) => {
          try {
            const { logId } = logIdParamsSchema.parse(params);
            const userId = request.headers.get('x-user-id') || '';
            const db = getControlDb();

            const existing = await db
              .select({ id: auditEvents.id, resolved: auditEvents.resolved })
              .from(auditEvents)
              .where(sql`${auditEvents.id} = ${logId}`)
              .limit(1);

            if (existing.length === 0) {
              set.status = 404;
              return { error: 'Audit event not found' };
            }

            if (existing[0].resolved) {
              return { message: 'Already resolved', id: logId };
            }

            await db
              .update(auditEvents)
              .set({
                resolved: true,
                resolvedBy: userId || null,
                resolvedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(sql`${auditEvents.id} = ${logId}`);

            return { message: 'Audit event resolved', id: logId };
          } catch (error) {
            _logger.error('Failed to resolve audit event', {
              error: error instanceof Error ? error.message : String(error),
            });
            set.status = 500;
            return { error: 'Failed to resolve audit event' };
          }
        })
    )
  );

  return elysiaApp;
}

export default registerAuditRoutes;
