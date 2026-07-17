// Tests for the in-memory phase store used by both the proxy and the
// admin listener.

import { describe, it, expect } from 'vitest';
import { PhaseStore } from '../../../egress/phase_store.js';
import {
  SETUP_PHASE_HOST_ALLOWLIST,
  AGENT_PHASE_HOST_ALLOWLIST,
} from '@uaip/types';

describe('PhaseStore', () => {
  it('starts with no phase (deny-all)', () => {
    const s = new PhaseStore();
    expect(s.get()).toBeNull();
    expect(s.allowedHosts()).toBeNull();
  });

  it('transition to setup returns setup allowlist', () => {
    const s = new PhaseStore();
    const out = s.set('setup');
    expect(out).toBe('setup');
    expect(s.get()).toBe('setup');
    expect(s.allowedHosts()).toEqual([...SETUP_PHASE_HOST_ALLOWLIST]);
  });

  it('transition to agent returns agent allowlist', () => {
    const s = new PhaseStore();
    s.set('agent');
    expect(s.allowedHosts()).toEqual([...AGENT_PHASE_HOST_ALLOWLIST]);
  });

  it('clear restores deny-all', () => {
    const s = new PhaseStore();
    s.set('setup');
    s.clear();
    expect(s.get()).toBeNull();
    expect(s.allowedHosts()).toBeNull();
  });

  it('returned allowlist is a defensive copy', () => {
    const s = new PhaseStore();
    s.set('setup');
    const a = s.allowedHosts()!;
    (a as string[]).push('evilhost.com');
    const b = s.allowedHosts()!;
    expect(b).toEqual([...SETUP_PHASE_HOST_ALLOWLIST]);
  });
});
