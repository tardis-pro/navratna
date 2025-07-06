import { TypeOrmService } from '../typeormService.js';
import { AuditRepository } from '../database/repositories/AuditRepository.js';
import { AuditEvent } from '../entities/auditEvent.entity.js';

export class AuditService {
  private static instance: AuditService;
  private typeormService: TypeOrmService;

  private _auditRepository: AuditRepository | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  public getAuditRepository(): AuditRepository {
    if (!this._auditRepository) {
      this._auditRepository = new AuditRepository();
    }
    return this._auditRepository;
  }
}
