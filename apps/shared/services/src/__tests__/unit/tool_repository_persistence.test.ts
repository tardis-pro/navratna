import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ToolCategory, SecurityLevel } from '@uaip/types';

const insertedValues: Record<string, unknown>[] = [];

vi.mock('../../database/drizzle/clients/index', () => ({
  getControlDb: () => ({
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        insertedValues.push(v);
        return { returning: async () => [{ id: 'tool-uuid-1', ...v }] };
      },
    }),
  }),
}));

describe('ToolRepository.createTool field persistence', () => {
  beforeEach(() => {
    insertedValues.length = 0;
  });

  it('persists caller-supplied author, tags, requiresApproval, dependencies and schemas', async () => {
    const { ToolRepository } = await import('../../database/repositories/tool_repository');
    const repo = new ToolRepository();

    const parameters = { type: 'object', properties: { q: { type: 'string' } } };
    const returnType = { type: 'object', properties: { hits: { type: 'number' } } };

    await repo.createTool({
      name: 'ULW Probe Tool',
      description: 'probe',
      category: ToolCategory.DEVELOPMENT,
      version: '1.0.0',
      securityLevel: SecurityLevel.LOW,
      inputSchema: parameters,
      outputSchema: returnType,
      author: 'ulw-qa',
      tags: ['probe', 'qa'],
      requiresApproval: true,
      dependencies: ['other-tool'],
    });

    const row = insertedValues[0];
    expect(row, 'createTool must issue exactly one insert').toBeDefined();

    expect(row.author, 'author must be the caller-supplied value, not hardcoded "system"').toBe(
      'ulw-qa'
    );
    expect(row.tags, 'tags must be persisted').toEqual(['probe', 'qa']);
    expect(row.requiresApproval, 'requiresApproval must be persisted').toBe(true);
    expect(row.dependencies, 'dependencies must be persisted').toEqual(['other-tool']);
    expect(row.parameters, 'inputSchema must be persisted as parameters').toEqual(parameters);
    expect(row.returnType, 'outputSchema must be persisted as returnType').toEqual(returnType);
  });

  it('falls back to schema defaults when optional fields are omitted', async () => {
    const { ToolRepository } = await import('../../database/repositories/tool_repository');
    const repo = new ToolRepository();

    await repo.createTool({
      name: 'Minimal Tool',
      description: 'minimal',
      category: ToolCategory.API,
    });

    const row = insertedValues[0];
    expect(row.author).toBe('system');
    expect(row.tags).toEqual([]);
    expect(row.requiresApproval).toBe(false);
    expect(row.dependencies).toEqual([]);
  });
});
