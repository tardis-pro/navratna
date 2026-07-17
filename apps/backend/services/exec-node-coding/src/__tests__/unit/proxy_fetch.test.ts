import { describe, expect, it, vi } from 'vitest';
import { createProxyFetch } from '../../proxy_fetch.js';

describe('provider proxy fetch transport', () => {
  it('adds Bun proxy transport to HTTPS provider requests', async () => {
    const nativeFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const proxyFetch = createProxyFetch(nativeFetch as typeof globalThis.fetch, 'http://127.0.0.1:15443');

    await proxyFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer test' },
    });

    expect(nativeFetch).toHaveBeenCalledTimes(1);
    const init = nativeFetch.mock.calls[0]?.[1] as RequestInit & { proxy?: string };
    expect(init.proxy).toBe('http://127.0.0.1:15443');
    expect(init.method).toBe('POST');
  });
});
