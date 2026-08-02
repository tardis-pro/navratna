import { getTableConfig } from 'drizzle-orm/pg-core';
import { userAgentAssignments } from '../../database/drizzle/schemas/control_schema.js';

const columnsOf = (table: Parameters<typeof getTableConfig>[0]) =>
  new Map(getTableConfig(table).columns.map((column) => [column.name, column]));

describe('user_agent_assignments', () => {
  it('declares the user_agent_assignments table', () => {
    expect(getTableConfig(userAgentAssignments).name).toBe('user_agent_assignments');
  });

  it('has userId, agentId, organizationId, assignedBy and source columns', () => {
    const columns = columnsOf(userAgentAssignments);
    for (const name of ['user_id', 'agent_id', 'organization_id', 'assigned_by', 'source']) {
      expect(columns.has(name), `user_agent_assignments.${name} must exist`).toBe(true);
    }
  });

  it('has NO foreign key on agent_id (cross-plane boundary)', () => {
    const foreignKeys = getTableConfig(userAgentAssignments).foreignKeys;
    const agentFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((column) => column.name === 'agent_id')
    );
    expect(agentFk).toBeUndefined();
  });

  it('enforces one assignment row per (user, agent) pair', () => {
    const config = getTableConfig(userAgentAssignments);
    const unique = config.indexes.find(
      (index) => index.config.name === 'uq_user_agent_assignments_user_agent'
    );
    expect(unique).toBeDefined();
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.columns.map((column) => (column as { name: string }).name)).toEqual([
      'user_id',
      'agent_id',
    ]);
  });
});
