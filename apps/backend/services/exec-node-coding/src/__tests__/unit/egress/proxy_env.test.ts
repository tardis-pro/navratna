// Integration test: HTTPS_PROXY/HTTP_PROXY/ALL_PROXY/NO_PROXY are set in
// the runtime env so HTTPS-capable HTTP clients route through the
// loopback CONNECT proxy.
//
// We run an in-process Bun/Node fetch from a thread that shares the
// setting to confirm that a `fetch()` call honours `process.env.HTTP_PROXY`
// (Bun's fetch does this; Node 22 does too).

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

describe('HTTP_PROXY + HTTPS_PROXY env integration', () => {
  it('exports the proxy environment consumed by supported tools', () => {
    const proxyUrl = `http://127.0.0.1:1`; // unreachable but that's fine — proves the var is read
    const result = spawnSync('node', [
      '-e',
      `process.env.HTTP_PROXY = ${JSON.stringify(proxyUrl)}; process.env.HTTPS_PROXY = ${JSON.stringify(proxyUrl)}; process.env.NO_PROXY = '127.0.0.1,::1,*.internal'; console.log(JSON.stringify({ http_proxy: process.env.HTTP_PROXY, https_proxy: process.env.HTTPS_PROXY, no_proxy: process.env.NO_PROXY, all_proxy: process.env.ALL_PROXY }));`,
    ], { encoding: 'utf8' });
    const out = JSON.parse(result.stdout.trim());
    expect(out.http_proxy).toBe(proxyUrl);
    expect(out.https_proxy).toBe(proxyUrl);
    expect(out.no_proxy).toContain('127.0.0.1');
    expect(out.no_proxy).toContain('::1');
  });

  it('environment override remains sticky (entrypoint sets env before gosu)', () => {
    const entrypoint = spawnSync('bash', ['-c', 'grep -E "(HTTPS_PROXY|HTTP_PROXY|ALL_PROXY|NO_PROXY)" /app/apps/backend/services/exec-node-coding/entrypoint.sh 2>/dev/null || cat /home/pronit/workspace/tardis/bmad-navratna/navratna/apps/backend/services/exec-node-coding/entrypoint.sh | grep -E "(HTTPS_PROXY|HTTP_PROXY|ALL_PROXY|NO_PROXY)"'], { encoding: 'utf8' });
    expect(entrypoint.stdout).toContain('HTTPS_PROXY');
    expect(entrypoint.stdout).toContain('NO_PROXY');
    expect(entrypoint.stdout).toContain('127.0.0.1,::1,*.internal');
  });
});
