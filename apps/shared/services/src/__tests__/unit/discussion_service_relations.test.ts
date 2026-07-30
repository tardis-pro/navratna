import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DiscussionService } from '../../discussion_service'

describe('DiscussionService relation hydration', () => {
  const databaseService = {
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    // Lifecycle transitions claim the row with a conditional UPDATE; a returned
    // row means this instance won.
    executeQuery: vi.fn(async () => [{ id: 'discussion-1', status: 'active' }]),
  }

  const eventBusService = {
    publish: vi.fn().mockResolvedValue(undefined),
  }

  const personaService = {}

  let service: DiscussionService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new DiscussionService({
      databaseService: databaseService as never,
      eventBusService: eventBusService as never,
      personaService: personaService as never,
      enableAnalytics: false,
      enableRealTimeEvents: false,
    })
  })

  it('hydrates participants when fetching a discussion', async () => {
    databaseService.findById.mockResolvedValue({
      id: 'discussion-1',
      status: 'draft',
      state: { currentTurn: { turnNumber: 0 }, activeParticipants: 0 },
      createdBy: 'user-1',
      createdAt: new Date(),
    })
    databaseService.findMany.mockResolvedValue([
      { id: 'participant-1', discussionId: 'discussion-1', isActive: true, role: 'participant' },
      { id: 'participant-2', discussionId: 'discussion-1', isActive: true, role: 'participant' },
    ])

    const discussion = await service.getDiscussion('discussion-1', true)

    expect(databaseService.findMany).toHaveBeenCalledWith(
      'discussion_participants',
      { discussionId: 'discussion-1' },
      { order: { joinedAt: 'ASC' } }
    )
    expect(discussion?.participants).toHaveLength(2)
  })

  it('can start a discussion when participants are hydrated from storage', async () => {
    databaseService.findById
      .mockResolvedValueOnce({
        id: 'discussion-1',
        status: 'draft',
        state: { currentTurn: { turnNumber: 0 }, activeParticipants: 0 },
        createdBy: 'user-1',
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'discussion-1',
        status: 'active',
        state: { currentTurn: { turnNumber: 0 }, activeParticipants: 1 },
        createdBy: 'user-1',
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'discussion-1',
        status: 'active',
        state: { currentTurn: { turnNumber: 1 }, activeParticipants: 1 },
        createdBy: 'user-1',
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'discussion-1',
        status: 'active',
        state: { currentTurn: { participantId: 'participant-1', turnNumber: 1 }, activeParticipants: 1 },
        createdBy: 'user-1',
        createdAt: new Date(),
      })

    databaseService.findMany.mockResolvedValue([
      { id: 'participant-1', discussionId: 'discussion-1', isActive: true, role: 'participant' },
      { id: 'participant-2', discussionId: 'discussion-1', isActive: true, role: 'participant' },
    ])

    databaseService.update.mockResolvedValue({ id: 'discussion-1' })

    const discussion = await service.startDiscussion('discussion-1', 'user-1')

    expect(discussion).toBeDefined()
    expect(databaseService.update).toHaveBeenCalled()
    expect(databaseService.findMany).toHaveBeenCalledWith(
      'discussion_participants',
      { discussionId: 'discussion-1' },
      { order: { joinedAt: 'ASC' } }
    )
  })
})
