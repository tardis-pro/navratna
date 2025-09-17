import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withRequiredAuth, withAdminGuard } from './middleware/auth.plugin.js';
import { SecurityService, EventBusService, AuditService as DomainAuditService, DatabaseService } from '@uaip/shared-services';
import { AuditService } from '../services/auditService.js';
import { NotificationService } from '../services/notificationService.js';
import { AuditEventType } from '@uaip/types';
import { SecurityGatewayService } from '../services/securityGatewayService.js';
import { ApprovalWorkflowService } from '../services/approvalWorkflowService.js';

// Lazy service setup mirroring the original route behavior
let securityService: SecurityService | null = null;
let auditService: AuditService | null = null;
let domainAuditService: DomainAuditService | null = null;
let notificationService: NotificationService | null = null;
let eventBusService: EventBusService | null = null;
let approvalWorkflowService: ApprovalWorkflowService | null = null;
let securityGatewayService: SecurityGatewayService | null = null;

async function getServices() {
  if (!securityService) {
    securityService = SecurityService.getInstance();
    auditService = new AuditService();
    domainAuditService = DomainAuditService.getInstance();
  }
  return { securityService, auditService: auditService!, domainAuditService: domainAuditService! };
}

async function getSecurityServices() {
  const { securityService, auditService, domainAuditService } = await getServices();
  const databaseService = DatabaseService.getInstance();
  await databaseService.initialize();
  if (!notificationService) notificationService = new NotificationService();
  if (!eventBusService) eventBusService = new EventBusService({ url: process.env.RABBITMQ_URL || 'amqp://localhost:5672', serviceName: 'security-gateway' }, logger);
  if (!approvalWorkflowService) approvalWorkflowService = new ApprovalWorkflowService(databaseService, eventBusService, notificationService, auditService);
  if (!securityGatewayService) securityGatewayService = new SecurityGatewayService(databaseService, approvalWorkflowService, auditService);
  return { databaseService, auditService, domainAuditService, securityService, notificationService, eventBusService, approvalWorkflowService, securityGatewayService };
}

// Schemas
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
      timeoutHours: z.number().min(1).max(168).optional()
    }).optional(),
    blockOperation: z.boolean().default(false),
    logLevel: z.enum(['info', 'warn', 'error']).default('info'),
    notificationChannels: z.array(z.string()).optional(),
    additionalActions: z.record(z.any()).optional()
  })
});
const updatePolicySchema = securityPolicySchema.partial({ name: true });

function validateWithZod<T>(schema: z.ZodSchema<T>, data: any) {
  const result = schema.safeParse(data);
  if (result.success) return { error: null, value: result.data };
  return { error: { details: result.error.errors.map((e) => ({ message: e.message, path: e.path.join('.') })) }, value: null };
}

export function registerSecurityRoutes(app: any): any {
  return app.group('/api/v1/security', (app: any) => withRequiredAuth(app)
    // POST /assess-risk
    .post('/assess-risk', async ({ set, body, user, request, headers }) => {
      const { error, value } = validateWithZod(riskAssessmentSchema, body);
      if (error) { set.status = 400; return { error: 'Validation Error', details: error.details.map((d: any) => d.message) }; }
      try {
        const { securityGatewayService, auditService } = await getSecurityServices();
        const assessment = await securityGatewayService.assessRisk({ ...value, userId: user!.id, userRole: user!.role, timestamp: new Date(), ipAddress: request.headers.get('x-forwarded-for') || '', userAgent: headers['user-agent'] });
        await auditService.logSecurityEvent({ eventType: AuditEventType.RISK_ASSESSMENT, userId: user!.id, details: { operationType: value.operationType, resourceType: value.resourceType, resourceId: value.resourceId, riskScore: assessment.score, riskLevel: assessment.overallRisk }, ipAddress: request.headers.get('x-forwarded-for') || '', userAgent: headers['user-agent'] });
        return { message: 'Risk assessment completed', assessment };
      } catch (error) {
        set.status = 500; return { error: 'Internal Server Error', message: 'An error occurred during risk assessment' };
      }
    })

    // POST /check-approval-required
    .post('/check-approval-required', async ({ set, body, user, request, headers }) => {
      const { error, value } = validateWithZod(riskAssessmentSchema, body);
      if (error) { set.status = 400; return { error: 'Validation Error', details: error.details.map((d: any) => d.message) }; }
      try {
        const { securityGatewayService } = await getSecurityServices();
        const approvalRequired = await securityGatewayService.requiresApproval({ ...value, userId: user!.id, userRole: user!.role, timestamp: new Date(), ipAddress: request.headers.get('x-forwarded-for') || '', userAgent: headers['user-agent'] });
        return { message: 'Approval requirement check completed', requiresApproval: approvalRequired.required, requirements: approvalRequired.requirements, matchedPolicies: approvalRequired.matchedPolicies };
      } catch (error) {
        set.status = 500; return { error: 'Internal Server Error', message: 'An error occurred during approval requirement check' };
      }
    })

    // Admin-only: policies
    .group('', (g: any) => withAdminGuard(g)
      .get('/policies', async ({ set, query }) => {
        try {
          const { securityService } = await getServices();
          const { page = 1, limit = 20, active, search } = query as any;
          const filters: any = { limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
          if (active !== undefined) filters.active = active === 'true';
          if (search) filters.search = String(search);
          const repo = securityService!.getSecurityPolicyRepository();
          const { policies, total } = await repo.querySecurityPolicies(filters);
          return { message: 'Security policies retrieved successfully', policies, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
        } catch (error) {
          set.status = 500; return { error: 'Internal Server Error', message: 'An error occurred while retrieving security policies' };
        }
      })

      .get('/policies/:policyId', async ({ set, params }) => {
        try {
          const { securityService } = await getServices();
          const policyId = (params as any).policyId as string;
          const repo = securityService!.getSecurityPolicyRepository();
          const policy = await repo.getSecurityPolicy(policyId);
          if (!policy) { set.status = 404; return { error: 'Policy Not Found', message: 'Security policy not found' }; }
          return { message: 'Security policy retrieved successfully', policy };
        } catch (error) {
          set.status = 500; return { error: 'Internal Server Error', message: 'An error occurred while retrieving the security policy' };
        }
      })

      .post('/policies', async ({ set, body, user, request, headers }) => {
        const { error, value } = validateWithZod(securityPolicySchema, body);
        if (error) { set.status = 400; return { error: 'Validation Error', details: error.details.map((d: any) => d.message) }; }
        try {
          const { securityService, auditService } = await getSecurityServices();
          const repo = securityService!.getSecurityPolicyRepository();
          const newPolicy = await repo.createSecurityPolicy({ ...value, createdBy: user!.id });
          await auditService.logSecurityEvent({ eventType: AuditEventType.POLICY_CREATED, userId: user!.id, details: { policyId: newPolicy.id, policyName: newPolicy.name, priority: newPolicy.priority, isActive: newPolicy.isActive }, ipAddress: request.headers.get('x-forwarded-for') || '', userAgent: headers['user-agent'] });
          set.status = 201; return { message: 'Security policy created successfully', policy: newPolicy };
        } catch (error) {
          set.status = 500; return { error: 'Internal Server Error', message: 'An error occurred while creating the security policy' };
        }
      })

      .put('/policies/:policyId', async ({ set, params, body }) => {
        const { error, value } = validateWithZod(updatePolicySchema, body);
        if (error) { set.status = 400; return { error: 'Validation Error', details: error.details.map((d: any) => d.message) }; }
        try {
          const { securityService } = await getServices();
          const policyId = (params as any).policyId as string;
          const repo = securityService!.getSecurityPolicyRepository();
          const updated = await repo.updateSecurityPolicy(policyId, value);
          if (!updated) { set.status = 404; return { error: 'Policy Not Found', message: 'Security policy not found' }; }
          return { message: 'Security policy updated successfully', policy: updated };
        } catch (error) {
          set.status = 500; return { error: 'Internal Server Error', message: 'An error occurred while updating the security policy' };
        }
      })

      .delete('/policies/:policyId', async ({ set, params }) => {
        try {
          const { securityService } = await getServices();
          const policyId = (params as any).policyId as string;
          const repo = securityService!.getSecurityPolicyRepository();
          const ok = await repo.deleteSecurityPolicy(policyId);
          if (!ok) { set.status = 404; return { error: 'Policy Not Found', message: 'Security policy not found' }; }
          return { message: 'Security policy deleted successfully' };
        } catch (error) {
          set.status = 500; return { error: 'Internal Server Error', message: 'An error occurred while deleting the security policy' };
        }
      })

      .get('/stats', async ({ set, query }) => {
        try {
          const timeframe = ((query as any).timeframe || '24h') as string;
          let startDate: Date; const endDate = new Date();
          switch (timeframe) { case '1h': startDate = new Date(endDate.getTime() - 3600000); break; case '24h': startDate = new Date(endDate.getTime() - 86400000); break; case '7d': startDate = new Date(endDate.getTime() - 7 * 86400000); break; case '30d': startDate = new Date(endDate.getTime() - 30 * 86400000); break; default: startDate = new Date(endDate.getTime() - 86400000); }
          const { domainAuditService, securityService } = await getServices();
          const auditRepo = domainAuditService!.getAuditRepository();
          const eventStats = await auditRepo.queryAuditEvents({ startDate, endDate, limit: 1000 });
          const eventsByType = eventStats.reduce((acc: Record<string, number>, event: any) => { acc[event.eventType] = (acc[event.eventType]) + 1; return acc; }, {} as Record<string, number>);
          const riskEvents = await auditRepo.queryAuditEvents({ eventTypes: [AuditEventType.RISK_ASSESSMENT], startDate, endDate, limit: 1000 });
          const riskStats = riskEvents.reduce((acc: any, event: any) => { const score = event.details?.riskScore; if (typeof score === 'number') { acc.totalAssessments++; acc.totalRiskScore += score; if (score >= 70) acc.highRiskCount++; else if (score >= 40) acc.mediumRiskCount++; else acc.lowRiskCount++; } return acc; }, { totalAssessments: 0, totalRiskScore: 0, highRiskCount: 0, mediumRiskCount: 0, lowRiskCount: 0 });
          const policyStats = await securityService!.getSecurityPolicyRepository().getSecurityPolicyStats();
          return { message: 'Security statistics retrieved successfully', timeframe, statistics: { events: Object.entries(eventsByType).map(([eventType, count]) => ({ event_type: eventType, count })), riskAssessments: { total_assessments: riskStats.totalAssessments, avg_risk_score: riskStats.totalAssessments > 0 ? riskStats.totalRiskScore / riskStats.totalAssessments : 0, high_risk_count: riskStats.highRiskCount, medium_risk_count: riskStats.mediumRiskCount, low_risk_count: riskStats.lowRiskCount }, policies: { total_policies: policyStats.totalPolicies, active_policies: policyStats.activePolicies, inactive_policies: policyStats.inactivePolicies } } };
        } catch (error) {
          set.status = 500; return { error: 'Internal Server Error', message: 'An error occurred while retrieving security statistics' };
        }
      })
    )
  );
}

export default registerSecurityRoutes;

