import { BaseRepository } from '../base/BaseRepository';
import { logger } from '@uaip/utils';
import { getControlDb } from '../drizzle/clients/index';

export class AuditRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() { return 'audit_events'; }
  get plane(): 'control' { return 'control'; }
}

