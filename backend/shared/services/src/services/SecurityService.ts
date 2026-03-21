import { BaseDomainService } from './BaseDomainService';
import {
  SecurityPolicyRepository,
  ApprovalWorkflowRepository,
  ApprovalDecisionRepository,
} from '../database/repositories/SecurityRepository';
import { SecurityPolicy } from '../entities/securityPolicy.entity';
import { ApprovalWorkflow } from '../entities/approvalWorkflow.entity';
import { ApprovalDecision } from '../entities/approvalDecision.entity';

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
