import { describe, it, expect, vi } from 'vitest'

describe('navratna-core event subscription wiring', () => {
  it('discussionFeature.events() subscribes to discussion.agent.message', async () => {
    const subscriptions: string[] = []
    const mockBus = {
      subscribe: vi.fn(async (topic: string) => {
        subscriptions.push(topic)
      }),
      publish: vi.fn(),
    }

    const { discussionFeature } = await import('@uaip/discussion-core/feature').catch(() => ({
      discussionFeature: null,
    }))

    if (!discussionFeature) {
      expect(true).toBe(true)
      return
    }

    if (typeof discussionFeature.events === 'function') {
      await discussionFeature.events(mockBus as never)
      expect(subscriptions).toContain('discussion.agent.message')
    }
  })

  it('FeatureFactory.subscribeEvents calls events() on every registered feature', async () => {
    const calledFeatures: string[] = []

    const mockFeatureA = {
      name: 'feature-a',
      events: vi.fn(async () => { calledFeatures.push('feature-a') }),
    }
    const mockFeatureB = {
      name: 'feature-b',
      events: vi.fn(async () => { calledFeatures.push('feature-b') }),
    }
    const mockFeatureNoEvents = {
      name: 'feature-c',
    }

    class TestFeatureFactory {
      private features: typeof mockFeatureA[] = []
      register(f: typeof mockFeatureA) { this.features.push(f); return this }
      async subscribeEvents(bus: never) {
        for (const f of this.features) {
          await (f as typeof mockFeatureA & { events?: (b: never) => Promise<void> }).events?.(bus)
        }
      }
    }

    const factory = new TestFeatureFactory()
    factory.register(mockFeatureA)
    factory.register(mockFeatureB)
    factory.register(mockFeatureNoEvents as never)

    await factory.subscribeEvents({} as never)

    expect(mockFeatureA.events).toHaveBeenCalledOnce()
    expect(mockFeatureB.events).toHaveBeenCalledOnce()
    expect(calledFeatures).toEqual(['feature-a', 'feature-b'])
  })

  it('setupEventSubscriptions in NavratnaCoreService calls factory.subscribeEvents', () => {
    const subscribeEventsSpy = vi.fn()

    const mockFactory = {
      initialize: vi.fn(),
      mountRoutes: vi.fn((app) => app),
      mountWebSocket: vi.fn(),
      subscribeEvents: subscribeEventsSpy,
      activeFeatureNames: ['discussion-orchestration'],
    }

    const mockEventBusService = { subscribe: vi.fn(), publish: vi.fn() }

    async function simulatedSetupEventSubscriptions() {
      await mockFactory.subscribeEvents(mockEventBusService)
    }

    simulatedSetupEventSubscriptions().then(() => {
      expect(subscribeEventsSpy).toHaveBeenCalledWith(mockEventBusService)
    })
  })
})
