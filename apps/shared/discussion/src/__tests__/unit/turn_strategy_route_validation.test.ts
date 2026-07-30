import { describe, it, expect } from 'vitest';
import { testDouble } from '../test_double.js';
import { TurnStrategy } from '@uaip/types';
import type { TurnStrategyConfig } from '@uaip/types';
import { TurnStrategyService } from '../../services/turn_strategy_service.js';

/**
 * PUT /:id/turn-strategy accepts any member of the TurnStrategy enum, but the
 * enum is wider than the set of strategies that actually have a registered
 * implementation. Persisting an unimplemented strategy leaves the discussion
 * unable to advance a turn, so the write path has to validate against the
 * registry — not just the enum.
 */

describe('turn-strategy write path validation', () => {
  const service = new TurnStrategyService();

  const unimplemented = [
    TurnStrategy.PRIORITY_BASED,
    TurnStrategy.FREE_FORM,
    TurnStrategy.EXPERTISE_DRIVEN,
  ];

  it('enum membership alone is not sufficient to accept a strategy', () => {
    for (const strategy of unimplemented) {
      expect(Object.values(TurnStrategy)).toContain(strategy);
    }
  });

  it('rejects every enum strategy that has no registered implementation', () => {
    for (const strategy of unimplemented) {
      const config = testDouble<TurnStrategyConfig>({
        strategy,
        config: { type: strategy },
      });

      const result = service.validateStrategyConfig(strategy, config);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('accepts the strategies that are registered', () => {
    const registered: Array<[TurnStrategy, Record<string, unknown>]> = [
      [TurnStrategy.ROUND_ROBIN, { type: 'round_robin', maxSkips: 1, skipInactive: true }],
      [TurnStrategy.MODERATED, { type: 'moderated', moderatorId: 'mod-1' }],
      [
        TurnStrategy.CONTEXT_AWARE,
        {
          type: 'context_aware',
          relevanceThreshold: 0.5,
          expertiseWeight: 0.5,
          engagementWeight: 0.5,
        },
      ],
    ];

    for (const [strategy, inner] of registered) {
      const config = testDouble<TurnStrategyConfig>({ strategy, config: inner });
      const result = service.validateStrategyConfig(strategy, config);
      expect(result.isValid).toBe(true);
    }
  });
});
