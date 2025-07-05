import { TypeOrmService } from '../typeormService.js';
import { SecurityPolicyRepository, ApprovalWorkflowRepository, ApprovalDecisionRepository } from '../database/repositories/SecurityRepository.js';
import { SecurityPolicy } from '../entities/securityPolicy.entity.js';
import { ApprovalWorkflow } from '../entities/approvalWorkflow.entity.js';
import { ApprovalDecision } from '../entities/approvalDecision.entity.js';

export class SecurityService {
  private static instance: SecurityService;
  private typeormService: TypeOrmService;

  private _securityPolicyRepository: SecurityPolicyRepository | null = null;
  private _approvalWorkflowRepository: ApprovalWorkflowRepository | null = null;
  private _approvalDecisionRepository: ApprovalDecisionRepository | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

  public static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }

  public getSecurityPolicyRepository(): SecurityPolicyRepository {
    if (!this._securityPolicyRepository) {
      this._securityPolicyRepository = new SecurityPolicyRepository(this.typeormService.dataSource, SecurityPolicy);
    }
    return this._securityPolicyRepository;
  }

  public getApprovalWorkflowRepository(): ApprovalWorkflowRepository {
    if (!this._approvalWorkflowRepository) {
      this._approvalWorkflowRepository = new ApprovalWorkflowRepository(this.typeormService.dataSource, ApprovalWorkflow);
    }
    return this._approvalWorkflowRepository;
  }

  public getApprovalDecisionRepository(): ApprovalDecisionRepository {
    if (!this._approvalDecisionRepository) {
      this._approvalDecisionRepository = new ApprovalDecisionRepository(this.typeormService.dataSource, ApprovalDecision);
    }
    return this._approvalDecisionRepository;
  }
}
