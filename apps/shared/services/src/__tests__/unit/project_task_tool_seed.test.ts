import { ToolDefinitionSeed } from '../../database/seeders/tool_definition_seed';
import { PROJECT_TASK_TOOL_IDS } from '../../services/project_task_tool_service';
import { CALENDAR_TOOL_IDS } from '../../services/calendar_tool_service';

vi.mock('../../database/drizzle/clients/index', () => ({
  getControlDb: () => ({}),
}));

const getProjectTaskDefinitions = async () => {
  const seed = new ToolDefinitionSeed();
  const all = await seed.getSeedData();
  return all.filter((tool) => (PROJECT_TASK_TOOL_IDS as readonly string[]).includes(tool.name));
};

const getCalendarDefinitions = async () => {
  const seed = new ToolDefinitionSeed();
  const all = await seed.getSeedData();
  return all.filter((tool) => (CALENDAR_TOOL_IDS as readonly string[]).includes(tool.name));
};

describe('project/task tool definitions', () => {
  it('seeds exactly one definition per registered tool id', async () => {
    const defs = await getProjectTaskDefinitions();
    const names = defs.map((tool) => tool.name).sort();
    expect(names).toEqual([...PROJECT_TASK_TOOL_IDS].sort());
  });

  it('keeps the seeded names byte-identical to the executor switch keys', async () => {
    const defs = await getProjectTaskDefinitions();
    for (const tool of defs) {
      expect(PROJECT_TASK_TOOL_IDS).toContain(tool.name as (typeof PROJECT_TASK_TOOL_IDS)[number]);
    }
  });

  it('requires userId on every tool so nothing can run unscoped', async () => {
    const defs = await getProjectTaskDefinitions();
    for (const tool of defs) {
      const params = tool.parameters as { required?: string[]; properties?: Record<string, unknown> };
      expect(params.required, `${tool.name} must require userId`).toContain('userId');
      expect(params.properties).toHaveProperty('userId');
    }
  });

  it('enables every tool and leaves read tools without an approval gate', async () => {
    const defs = await getProjectTaskDefinitions();
    for (const tool of defs) {
      expect(tool.isEnabled, `${tool.name} should be enabled`).toBe(true);
      expect(tool.requiresApproval, `${tool.name} should not need approval`).toBe(false);
    }
  });

  it('marks write tools at a higher security level than read tools', async () => {
    const defs = await getProjectTaskDefinitions();
    const byName = new Map(defs.map((tool) => [tool.name, tool]));

    expect(byName.get('task-create')?.securityLevel).toBe('medium');
    expect(byName.get('task-update')?.securityLevel).toBe('medium');
    expect(byName.get('task-list')?.securityLevel).toBe('low');
    expect(byName.get('project-list')?.securityLevel).toBe('low');
  });

  it('declares the project/task identifiers each tool needs', async () => {
    const defs = await getProjectTaskDefinitions();
    const required = (name: string) => {
      const tool = defs.find((candidate) => candidate.name === name);
      expect(tool, `${name} should be seeded`).toBeDefined();
      return (tool!.parameters as { required?: string[] }).required ?? [];
    };

    expect(required('project-get')).toContain('projectId');
    expect(required('task-get')).toContain('taskId');
    expect(required('task-create')).toEqual(
      expect.arrayContaining(['projectId', 'title'])
    );
    expect(required('task-update')).toContain('taskId');
    expect(required('task-stats')).toContain('projectId');
  });

  it('does not collide with the pre-existing native tool names', async () => {
    const seed = new ToolDefinitionSeed();
    const all = await seed.getSeedData();
    const names = all.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('calendar tool definitions', () => {
  it('seeds exactly one definition per registered calendar tool id', async () => {
    const defs = await getCalendarDefinitions();
    expect(defs.map((tool) => tool.name).sort()).toEqual([...CALENDAR_TOOL_IDS].sort());
  });

  it('requires userId on every tool so nothing can read another account', async () => {
    const defs = await getCalendarDefinitions();
    for (const tool of defs) {
      const params = tool.parameters as { required?: string[]; properties?: Record<string, unknown> };
      expect(params.required, `${tool.name} must require userId`).toContain('userId');
      expect(params.properties).toHaveProperty('userId');
    }
  });

  it('declares the identifiers and time windows each tool needs', async () => {
    const defs = await getCalendarDefinitions();
    const required = (name: string) => {
      const tool = defs.find((candidate) => candidate.name === name);
      expect(tool, `${name} should be seeded`).toBeDefined();
      return (tool!.parameters as { required?: string[] }).required ?? [];
    };

    expect(required('calendar-event-get')).toContain('eventId');
    expect(required('calendar-event-create')).toEqual(
      expect.arrayContaining(['title', 'startAt', 'endAt'])
    );
    expect(required('calendar-event-update')).toContain('eventId');
    expect(required('calendar-event-delete')).toContain('eventId');
    expect(required('calendar-freebusy')).toEqual(
      expect.arrayContaining(['timeMin', 'timeMax'])
    );
  });

  it('marks mutating calendar tools above read-only ones', async () => {
    const defs = await getCalendarDefinitions();
    const byName = new Map(defs.map((tool) => [tool.name, tool]));

    expect(byName.get('calendar-event-create')?.securityLevel).toBe('medium');
    expect(byName.get('calendar-event-update')?.securityLevel).toBe('medium');
    expect(byName.get('calendar-event-delete')?.securityLevel).toBe('medium');
    expect(byName.get('calendar-list')?.securityLevel).toBe('low');
    expect(byName.get('calendar-freebusy')?.securityLevel).toBe('low');
  });

  it('enables every calendar tool without an approval gate', async () => {
    const defs = await getCalendarDefinitions();
    for (const tool of defs) {
      expect(tool.isEnabled, `${tool.name} should be enabled`).toBe(true);
      expect(tool.requiresApproval, `${tool.name} should not need approval`).toBe(false);
    }
  });
});
