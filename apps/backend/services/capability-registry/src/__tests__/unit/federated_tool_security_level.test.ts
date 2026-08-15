/**
 * What a federated tool is registered as, and why it matters.
 *
 * syncTools stamped 'medium' on every federated tool, and getRequiredSecurityLevel
 * falls back to MEDIUM for anything unrecognised, so 143 of 147 registered tools
 * required level 2. The system actor resolves to level 1 and cannot be raised —
 * resolveSecurityLevel returns 1 for any inactive user, and EnsureSystemActor
 * keeps that account inactive so it cannot be logged into. A scheduled run
 * therefore sat one level below a read-only metrics query.
 */

import { describe, it, expect } from 'vitest';
import { federatedToolSecurityLevel } from '../../utils/federated_tool_security.js';

describe('federatedToolSecurityLevel', () => {
  it.each(['find_anomalies', 'recent_errors', 'http_errors', 'release_history', 'code_quality'])(
    'registers the read-only evidence tool %s as low',
    (name) => {
      expect(federatedToolSecurityLevel(name)).toBe('low');
    }
  );

  it.each(['create_task', 'restart', 'rollback', 'write_dev_file', 'redeploy'])(
    'leaves the write-capable tool %s at medium',
    (name) => {
      // A caller that cannot be logged into should be able to look, not to act.
      expect(federatedToolSecurityLevel(name)).toBe('medium');
    }
  );

  it('does not lower anything it was not asked to lower', () => {
    expect(federatedToolSecurityLevel('some_unrelated_producer_tool')).toBe('medium');
    // Read-only, but out of scope for this change — reaching it is a separate call.
    expect(federatedToolSecurityLevel('explain_finding')).toBe('medium');
  });

  it('matches on the exact tool name, not a prefix or a registry id', () => {
    // The registry id is `federation:<subdomainId>:<toolName>`; the level is
    // decided from the producer-local name that syncTools passes in.
    expect(federatedToolSecurityLevel('federation:abc:find_anomalies')).toBe('medium');
    expect(federatedToolSecurityLevel('find_anomalies_v2')).toBe('medium');
  });
});
