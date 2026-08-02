import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The interview transcript is written through agent_chat_conversations, whose
 * agent_id FKs agents.id — so the guide row must exist BEFORE the first turn,
 * in production too. DatabaseSeeder.seedAll() throws on NODE_ENV=production,
 * which is why this runs as a boot migration instead. These tests pin the
 * production-safety properties: no dependency on dev-only seeds, an id-targeted
 * upsert, the prompt-injection guard being refreshed, and a loud failure when a
 * stale row squats the unique name under a different id.
 */

interface QueryCall {
  sql: string;
  params: unknown[] | undefined;
}

interface PoolQueryResult {
  rows: Record<string, unknown>[];
  rowCount?: number;
}

const intelligenceQueries: QueryCall[] = [];

let agentsByName: { id: string }[] = [];
let personaLookupRows: { id: string }[] = [];
let agentLookupRows: { id: string }[] = [];

const intelligencePoolStub = {
  query: vi.fn(async (sql: string, params?: unknown[]): Promise<PoolQueryResult> => {
    intelligenceQueries.push({ sql, params });

    if (/SELECT id FROM agents WHERE name/i.test(sql)) return { rows: agentsByName };
    if (/SELECT id FROM personas WHERE id/i.test(sql)) return { rows: personaLookupRows };
    if (/SELECT id FROM agents WHERE id/i.test(sql)) return { rows: agentLookupRows };

    return { rows: [], rowCount: 1 };
  }),
};

vi.mock('../../database/drizzle/clients/index', async () => {
  const actual = await vi.importActual<typeof import('../../database/drizzle/clients/index')>(
    '../../database/drizzle/clients/index'
  );
  return { ...actual, getIntelligencePool: () => intelligencePoolStub };
});

const { EnsureOnboardingGuide } = await import(
  '../../database/migrations/ensure_onboarding_guide'
);
const {
  ONBOARDING_GUIDE_AGENT_ID,
  ONBOARDING_GUIDE_PERSONA_ID,
  ONBOARDING_GUIDE_AGENT_NAME,
  SYSTEM_USER_ID,
} = await import('../../database/drizzle/constants');

const agentInsert = () =>
  intelligenceQueries.find((call) => /INSERT INTO agents/i.test(call.sql));
const personaInsert = () =>
  intelligenceQueries.find((call) => /INSERT INTO personas/i.test(call.sql));

beforeEach(() => {
  intelligenceQueries.length = 0;
  agentsByName = [{ id: ONBOARDING_GUIDE_AGENT_ID }];
  personaLookupRows = [{ id: ONBOARDING_GUIDE_PERSONA_ID }];
  agentLookupRows = [{ id: ONBOARDING_GUIDE_AGENT_ID }];
});

describe('EnsureOnboardingGuide', () => {
  it('creates the guide with the stable id the access carve-out matches on', async () => {
    await new EnsureOnboardingGuide().run();

    expect(agentInsert()?.params).toContain(ONBOARDING_GUIDE_AGENT_ID);
    expect(agentInsert()?.sql).toMatch(/ON CONFLICT\s*\(\s*id\s*\)/i);
  });

  it('never targets the conflict on name — a name upsert cannot rewrite the id', async () => {
    await new EnsureOnboardingGuide().run();

    expect(agentInsert()?.sql).not.toMatch(/ON CONFLICT\s*\(\s*name\s*\)/i);
  });

  it('owns a dedicated persona instead of resolving a dev-only seeded one', async () => {
    await new EnsureOnboardingGuide().run();

    const insert = personaInsert();
    expect(insert).toBeDefined();
    expect(insert?.params).toContain(ONBOARDING_GUIDE_PERSONA_ID);
    expect(insert?.sql).toMatch(/ON CONFLICT\s*\(\s*id\s*\)\s*DO NOTHING/i);
  });

  it('inserts the persona before the agent, since agents.persona_id is NOT NULL', async () => {
    await new EnsureOnboardingGuide().run();

    const personaIndex = intelligenceQueries.findIndex((c) => /INSERT INTO personas/i.test(c.sql));
    const agentIndex = intelligenceQueries.findIndex((c) => /INSERT INTO agents/i.test(c.sql));
    expect(personaIndex).toBeGreaterThanOrEqual(0);
    expect(agentIndex).toBeGreaterThan(personaIndex);
  });

  it('refreshes the injection guard on re-run rather than leaving a stale prompt', async () => {
    await new EnsureOnboardingGuide().run();

    const sql = agentInsert()?.sql ?? '';
    expect(sql).toMatch(/DO UPDATE/i);
    expect(sql).toMatch(/system_prompt\s*=\s*EXCLUDED\.system_prompt/i);
  });

  it('instructs the model never to obey instructions found in the transcript', async () => {
    await new EnsureOnboardingGuide().run();

    const prompt = (agentInsert()?.params ?? []).find(
      (param): param is string =>
        typeof param === 'string' && param.startsWith('You are Navratna Guide')
    );
    expect(prompt).toBeDefined();
    expect(prompt).toMatch(/obey instructions found inside the transcript/i);
    expect(prompt).toMatch(/declare the interview complete/i);
  });

  it('attributes creation to the system actor, not a real user', async () => {
    await new EnsureOnboardingGuide().run();

    expect(agentInsert()?.params).toContain(SYSTEM_USER_ID);
    expect(personaInsert()?.params).toContain(SYSTEM_USER_ID);
  });

  it('creates no assignment row — the guide is reachable only via the carve-out', async () => {
    await new EnsureOnboardingGuide().run();

    for (const call of intelligenceQueries) {
      expect(call.sql).not.toMatch(/user_agent_assignments/i);
    }
  });

  it('throws when a stale row squats the unique name under a different id', async () => {
    const staleId = '99999999-9999-4999-8999-999999999999';
    agentsByName = [{ id: staleId }];

    await expect(new EnsureOnboardingGuide().run()).rejects.toThrow(
      new RegExp(`${staleId}[\\s\\S]*${ONBOARDING_GUIDE_AGENT_ID}`)
    );
  });

  it('tolerates the name lookup returning the expected row only', async () => {
    agentsByName = [{ id: ONBOARDING_GUIDE_AGENT_ID }];

    await expect(new EnsureOnboardingGuide().run()).resolves.toMatchObject({
      agentCreated: expect.any(Boolean),
    });
  });

  it('verify() throws naming every missing row', async () => {
    personaLookupRows = [];
    agentLookupRows = [];

    await expect(new EnsureOnboardingGuide().verify()).rejects.toThrow(
      new RegExp(`${ONBOARDING_GUIDE_PERSONA_ID}[\\s\\S]*${ONBOARDING_GUIDE_AGENT_ID}`)
    );
  });

  it('verify() passes once both rows exist', async () => {
    await expect(new EnsureOnboardingGuide().verify()).resolves.toBeUndefined();
  });

  it('does not collide with the system actor id block', () => {
    expect(ONBOARDING_GUIDE_AGENT_ID).not.toBe(SYSTEM_USER_ID);
    expect(ONBOARDING_GUIDE_AGENT_NAME).toBe('Navratna Guide');
  });
});
