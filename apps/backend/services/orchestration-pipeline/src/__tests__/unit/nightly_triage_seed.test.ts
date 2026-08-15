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
const definitionRows: Array<{ id: string; enabled?: boolean }> = [];
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
  workflowDefinitions: { id: 'wf.id', name: 'wf.name', enabled: 'wf.enabled' },
  projects: 'projects_table',
}));

import {
  seedNightlyTriageWorkflow,
  NIGHTLY_TRIAGE_NAME,
  TRIAGE_PROMPT,
} from '../../seeds/nightly-triage-workflow.js';

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
    // `forEach` only: the list an earlier step produced, and the bound on it.
    itemsFrom?: string;
    maxItems?: number;
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

  // This seed runs at EVERY gateway boot. It used to write `enabled: false` on
  // the update path, so an operator who followed this file's own instruction and
  // flipped the row had it silently reverted by the next restart — the engine
  // then reported `loaded: 0` and nothing explained why. Seeding owns the
  // definition; being switched on is an operator decision.
  it('preserves an operator-enabled row across a redeploy', async () => {
    projectRows.push({ id: 'proj-42' });
    definitionRows.push({ id: 'wf-existing', enabled: true });

    await seedNightlyTriageWorkflow();

    expect((updateSetMock.mock.calls[0][0] as SeededRow).enabled).toBe(true);
  });

  it('still lets an explicit --enable turn a disabled row on', async () => {
    projectRows.push({ id: 'proj-42' });
    definitionRows.push({ id: 'wf-existing', enabled: false });

    await seedNightlyTriageWorkflow({ enable: true });

    expect((updateSetMock.mock.calls[0][0] as SeededRow).enabled).toBe(true);
  });

  it('gathers on cron and ends in a reasoning step that can see the gathering', async () => {
    projectRows.push({ id: 'proj-42' });

    await seedNightlyTriageWorkflow();

    const row = insertValuesMock.mock.calls[0][0] as SeededRow;
    expect(row.trigger.kind).toBe('cron');

    const gathers = row.steps.filter((s) => s.type === 'toolCall');
    // 5 gathers, and no longer a sixth toolCall: filing moved to a `forEach` so
    // the night produces one task PER GROUP instead of one carrying the lot.
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

    // The night ends by fanning out over the reasoning step's groups, one task
    // each. A `toolCall` here would be the old single-digest behaviour returning.
    const file = row.steps.at(-1);
    expect(file?.type).toBe('forEach');
    expect(file?.toolId).toContain('create_task');
    // The groups must come from the reasoning step, not a hardcoded list.
    expect(file?.itemsFrom).toContain('steps.triage.output');
    // Every field the prompt promises must actually be wired, or a group's task
    // arrives on the board with a literal placeholder in it.
    expect(file?.arguments?.title).toBe('{{item.title}}');
    expect(file?.arguments?.body).toBe('{{item.why}}');
    // Without `key`, a second run in one day files every group again. This is
    // the assertion that keeps the board idempotent.
    expect(file?.arguments?.key).toBe('{{item.key}}');
    // The step's bound must agree with the bound the prompt states. If these
    // drift, the model is asked for one number and truncated at another.
    expect(file?.maxItems).toBe(8);
  });

  it('asks for the JSON array shape the fan-out consumes, and permits the empty one', () => {
    // The reasoning step's output stopped being prose for a human and became the
    // INPUT to `forEach`, so these are contract assertions, not style ones.
    const prompt = TRIAGE_PROMPT;

    // Every key the forEach substitutes must be named in the format block.
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"why"');
    expect(prompt).toContain('"key"');

    // The dedupe key is only worth having if it survives a rewording, so the
    // prompt must say that rather than merely asking for an id.
    // Fragment, not the full sentence: the prompt is a line array joined with
    // newlines, so an assertion spanning a line break can never match.
    expect(prompt).toContain('the CAUSE and never the wording');

    // `[]` is recorded as requested:0 and is NOT an error, so the model has to be
    // told the empty answer is permitted — otherwise it pads to avoid looking
    // unhelpful, which is the failure this bar exists to prevent.
    expect(prompt).toContain('return exactly []');

    // Unparseable output throws. The prompt must forbid prose explicitly rather
    // than merely requesting JSON.
    expect(prompt.toLowerCase()).toContain('prose fails the run');

    // The clustering rule itself: a group is a unit of work, not a finding.
    expect(prompt).toContain('NOT one finding');
  });
});
