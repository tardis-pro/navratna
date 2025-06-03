import express, { Router } from 'express';
import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { authMiddleware, requireAdmin } from '@uaip/middleware';
import { validateRequest } from '@uaip/middleware';
import { AuditService } from '../services/auditService.js';
import { DatabaseService } from '@uaip/shared-services';
import { AuditEventType } from '@uaip/types';

const router: Router = express.Router();
const databaseService = new DatabaseService();
const auditService = new AuditService(databaseService);

// Validation schemas using Zod
const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  eventType: z.string().optional(),
  userId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  ipAddress: z.string().ip().optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['created_at', 'event_type', 'user_id']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

const exportSchema = z.object({
  format: z.enum(['json', 'csv', 'xml']).default('json'),
  eventType: z.string().optional(),
  userId: z.string().uuid().optional(),
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
    const { error, value } = validateWithZod(auditQuerySchema, req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
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

    // Build query
    let query = `
      SELECT 
        sal.id,
        sal.event_type,
        sal.user_id,
        sal.details,
        sal.ip_address,
        sal.user_agent,
        sal.created_at,
        u.email as user_email
      FROM security_audit_logs sal
      LEFT JOIN users u ON sal.user_id = u.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 0;

    // Add filters
    if (eventType) {
      paramCount++;
      query += ` AND sal.event_type = $${paramCount}`;
      params.push(eventType);
    }

    if (userId) {
      paramCount++;
      query += ` AND sal.user_id = $${paramCount}`;
      params.push(userId);
    }

    if (startDate) {
      paramCount++;
      query += ` AND sal.created_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND sal.created_at <= $${paramCount}`;
      params.push(endDate);
    }

    if (ipAddress) {
      paramCount++;
      query += ` AND sal.ip_address = $${paramCount}`;
      params.push(ipAddress);
    }

    if (search) {
      paramCount++;
      query += ` AND (sal.event_type ILIKE $${paramCount} OR sal.details::text ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    // Add sorting
    query += ` ORDER BY sal.${sortBy} ${sortOrder.toUpperCase()}`;

    // Add pagination
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await databaseService.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) 
      FROM security_audit_logs sal
      LEFT JOIN users u ON sal.user_id = u.id
      WHERE 1=1
    `;
    const countParams: any[] = [];
    let countParamCount = 0;

    // Apply same filters for count
    if (eventType) {
      countParamCount++;
      countQuery += ` AND sal.event_type = $${countParamCount}`;
      countParams.push(eventType);
    }

    if (userId) {
      countParamCount++;
      countQuery += ` AND sal.user_id = $${countParamCount}`;
      countParams.push(userId);
    }

    if (startDate) {
      countParamCount++;
      countQuery += ` AND sal.created_at >= $${countParamCount}`;
      countParams.push(startDate as string);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND sal.created_at <= $${countParamCount}`;
      countParams.push(endDate as string);
    }

    if (ipAddress) {
      countParamCount++;
      countQuery += ` AND sal.ip_address = $${countParamCount}`;
      countParams.push(ipAddress);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (sal.event_type ILIKE $${countParamCount} OR sal.details::text ILIKE $${countParamCount} OR u.email ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await databaseService.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      message: 'Audit logs retrieved successfully',
      logs: result.rows,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
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
  }
});

/**
 * @route GET /api/v1/audit/logs/:logId
 * @desc Get a specific audit log entry
 * @access Private - Admin/Security/Auditor roles only
 */
router.get('/logs/:logId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { logId } = req.params;

    const query = `
      SELECT 
        sal.id,
        sal.event_type,
        sal.user_id,
        sal.details,
        sal.ip_address,
        sal.user_agent,
        sal.created_at,
        u.email as user_email,
        u.role as user_role
      FROM security_audit_logs sal
      LEFT JOIN users u ON sal.user_id = u.id
      WHERE sal.id = $1
    `;

    const result = await databaseService.query(query, [logId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Log Not Found',
        message: 'Audit log entry not found'
      });
    }

    res.json({
      message: 'Audit log retrieved successfully',
      log: result.rows[0]
    });

  } catch (error) {
    logger.error('Get audit log error', { error, logId: req.params.logId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving the audit log'
    });
  }
});

/**
 * @route GET /api/v1/audit/events/types
 * @desc Get all available event types
 * @access Private - Admin/Security/Auditor roles only
 */
router.get('/events/types', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT event_type, COUNT(*) as count
      FROM security_audit_logs
      GROUP BY event_type
      ORDER BY count DESC, event_type ASC
    `;

    const result = await databaseService.query(query);

    res.json({
      message: 'Event types retrieved successfully',
      eventTypes: result.rows
    });

  } catch (error) {
    logger.error('Get event types error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving event types'
    });
  }
});

/**
 * @route GET /api/v1/audit/stats
 * @desc Get audit statistics and metrics
 * @access Private - Admin/Security/Auditor roles only
 */
router.get('/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;

    let timeCondition = '';
    switch (timeframe) {
      case '1h':
        timeCondition = "created_at >= NOW() - INTERVAL '1 hour'";
        break;
      case '24h':
        timeCondition = "created_at >= NOW() - INTERVAL '24 hours'";
        break;
      case '7d':
        timeCondition = "created_at >= NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        timeCondition = "created_at >= NOW() - INTERVAL '30 days'";
        break;
      default:
        timeCondition = "created_at >= NOW() - INTERVAL '24 hours'";
    }

    // Get event statistics
    const eventStatsQuery = `
      SELECT 
        event_type,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT ip_address) as unique_ips
      FROM security_audit_logs 
      WHERE ${timeCondition}
      GROUP BY event_type
      ORDER BY count DESC
    `;

    const eventStats = await databaseService.query(eventStatsQuery);

    // Get hourly distribution
    const hourlyStatsQuery = `
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
      FROM security_audit_logs 
      WHERE ${timeCondition}
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `;

    const hourlyStats = await databaseService.query(hourlyStatsQuery);

    // Get top users by activity
    const topUsersQuery = `
      SELECT 
        sal.user_id,
        u.email,
        COUNT(*) as event_count
      FROM security_audit_logs sal
      LEFT JOIN users u ON sal.user_id = u.id
      WHERE ${timeCondition} AND sal.user_id IS NOT NULL
      GROUP BY sal.user_id, u.email
      ORDER BY event_count DESC
      LIMIT 10
    `;

    const topUsers = await databaseService.query(topUsersQuery);

    // Get top IP addresses
    const topIPsQuery = `
      SELECT 
        ip_address,
        COUNT(*) as event_count,
        COUNT(DISTINCT user_id) as unique_users
      FROM security_audit_logs 
      WHERE ${timeCondition} AND ip_address IS NOT NULL
      GROUP BY ip_address
      ORDER BY event_count DESC
      LIMIT 10
    `;

    const topIPs = await databaseService.query(topIPsQuery);

    res.json({
      message: 'Audit statistics retrieved successfully',
      timeframe,
      statistics: {
        eventTypes: eventStats.rows,
        hourlyDistribution: hourlyStats.rows,
        topUsers: topUsers.rows,
        topIPAddresses: topIPs.rows,
        summary: {
          totalEvents: eventStats.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
          uniqueUsers: new Set(topUsers.rows.map(row => row.user_id)).size,
          uniqueIPs: new Set(topIPs.rows.map(row => row.ip_address)).size
        }
      }
    });

  } catch (error) {
    logger.error('Get audit stats error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving audit statistics'
    });
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
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
    }

    const { startDate, endDate, format } = value;

    // Get export data
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
        recordCount: parsedData.recordCount || 0
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

    res.json({
      message: 'Audit logs exported successfully',
      format,
      recordCount: parsedData.recordCount || 0,
      exportedAt: new Date().toISOString()
    });

    // Send the actual data
    res.send(parsedData.data || exportData);

  } catch (error) {
    logger.error('Export audit logs error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while exporting audit logs'
    });
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
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
    }

    const { startDate, endDate, format, includeDetails, complianceFramework } = value;

    // Generate compliance report
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
  }
});

/**
 * @route GET /api/v1/audit/user-activity/:userId
 * @desc Get audit trail for a specific user
 * @access Private - Admin/Security/Auditor roles only
 */
router.get('/user-activity/:userId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, startDate, endDate, eventType } = req.query;

    // Validate userId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(400).json({
        error: 'Invalid User ID',
        message: 'User ID must be a valid UUID'
      });
    }

    let query = `
      SELECT 
        sal.id,
        sal.event_type,
        sal.details,
        sal.ip_address,
        sal.user_agent,
        sal.created_at,
        u.email,
        u.role
      FROM security_audit_logs sal
      JOIN users u ON sal.user_id = u.id
      WHERE sal.user_id = $1
    `;

    const params: any[] = [userId];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      query += ` AND sal.created_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND sal.created_at <= $${paramCount}`;
      params.push(endDate);
    }

    if (eventType) {
      paramCount++;
      query += ` AND sal.event_type = $${paramCount}`;
      params.push(eventType);
    }

    query += ` ORDER BY sal.created_at DESC`;

    // Add pagination
    const offset = (Number(page) - 1) * Number(limit);
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(Number(limit));

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await databaseService.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) 
      FROM security_audit_logs sal
      WHERE sal.user_id = $1
    `;
    const countParams = [userId];
    let countParamCount = 1;

    if (startDate) {
      countParamCount++;
      countQuery += ` AND sal.created_at >= $${countParamCount}`;
      countParams.push(startDate as string);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND sal.created_at <= $${countParamCount}`;
      countParams.push(endDate as string);
    }

    if (eventType) {
      countParamCount++;
      countQuery += ` AND sal.event_type = $${countParamCount}`;
      countParams.push(eventType as string);
    }

    const countResult = await databaseService.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      message: 'User activity retrieved successfully',
      userId,
      userEmail: result.rows[0]?.email || null,
      userRole: result.rows[0]?.role || null,
      activities: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / Number(limit))
      }
    });

  } catch (error) {
    logger.error('Get user activity error', { error, targetUserId: req.params.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving user activity'
    });
  }
});

/**
 * @route DELETE /api/v1/audit/cleanup
 * @desc Clean up old audit logs based on retention policy
 * @access Private - Admin only
 */
router.delete('/cleanup', authMiddleware, requireAdmin, async (req, res) => {
  try {
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
  }
});

export default router; 