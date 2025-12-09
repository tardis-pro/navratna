import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withAdminGuard, withRequiredAuth } from './middleware/auth.plugin.js';
import { AuditService as DomainAuditService } from '@uaip/shared-services';
import { AuditService } from '../services/auditService.js';
import { AuditEventType } from '@uaip/types';

let domainAuditService: DomainAuditService | null = null;
let auditService: AuditService | null = null;

async function getServices() {
  if (!domainAuditService) {
    domainAuditService = DomainAuditService.getInstance();
    auditService = new AuditService();
  }
  return { domainAuditService: domainAuditService!, auditService: auditService! };
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

function validateWithZod<T>(schema: z.ZodSchema<T>, data: any) {
  const result = schema.safeParse(data);
  if (result.success) return { error: null, value: result.data };
  return {
    error: {
      details: result.error.errors.map((e) => ({ message: e.message, path: e.path.join('.') })),
    },
    value: null,
  };
}

export function registerAuditRoutes(app: any): any {
  return app.group('/api/v1/audit', (app: any) =>
    withRequiredAuth(app).group('', (g: any) =>
      withAdminGuard(g)
        // GET /logs
        .get('/logs', async ({ set, query }) => {
          const { error, value } = validateWithZod(auditQuerySchema, query);
          if (error) {
            set.status = 400;
            return { error: 'Validation Error', details: error.details.map((d: any) => d.message) };
          }
          try {
            const { domainAuditService } = await getServices();
            const offset = (value.page - 1) * value.limit;
            const repo = domainAuditService.getAuditRepository();
            const result = await repo.searchAuditLogs({ ...value, offset });
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
          } catch (error) {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to retrieve audit logs' };
          }
        })

        // GET /logs/:logId
        .get('/logs/:logId', async ({ set, params }) => {
          try {
            const { domainAuditService } = await getServices();
            const logId = (params as any).logId as string;
            const repo = domainAuditService.getAuditRepository();
            const log = await repo.getAuditLogById(logId);
            if (!log) {
              set.status = 404;
              return { error: 'Log Not Found', message: 'Audit log entry not found' };
            }
            return { message: 'Audit log retrieved successfully', log };
          } catch (error) {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to retrieve audit log' };
          }
        })

        // GET /events/types
        .get('/events/types', async ({ set }) => {
          try {
            const { domainAuditService } = await getServices();
            const repo = domainAuditService.getAuditRepository();
            const eventTypes = await repo.getAuditEventTypes();
            return { message: 'Event types retrieved successfully', eventTypes };
          } catch (error) {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to retrieve event types' };
          }
        })

        // GET /stats
        .get('/stats', async ({ set, query }) => {
          try {
            const timeframe = ((query as any).timeframe || '24h') as string;
            const valid = ['1h', '24h', '7d', '30d'];
            const selected = valid.includes(timeframe) ? timeframe : '24h';
            const { domainAuditService } = await getServices();
            const repo = domainAuditService.getAuditRepository();
            const statistics = await repo.getAuditStatistics(selected as any);
            return {
              message: 'Audit statistics retrieved successfully',
              timeframe: selected,
              statistics,
            };
          } catch (error) {
            set.status = 500;
            return {
              error: 'Internal Server Error',
              message: 'Failed to retrieve audit statistics',
            };
          }
        })

        // POST /export
        .post('/export', async ({ set, body, user, request, headers }) => {
          const { error, value } = validateWithZod(exportSchema, body);
          if (error) {
            set.status = 400;
            return { error: 'Validation Error', details: error.details.map((d: any) => d.message) };
          }
          try {
            const { auditService } = await getServices();
            const exportData = await auditService.exportLogs(
              value.startDate,
              value.endDate,
              value.format
            );
            let parsedData: any;
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
                recordCount: parsedData.recordCount,
              },
              ipAddress: request.headers.get('x-forwarded-for') || '',
              userAgent: headers['user-agent'],
            });
            return {
              message: 'Audit logs exported successfully',
              format: value.format,
              recordCount: parsedData.recordCount,
              exportedAt: new Date().toISOString(),
              data: parsedData.data || exportData,
            };
          } catch (error) {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to export audit logs' };
          }
        })

        // POST /compliance-report
        .post('/compliance-report', async ({ set, body, user, request, headers }) => {
          const { error, value } = validateWithZod(complianceReportSchema, body);
          if (error) {
            set.status = 400;
            return { error: 'Validation Error', details: error.details.map((d: any) => d.message) };
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
          } catch (error) {
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
            const userId = (params as any).userId as string;
            const page = Number((query as any).page ?? 1);
            const limit = Number((query as any).limit ?? 20);
            const startDate = (query as any).startDate
              ? new Date((query as any).startDate)
              : undefined;
            const endDate = (query as any).endDate ? new Date((query as any).endDate) : undefined;
            const eventType = (query as any).eventType as AuditEventType | undefined;
            const offset = (page - 1) * limit;
            const repo = domainAuditService.getAuditRepository();
            const result = await repo.getUserActivityAuditTrail({
              userId,
              startDate,
              endDate,
              eventType: eventType as any,
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
          } catch (error) {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to retrieve user activity' };
          }
        })

        // DELETE /cleanup
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
          } catch (error) {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to cleanup audit logs' };
          }
        })
    )
  );
}

export default registerAuditRoutes;
