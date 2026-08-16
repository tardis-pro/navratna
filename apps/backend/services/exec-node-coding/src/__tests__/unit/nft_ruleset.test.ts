// Static analysis of the nft ruleset. Reads the file from disk and
// verifies exact rules are present in the produced output — no nft kernel
// needed. This is the contract the container's entrypoint relies on.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const RULESET_PATH = path.resolve(__dirname, '../../../scripts/nft-ruleset.nft');

function readRuleset(): string {
  return fs.readFileSync(RULESET_PATH, 'utf8');
}

describe('nftables ruleset — exact rule contract', () => {
  const s = readRuleset();

  it('has table inet exec_node_sandbox', () => {
    expect(s).toMatch(/^table\s+inet\s+exec_node_sandbox\b/m);
  });

  it('has input chain with policy drop', () => {
    expect(s).toMatch(/^\s*chain\s+input\s*\{/m);
    expect(s).toMatch(/type\s+filter\s+hook\s+input\s+priority\s+filter;\s*policy\s+drop/m);
  });

  it('has output chain with policy drop', () => {
    expect(s).toMatch(/^\s*chain\s+output\s*\{/m);
    expect(s).toMatch(/type\s+filter\s+hook\s+output\s+priority\s+filter;\s*policy\s+drop/m);
  });

  it('input chain allows established/related', () => {
    expect(s).toMatch(/ct\s+state\s+established,related\s+accept/);
  });

  it('input chain allows 6PN on port 3009 (coding) and 15444 (admin)', () => {
    expect(s).toMatch(/ip6\s+saddr\s+fdaa::\/8\s+tcp\s+dport\s+\{?\s*3009\s*,\s*15444\s*\}?\s+accept/);
  });

  it('output chain drops invalid connections', () => {
    expect(s).toMatch(/ct\s+state\s+invalid\s+drop/);
  });

  it('output chain allows loopback output', () => {
    expect(s).toMatch(/oifname\s+"?lo"?\s+accept/);
  });

  it('output chain allows UID 1002 UDP and TCP port 53 (DNS)', () => {
    expect(s).toMatch(/skuid\s+1002\s+udp\s+dport\s+53\s+accept/);
    expect(s).toMatch(/skuid\s+1002\s+tcp\s+dport\s+53\s+accept/);
  });

  it('output chain allows UID 1002 tcp/443 only', () => {
    expect(s).toMatch(/skuid\s+1002\s+tcp\s+dport\s+443\s+accept/);
  });

  it('output chain does NOT allow UID 1001 any non-loopback port', () => {
    // No "skuid 1001" accept rule outside loopback must exist.
    const lines = s.split('\n');
    const violations: string[] = [];
    for (const line of lines) {
      if (line.includes('skuid 1001') && line.trim().endsWith('accept')) {
        violations.push(line.trim());
      }
    }
    expect(violations).toEqual([]);
    // We rely on "policy drop" + loopback accept to enforce the default-deny.
  });

  it('output chain does NOT have a wild UID1001 to tcp/443', () => {
    expect(s).not.toMatch(/skuid\s+1001\s+tcp\s+dport\s+443\s+accept/);
  });

  it('output chain does NOT have a wild UID1001 tcp/443 allow-all' , () => {
    // Critical: no broad UID1001 accept (port-agnostic) would mean a port-policy
    // masquerading as a destination guarantee. Our nftables is destination-blind —
    // host isolation comes from the CONNECT proxy.
    expect(s).not.toMatch(/skuid\s+1001[^\\]*\s+accept[^\\]*tcp/);
  });
});
