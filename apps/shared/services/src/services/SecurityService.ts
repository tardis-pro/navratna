import { BaseDomainService } from './BaseDomainService';
import {
  SecurityPolicyRepository,
  ApprovalWorkflowRepository,
  ApprovalDecisionRepository,
} from '../database/repositories/SecurityRepository';
// Entity types used by repositories: SecurityPolicy, ApprovalWorkflow, ApprovalDecision

export class SecurityService extends BaseDomainService {
  protected constructor() {
    super();
  }

  public static getInstance(): SecurityService {
    return BaseDomainService.resolve<SecurityService>(SecurityService);
  }

  public getSecurityPolicyRepository(): SecurityPolicyRepository {
    return this.getRepository('secPolicyRepo', () => new SecurityPolicyRepository());
  }

  public getApprovalWorkflowRepository(): ApprovalWorkflowRepository {
    return this.getRepository('approvalWorkflowRepo', () => new ApprovalWorkflowRepository());
  }

  public getApprovalDecisionRepository(): ApprovalDecisionRepository {
    return this.getRepository('approvalDecisionRepo', () => new ApprovalDecisionRepository());
  }
}
