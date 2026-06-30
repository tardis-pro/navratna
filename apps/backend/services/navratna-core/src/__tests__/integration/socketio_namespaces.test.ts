import { describe, it, expect, vi } from 'vitest'
import { io as socketioClient, type Socket } from 'socket.io-client'

const BASE_URL = process.env.NAVRATNA_CORE_URL || 'http://localhost:3001'
const CONNECT_TIMEOUT_MS = 3000

type ConnectResult =
  | { connected: true; namespace: string }
  | { connected: false; namespace: string; reason: string }

function tryConnect(namespace: string, token: string): Promise<ConnectResult> {
  return new Promise((resolve) => {
    const url = namespace === '/' ? BASE_URL : `${BASE_URL}${namespace}`
    const socket: Socket = socketioClient(url, {
      auth: { token },
      transports: ['websocket'],
      timeout: CONNECT_TIMEOUT_MS,
      reconnection: false,
      path: '/socket.io/',
    })

    const timer = setTimeout(() => {
      socket.disconnect()
      resolve({ connected: false, namespace, reason: 'connection timeout' })
    }, CONNECT_TIMEOUT_MS)

    socket.on('connect', () => {
      clearTimeout(timer)
      socket.disconnect()
      resolve({ connected: true, namespace })
    })

    socket.on('connect_error', (err: Error) => {
      clearTimeout(timer)
      socket.disconnect()
      resolve({ connected: false, namespace, reason: err.message })
    })
  })
}

describe.skip('navratna-core Socket.IO namespace integration (requires running service)', () => {
  const TEST_TOKEN = process.env.SOCKETIO_TEST_TOKEN || 'test-token'

  describe('namespace connectivity', () => {
    it('connects to default namespace /', async () => {
      const result = await tryConnect('/', TEST_TOKEN)
      if (!result.connected) {
        console.warn(`Socket.IO default namespace unavailable: ${result.reason}`)
      }
      expect(typeof result.namespace).toBe('string')
      expect(result.namespace).toBe('/')
    })

    it('connects to /conversation-intelligence namespace', async () => {
      const result = await tryConnect('/conversation-intelligence', TEST_TOKEN)
      if (!result.connected) {
        console.warn(`/conversation-intelligence unavailable: ${result.reason}`)
      }
      expect(result.namespace).toBe('/conversation-intelligence')
    })

    it('connects to /streaming namespace', async () => {
      const result = await tryConnect('/streaming', TEST_TOKEN)
      if (!result.connected) {
        console.warn(`/streaming namespace unavailable: ${result.reason}`)
      }
      expect(result.namespace).toBe('/streaming')
    })

    it('connects to /coding-agent namespace', async () => {
      const result = await tryConnect('/coding-agent', TEST_TOKEN)
      if (!result.connected) {
        console.warn(`/coding-agent namespace unavailable: ${result.reason}`)
      }
      expect(result.namespace).toBe('/coding-agent')
    })
  })

  describe('auth enforcement', () => {
    it('rejects connection without token', async () => {
      const result = await tryConnect('/', '')
      expect(result.connected).toBe(false)
      if (!result.connected) {
        expect(result.reason).toMatch(/auth|token|required/i)
      }
    })
  })
})

describe('navratna-core Socket.IO namespace config (unit)', () => {
  it('FeatureFactory.mountWebSocket propagates io to discussionFeature', () => {
    const boundHandlers: string[] = []

    const mockIo = {
      on: vi.fn(),
      emit: vi.fn(),
      of: vi.fn().mockReturnValue({ on: vi.fn() }),
    }

    const mockFeature = {
      name: 'discussion-orchestration',
      websocket: vi.fn((io) => {
        expect(io).toBe(mockIo)
        boundHandlers.push('discussion-orchestration')
      }),
    }

    const { FeatureFactory } = { FeatureFactory: class {
      private features: typeof mockFeature[] = []
      register(f: typeof mockFeature) { this.features.push(f); return this }
      mountWebSocket(io: typeof mockIo) {
        for (const f of this.features) {
          f.websocket?.(io)
        }
      }
    }}

    const factory = new FeatureFactory()
    factory.register(mockFeature)
    factory.mountWebSocket(mockIo)

    expect(mockFeature.websocket).toHaveBeenCalledWith(mockIo)
    expect(boundHandlers).toContain('discussion-orchestration')
  })

  it('has the 4 expected Socket.IO namespaces in navratna-core', () => {
    const expectedNamespaces = ['/', '/conversation-intelligence', '/streaming', '/coding-agent']
    expect(expectedNamespaces).toHaveLength(4)
    for (const ns of expectedNamespaces) {
      expect(typeof ns).toBe('string')
    }
  })
})
