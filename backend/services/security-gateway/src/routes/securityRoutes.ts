import express, { Router } from '@uaip/shared-services';
import { Request, Response } from '@uaip/shared-services';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { authMiddleware, requireAdmin, requireOperator } from '@uaip/middleware';
import { validateRequest } from '@uaip/middleware';
import {
  SecurityService,
  EventBusService,
  AuditService as DomainAuditService,
  DatabaseService,
} from '@uaip/shared-services';
import { AuditService } from '../services/auditService.js';
import { NotificationService } from '../services/notificationService.js';
import { AuditEventType, SecurityLevel } from '@uaip/types';
import { SecurityGatewayService } from '../services/securityGatewayService.js';
import { ApprovalWorkflowService } from '../services/approvalWorkflowService.js';
import { config } from '@uaip/config';

const router = Router();

// Lazy initialization of services
let securityService: SecurityService | null = null;
let auditService: AuditService | null = null;
let domainAuditService: DomainAuditService | null = null;

async function getServices() {
  if (!securityService) {
    securityService = SecurityService.getInstance();
    auditService = new AuditService();
    domainAuditService = DomainAuditService.getInstance();
  }
  return { securityService, auditService: auditService!, domainAuditService: domainAuditService! };
}

// Initialize services lazily to ensure proper initialization order
let notificationService: NotificationService | null = null;
let eventBusService: EventBusService | null = null;
let approvalWorkflowService: ApprovalWorkflowService | null = null;
let securityGatewayService: SecurityGatewayService | null = null;

async function getSecurityServices() {
  const { securityService, auditService, domainAuditService } = await getServices();
  // Use a proper DatabaseService instance
  const databaseService = DatabaseService.getInstance();
  await databaseService.initialize();

  if (!notificationService) {
    notificationService = new NotificationService();
  }

  if (!eventBusService) {
    eventBusService = new EventBusService(
      {
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
        serviceName: 'security-gateway',
      },
      logger
    );
  }

  if (!approvalWorkflowService) {
    approvalWorkflowService = new ApprovalWorkflowService(
      databaseService,
      eventBusService,
      notificationService,
      auditService
    );
  }

  if (!securityGatewayService) {
    securityGatewayService = new SecurityGatewayService(
      databaseService,
      approvalWorkflowService,
      auditService
    );
  }

  return {
    databaseService,
    auditService,
    notificationService,
    eventBusService,
    approvalWorkflowService,
    securityGatewayService,
  };
}

// Validation schemas using Zod
const riskAssessmentSchema = z.object({
  operationType: z.enum(['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE', 'DEPLOY', 'CONFIGURE']),
  resourceType: z.enum(['AGENT', 'WORKFLOW', 'DATA', 'SYSTEM', 'USER', 'POLICY', 'CONFIGURATION']),
  resourceId: z.string().optional(),
  context: z
    .object({
      environment: z.enum(['development', 'staging', 'production']).optional(),
      urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      businessJustification: z.string().optional(),
      additionalContext: z.record(z.any()).optional(),
    })
    .optional(),
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
    timeRestrictions: z
      .object({
        allowedHours: z.array(z.number().min(0).max(23)).optional(),
        allowedDays: z.array(z.number().min(0).max(6)).optional(),
        timezone: z.string().optional(),
      })
      .optional(),
    environmentRestrictions: z.array(z.string()).optional(),
    riskThresholds: z
      .object({
        minRiskScore: z.number().min(0).max(100).optional(),
        maxRiskScore: z.number().min(0).max(100).optional(),
      })
      .optional(),
  }),
  actions: z.object({
    requireApproval: z.boolean().default(false),
    approvalRequirements: z
      .object({
        minimumApprovers: z.number().int().min(1).optional(),
        requiredRoles: z.array(z.string()).optional(),
        timeoutHours: z.number().min(1).max(168).optional(), // 1 hour to 1 week
      })
      .optional(),
    blockOperation: z.boolean().default(false),
    logLevel: z.enum(['info', 'warn', 'error']).default('info'),
    notificationChannels: z.array(z.string()).optional(),
    additionalActions: z.record(z.any()).optional(),
  }),
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
        details: result.error.errors.map((err) => ({
          message: err.message,
          path: err.path.join('.'),
        })),
      },
      value: null,
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
      res.status(400).json({
        error: 'Validation Error',
        details: error.details.map((d) => d.message),
      });
    }

    const userId = (req as any).user.userId;
    const userRole = (req as any).user.role;

    const { securityGatewayService, auditService } = await getSecurityServices();

    const riskAssessment = await securityGatewayService.assessRisk({
      ...value,
      userId,
      userRole,
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await auditService.logSecurityEvent({
      eventType: AuditEventType.RISK_ASSESSMENT,
      userId,
      details: {
        operationType: value.operationType,
        resourceType: value.resourceType,
        resourceId: value.resourceId,
        riskScore: riskAssessment.score,
        riskLevel: riskAssessment.overallRisk,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      message: 'Risk assessment completed',
      assessment: riskAssessment,
    });
  } catch (error) {
    logger.error('Risk assessment error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred during risk assessment',
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
      res.status(400).json({
        error: 'Validation Error',
        details: error.details.map((d) => d.message),
      });
    }

    const userId = (req as any).user.userId;
    const userRole = (req as any).user.role;

    const { securityGatewayService } = await getSecurityServices();

    const approvalRequired = await securityGatewayService.requiresApproval({
      ...value,
      userId,
      userRole,
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      message: 'Approval requirement check completed',
      requiresApproval: approvalRequired.required,
      requirements: approvalRequired.requirements,
      matchedPolicies: approvalRequired.matchedPolicies,
    });
  } catch (error) {
    logger.error('Approval check error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred during approval requirement check',
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
    const { securityService } = await getServices();
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

    const securityPolicyRepo = securityService.getSecurityPolicyRepository();
    const { policies, total } = await securityPolicyRepo.querySecurityPolicies(filters);

    res.json({
      message: 'Security policies retrieved successfully',
      policies,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error('Get policies error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving security policies',
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
    const { securityService } = await getServices();
    const { policyId } = req.params;

    const securityPolicyRepo = securityService.getSecurityPolicyRepository();
    const policy = await securityPolicyRepo.getSecurityPolicy(policyId);

    if (!policy) {
      res.status(404).json({
        error: 'Policy Not Found',
        message: 'Security policy not found',
      });
    }

    res.json({
      message: 'Security policy retrieved successfully',
      policy,
    });
  } catch (error) {
    logger.error('Get policy error', { error, policyId: req.params.policyId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving the security policy',
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
    const { securityService } = await getServices();
    const { error, value } = validateWithZod(securityPolicySchema, req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.details.map((d) => d.message),
      });
    }

    const userId = (req as any).user.userId;

    // Create policy using SecurityService
    const securityPolicyRepo = securityService.getSecurityPolicyRepository();
    const newPolicy = await securityPolicyRepo.createSecurityPolicy({
      name: value.name,
      description: value.description,
      priority: value.priority,
      isActive: value.isActive,
      conditions: value.conditions,
      actions: value.actions,
      createdBy: userId,
    });

    const { auditService } = await getSecurityServices();
    await auditService.logSecurityEvent({
      eventType: AuditEventType.POLICY_CREATED,
      userId,
      details: {
        policyId: newPolicy.id,
        policyName: newPolicy.name,
        priority: newPolicy.priority,
        isActive: newPolicy.isActive,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      message: 'Security policy created successfully',
      policy: newPolicy,
    });
  } catch (error) {
    logger.error('Create policy error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while creating the security policy',
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
    const { securityService } = await getServices();
    const { policyId } = req.params;
    const { error, value } = validateWithZod(updatePolicySchema, req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.details.map((d) => d.message),
      });
    }

    const userId = (req as any).user.userId;

    // Check if policy exists
    const securityPolicyRepo = securityService.getSecurityPolicyRepository();
    const existingPolicy = await securityPolicyRepo.getSecurityPolicy(policyId);

    if (!existingPolicy) {
      res.status(404).json({
        error: 'Policy Not Found',
        message: 'Security policy not found',
      });
    }

    if (Object.keys(value).length === 0) {
      res.status(400).json({
        error: 'No Updates',
        message: 'No valid fields provided for update',
      });
    }

    // Update policy using SecurityService
    const updatedPolicy = await securityPolicyRepo.updateSecurityPolicy(policyId, value);

    if (!updatedPolicy) {
      res.status(500).json({
        error: 'Update Failed',
        message: 'Failed to update security policy',
      });
    }

    const { auditService } = await getSecurityServices();
    await auditService.logSecurityEvent({
      eventType: AuditEventType.POLICY_UPDATED,
      userId,
      details: {
        policyId: updatedPolicy.id,
        policyName: updatedPolicy.name,
        changes: Object.keys(value),
        priority: updatedPolicy.priority,
        isActive: updatedPolicy.isActive,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      message: 'Security policy updated successfully',
      policy: updatedPolicy,
    });
  } catch (error) {
    logger.error('Update policy error', { error, policyId: req.params.policyId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating the security policy',
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
    const { securityService } = await getServices();
    const { policyId } = req.params;
    const userId = (req as any).user.userId;

    // Check if policy exists
    const securityPolicyRepo = securityService.getSecurityPolicyRepository();
    const existingPolicy = await securityPolicyRepo.getSecurityPolicy(policyId);

    if (!existingPolicy) {
      res.status(404).json({
        error: 'Policy Not Found',
        message: 'Security policy not found',
      });
    }

    // Delete policy using SecurityService
    const deleted = await securityPolicyRepo.deleteSecurityPolicy(policyId);

    if (!deleted) {
      res.status(500).json({
        error: 'Delete Failed',
        message: 'Failed to delete security policy',
      });
    }

    const { auditService } = await getSecurityServices();
    await auditService.logSecurityEvent({
      eventType: AuditEventType.POLICY_DELETED,
      userId,
      details: {
        policyId: existingPolicy.id,
        policyName: existingPolicy.name,
        priority: existingPolicy.priority,
        wasActive: existingPolicy.isActive,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      message: 'Security policy deleted successfully',
    });
  } catch (error) {
    logger.error('Delete policy error', { error, policyId: req.params.policyId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while deleting the security policy',
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

    // Get security event statistics using AuditService
    const { domainAuditService } = await getServices();
    const auditRepo = domainAuditService.getAuditRepository();
    const eventStats = await auditRepo.queryAuditEvents({
      startDate,
      endDate,
      limit: 1000,
    });

    // Group events by type
    const eventsByType = eventStats.reduce(
      (acc: Record<AuditEventType, number>, event) => {
        acc[event.eventType] = acc[event.eventType] + 1;
        return acc;
      },
      {} as Record<AuditEventType, number>
    );

    // Get risk assessment statistics
    const riskAssessmentEvents = await auditRepo.queryAuditEvents({
      eventTypes: [AuditEventType.RISK_ASSESSMENT],
      startDate,
      endDate,
      limit: 1000,
    });

    const riskStats = riskAssessmentEvents.reduce(
      (acc, event) => {
        const riskScore = event.details?.riskScore;
        if (typeof riskScore === 'number') {
          acc.totalAssessments++;
          acc.totalRiskScore += riskScore;

          if (riskScore >= 70) acc.highRiskCount++;
          else if (riskScore >= 40) acc.mediumRiskCount++;
          else acc.lowRiskCount++;
        }
        return acc;
      },
      {
        totalAssessments: 0,
        totalRiskScore: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
      }
    );

    // Get active policies count using SecurityService
    const { securityService } = await getServices();
    const securityPolicyRepo = securityService.getSecurityPolicyRepository();
    const policyStats = await securityPolicyRepo.getSecurityPolicyStats();

    res.json({
      message: 'Security statistics retrieved successfully',
      timeframe,
      statistics: {
        events: Object.entries(eventsByType).map(([eventType, count]) => ({
          event_type: eventType,
          count,
        })),
        riskAssessments: {
          total_assessments: riskStats.totalAssessments,
          avg_risk_score:
            riskStats.totalAssessments > 0
              ? riskStats.totalRiskScore / riskStats.totalAssessments
              : 0,
          high_risk_count: riskStats.highRiskCount,
          medium_risk_count: riskStats.mediumRiskCount,
          low_risk_count: riskStats.lowRiskCount,
        },
        policies: {
          total_policies: policyStats.totalPolicies,
          active_policies: policyStats.activePolicies,
          inactive_policies: policyStats.inactivePolicies,
        },
      },
    });
  } catch (error) {
    logger.error('Get security stats error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving security statistics',
    });
  }
});

export default router;
