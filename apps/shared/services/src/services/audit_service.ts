import { BaseDomainService } from './base_domain_service';
import { AuditRepository } from '../database/repositories/audit_repository';

export class AuditService extends BaseDomainService {
  protected constructor() {
    super();
  }

  public static getInstance(): AuditService {
    return BaseDomainService.resolve<AuditService>(AuditService);
  }

  public getAuditRepository(): AuditRepository {
    return this.getRepository('auditRepo', () => new AuditRepository());
  }
}
