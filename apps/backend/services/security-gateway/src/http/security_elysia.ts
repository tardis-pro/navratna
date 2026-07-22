import { Elysia, t } from 'elysia';
import { z } from 'zod';
import { withRequiredAuth, withAdminGuard } from '@uaip/middleware';
import { SecurityService, AuditService as DomainAuditService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/infra/event_bus';
import { AuditService } from '../services/audit_service.js';
import { NotificationService } from '../services/notification_service.js';
import { AuditEventType, SecurityLevel } from '@uaip/types';
import { SecurityGatewayService } from '../services/security_gateway_service.js';
import { ApprovalWorkflowService } from '../services/approval_workflow_service.js';

import { getAuthUser } from './context_helpers.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

let securityServiceSingleton: SecurityService | null = null;
let auditServiceSingleton: AuditService | null = null;
let domainAuditServiceSingleton: DomainAuditService | null = null;
let notificationServiceSingleton: NotificationService | null = null;
let eventBusServiceSingleton: EventBusService | null = null;
let approvalWorkflowServiceSingleton: ApprovalWorkflowService | null = null;
let securityGatewayServiceSingleton: SecurityGatewayService | null = null;

async function getServices() {
  if (!securityServiceSingleton) {
    securityServiceSingleton = SecurityService.getInstance();
    auditServiceSingleton = new AuditService();
    domainAuditServiceSingleton = DomainAuditService.getInstance();
  }
  return {
    securityService: securityServiceSingleton,
    auditService: auditServiceSingleton!,
    domainAuditService: domainAuditServiceSingleton!,
  };
}

async function getSecurityServices() {
  const { securityService, auditService, domainAuditService } = await getServices();
  if (!notificationServiceSingleton) notificationServiceSingleton = new NotificationService();
  if (!eventBusServiceSingleton) eventBusServiceSingleton = EventBusService.getInstance();
  if (!approvalWorkflowServiceSingleton)
    approvalWorkflowServiceSingleton = new ApprovalWorkflowService(
      eventBusServiceSingleton,
      notificationServiceSingleton,
      auditService
    );
  if (!securityGatewayServiceSingleton)
    securityGatewayServiceSingleton = new SecurityGatewayService(
      approvalWorkflowServiceSingleton,
      auditService
    );
  return {
    auditService,
    domainAuditService,
    securityService,
    notificationService: notificationServiceSingleton,
    eventBusService: eventBusServiceSingleton,
    approvalWorkflowService: approvalWorkflowServiceSingleton,
    securityGatewayService: securityGatewayServiceSingleton,
  };
}

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
        timeoutHours: z.number().min(1).max(168).optional(),
      })
      .optional(),
    blockOperation: z.boolean().default(false),
    logLevel: z.enum(['info', 'warn', 'error']).default('info'),
    notificationChannels: z.array(z.string()).optional(),
    additionalActions: z.record(z.any()).optional(),
  }),
});
const updatePolicySchema = securityPolicySchema.partial({ name: true });

type RiskStats = {
  totalAssessments: number;
  totalRiskScore: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
};

type ValidationSuccess<T> = { error: null; value: T };
type ValidationFailure = { error: { details: { message: string; path: string }[] }; value: null };

function validateWithZod<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationSuccess<T> | ValidationFailure {
  const result = schema.safeParse(data);
  if (result.success) return { error: null, value: result.data };
  return {
    error: {
      details: result.error.errors.map((e) => ({ message: e.message, path: e.path.join('.') })),
    },
    value: null,
  };
}

const RiskAssessmentBodySchema = t.Object({
  operationType: t.String(),
  resourceType: t.String(),
  resourceId: t.Optional(t.String()),
  context: t.Optional(t.Any()),
});

const ErrorSchema = t.Object({ error: t.String(), message: t.Optional(t.String()) });
const ValidationErrorSchema = t.Object({ error: t.String(), details: t.Optional(t.Any()) });

export function registerSecurityRoutes() {
  return new Elysia().group('/api/v1/security', (app) => withRequiredAuth(app)
    .post('/assess-risk', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set, body, request, headers } = ctx;
      const assessResult = validateWithZod(riskAssessmentSchema, body);
      if (assessResult.error) {
        set.status = 400;
        return {
          error: 'Validation Error',
          details: assessResult.error.details.map((d) => d.message),
        };
      }
      const value = assessResult.value;
      try {
        const { securityGatewayService, auditService } = await getSecurityServices();
        const assessment = await securityGatewayService.assessRisk({
          securityContext: {
            userId: user!.id,
            role: user!.role,
            permissions: user!.permissions || [],
            securityLevel: SecurityLevel.MEDIUM,
            sessionId: user!.sessionId || 'unknown',
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'] || '',
            lastAuthentication: new Date(),
            mfaVerified: false,
            riskScore: 0,
          },
          operation: {
            type: value.operationType,
            resource: value.resourceType,
            action: 'access',
          },
        });
        await auditService.logSecurityEvent({
          eventType: AuditEventType.RISK_ASSESSMENT,
          userId: user!.id,
          details: {
            operationType: value.operationType,
            resourceType: value.resourceType,
            resourceId: value.resourceId,
            riskScore: assessment.score,
            riskLevel: assessment.overallRisk,
          },
          ipAddress: request.headers.get('x-forwarded-for') || '',
          userAgent: headers['user-agent'],
        });
        return { message: 'Risk assessment completed', assessment };
      } catch {
        set.status = 500;
        return {
          error: 'Internal Server Error',
          message: 'An error occurred during risk assessment',
        };
      }
    }, {
      body: RiskAssessmentBodySchema,
      response: {
        200: t.Object({ message: t.String(), assessment: t.Any() }),
        400: ValidationErrorSchema,
        500: ErrorSchema,
      },
    })
    .post('/check-approval-required', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set, body, request, headers } = ctx;
      const approvalCheckResult = validateWithZod(riskAssessmentSchema, body);
      if (approvalCheckResult.error) {
        set.status = 400;
        return {
          error: 'Validation Error',
          details: approvalCheckResult.error.details.map((d) => d.message),
        };
      }
      const approvalCheckValue = approvalCheckResult.value;
      try {
        const { securityGatewayService } = await getSecurityServices();
        const approvalRequired = await securityGatewayService.requiresApproval({
          securityContext: {
            userId: user!.id,
            role: user!.role,
            permissions: user!.permissions || [],
            securityLevel: SecurityLevel.MEDIUM,
            sessionId: user!.sessionId || 'unknown',
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'] || '',
            lastAuthentication: new Date(),
            mfaVerified: false,
            riskScore: 0,
          },
          operation: {
            type: approvalCheckValue.operationType,
            resource: approvalCheckValue.resourceType,
            action: 'access',
          },
        });
        return {
          message: 'Approval requirement check completed',
          requiresApproval: approvalRequired.required,
          requirements: approvalRequired.requirements,
          matchedPolicies: approvalRequired.matchedPolicies,
        };
      } catch {
        set.status = 500;
        return {
          error: 'Internal Server Error',
          message: 'An error occurred during approval requirement check',
        };
      }
    }, {
      body: RiskAssessmentBodySchema,
      response: {
        200: t.Object({
          message: t.String(),
          requiresApproval: t.Boolean(),
          requirements: t.Optional(t.Any()),
          matchedPolicies: t.Array(t.String()),
        }),
        400: ValidationErrorSchema,
        500: ErrorSchema,
      },
    })
  
    .get('/events', async (ctx) => {
      const { set, query } = ctx;
      try {
        const { domainAuditService } = await getServices();
        const auditRepo = domainAuditService!.getAuditRepository();
        const q = (query ?? {}) as Record<string, unknown>;
        const limit = Number(q.limit ?? 20);
        const page = Number(q.page ?? 1);
        const filters: Record<string, unknown> = {
          limit,
          offset: (page - 1) * limit,
        };
        if (q.startDate) filters.startDate = new Date(String(q.startDate));
        if (q.endDate) filters.endDate = new Date(String(q.endDate));
        if (q.userId) filters.userId = String(q.userId);
        if (q.type) filters.eventTypes = [String(q.type)];
        const events = await auditRepo.queryAuditEvents(filters);
        return events.map((e: Record<string, unknown>) => ({
          id: e.id,
          type: e.eventType,
          severity: e.severity ?? 'info',
          userId: e.userId,
          resourceType: e.resourceType,
          resourceId: e.resourceId,
          action: e.action,
          details: e.details,
          ipAddress: e.ipAddress,
          userAgent: e.userAgent,
          timestamp: e.timestamp ?? e.createdAt,
        }));
      } catch {
        set.status = 500;
        return { error: 'Internal Server Error', message: 'Failed to retrieve security events' };
      }
    })

    .group('', (g) => withAdminGuard(g)
      .get('/policies', async ({ set, query }) => {
        try {
          const { securityService } = await getServices();
          const { page = '1', limit = '20', active, search } = query;
          const filters: Record<string, unknown> = {
            limit: Number(limit),
            offset: (Number(page) - 1) * Number(limit),
          };
          if (active !== undefined) filters.active = active === 'true';
          if (search) filters.search = String(search);
          const repo = securityService!.getSecurityPolicyRepository();
          const allPolicies = filters.active === true
            ? await repo.findEnabled()
            : await repo.findAll();
          const filtered = filters.search
            ? allPolicies.filter(p => p.name.toLowerCase().includes(String(filters.search).toLowerCase()))
            : allPolicies;
          const total = filtered.length;
          const policies = filtered.slice(Number(filters.offset) || 0, (Number(filters.offset) || 0) + (Number(filters.limit) || 20));
          return {
            message: 'Security policies retrieved successfully',
            policies,
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total,
              pages: Math.ceil(total / Number(limit)),
            },
          };
        } catch {
          set.status = 500;
          return {
            error: 'Internal Server Error',
            message: 'An error occurred while retrieving security policies',
          };
        }
      }, {
        response: {
          200: t.Object({
            message: t.String(),
            policies: t.Any(),
            pagination: t.Object({
              page: t.Number(),
              limit: t.Number(),
              total: t.Number(),
              pages: t.Number(),
            }),
          }),
          500: ErrorSchema,
        },
      })
      
      .get('/policies/:policyId', async ({ set, params }) => {
        try {
          const { securityService } = await getServices();
          const policyId = params.policyId;
          const repo = securityService!.getSecurityPolicyRepository();
          const policy = await repo.getSecurityPolicy(policyId);
          if (!policy) {
            set.status = 404;
            return { error: 'Policy Not Found', message: 'Security policy not found' };
          }
          return { message: 'Security policy retrieved successfully', policy };
        } catch {
          set.status = 500;
          return {
            error: 'Internal Server Error',
            message: 'An error occurred while retrieving the security policy',
          };
        }
      }, {
        response: {
          200: t.Object({ message: t.String(), policy: t.Any() }),
          404: ErrorSchema,
          500: ErrorSchema,
        },
      })
      .post('/policies', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, body, request, headers } = ctx;
        const createPolicyResult = validateWithZod(securityPolicySchema, body);
        if (createPolicyResult.error) {
          set.status = 400;
          return {
            error: 'Validation Error',
            details: createPolicyResult.error.details.map((d) => d.message),
          };
        }
        const createPolicyValue = createPolicyResult.value;
        try {
          const { securityService, auditService } = await getSecurityServices();
          const repo = securityService!.getSecurityPolicyRepository();
          const newPolicy = await repo.createSecurityPolicy({
            name: createPolicyValue.name,
            description: createPolicyValue.description,
            priority: createPolicyValue.priority,
            isEnabled: createPolicyValue.isActive,
            policyType: 'custom',
            rules: { conditions: createPolicyValue.conditions, actions: createPolicyValue.actions },
            metadata: { createdBy: user!.id },
          });
          await auditService.logSecurityEvent({
            eventType: AuditEventType.POLICY_CREATED,
            userId: user!.id,
            details: {
              policyId: newPolicy.id,
              policyName: newPolicy.name,
              priority: newPolicy.priority,
              isActive: newPolicy.isEnabled,
            },
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'],
          });
          set.status = 201;
          return { message: 'Security policy created successfully', policy: newPolicy };
        } catch {
          set.status = 500;
          return {
            error: 'Internal Server Error',
            message: 'An error occurred while creating the security policy',
          };
        }
      }, {
        body: t.Object({
          name: t.String(),
          description: t.String(),
          priority: t.Number(),
          isActive: t.Optional(t.Boolean()),
          conditions: t.Any(),
          actions: t.Any(),
        }),
        response: {
          201: t.Object({ message: t.String(), policy: t.Any() }),
          400: ValidationErrorSchema,
          500: ErrorSchema,
        },
      })
      
      .put('/policies/:policyId', async ({ set, params, body }) => {
        const updateResult = validateWithZod(updatePolicySchema, body);
        if (updateResult.error) {
          set.status = 400;
          return {
            error: 'Validation Error',
            details: updateResult.error.details.map((d) => d.message),
          };
        }
        const updateValue = updateResult.value;
        try {
          const { securityService } = await getServices();
          const policyId = params.policyId;
          const repo = securityService!.getSecurityPolicyRepository();
          // Map API schema fields to repository format:
          // - isActive → isEnabled
          // - conditions + actions → rules object
          const updatePayload: Record<string, unknown> = {};
          if (updateValue.name !== undefined) updatePayload.name = updateValue.name;
          if (updateValue.description !== undefined) updatePayload.description = updateValue.description;
          if (updateValue.priority !== undefined) updatePayload.priority = updateValue.priority;
          if (updateValue.isActive !== undefined) updatePayload.isEnabled = updateValue.isActive;
          if (updateValue.conditions !== undefined || updateValue.actions !== undefined) {
            updatePayload.rules = { conditions: updateValue.conditions, actions: updateValue.actions };
          }
          const updated = await repo.updateSecurityPolicy(policyId, updatePayload);
          if (!updated) {
            set.status = 404;
            return { error: 'Policy Not Found', message: 'Security policy not found' };
          }
          return { message: 'Security policy updated successfully', policy: updated };
        } catch {
          set.status = 500;
          return {
            error: 'Internal Server Error',
            message: 'An error occurred while updating the security policy',
          };
        }
      }, {
        body: t.Object({
          name: t.Optional(t.String()),
          description: t.Optional(t.String()),
          priority: t.Optional(t.Number()),
          isActive: t.Optional(t.Boolean()),
          conditions: t.Optional(t.Any()),
          actions: t.Optional(t.Any()),
        }),
        response: {
          200: t.Object({ message: t.String(), policy: t.Any() }),
          400: ValidationErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
      })
      
      .delete('/policies/:policyId', async ({ set, params }) => {
        try {
          const { securityService } = await getServices();
          const policyId = params.policyId;
          const repo = securityService!.getSecurityPolicyRepository();
          const ok = await repo.deleteSecurityPolicy(policyId);
          if (!ok) {
            set.status = 404;
            return { error: 'Policy Not Found', message: 'Security policy not found' };
          }
          return { message: 'Security policy deleted successfully' };
        } catch {
          set.status = 500;
          return {
            error: 'Internal Server Error',
            message: 'An error occurred while deleting the security policy',
          };
        }
      }, {
        response: {
          200: t.Object({ message: t.String() }),
          404: ErrorSchema,
          500: ErrorSchema,
        },
      })
      
      .get('/stats', async ({ set, query }) => {
        try {
          const timeframe = (typeof query === 'object' && query !== null && 'timeframe' in query && typeof query.timeframe === 'string' ? query.timeframe : undefined) || '24h';
          let startDate: Date;
          const endDate = new Date();
          switch (timeframe) {
            case '1h':
              startDate = new Date(endDate.getTime() - 3600000);
              break;
            case '24h':
              startDate = new Date(endDate.getTime() - 86400000);
              break;
            case '7d':
              startDate = new Date(endDate.getTime() - 7 * 86400000);
              break;
            case '30d':
              startDate = new Date(endDate.getTime() - 30 * 86400000);
              break;
            default:
              startDate = new Date(endDate.getTime() - 86400000);
          }
          const { domainAuditService, securityService } = await getServices();
          const auditRepo = domainAuditService!.getAuditRepository();
          const eventStats = await auditRepo.queryAuditEvents({
            startDate,
            endDate,
            limit: 1000,
          });
          const eventsByType = eventStats.reduce(
            (acc: Record<string, number>, event: Record<string, unknown>) => {
              const eventType = typeof event.eventType === 'string' ? event.eventType : 'unknown';
              acc[eventType] = (acc[eventType] ?? 0) + 1;
              return acc;
            },
            {}
          );
          const riskEvents = await auditRepo.queryAuditEvents({
            eventTypes: [AuditEventType.RISK_ASSESSMENT],
            startDate,
            endDate,
            limit: 1000,
          });
          const initialRiskStats: RiskStats = {
            totalAssessments: 0,
            totalRiskScore: 0,
            highRiskCount: 0,
            mediumRiskCount: 0,
            lowRiskCount: 0,
          };
          const riskStats: RiskStats = riskEvents.reduce<RiskStats>(
            (acc, event: Record<string, unknown>) => {
              const details = isRecord(event.details) ? event.details : undefined;
              const score = details?.riskScore;
              if (typeof score === 'number') {
                acc.totalAssessments++;
                acc.totalRiskScore += score;
                if (score >= 70) acc.highRiskCount++;
                else if (score >= 40) acc.mediumRiskCount++;
                else acc.lowRiskCount++;
              }
              return acc;
            },
            initialRiskStats
          );
          const policyStats = await securityService!
            .getSecurityPolicyRepository()
            .getSecurityPolicyStats();
          return {
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
                total_policies: policyStats.total,
                active_policies: policyStats.enabled,
                inactive_policies: policyStats.disabled,
              },
            },
          };
        } catch {
          set.status = 500;
          return {
            error: 'Internal Server Error',
            message: 'An error occurred while retrieving security statistics',
          };
        }
      }, {
        response: {
          200: t.Object({
            message: t.String(),
            timeframe: t.String(),
            statistics: t.Object({
              events: t.Array(t.Object({ event_type: t.String(), count: t.Number() })),
              riskAssessments: t.Object({
                total_assessments: t.Number(),
                avg_risk_score: t.Number(),
                high_risk_count: t.Number(),
                medium_risk_count: t.Number(),
                low_risk_count: t.Number(),
              }),
              policies: t.Object({
                total_policies: t.Number(),
                active_policies: t.Number(),
                inactive_policies: t.Number(),
              }),
            }),
          }),
          500: ErrorSchema,
        },
      })
    )
  );

}

export default registerSecurityRoutes;
