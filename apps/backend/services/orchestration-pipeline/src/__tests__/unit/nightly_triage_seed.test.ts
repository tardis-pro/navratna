/**
 * The nightly triage seed.
 *
 * The row it writes is the only way an N2 definition reaches a deployed stack —
 * the platform has no exec path into the database — so the properties that matter
 * are the ones nobody can fix by hand afterwards: it must be scoped to a real
 * project, it must not create a second row on redeploy, and it must not arrive
 * already scheduled.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const projectRows: Array<{ id: string }> = [];
const definitionRows: Array<{ id: string }> = [];
const insertValuesMock = vi.fn();
const updateSetMock = vi.fn();

vi.mock('@uaip/shared-services', () => ({
  getControlDb: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () =>
            Promise.resolve(table === 'projects_table' ? projectRows : definitionRows),
        }),
      }),
    }),
    insert: () => ({
      values: (row: unknown) => {
        insertValuesMock(row);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (row: unknown) => {
        updateSetMock(row);
        return { where: () => Promise.resolve() };
      },
    }),
  }),
}));

vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

vi.mock('@uaip/shared-services/drizzle/control', () => ({
  workflowDefinitions: { id: 'wf.id', name: 'wf.name' },
  projects: 'projects_table',
}));

import { seedNightlyTriageWorkflow, NIGHTLY_TRIAGE_NAME } from '../../seeds/nightly-triage-workflow.js';

interface SeededRow {
  name: string;
  enabled: boolean;
  projectId: string;
  trigger: { kind: string; expr: string };
  steps: Array<{
    type: string;
    id: string;
    toolId?: string;
    prompt?: string;
    arguments?: Record<string, unknown>;
  }>;
}

describe('seedNightlyTriageWorkflow', () => {
  beforeEach(() => {
    projectRows.length = 0;
    definitionRows.length = 0;
    insertValuesMock.mockReset();
    updateSetMock.mockReset();
  });

  it('refuses to seed a project-less row rather than creating one that can only fail', async () => {
    const result = await seedNightlyTriageWorkflow();

    expect(result.action).toBe('skipped');
    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it('scopes the definition to the project it resolved by slug', async () => {
    projectRows.push({ id: 'proj-42' });

    const result = await seedNightlyTriageWorkflow();

    expect(result).toEqual({ action: 'inserted', projectId: 'proj-42' });
    const row = insertValuesMock.mock.calls[0][0] as SeededRow;
    expect(row.projectId).toBe('proj-42');
    expect(row.name).toBe(NIGHTLY_TRIAGE_NAME);
  });

  it('arrives disabled, so registering it schedules nothing', async () => {
    projectRows.push({ id: 'proj-42' });

    await seedNightlyTriageWorkflow();

    expect((insertValuesMock.mock.calls[0][0] as SeededRow).enabled).toBe(false);
  });

  it('enables only when explicitly asked', async () => {
    projectRows.push({ id: 'proj-42' });

    await seedNightlyTriageWorkflow({ enable: true });

    expect((insertValuesMock.mock.calls[0][0] as SeededRow).enabled).toBe(true);
  });

  it('updates the existing row on redeploy instead of adding a second one', async () => {
    projectRows.push({ id: 'proj-42' });
    definitionRows.push({ id: 'wf-existing' });

    const result = await seedNightlyTriageWorkflow();

    expect(result.action).toBe('updated');
    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(updateSetMock).toHaveBeenCalledTimes(1);
  });

  it('gathers on cron and ends in a reasoning step that can see the gathering', async () => {
    projectRows.push({ id: 'proj-42' });

    await seedNightlyTriageWorkflow();

    const row = insertValuesMock.mock.calls[0][0] as SeededRow;
    expect(row.trigger.kind).toBe('cron');

    const gathers = row.steps.filter((s) => s.type === 'toolCall');
    expect(gathers).toHaveLength(5);
    // Every gather is an MCP tool, which is what makes the project scope load-bearing.
    expect(gathers.every((s) => s.toolId?.startsWith('mcp-'))).toBe(true);
    // code_quality was excluded only while tardis T2 did not exist — a step
    // naming an unresolvable tool fails, and a failed step ends the run. T2 has
    // landed, so the assertion inverts: the static half must be gathered, or the
    // triage sees runtime symptoms and never the code they came from.
    expect(gathers.some((s) => s.toolId?.includes('code_quality'))).toBe(true);
    // Bounded at the call. Unbounded, this one step would hand the reasoning
    // turn thousands of issues.
    const quality = gathers.find((s) => s.toolId?.includes('code_quality'));
    expect(quality?.arguments?.severities).toBe('BLOCKER,CRITICAL');

    expect(row.steps.at(-1)?.type).toBe('agentTurn');
  });
});
