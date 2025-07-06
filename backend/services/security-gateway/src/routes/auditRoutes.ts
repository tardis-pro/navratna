import express, { Router } from 'express';
import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { authMiddleware, requireAdmin } from '@uaip/middleware';
import { validateRequest } from '@uaip/middleware';
import { AuditService as DomainAuditService } from '@uaip/shared-services';
import { AuditEventType } from '@uaip/types';
import { AuditService } from '../services/auditService.js';

const router: Router = express.Router();

// Lazy initialization of services
let domainAuditService: DomainAuditService | null = null;
let auditService: AuditService | null = null;

async function getServices() {
  if (!domainAuditService) {
    domainAuditService = DomainAuditService.getInstance();
    auditService = new AuditService();
  }
  return { domainAuditService, auditService: auditService! };
}

// Validation schemas using Zod
const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  eventType: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  ipAddress: z.string().ip().optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['timestamp', 'eventType', 'userId']).default('timestamp'),
  sortOrder: z.enum(['ASC', 'DESC']).default('DESC')
});

const exportSchema = z.object({
  format: z.enum(['json', 'csv', 'xml']).default('json'),
  eventType: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  includeDetails: z.boolean().default(true)
});

const complianceReportSchema = z.object({
  reportType: z.enum(['security_events', 'user_activity', 'policy_compliance', 'risk_assessment']),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
  includeCharts: z.boolean().default(false)
});

// Helper function for Zod validation
const validateWithZod = (schema: z.ZodSchema, data: any) => {
  const result = schema.safeParse(data);
  if (result.success) {
    return { error: null, value: result.data };
  } else {
    return {
      error: {
        details: result.error.errors.map(err => ({
          message: err.message,
          path: err.path.join('.')
        }))
      },
      value: null
    };
  }
};

// Routes

/**
 * @route GET /api/v1/audit/logs
 * @desc Get audit logs with filtering and pagination
 * @access Private - Admin/Security/Auditor roles only
 */
router.get('/logs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { domainAuditService } = await getServices();
    const { error, value } = validateWithZod(auditQuerySchema, req.query);
    if (error) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
      return;
    }

    const {
      page,
      limit,
      eventType,
      userId,
      startDate,
      endDate,
      ipAddress,
      search,
      sortBy,
      sortOrder
    } = value;

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Use AuditRepository method through domain service
    const auditRepository = domainAuditService.getAuditRepository();
    const result = await auditRepository.searchAuditLogs({
      eventType,
      userId,
      startDate,
      endDate,
      ipAddress,
      search,
      sortBy,
      sortOrder,
      limit,
      offset
    });

    res.json({
      message: 'Audit logs retrieved successfully',
      logs: result.logs,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit)
      },
      filters: {
        eventType,
        userId,
        startDate,
        endDate,
        ipAddress,
        search
      }
    });

  } catch (error) {
    logger.error('Get audit logs error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving audit logs'
    });
      return;
        return;
  }
});

/**
 * @route GET /api/v1/audit/logs/:logId
 * @desc Get a specific audit log entry
 * @access Private - Admin/Security/Auditor roles only
 */
router.get('/logs/:logId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { domainAuditService } = await getServices();
    const { logId } = req.params;

    // Use AuditRepository method through domain service
    const auditRepository = domainAuditService.getAuditRepository();
    const log = await auditRepository.getAuditLogById(logId);

    if (!log) {
      res.status(404).json({
        error: 'Log Not Found',
        message: 'Audit log entry not found'
      });
      return;
        return;
      return;
    }

    res.json({
      message: 'Audit log retrieved successfully',
      log
    });

  } catch (error) {
    logger.error('Get audit log error', { error, logId: req.params.logId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving the audit log'
    });
      return;
        return;
  }
});

/**
 * @route GET /api/v1/audit/events/types
 * @desc Get all available event types
 * @access Private - Admin/Security/Auditor roles only
 */
router.get('/events/types', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { domainAuditService } = await getServices();
    // Use AuditRepository method through domain service
    const auditRepository = domainAuditService.getAuditRepository();
    const eventTypes = await auditRepository.getAuditEventTypes();

    res.json({
      message: 'Event types retrieved successfully',
      eventTypes
    });

  } catch (error) {
    logger.error('Get event types error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving event types'
    });
      return;
        return;
  }
});

/**
 * @route GET /api/v1/audit/stats
 * @desc Get audit statistics and metrics
 * @access Private - Admin/Security/Auditor roles only
 */
router.get('/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { domainAuditService } = await getServices();
    const { timeframe = '24h' } = req.query;

    // Validate timeframe
    const validTimeframes = ['1h', '24h', '7d', '30d'];
    const selectedTimeframe = validTimeframes.includes(timeframe as string) 
      ? (timeframe as '1h' | '24h' | '7d' | '30d') 
      : '24h';

    // Use AuditRepository method through domain service
    const auditRepository = domainAuditService.getAuditRepository();
    const statistics = await auditRepository.getAuditStatistics(selectedTimeframe);

    res.json({
      message: 'Audit statistics retrieved successfully',
      timeframe: selectedTimeframe,
      statistics
    });

  } catch (error) {
    logger.error('Get audit stats error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving audit statistics'
    });
      return;
        return;
  }
});

/**
 * @route POST /api/v1/audit/export
 * @desc Export audit logs in various formats
 * @access Private - Admin/Security/Auditor roles only
 */
router.post('/export', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { error, value } = validateWithZod(exportSchema, req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
      return;
        return;
      return;
    }

    const { startDate, endDate, format } = value;

    // Get export data using AuditService (which uses TypeORM methods)
    const exportData = await auditService.exportLogs(startDate, endDate, format);
    
    // Parse the export data if it's a string
    let parsedData;
    try {
      parsedData = typeof exportData === 'string' ? JSON.parse(exportData) : exportData;
    } catch (error) {
      parsedData = { data: exportData, recordCount: 0 };
    }

    await auditService.logSecurityEvent({
      eventType: AuditEventType.AUDIT_EXPORT,
      userId: (req as any).user.userId,
      details: {
        format: value.format,
        eventType: value.eventType,
        startDate: value.startDate,
        endDate: value.endDate,
        recordCount: parsedData.recordCount
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Set appropriate headers based on format
    switch (value.format) {
      case 'csv':
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
        break;
      case 'xml':
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.xml"`);
        break;
      default:
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.json"`);
    }

    // Send the actual data with appropriate headers
    if (value.format === 'json') {
      res.json({
        message: 'Audit logs exported successfully',
        format,
        recordCount: parsedData.recordCount,
        exportedAt: new Date().toISOString(),
        data: parsedData.data || exportData
      });
    } else {
      res.send(parsedData.data || exportData);
    }

  } catch (error) {
    logger.error('Export audit logs error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while exporting audit logs'
    });
      return;
        return;
  }
});

/**
 * @route POST /api/v1/audit/compliance-report
 * @desc Generate compliance reports
 * @access Private - Admin/Security/Auditor roles only
 */
router.post('/compliance-report', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { error, value } = validateWithZod(complianceReportSchema, req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
      return;
        return;
      return;
    }

    const { startDate, endDate, format, includeDetails, complianceFramework } = value;

    // Generate compliance report using AuditService (which uses TypeORM methods)
    const report = await auditService.generateComplianceReport({
      startDate,
      endDate,
      includeDetails,
      complianceFramework
    });

    await auditService.logSecurityEvent({
      eventType: AuditEventType.COMPLIANCE_REPORT_GENERATED,
      userId: (req as any).user.userId,
      details: {
        reportType: value.reportType,
        startDate: value.startDate,
        endDate: value.endDate,
        format: value.format
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    if (format === 'json') {
      res.json(report);
    } else {
      res.send(JSON.stringify(report));
    }

  } catch (error) {
    logger.error('Generate compliance report error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while generating the compliance report'
    });
      return;
        return;
  }
});

/**
 * @route GET /api/v1/audit/user-activity/:userId
 * @desc Get audit trail for a specific user
 * @access Private - Admin/Security/Auditor roles only
 */
router.get('/user-activity/:userId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { domainAuditService } = await getServices();
    const { userId } = req.params;
    const { page = 1, limit = 20, startDate, endDate, eventType } = req.query;

    // Calculate offset for pagination
    const offset = (Number(page) - 1) * Number(limit);

    // Use AuditRepository method through domain service
    const auditRepository = domainAuditService.getAuditRepository();
    const result = await auditRepository.getUserActivityAuditTrail({
      userId,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      eventType: eventType as AuditEventType,
      limit: Number(limit),
      offset
    });

    res.json({
      message: 'User activity retrieved successfully',
      userId,
      userEmail: result.activities[0]?.user?.email || null,
      userRole: result.activities[0]?.user?.role || null,
      activities: result.activities,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.total,
        pages: Math.ceil(result.total / Number(limit))
      }
    });

  } catch (error) {
    logger.error('Get user activity error', { error, targetUserId: req.params.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving user activity'
    });
      return;
        return;
  }
});

/**
 * @route DELETE /api/v1/audit/cleanup
 * @desc Clean up old audit logs based on retention policy
 * @access Private - Admin only
 */
router.delete('/cleanup', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // Use AuditService method (which uses TypeORM methods)
    const result = await auditService.cleanupOldLogs();

    await auditService.logSecurityEvent({
      eventType: AuditEventType.AUDIT_CLEANUP,
      userId: (req as any).user.userId,
      details: {
        deletedCount: result.deleted,
        oldestRetainedDate: result.archived
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'Audit cleanup completed successfully',
      result
    });

  } catch (error) {
    logger.error('Audit cleanup error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred during audit cleanup'
    });
      return;
        return;
  }
});

export default router; 