import { BaseDomainService } from './BaseDomainService';
import { AuditRepository } from '../database/repositories/AuditRepository';
// AuditEvent entity type used by AuditRepository

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
