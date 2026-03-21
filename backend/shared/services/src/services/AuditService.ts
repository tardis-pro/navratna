import { BaseDomainService } from './BaseDomainService';
import { AuditRepository } from '../database/repositories/AuditRepository';
import { AuditEvent } from '../entities/auditEvent.entity';

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
