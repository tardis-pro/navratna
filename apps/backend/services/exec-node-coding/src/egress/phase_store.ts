// In-memory phase + allowed-host store for the two-phase egress proxy.
//
// Phase state lives ONLY in process memory (not persisted across a machine
// restart) — a fresh machine starts with no phase set, so any HTTP traffic
// from UID1001 is denied until the gateway transitions it explicitly.
//
// The store is a plain class (no I/O). It is shared with the admin listener
// and the proxy via dependency injection — both of which run as UID1002.

import {
  AGENT_PHASE_HOST_ALLOWLIST,
  SETUP_PHASE_HOST_ALLOWLIST,
} from '@uaip/types';
import type { CodingEgressPhase } from '@uaip/types';

export class PhaseStore {
  private phase: CodingEgressPhase | null = null;

  get(): CodingEgressPhase | null { return this.phase; }

  set(p: CodingEgressPhase): CodingEgressPhase {
    this.phase = p;
    return p;
  }

  clear(): void { this.phase = null; }

  /** Returns the allowlist for the current phase, or null if no phase set (deny-all). */
  allowedHosts(): ReadonlyArray<string> | null {
    if (this.phase === 'setup') return [...SETUP_PHASE_HOST_ALLOWLIST];
    if (this.phase === 'agent') return [...AGENT_PHASE_HOST_ALLOWLIST];
    return null;
  }
}
