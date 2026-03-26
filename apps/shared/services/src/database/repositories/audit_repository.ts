import { BaseRepository } from '../base/base_repository';

export class AuditRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'audit_events';
  }
  get plane(): 'control' {
    return 'control';
  }
}
