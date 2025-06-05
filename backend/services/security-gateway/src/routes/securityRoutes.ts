import express, { Router } from 'express';
import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { authMiddleware, requireAdmin, requireOperator } from '@uaip/middleware';
import { validateRequest } from '@uaip/middleware';
import { DatabaseService, EventBusService } from '@uaip/shared-services';
import { AuditService } from '../services/auditService.js';
import { NotificationService } from '../services/notificationService.js';
import { AuditEventType, SecurityLevel } from '@uaip/types';
import { SecurityGatewayService } from '../services/securityGatewayService.js';
import { ApprovalWorkflowService } from '../services/approvalWorkflowService.js';
import { config } from '@uaip/config';

const router: Router = express.Router();

// Lazy initialization of services
let databaseService: DatabaseService | null = null;
let auditService: AuditService | null = null;

async function getServices() {
  if (!databaseService) {
    databaseService = new DatabaseService();
    await databaseService.initialize();
    auditService = new AuditService(databaseService);
  }
  return { databaseService, auditService: auditService! };
}

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
    
    const filters: any = {};
    
    if (active !== undefined) {
      filters.active = active === 'true';
    }
    
    if (search) {
      filters.search = search as string;
    }
    
    filters.limit = Number(limit);
    filters.offset = (Number(page) - 1) * Number(limit);

    const { policies, total } = await databaseService.querySecurityPolicies(filters);

    res.json({
      message: 'Security policies retrieved successfully',
      policies,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
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

    const policy = await databaseService.getSecurityPolicy(policyId);
    
    if (!policy) {
      return res.status(404).json({
        error: 'Policy Not Found',
        message: 'Security policy not found'
      });
    }

    res.json({
      message: 'Security policy retrieved successfully',
      policy
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

    // Create policy using DatabaseService
    const newPolicy = await databaseService.createSecurityPolicy({
      name: value.name,
      description: value.description,
      priority: value.priority,
      isActive: value.isActive,
      conditions: value.conditions,
      actions: value.actions,
      createdBy: userId
    });

    await auditService.logSecurityEvent({
      eventType: AuditEventType.POLICY_CREATED,
      userId,
      details: {
        policyId: newPolicy.id,
        policyName: newPolicy.name,
        priority: newPolicy.priority,
        isActive: newPolicy.isActive
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
    const existingPolicy = await databaseService.getSecurityPolicy(policyId);

    if (!existingPolicy) {
      return res.status(404).json({
        error: 'Policy Not Found',
        message: 'Security policy not found'
      });
    }

    if (Object.keys(value).length === 0) {
      return res.status(400).json({
        error: 'No Updates',
        message: 'No valid fields provided for update'
      });
    }

    // Update policy using DatabaseService
    const updatedPolicy = await databaseService.updateSecurityPolicy(policyId, value);

    if (!updatedPolicy) {
      return res.status(500).json({
        error: 'Update Failed',
        message: 'Failed to update security policy'
      });
    }

    await auditService.logSecurityEvent({
      eventType: AuditEventType.POLICY_UPDATED,
      userId,
      details: {
        policyId: updatedPolicy.id,
        policyName: updatedPolicy.name,
        changes: Object.keys(value),
        priority: updatedPolicy.priority,
        isActive: updatedPolicy.isActive
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
    const existingPolicy = await databaseService.getSecurityPolicy(policyId);

    if (!existingPolicy) {
      return res.status(404).json({
        error: 'Policy Not Found',
        message: 'Security policy not found'
      });
    }

    // Delete policy using DatabaseService
    const deleted = await databaseService.deleteSecurityPolicy(policyId);

    if (!deleted) {
      return res.status(500).json({
        error: 'Delete Failed',
        message: 'Failed to delete security policy'
      });
    }

    await auditService.logSecurityEvent({
      eventType: AuditEventType.POLICY_DELETED,
      userId,
      details: {
        policyId: existingPolicy.id,
        policyName: existingPolicy.name,
        priority: existingPolicy.priority,
        wasActive: existingPolicy.isActive
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
    
    let startDate: Date;
    const endDate = new Date();
    
    switch (timeframe) {
      case '1h':
        startDate = new Date(endDate.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    }

    // Get security event statistics using DatabaseService
    const eventStats = await databaseService.queryAuditEvents({
      startDate,
      endDate,
      limit: 1000
    });

    // Group events by type
    const eventsByType = eventStats.reduce((acc: Record<string, number>, event) => {
      acc[event.eventType] = (acc[event.eventType] || 0) + 1;
      return acc;
    }, {});

    // Get risk assessment statistics
    const riskAssessmentEvents = await databaseService.queryAuditEvents({
      eventTypes: ['RISK_ASSESSMENT'],
      startDate,
      endDate,
      limit: 1000
    });

    const riskStats = riskAssessmentEvents.reduce((acc, event) => {
      const riskScore = event.details?.riskScore;
      if (typeof riskScore === 'number') {
        acc.totalAssessments++;
        acc.totalRiskScore += riskScore;
        
        if (riskScore >= 70) acc.highRiskCount++;
        else if (riskScore >= 40) acc.mediumRiskCount++;
        else acc.lowRiskCount++;
      }
      return acc;
    }, {
      totalAssessments: 0,
      totalRiskScore: 0,
      highRiskCount: 0,
      mediumRiskCount: 0,
      lowRiskCount: 0
    });

    // Get active policies count using DatabaseService
    const policyStats = await databaseService.getSecurityPolicyStats();

    res.json({
      message: 'Security statistics retrieved successfully',
      timeframe,
      statistics: {
        events: Object.entries(eventsByType).map(([eventType, count]) => ({
          event_type: eventType,
          count
        })),
        riskAssessments: {
          total_assessments: riskStats.totalAssessments,
          avg_risk_score: riskStats.totalAssessments > 0 
            ? riskStats.totalRiskScore / riskStats.totalAssessments 
            : 0,
          high_risk_count: riskStats.highRiskCount,
          medium_risk_count: riskStats.mediumRiskCount,
          low_risk_count: riskStats.lowRiskCount
        },
        policies: {
          total_policies: policyStats.totalPolicies,
          active_policies: policyStats.activePolicies,
          inactive_policies: policyStats.inactivePolicies
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