// cognitive_portrait_routes.test.ts — kept in backend, exercises @uaip/agent-intelligence-core route.
// The vitest.config.ts aliases @uaip/agent-intelligence-core → apps/shared/agent-intelligence/dist so
// the relative mock paths below resolve to the SAME absolute files that the -core route imports.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Elysia } from 'elysia'
import { registerCognitivePortraitRoutes } from '@uaip/agent-intelligence-core'

vi.mock('@uaip/middleware', () => ({
  withNginxAuth: (app: Elysia) => app,
  t: {
    Object: vi.fn(() => ({})),
    String: vi.fn(() => ({})),
    Optional: vi.fn(() => ({})),
  },
}))

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>()
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../../../../../../shared/agent-intelligence/dist/services/cognitive_portrait_service.js', () => ({
  getPortrait: vi.fn(),
  updateTrustCalibration: vi.fn(),
  getPersonalizationVector: vi.fn(),
}))

import {
  getPortrait,
  updateTrustCalibration,
  getPersonalizationVector,
} from '../../../../../../shared/agent-intelligence/dist/services/cognitive_portrait_service.js'

const mockGetPortrait = vi.mocked(getPortrait)
const mockUpdateTrustCalibration = vi.mocked(updateTrustCalibration)
const mockGetPersonalizationVector = vi.mocked(getPersonalizationVector)

describe('cognitive_portrait_routes', () => {
  let app: Elysia

  beforeEach(() => {
    vi.clearAllMocks()
    app = new Elysia().use(registerCognitivePortraitRoutes())
  })

  describe('GET /api/v1/users/:userId/cognitive-portrait', () => {
    it('returns cognitive portrait for a user', async () => {
      const mockPortrait = {
        userId: 'user-123',
        decisionStyle: 'analytical',
        communicationPreferences: {},
        trustCalibration: {},
        learningVelocity: 0.8,
      }
      mockGetPortrait.mockResolvedValueOnce(mockPortrait as never)

      const response = await app.handle(
        new Request('http://localhost/api/v1/users/user-123/cognitive-portrait')
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(mockGetPortrait).toHaveBeenCalledWith({ userId: 'user-123', forceRecompute: false })
    })

    it('passes forceRecompute=true when query param is set', async () => {
      mockGetPortrait.mockResolvedValueOnce({ userId: 'user-123' } as never)

      await app.handle(
        new Request('http://localhost/api/v1/users/user-123/cognitive-portrait?forceRecompute=true')
      )

      expect(mockGetPortrait).toHaveBeenCalledWith({ userId: 'user-123', forceRecompute: true })
    })

    it('returns 500 when service throws', async () => {
      mockGetPortrait.mockRejectedValueOnce(new Error('DB connection failed'))

      const response = await app.handle(
        new Request('http://localhost/api/v1/users/user-123/cognitive-portrait')
      )

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error).toBe('Failed to get cognitive portrait')
    })
  })

  describe('POST /api/v1/users/:userId/cognitive-portrait/calibrate', () => {
    it('updates trust calibration successfully', async () => {
      const mockTrust = { agentId: 'agent-1', level: 0.9 }
      mockUpdateTrustCalibration.mockResolvedValueOnce(mockTrust as never)

      const response = await app.handle(
        new Request('http://localhost/api/v1/users/user-123/cognitive-portrait/calibrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'accept', agentId: 'agent-1', context: 'code-review' }),
        })
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.trustCalibration).toEqual(mockTrust)
    })

    it('returns 400 when body is invalid', async () => {
      const response = await app.handle(
        new Request('http://localhost/api/v1/users/user-123/cognitive-portrait/calibrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'invalid-action', agentId: '', context: '' }),
        })
      )

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.success).toBe(false)
    })

    it('returns 500 when service throws', async () => {
      mockUpdateTrustCalibration.mockRejectedValueOnce(new Error('Trust update failed'))

      const response = await app.handle(
        new Request('http://localhost/api/v1/users/user-123/cognitive-portrait/calibrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'accept', agentId: 'agent-1', context: 'review' }),
        })
      )

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)
    })
  })

  describe('GET /api/v1/users/:userId/personalization-vector', () => {
    it('returns personalization vector for a user', async () => {
      const mockVector = { dimensions: [0.1, 0.5, 0.9], userId: 'user-123' }
      mockGetPersonalizationVector.mockReturnValueOnce(mockVector as never)

      const response = await app.handle(
        new Request('http://localhost/api/v1/users/user-123/personalization-vector')
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.personalizationVector).toEqual(mockVector)
      expect(mockGetPersonalizationVector).toHaveBeenCalledWith('user-123')
    })

    it('returns 500 when service throws', async () => {
      mockGetPersonalizationVector.mockImplementationOnce(() => {
        throw new Error('Vector computation failed')
      })

      const response = await app.handle(
        new Request('http://localhost/api/v1/users/user-123/personalization-vector')
      )

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)
    })
  })
})
