import { AgentIntelligenceService } from '../../agent_intelligence_service';

vi.mock('../../database_service');
vi.mock('../../event_bus_service');

const VALID_SKILL = {
  name: 'incident-triage',
  description: 'Triage production incidents',
  content: '1. Check dashboards\n2. Identify blast radius',
  source: 'inline' as const,
  enabled: true,
};

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const PERSONA_ID = '99999999-9999-4999-8999-999999999999';

const personaRow = {
  id: PERSONA_ID,
  name: 'Ops Persona',
  role: 'assistant',
  description: 'ops',
  background: '',
  systemPrompt: '',
  traits: [],
  expertise: [],
  createdBy: 'user-1',
};

const agentRow = (overrides: Record<string, unknown> = {}) => ({
  id: AGENT_ID,
  name: 'Ops Agent',
  role: 'assistant',
  personaId: PERSONA_ID,
  intelligenceConfig: {},
  securityContext: {},
  configuration: {},
  isActive: true,
  createdBy: 'user-1',
  lastActiveAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  modelId: null,
  apiType: null,
  temperature: null,
  maxTokens: null,
  systemPrompt: null,
  skills: [],
  ...overrides,
});

interface AgentRepoStub {
  createAgent: ReturnType<typeof vi.fn>;
  updateAgent: ReturnType<typeof vi.fn>;
  findAgentById: ReturnType<typeof vi.fn>;
  findActiveAgents: ReturnType<typeof vi.fn>;
  findPersonaById: ReturnType<typeof vi.fn>;
}

const makeService = (): { service: AgentIntelligenceService; agents: AgentRepoStub } => {
  const agents: AgentRepoStub = {
    createAgent: vi.fn().mockResolvedValue(agentRow()),
    updateAgent: vi.fn().mockResolvedValue(agentRow()),
    findAgentById: vi.fn().mockResolvedValue(agentRow()),
    findActiveAgents: vi.fn().mockResolvedValue([]),
    findPersonaById: vi.fn().mockResolvedValue(personaRow),
  };
  const databaseService = {
    initialize: vi.fn().mockResolvedValue(undefined),
    agents,
  };
  const eventBusService = { publish: vi.fn().mockResolvedValue(undefined) };

  const service = new AgentIntelligenceService(
    databaseService as never,
    eventBusService as never
  );
  // The service short-circuits initialize() when already flagged; the DB stub above
  // stands in for the real connection, so skip the retry/connect path entirely.
  (service as unknown as { isInitialized: boolean }).isInitialized = true;

  return { service, agents };
};

describe('agent skills persistence', () => {
  it('persists skills on create instead of dropping them', async () => {
    const { service, agents } = makeService();

    await service.createAgent({
      name: 'Ops Agent',
      createdBy: 'user-1',
      skills: [VALID_SKILL],
    });

    expect(agents.createAgent).toHaveBeenCalledTimes(1);
    const payload = agents.createAgent.mock.calls[0][0];
    expect(payload.skills).toHaveLength(1);
    expect(payload.skills[0]).toMatchObject({
      name: 'incident-triage',
      content: '1. Check dashboards\n2. Identify blast radius',
    });
  });

  it('defaults to an empty skills array when none are supplied', async () => {
    const { service, agents } = makeService();

    await service.createAgent({ name: 'Ops Agent', createdBy: 'user-1' });

    expect(agents.createAgent.mock.calls[0][0].skills).toEqual([]);
  });

  it('drops malformed skills rather than persisting junk', async () => {
    const { service, agents } = makeService();

    await service.createAgent({
      name: 'Ops Agent',
      createdBy: 'user-1',
      skills: [VALID_SKILL, { name: 'missing-content' }, 'not-an-object'],
    });

    const payload = agents.createAgent.mock.calls[0][0];
    expect(payload.skills).toHaveLength(1);
    expect(payload.skills[0].name).toBe('incident-triage');
  });

  it('persists skills on update instead of dropping them', async () => {
    const { service, agents } = makeService();

    await service.updateAgent(AGENT_ID, { skills: [VALID_SKILL] });

    const payload = agents.updateAgent.mock.calls[0][1];
    expect(payload.skills).toHaveLength(1);
    expect(payload.skills[0].name).toBe('incident-triage');
  });

  it('clears skills when an empty array is sent', async () => {
    const { service, agents } = makeService();

    await service.updateAgent(AGENT_ID, { skills: [] });

    expect(agents.updateAgent.mock.calls[0][1].skills).toEqual([]);
  });

  it('leaves skills untouched when the update omits them', async () => {
    const { service, agents } = makeService();

    await service.updateAgent(AGENT_ID, { name: 'Renamed' });

    expect(agents.updateAgent.mock.calls[0][1]).not.toHaveProperty('skills');
  });

  it('returns stored skills from getAgent so the UI can load them back', async () => {
    const { service, agents } = makeService();
    agents.findAgentById.mockResolvedValue(agentRow({ skills: [VALID_SKILL] }));

    const agent = await service.getAgent(AGENT_ID);

    expect(agent?.skills).toHaveLength(1);
    expect(agent?.skills?.[0].name).toBe('incident-triage');
  });

  it('returns an empty array from getAgent when the column is empty', async () => {
    const { service } = makeService();

    const agent = await service.getAgent(AGENT_ID);

    expect(agent?.skills).toEqual([]);
  });
});
