import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Elysia } from 'elysia'

import { registerDiscussionRoutes } from '../../../../discussion-orchestration/src/routes/discussion_routes.ts'
import { registerPersonaRoutes } from '../../../../discussion-orchestration/src/routes/persona_routes.ts'

const VALID_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

const createRequest = (path: string, init?: RequestInit) =>
  new Request(`http://localhost${path}`, init)

const personaService = {
  searchPersonas: vi.fn(),
  createPersona: vi.fn(),
  getPersonaRecommendations: vi.fn(),
  getPersonaTemplates: vi.fn(),
  getPersona: vi.fn(),
  updatePersona: vi.fn(),
  deletePersona: vi.fn(),
  getPersonaAnalytics: vi.fn(),
  validatePersona: vi.fn(),
}

const discussionService = {
  createDiscussion: vi.fn(),
  searchDiscussions: vi.fn(),
  getDiscussion: vi.fn(),
  updateDiscussion: vi.fn(),
  startDiscussion: vi.fn(),
  endDiscussion: vi.fn(),
  removeParticipant: vi.fn(),
  getDiscussionMessages: vi.fn(),
  advanceTurn: vi.fn(),
  getDiscussionAnalytics: vi.fn(),
}

const orchestrationService = {
  addParticipant: vi.fn(),
  sendMessage: vi.fn(),
  requestTurn: vi.fn(),
  createHuddle: vi.fn(),
  resolveHuddle: vi.fn(),
}

describe('discussion/persona routes e2e', () => {
  const buildApp = () => {
    const app = new Elysia()
    registerDiscussionRoutes(app as never, discussionService as never, orchestrationService as never)
    registerPersonaRoutes(app as never, personaService as never)
    return app
  }

  beforeEach(() => {
    vi.clearAllMocks()

    personaService.searchPersonas.mockResolvedValue({ personas: [], total: 0, hasMore: false })
    personaService.createPersona.mockResolvedValue({ id: 'persona-1', name: 'Persona One' })
    personaService.getPersonaRecommendations.mockResolvedValue([])
    personaService.getPersonaTemplates.mockResolvedValue([])
    personaService.getPersona.mockResolvedValue({ id: 'persona-1', name: 'Persona One' })
    personaService.updatePersona.mockResolvedValue({ id: 'persona-1', name: 'Updated Persona' })
    personaService.deletePersona.mockResolvedValue(undefined)
    personaService.getPersonaAnalytics.mockResolvedValue({})
    personaService.validatePersona.mockResolvedValue({ isValid: true, errors: [], warnings: [] })

    discussionService.createDiscussion.mockResolvedValue({ id: 'discussion-1', title: 'Discussion' })
    discussionService.searchDiscussions.mockResolvedValue({ discussions: [], total: 0, hasMore: false })
    discussionService.getDiscussion.mockResolvedValue({ id: 'discussion-1', title: 'Discussion' })
    discussionService.updateDiscussion.mockResolvedValue({ id: 'discussion-1', title: 'Updated Discussion' })
    discussionService.startDiscussion.mockResolvedValue({ id: 'discussion-1', status: 'active' })
    discussionService.endDiscussion.mockResolvedValue({ id: 'discussion-1', status: 'completed' })
    discussionService.removeParticipant.mockResolvedValue(undefined)
    discussionService.getDiscussionMessages.mockResolvedValue([])
    discussionService.advanceTurn.mockResolvedValue(undefined)
    discussionService.getDiscussionAnalytics.mockResolvedValue({})

    orchestrationService.addParticipant.mockResolvedValue({ participantId: 'participant-1' })
    orchestrationService.sendMessage.mockResolvedValue({ success: true, messageId: 'message-1' })
    orchestrationService.requestTurn.mockResolvedValue({ queued: true })
    orchestrationService.createHuddle.mockResolvedValue({ id: 'huddle-1' })
    orchestrationService.resolveHuddle.mockResolvedValue(undefined)
  })

  it('fails closed on missing auth headers for persona routes', async () => {
    const app = buildApp()
    const response = await app.handle(createRequest('/api/v1/personas', { method: 'GET' }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('fails closed on missing auth headers for discussion routes', async () => {
    const app = buildApp()
    const response = await app.handle(createRequest('/api/v1/discussions', { method: 'POST' }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('creates persona using authenticated user as createdBy', async () => {
    const app = buildApp()
    const response = await app.handle(
      createRequest('/api/v1/personas', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({ name: 'Persona One', role: 'Analyst', systemPrompt: 'Prompt text' }),
      })
    )

    expect(response.status).toBe(201)
    expect(personaService.createPersona).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: VALID_USER_ID })
    )
  })

  it('uses authenticated user for discussion lifecycle actions', async () => {
    const app = buildApp()

    await app.handle(
      createRequest('/api/v1/discussions/discussion-1/start', {
        method: 'POST',
        headers: { 'x-user-id': VALID_USER_ID },
      })
    )
    expect(discussionService.startDiscussion).toHaveBeenCalledWith('discussion-1', VALID_USER_ID)

    await app.handle(
      createRequest('/api/v1/discussions/discussion-1/end', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({ reason: 'done' }),
      })
    )
    expect(discussionService.endDiscussion).toHaveBeenCalledWith('discussion-1', VALID_USER_ID, 'done')

    await app.handle(
      createRequest('/api/v1/discussions/discussion-1/participants/participant-1', {
        method: 'DELETE',
        headers: { 'x-user-id': VALID_USER_ID },
      })
    )
    expect(discussionService.removeParticipant).toHaveBeenCalledWith(
      'discussion-1',
      'participant-1',
      VALID_USER_ID
    )

    await app.handle(
      createRequest('/api/v1/discussions/discussion-1/advance-turn', {
        method: 'POST',
        headers: { 'x-user-id': VALID_USER_ID },
      })
    )
    expect(discussionService.advanceTurn).toHaveBeenCalledWith('discussion-1', VALID_USER_ID)
  })

  it('requires participantId for turn requests instead of anonymous fallback', async () => {
    const app = buildApp()
    const response = await app.handle(
      createRequest('/api/v1/discussions/discussion-1/turns/request', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({}),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'participantId is required' })
    expect(orchestrationService.requestTurn).not.toHaveBeenCalled()
  })

  it('requires explicit participants or initiatorId for huddles', async () => {
    const app = buildApp()
    const response = await app.handle(
      createRequest('/api/v1/discussions/discussion-1/huddle', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': VALID_USER_ID,
        },
        body: JSON.stringify({ topic: 'Need a huddle' }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'participants or initiatorId is required',
    })
    expect(orchestrationService.createHuddle).not.toHaveBeenCalled()
  })
})
