import { BaseRepository } from '../base/base_repository';

export class AuditRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'audit_events';
  }
  get plane(): 'control' {
    return 'control';
  }

  async createAuditEvent(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Map from AuditService's camelCase shape to the actual snake_case DB columns.
    // AuditService sends: { eventType, userId, agentId, resourceType, resourceId,
    //                       details, ipAddress, userAgent, riskLevel, timestamp }
    // Table columns:       event_type, actor_id, actor_type, entity_type, entity_id,
    //                       details, ip_address, user_agent, action, outcome
    const mapped: Record<string, unknown> = {
      event_type: data['eventType'] ?? data['event_type'] ?? 'unknown',
      actor_id: data['userId'] ?? data['actor_id'] ?? null,
      actor_type: data['agentId'] ? 'agent' : 'user',
      entity_type: data['resourceType'] ?? data['entity_type'] ?? null,
      entity_id: data['resourceId'] ?? data['entity_id'] ?? null,
      action: data['eventType'] ?? data['action'] ?? 'unknown',
      outcome: data['riskLevel'] ?? data['outcome'] ?? 'info',
      details: data['details'] ?? null,
      ip_address: data['ipAddress'] ?? data['ip_address'] ?? null,
      user_agent: data['userAgent'] ?? data['user_agent'] ?? null,
    };
    return this.create(mapped);
  }

  async queryAuditEvents(
    filters: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>[]> {
    return this.findMany(filters);
  }

  async archiveOldAuditEvents(_before: Date): Promise<number> {
    return 0;
  }

  async deleteOldArchivedAuditEvents(_before: Date): Promise<number> {
    return 0;
  }

  async countRecentAuditEvents(
    _filters: Record<string, unknown>
  ): Promise<number> {
    return this.count();
  }
}
