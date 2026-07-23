import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ParticipantManagementService } from '../../participant_management_service'

describe('ParticipantManagementService', () => {
  const databaseService = {
    findMany: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  }

  let service: ParticipantManagementService

  beforeEach(() => {
    vi.clearAllMocks()
    databaseService.findById.mockResolvedValue({ personaId: 'persona-1' })
    service = new ParticipantManagementService(databaseService as never)
  })

  it('persists displayName, permissions, turnOrder, and turnWeight in metadata', async () => {
    databaseService.findMany.mockResolvedValue([])
    databaseService.create.mockImplementation(async (_table: string, payload: Record<string, unknown>) => ({
      id: 'participant-1',
      ...payload,
    }))

    const participant = await service.createAgentParticipant({
      discussionId: 'discussion-1',
      agentId: 'agent-1',
      displayName: 'Agent One',
      permissions: ['discussion:speak'],
      turnOrder: 2,
      turnWeight: 5,
      roleInDiscussion: 'participant',
    })

    expect(databaseService.create).toHaveBeenCalledWith(
      'discussion_participants',
      expect.objectContaining({
        metadata: expect.objectContaining({
          displayName: 'Agent One',
          permissions: ['discussion:speak'],
          turnOrder: 2,
          turnWeight: 5,
        }),
      })
    )
    expect((participant.metadata as Record<string, unknown>).displayName).toBe('Agent One')
  })

  it('persists agent personaId on new discussion participants', async () => {
    databaseService.findMany.mockResolvedValue([])
    databaseService.create.mockImplementation(async (_table: string, payload: Record<string, unknown>) => ({
      id: 'participant-1',
      ...payload,
    }))

    const participant = await service.createAgentParticipant({
      discussionId: 'discussion-1',
      agentId: 'agent-1',
      personaId: 'persona-1',
      displayName: 'Agent One',
    })

    expect(databaseService.create).toHaveBeenCalledWith(
      'discussion_participants',
      expect.objectContaining({
        personaId: 'persona-1',
      })
    )
    expect(participant.personaId).toBe('persona-1')
  })

  it('merges metadata when an existing participant is re-added', async () => {
    databaseService.findMany.mockResolvedValue([
      {
        id: 'participant-1',
        discussionId: 'discussion-1',
        metadata: {},
      },
    ])
    databaseService.update.mockImplementation(async (_table: string, _id: string, payload: Record<string, unknown>) => ({
      id: 'participant-1',
      discussionId: 'discussion-1',
      metadata: payload.metadata,
    }))

    const participant = await service.createAgentParticipant({
      discussionId: 'discussion-1',
      agentId: 'agent-1',
      displayName: 'Updated Name',
      permissions: ['discussion:moderate'],
      turnOrder: 1,
      turnWeight: 10,
    })

    expect(databaseService.update).toHaveBeenCalledWith(
      'discussion_participants',
      'participant-1',
      expect.objectContaining({
        metadata: expect.objectContaining({
          displayName: 'Updated Name',
          permissions: ['discussion:moderate'],
          turnOrder: 1,
          turnWeight: 10,
        }),
      })
    )
    expect((participant.metadata as Record<string, unknown>).displayName).toBe('Updated Name')
  })

  it('backfills personaId when an existing participant is re-added', async () => {
    databaseService.findMany.mockResolvedValue([
      {
        id: 'participant-1',
        discussionId: 'discussion-1',
        personaId: null,
        metadata: {},
      },
    ])
    databaseService.update.mockImplementation(async (_table: string, _id: string, payload: Record<string, unknown>) => ({
      id: 'participant-1',
      discussionId: 'discussion-1',
      personaId: payload.personaId,
      metadata: payload.metadata,
    }))

    const participant = await service.createAgentParticipant({
      discussionId: 'discussion-1',
      agentId: 'agent-1',
      personaId: 'persona-1',
    })

    expect(databaseService.update).toHaveBeenCalledWith(
      'discussion_participants',
      'participant-1',
      expect.objectContaining({
        personaId: 'persona-1',
      })
    )
    expect(participant.personaId).toBe('persona-1')
  })

  it('backfills missing personaIds for a discussion from linked agents', async () => {
    databaseService.findMany.mockResolvedValue([
      {
        id: 'participant-1',
        discussionId: 'discussion-1',
        participantType: 'agent',
        agentId: 'agent-1',
        personaId: null,
      },
      {
        id: 'participant-2',
        discussionId: 'discussion-1',
        participantType: 'user',
        userId: 'user-1',
        personaId: null,
      },
    ])
    databaseService.findById.mockResolvedValue({ personaId: 'persona-1' })
    databaseService.update.mockResolvedValue({})

    const updatedCount = await service.backfillDiscussionPersonaIds('discussion-1')

    expect(updatedCount).toBe(1)
    expect(databaseService.findById).toHaveBeenCalledWith('agents', 'agent-1')
    expect(databaseService.update).toHaveBeenCalledWith(
      'discussion_participants',
      'participant-1',
      expect.objectContaining({
        personaId: 'persona-1',
      })
    )
  })
})
