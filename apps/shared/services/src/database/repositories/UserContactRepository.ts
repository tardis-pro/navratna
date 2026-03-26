import { BaseRepository } from '../base/BaseRepository';
import { logger } from '@uaip/utils';
import { getControlDb } from '../drizzle/clients/index';

export class UserContactRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'user_contacts';
  }
  get plane(): 'control' {
    return 'control';
  }
}

export const ContactStatus = { ACTIVE: 'active', INACTIVE: 'inactive', BLOCKED: 'blocked' };
export const ContactType = { USER: 'user', AGENT: 'agent', EXTERNAL: 'external' };
