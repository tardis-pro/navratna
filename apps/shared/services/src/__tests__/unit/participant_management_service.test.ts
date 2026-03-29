import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ParticipantManagementService } from '../../participant_management_service'

describe('ParticipantManagementService', () => {
  const databaseService = {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  }

  let service: ParticipantManagementService

  beforeEach(() => {
    vi.clearAllMocks()
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
})
