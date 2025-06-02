import express, { Router } from 'express';
import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '@uaip/utils/src/logger';
import { ApiError } from '@uaip/utils';
import { authMiddleware, requireAdmin } from '@uaip/middleware';
import { validateRequest } from '@uaip/middleware';
import { DatabaseService } from '@uaip/shared-services';
import { AuditService } from '@/services/auditService';
import { NotificationService } from '@/services/notificationService';
import { AuditEventType } from '@uaip/types';
import { SecurityGatewayService } from '@/services/securityGatewayService';
import { ApprovalWorkflowService } from '@/services/approvalWorkflowService';
import { EventBusService } from '@uaip/shared-services';

const router: Router = express.Router();
const databaseService = new DatabaseService();
const auditService = new AuditService(databaseService);
const notificationService = new NotificationService();
const eventBusService = new EventBusService(
  {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    serviceName: 'security-gateway'
  },
  logger
);
const approvalWorkflowService = new ApprovalWorkflowService(
  databaseService,
  eventBusService,
  notificationService,
  auditService
);
const securityGatewayService = new SecurityGatewayService(databaseService, approvalWorkflowService, auditService);

// Validation schemas using Zod
const riskAssessmentSchema = z.object({
  operationType: z.enum(['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE', 'DEPLOY', 'CONFIGURE']),
  resourceType: z.enum(['AGENT', 'WORKFLOW', 'DATA', 'SYSTEM', 'USER', 'POLICY', 'CONFIGURATION']),
  resourceId: z.string().optional(),
  context: z.object({
    environment: z.enum(['development', 'staging', 'production']).optional(),
    urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    businessJustification: z.string().optional(),
    additionalContext: z.record(z.any()).optional()
  }).optional()
});

const securityPolicySchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500),
  priority: z.number().int().min(1).max(100),
  isActive: z.boolean().default(true),
  conditions: z.object({
    operationTypes: z.array(z.string()).optional(),
    resourceTypes: z.array(z.string()).optional(),
    userRoles: z.array(z.string()).optional(),
    timeRestrictions: z.object({
      allowedHours: z.array(z.number().min(0).max(23)).optional(),
      allowedDays: z.array(z.number().min(0).max(6)).optional(),
      timezone: z.string().optional()
    }).optional(),
    environmentRestrictions: z.array(z.string()).optional(),
    riskThresholds: z.object({
      minRiskScore: z.number().min(0).max(100).optional(),
      maxRiskScore: z.number().min(0).max(100).optional()
    }).optional()
  }),
  actions: z.object({
    requireApproval: z.boolean().default(false),
    approvalRequirements: z.object({
      minimumApprovers: z.number().int().min(1).optional(),
      requiredRoles: z.array(z.string()).optional(),
      timeoutHours: z.number().min(1).max(168).optional() // 1 hour to 1 week
    }).optional(),
    blockOperation: z.boolean().default(false),
    logLevel: z.enum(['info', 'warn', 'error']).default('info'),
    notificationChannels: z.array(z.string()).optional(),
    additionalActions: z.record(z.any()).optional()
  })
});

const updatePolicySchema = securityPolicySchema.partial({ name: true });

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
 * @route POST /api/v1/security/assess-risk
 * @desc Assess risk for a specific operation
 * @access Private
 */
router.post('/assess-risk', authMiddleware, async (req, res) => {
  try {
    const { error, value } = validateWithZod(riskAssessmentSchema, req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
    }

    const userId = (req as any).user.userId;
    const userRole = (req as any).user.role;

    const riskAssessment = await securityGatewayService.assessRisk({
      ...value,
      userId,
      userRole,
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await auditService.logSecurityEvent({
      eventType: AuditEventType.RISK_ASSESSMENT,
      userId,
      details: {
        operationType: value.operationType,
        resourceType: value.resourceType,
        resourceId: value.resourceId,
        riskScore: riskAssessment.score,
        riskLevel: riskAssessment.overallRisk
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'Risk assessment completed',
      assessment: riskAssessment
    });

  } catch (error) {
    logger.error('Risk assessment error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred during risk assessment'
    });
  }
});

/**
 * @route POST /api/v1/security/check-approval-required
 * @desc Check if an operation requires approval
 * @access Private
 */
router.post('/check-approval-required', authMiddleware, async (req, res) => {
  try {
    const { error, value } = validateWithZod(riskAssessmentSchema, req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
    }

    const userId = (req as any).user.userId;
    const userRole = (req as any).user.role;

    const approvalRequired = await securityGatewayService.requiresApproval({
      ...value,
      userId,
      userRole,
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'Approval requirement check completed',
      requiresApproval: approvalRequired.required,
      requirements: approvalRequired.requirements,
      matchedPolicies: approvalRequired.matchedPolicies
    });

  } catch (error) {
    logger.error('Approval check error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred during approval requirement check'
    });
  }
});

/**
 * @route GET /api/v1/security/policies
 * @desc Get all security policies
 * @access Private - Admin/Security roles only
 */
router.get('/policies', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, active, search } = req.query;
    
    let query = `
      SELECT id, name, description, priority, is_active, conditions, actions, 
             created_at, updated_at, created_by
      FROM security_policies
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (active !== undefined) {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      params.push(active === 'true');
    }

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY priority DESC, created_at DESC`;
    
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
    let countQuery = `SELECT COUNT(*) FROM security_policies WHERE 1=1`;
    const countParams: any[] = [];
    let countParamCount = 0;

    if (active !== undefined) {
      countParamCount++;
      countQuery += ` AND is_active = $${countParamCount}`;
      countParams.push(active === 'true');
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (name ILIKE $${countParamCount} OR description ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await databaseService.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      message: 'Security policies retrieved successfully',
      policies: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / Number(limit))
      }
    });

  } catch (error) {
    logger.error('Get policies error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving security policies'
    });
  }
});

/**
 * @route GET /api/v1/security/policies/:policyId
 * @desc Get a specific security policy
 * @access Private - Admin/Security roles only
 */
router.get('/policies/:policyId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { policyId } = req.params;

    const query = `
      SELECT id, name, description, priority, is_active, conditions, actions, 
             created_at, updated_at, created_by
      FROM security_policies
      WHERE id = $1
    `;
    
    const result = await databaseService.query(query, [policyId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Policy Not Found',
        message: 'Security policy not found'
      });
    }

    res.json({
      message: 'Security policy retrieved successfully',
      policy: result.rows[0]
    });

  } catch (error) {
    logger.error('Get policy error', { error, policyId: req.params.policyId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving the security policy'
    });
  }
});

/**
 * @route POST /api/v1/security/policies
 * @desc Create a new security policy
 * @access Private - Admin/Security roles only
 */
router.post('/policies', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { error, value } = validateWithZod(securityPolicySchema, req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
    }

    const userId = (req as any).user.userId;

    // Create policy
    const query = `
      INSERT INTO security_policies (
        name, description, priority, is_active, conditions, actions, 
        created_by, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `;

    const result = await databaseService.query(query, [
      value.name,
      value.description,
      value.priority,
      value.isActive,
      JSON.stringify(value.conditions),
      JSON.stringify(value.actions),
      userId
    ]);

    const newPolicy = result.rows[0];

    await auditService.logSecurityEvent({
      eventType: AuditEventType.POLICY_CREATED,
      userId,
      details: {
        policyId: newPolicy.id,
        policyName: newPolicy.name,
        priority: newPolicy.priority,
        isActive: newPolicy.is_active
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      message: 'Security policy created successfully',
      policy: newPolicy
    });

  } catch (error) {
    logger.error('Create policy error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while creating the security policy'
    });
  }
});

/**
 * @route PUT /api/v1/security/policies/:policyId
 * @desc Update a security policy
 * @access Private - Admin/Security roles only
 */
router.put('/policies/:policyId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { policyId } = req.params;
    const { error, value } = validateWithZod(updatePolicySchema, req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
    }

    const userId = (req as any).user.userId;

    // Check if policy exists
    const existingPolicy = await databaseService.query(
      'SELECT * FROM security_policies WHERE id = $1',
      [policyId]
    );

    if (existingPolicy.rows.length === 0) {
      return res.status(404).json({
        error: 'Policy Not Found',
        message: 'Security policy not found'
      });
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramCount = 0;

    if (value.name !== undefined) {
      paramCount++;
      updateFields.push(`name = $${paramCount}`);
      updateValues.push(value.name);
    }

    if (value.description !== undefined) {
      paramCount++;
      updateFields.push(`description = $${paramCount}`);
      updateValues.push(value.description);
    }

    if (value.priority !== undefined) {
      paramCount++;
      updateFields.push(`priority = $${paramCount}`);
      updateValues.push(value.priority);
    }

    if (value.isActive !== undefined) {
      paramCount++;
      updateFields.push(`is_active = $${paramCount}`);
      updateValues.push(value.isActive);
    }

    if (value.conditions !== undefined) {
      paramCount++;
      updateFields.push(`conditions = $${paramCount}`);
      updateValues.push(JSON.stringify(value.conditions));
    }

    if (value.actions !== undefined) {
      paramCount++;
      updateFields.push(`actions = $${paramCount}`);
      updateValues.push(JSON.stringify(value.actions));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No Updates',
        message: 'No valid fields provided for update'
      });
    }

    paramCount++;
    updateFields.push(`updated_at = NOW()`);
    
    paramCount++;
    const updateQuery = `
      UPDATE security_policies 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    updateValues.push(policyId);

    const result = await databaseService.query(updateQuery, updateValues);
    const updatedPolicy = result.rows[0];

    await auditService.logSecurityEvent({
      eventType: AuditEventType.POLICY_UPDATED,
      userId,
      details: {
        policyId: updatedPolicy.id,
        policyName: updatedPolicy.name,
        changes: Object.keys(value),
        priority: updatedPolicy.priority,
        isActive: updatedPolicy.is_active
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'Security policy updated successfully',
      policy: updatedPolicy
    });

  } catch (error) {
    logger.error('Update policy error', { error, policyId: req.params.policyId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating the security policy'
    });
  }
});

/**
 * @route DELETE /api/v1/security/policies/:policyId
 * @desc Delete a security policy
 * @access Private - Admin only
 */
router.delete('/policies/:policyId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { policyId } = req.params;
    const userId = (req as any).user.userId;

    // Check if policy exists
    const existingPolicy = await databaseService.query(
      'SELECT * FROM security_policies WHERE id = $1',
      [policyId]
    );

    if (existingPolicy.rows.length === 0) {
      return res.status(404).json({
        error: 'Policy Not Found',
        message: 'Security policy not found'
      });
    }

    const policy = existingPolicy.rows[0];

    // Delete policy
    await databaseService.query(
      'DELETE FROM security_policies WHERE id = $1',
      [policyId]
    );

    await auditService.logSecurityEvent({
      eventType: AuditEventType.POLICY_DELETED,
      userId,
      details: {
        policyId: policy.id,
        policyName: policy.name,
        priority: policy.priority,
        wasActive: policy.is_active
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'Security policy deleted successfully'
    });

  } catch (error) {
    logger.error('Delete policy error', { error, policyId: req.params.policyId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while deleting the security policy'
    });
  }
});

/**
 * @route GET /api/v1/security/stats
 * @desc Get security statistics and metrics
 * @access Private - Admin/Security roles only
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

    // Get security event statistics
    const eventStatsQuery = `
      SELECT 
        event_type,
        COUNT(*) as count
      FROM security_audit_logs 
      WHERE ${timeCondition}
      GROUP BY event_type
      ORDER BY count DESC
    `;

    const eventStats = await databaseService.query(eventStatsQuery);

    // Get risk assessment statistics
    const riskStatsQuery = `
      SELECT 
        COUNT(*) as total_assessments,
        AVG(CAST(details->>'riskScore' AS FLOAT)) as avg_risk_score,
        COUNT(CASE WHEN CAST(details->>'riskScore' AS FLOAT) >= 70 THEN 1 END) as high_risk_count,
        COUNT(CASE WHEN CAST(details->>'riskScore' AS FLOAT) BETWEEN 40 AND 69 THEN 1 END) as medium_risk_count,
        COUNT(CASE WHEN CAST(details->>'riskScore' AS FLOAT) < 40 THEN 1 END) as low_risk_count
      FROM security_audit_logs 
      WHERE event_type = 'RISK_ASSESSMENT' AND ${timeCondition}
    `;

    const riskStats = await databaseService.query(riskStatsQuery);

    // Get active policies count
    const policyStatsQuery = `
      SELECT 
        COUNT(*) as total_policies,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_policies,
        COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_policies
      FROM security_policies
    `;

    const policyStats = await databaseService.query(policyStatsQuery);

    res.json({
      message: 'Security statistics retrieved successfully',
      timeframe,
      statistics: {
        events: eventStats.rows,
        riskAssessments: riskStats.rows[0] || {
          total_assessments: 0,
          avg_risk_score: 0,
          high_risk_count: 0,
          medium_risk_count: 0,
          low_risk_count: 0
        },
        policies: policyStats.rows[0] || {
          total_policies: 0,
          active_policies: 0,
          inactive_policies: 0
        }
      }
    });

  } catch (error) {
    logger.error('Get security stats error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving security statistics'
    });
  }
});

export default router; 