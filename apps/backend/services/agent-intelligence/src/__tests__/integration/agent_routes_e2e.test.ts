import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Elysia } from 'elysia'

const { mockedScoreRelevance, mockedGetConstellations, mockedGetIntelligenceDb } = vi.hoisted(() => ({
  mockedScoreRelevance: vi.fn(),
  mockedGetConstellations: vi.fn(),
  mockedGetIntelligenceDb: vi.fn(),
}))

vi.mock('@uaip/shared-services', async () => {
  return {
    scoreRelevance: mockedScoreRelevance,
    getConstellations: mockedGetConstellations,
    // RedisCacheService stub prevents llm-service from throwing at module init
    RedisCacheService: class { static getInstance() { return { get: vi.fn(), set: vi.fn(), del: vi.fn() } } },
    redisCacheService: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
  }
})

// The -core agents CRUD list handler queries the intelligence DB directly via Drizzle
// (it does not use an injected getAgents dep), so we mock the Drizzle client surface.
vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  getIntelligenceDb: mockedGetIntelligenceDb,
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
  ilike: vi.fn((col, val) => ({ col, val, op: 'ilike' })),
  and: vi.fn((...args) => ({ args, op: 'and' })),
  sql: vi.fn(),
  count: vi.fn(() => ({ name: 'count' })),
  asc: vi.fn((col) => col),
}))

vi.mock('@uaip/shared-services/drizzle/intelligence', () => ({
  agents: { id: 'id', name: 'name', isActive: 'isActive', createdAt: 'createdAt' },
}))

import {
  registerAgentRoutes,
  registerConstellationRoutes,
  registerAgentCrudRoutes,
  registerAgentChatRoutes,
  registerAgentCapabilityRoutes,
  registerAgentMemoryRoutes,
} from '@uaip/agent-intelligence-core'

  const VALID_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
  const OTHER_USER_ID = '123e4567-e89b-42d3-a456-426614174000'

const createRequest = (path: string, init?: RequestInit) =>
  new Request(`http://localhost${path}`, init)

const readJson = async (response: Response): Promise<unknown> => response.json()

describe('agent routes e2e', () => {
  const crudDeps = {
    getAgents: vi.fn(),
    createAgent: vi.fn(),
    getAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
  }

  const userLlmDeps = {
    generateAgentResponse: vi.fn(),
  }

  const workflowRepo = {
    findById: vi.fn(),
    update: vi.fn(),
  }

  const decisionRepo = {
    create: vi.fn(),
  }

  const securityDeps = {
    getApprovalWorkflowRepository: vi.fn(() => workflowRepo),
    getApprovalDecisionRepository: vi.fn(() => decisionRepo),
  }

  const capabilityDeps = {
    getAgentCapabilities: vi.fn(),
  }

  const capabilityRouteDeps = {
    getAgent: vi.fn(),
    analyzeContext: vi.fn(),
    generateExecutionPlan: vi.fn(),
    learnFromOperation: vi.fn(),
  }

  const semanticMemoryDeps = {
    pruneMemory: vi.fn(),
    reinforceConcept: vi.fn(),
    downvoteMemory: vi.fn(),
  }

  const buildApp = () => {
    const app = new Elysia()
    app.use(registerAgentRoutes())
    app.use(registerConstellationRoutes())
    app.use(registerAgentCrudRoutes(crudDeps))
    app.use(registerAgentChatRoutes(crudDeps, userLlmDeps, securityDeps))
    app.use(registerAgentCapabilityRoutes(capabilityRouteDeps, capabilityDeps))
    app.use(registerAgentMemoryRoutes(semanticMemoryDeps))
    return app
  }

  beforeEach(() => {
    vi.clearAllMocks()

    crudDeps.getAgents.mockResolvedValue([{ id: 'agent-1', name: 'Agent One' }])
    crudDeps.createAgent.mockImplementation(async (payload: Record<string, unknown>) => ({
      id: 'agent-1',
      ...payload,
    }))
    crudDeps.getAgent.mockResolvedValue({
      id: 'agent-1',
      name: 'Agent One',
      role: 'assistant',
      modelId: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1024,
      systemPrompt: 'You are helpful',
      configuration: {},
      metadata: {},
    })
    crudDeps.updateAgent.mockResolvedValue({ id: 'agent-1', name: 'Updated Agent' })
    crudDeps.deleteAgent.mockResolvedValue(undefined)

    userLlmDeps.generateAgentResponse.mockResolvedValue({
      content: 'hello',
      model: 'gpt-4',
      finishReason: 'stop',
    })

    workflowRepo.findById.mockResolvedValue({
      id: 'approval-1',
      currentApprovers: [],
      requiredApprovers: [VALID_USER_ID],
      metadata: {},
    })
    workflowRepo.update.mockResolvedValue(undefined)
    decisionRepo.create.mockResolvedValue(undefined)

    capabilityDeps.getAgentCapabilities.mockResolvedValue([{ id: 'cap-1', name: 'Analysis' }])
    capabilityRouteDeps.getAgent.mockResolvedValue({ id: 'agent-1', name: 'Agent One', role: 'assistant' })
    capabilityRouteDeps.analyzeContext.mockResolvedValue({ confidence: 0.9, analysis: { intent: 'analyze' } })
    capabilityRouteDeps.generateExecutionPlan.mockResolvedValue({ id: 'plan-1', type: 'analysis', steps: [] })
    capabilityRouteDeps.learnFromOperation.mockResolvedValue({ learningApplied: true })

    semanticMemoryDeps.pruneMemory.mockResolvedValue(undefined)
    semanticMemoryDeps.reinforceConcept.mockResolvedValue(undefined)
    semanticMemoryDeps.downvoteMemory.mockResolvedValue(undefined)

    mockedScoreRelevance.mockResolvedValue([
      {
        id: 'agent-1',
        type: 'agent',
        score: 0.9,
        breakdown: {
          vectorScore: 0.9,
          graphScore: 0.8,
          recencyScore: 0.2,
          explicitScore: 0.7,
        },
        metadata: { name: 'Agent One' },
      },
    ])

    mockedGetConstellations.mockResolvedValue({
      constellations: [
        {
          id: 'cluster-1',
          name: 'Knowledge Cluster',
          description: 'Cluster description',
          knowledgeType: 'semantic',
          items: [],
          relevanceScore: 0.8,
          confidence: 0.9,
          tags: ['knowledge'],
          health: 'stable',
          metadata: {
            itemCount: 0,
            averageConfidence: 0.9,
            dominantSourceType: 'clustered',
            lastUpdated: new Date().toISOString(),
            clusterSimilarity: 0.8,
          },
        },
      ],
      totalItems: 1,
      query: 'knowledge',
      clusteredAt: new Date().toISOString(),
    })
  })

  it('fails closed on missing auth headers', async () => {
    const app = buildApp()
    const response = await app.handle(createRequest('/api/v1/agents', { method: 'GET' }))

    expect(response.status).toBe(401)
    await expect(readJson(response)).resolves.toMatchObject({
      error: 'Authentication required: valid user ID not found',
      code: 'AUTH_REQUIRED',
    })
  })

  it('fails closed on invalid user id format', async () => {
    const app = buildApp()
    const response = await app.handle(
      createRequest('/api/v1/agents', {
        method: 'GET',
        headers: { 'x-user-id': 'not-a-uuid' },
      })
    )

    expect(response.status).toBe(401)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('serves agent CRUD through authenticated requests', async () => {
    const countBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ total: 1 }]),
    }
    const rowsBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([{ id: 'agent-1', name: 'Agent One', isActive: true }]),
    }
    const select = vi.fn().mockReturnValueOnce(countBuilder).mockReturnValueOnce(rowsBuilder)
    mockedGetIntelligenceDb.mockReturnValue({ select })

    const app = buildApp()
    const response = await app.handle(
      createRequest('/api/v1/agents', {
        method: 'GET',
        headers: { 'x-user-id': VALID_USER_ID },
      })
    )

    expect(response.status).toBe(200)
    await expect(readJson(response)).resolves.toMatchObject({
      success: true,
      data: [{ id: 'agent-1', name: 'Agent One' }],
      pagination: { total: 1, page: 1 },
    })
  })

  it('creates agents with authenticated user injected into payload', async () => {
    const app = buildApp()
    const response = await app.handle(
      createRequest('/api/v1/agents', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({ name: 'Created Agent' }),
      })
    )

    expect(response.status).toBe(201)
    expect(crudDeps.createAgent).toHaveBeenCalledWith({
      name: 'Created Agent',
      createdBy: VALID_USER_ID,
    })
    await expect(readJson(response)).resolves.toMatchObject({ success: true })
  })

  it('routes chat through shared user llm service', async () => {
    const app = buildApp()
    const response = await app.handle(
      createRequest('/api/v1/agents/agent-1/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({ message: 'Hello agent' }),
      })
    )

    expect(response.status).toBe(200)
    expect(userLlmDeps.generateAgentResponse).toHaveBeenCalledWith(
      VALID_USER_ID,
      expect.objectContaining({
        agent: expect.objectContaining({ id: 'agent-1' }),
        messages: [expect.objectContaining({ content: 'Hello agent' })],
      })
    )
    await expect(readJson(response)).resolves.toMatchObject({ success: true })
  })

  it('handles approval resolution through shared security repositories', async () => {
    const app = buildApp()
    const response = await app.handle(
      createRequest('/api/v1/agents/agent-1/approvals/approval-1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({ decision: 'approved', reason: 'looks good' }),
      })
    )

    expect(response.status).toBe(200)
    expect(decisionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ approverId: VALID_USER_ID, decision: 'approved' })
    )
    expect(workflowRepo.update).toHaveBeenCalledWith(
      'approval-1',
      expect.objectContaining({ status: 'approved' })
    )
  })

  it('rejects approval resolution by non-required approvers', async () => {
    const app = buildApp()
    workflowRepo.findById.mockResolvedValueOnce({
      id: 'approval-1',
      currentApprovers: [],
      requiredApprovers: [VALID_USER_ID],
      status: 'pending',
      metadata: { agentId: 'agent-1' },
    })

    const response = await app.handle(
      createRequest('/api/v1/agents/agent-1/approvals/approval-1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': OTHER_USER_ID,
        },
        body: JSON.stringify({ decision: 'approved' }),
      })
    )

    expect(response.status).toBe(403)
    await expect(readJson(response)).resolves.toMatchObject({
      error: 'User is not authorized to resolve this approval',
    })
    expect(decisionRepo.create).not.toHaveBeenCalled()
  })

  it('supports capability analysis and planning endpoints', async () => {
    const app = buildApp()

    const analyzeResponse = await app.handle(
      createRequest('/api/v1/agents/agent-1/analyze', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({ input: 'Analyze this request', context: { topic: 'sales' } }),
      })
    )

    expect(analyzeResponse.status).toBe(200)
    expect(capabilityRouteDeps.analyzeContext).toHaveBeenCalledTimes(1)

    const planResponse = await app.handle(
      createRequest('/api/v1/agents/agent-1/plan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({ analysis: { intent: 'plan' }, userPreferences: {}, securityContext: {} }),
      })
    )

    expect(planResponse.status).toBe(200)
    expect(capabilityRouteDeps.generateExecutionPlan).toHaveBeenCalledTimes(1)
  })

  it('supports semantic memory prune and reinforce endpoints', async () => {
    const app = buildApp()

    const deleteResponse = await app.handle(
      createRequest('/api/v1/agents/agent-1/memory/semantic/concept-1', {
        method: 'DELETE',
        headers: { 'x-user-id': VALID_USER_ID },
      })
    )

    expect(deleteResponse.status).toBe(200)
    expect(semanticMemoryDeps.pruneMemory).toHaveBeenCalledWith('agent-1', 'concept-1')

    const patchResponse = await app.handle(
      createRequest('/api/v1/agents/agent-1/memory/semantic/concept-1', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({ action: 'reinforce', example: 'example context' }),
      })
    )

    expect(patchResponse.status).toBe(200)
    expect(semanticMemoryDeps.reinforceConcept).toHaveBeenCalledWith(
      'agent-1',
      'concept-1',
      'example context'
    )
  })

  it('secures and serves relevance + constellation endpoints', async () => {
    const app = buildApp()

    const relevanceResponse = await app.handle(
      createRequest('/api/v1/agents/relevance', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({
          query: 'find best agent',
          candidates: [{ id: 'agent-1', type: 'agent', metadata: { name: 'Agent One' } }],
        }),
      })
    )

    expect(relevanceResponse.status).toBe(200)
    expect(mockedScoreRelevance).toHaveBeenCalledTimes(1)

    const constellationResponse = await app.handle(
      createRequest('/api/v1/knowledge/constellations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({ query: 'knowledge', includeItems: false }),
      })
    )

    expect(constellationResponse.status).toBe(200)
    expect(mockedGetConstellations).toHaveBeenCalledWith({ query: 'knowledge', includeItems: false })
  })
})
