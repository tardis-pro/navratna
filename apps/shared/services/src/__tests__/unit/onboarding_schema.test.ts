import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import {
  onboardingInterviews,
  onboardingSlotValues,
  onboardingSlotEvidence,
  onboardingExtractionRuns,
} from '../../database/drizzle/schemas/control_schema.js';

const columnsOf = (table: Parameters<typeof getTableConfig>[0]) =>
  new Map(getTableConfig(table).columns.map((column) => [column.name, column]));

const renderWhere = (where: SQL | undefined) =>
  where ? new PgDialect().sqlToQuery(where).sql : '';

describe('onboarding schema', () => {
  it('declares all four onboarding tables with their expected names', () => {
    expect(getTableConfig(onboardingInterviews).name).toBe('onboarding_interviews');
    expect(getTableConfig(onboardingSlotValues).name).toBe('onboarding_slot_values');
    expect(getTableConfig(onboardingSlotEvidence).name).toBe('onboarding_slot_evidence');
    expect(getTableConfig(onboardingExtractionRuns).name).toBe('onboarding_extraction_runs');
  });

  it('onboarding_interviews has NO foreign key on guide_agent_id (cross-plane boundary)', () => {
    const foreignKeys = getTableConfig(onboardingInterviews).foreignKeys;
    const guideAgentFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((column) => column.name === 'guide_agent_id')
    );
    expect(guideAgentFk).toBeUndefined();
  });

  it('targets the child FKs at a UNIQUE CONSTRAINT, not an index', () => {
    const config = getTableConfig(onboardingInterviews);

    const constraint = config.uniqueConstraints.find(
      (entry) => entry.name === 'uq_onboarding_interviews_id_org'
    );
    expect(constraint).toBeDefined();
    expect(constraint?.columns.map((column) => column.name)).toEqual(['id', 'organization_id']);

    const asIndex = config.indexes.find(
      (index) => index.config.name === 'uq_onboarding_interviews_id_org'
    );
    expect(asIndex).toBeUndefined();
  });

  it('onboarding_slot_values uses a composite primary key of interview_id and slot_key', () => {
    const config = getTableConfig(onboardingSlotValues);
    expect(config.primaryKeys.length).toBe(1);
    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'interview_id',
      'slot_key',
    ]);
  });

  it('onboarding_slot_evidence has NO foreign key on source_message_id (cross-plane boundary)', () => {
    const foreignKeys = getTableConfig(onboardingSlotEvidence).foreignKeys;
    const sourceMessageFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((column) => column.name === 'source_message_id')
    );
    expect(sourceMessageFk).toBeUndefined();
  });

  it('onboarding_extraction_runs enforces one accepted run per trigger message', () => {
    const config = getTableConfig(onboardingExtractionRuns);
    const accepted = config.indexes.find(
      (index) => index.config.name === 'uq_onboarding_extraction_runs_accepted'
    );
    expect(accepted).toBeDefined();
    expect(accepted?.config.unique).toBe(true);
    expect(accepted?.config.columns.map((column) => (column as { name: string }).name)).toEqual([
      'interview_id',
      'trigger_message_id',
    ]);
    expect(renderWhere(accepted?.config.where)).toContain('accepted');
  });

  it('onboarding_extraction_runs enforces one accepted run per client turn id', () => {
    const config = getTableConfig(onboardingExtractionRuns);
    const clientTurn = config.indexes.find(
      (index) => index.config.name === 'uq_onboarding_extraction_runs_client_turn'
    );
    expect(clientTurn).toBeDefined();
    expect(clientTurn?.config.unique).toBe(true);
    expect(clientTurn?.config.columns.map((column) => (column as { name: string }).name)).toEqual([
      'interview_id',
      'client_turn_id',
    ]);
    expect(renderWhere(clientTurn?.config.where)).toContain('accepted');
  });

  it('every onboarding child table carries organization_id', () => {
    for (const table of [onboardingSlotValues, onboardingSlotEvidence, onboardingExtractionRuns]) {
      const columns = columnsOf(table);
      expect(
        columns.has('organization_id'),
        `${getTableConfig(table).name}.organization_id must exist`
      ).toBe(true);
    }
  });
});
