import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.DELETION_HASH_SALT ??= 'test-deletion-hash-salt';

/**
 * `web-search` used to fabricate everything it returned: URLs synthesised from
 * the query string (`https://www.<query>.com`), invented snippets, and a
 * `searchTime` from `Math.random()`. It was a registered, classified,
 * dispatchable tool, so an agent granted it cited invented sources as research.
 * `file-reader` was the same shape for any file path.
 *
 * These tests exist to keep both from coming back, and to pin the one piece of
 * behaviour that is easy to get subtly wrong: an empty result set from a
 * degraded search backend must not read as "nothing exists".
 */

const FIRECRAWL = 'https://firecrawl.test';

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function newExecutor() {
  const { BaseToolExecutor } = await import('../../services/base_tool_executor.js');
  return new BaseToolExecutor();
}

describe('web tools backed by Firecrawl', () => {
  beforeEach(() => {
    process.env.FIRECRAWL_API_URL = FIRECRAWL;
  });

  afterEach(() => {
    delete process.env.FIRECRAWL_API_URL;
    vi.unstubAllGlobals();
  });

  it('returns real search results and never synthesises a URL from the query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonOk({
          success: true,
          data: {
            web: [
              {
                url: 'https://modelcontextprotocol.io/docs/intro',
                title: 'What is the Model Context Protocol?',
                description: 'MCP is an open standard for connecting AI applications.',
              },
            ],
          },
        })
      )
    );

    const result = (await (await newExecutor()).execute('web-search', {
      query: 'model context protocol',
    })) as { results: Array<{ url: string; title: string; domain: string }>; resultCount: number };

    expect(result.resultCount).toBe(1);
    expect(result.results[0]!.url).toBe('https://modelcontextprotocol.io/docs/intro');
    expect(result.results[0]!.domain).toBe('modelcontextprotocol.io');

    // The old implementation's signature fabrication.
    const urls = result.results.map((r) => r.url).join(' ');
    expect(urls, 'must not invent a domain from the query string').not.toContain(
      'modelcontextprotocol.com'
    );
    expect(urls).not.toContain('wikipedia.org/wiki/model%20context%20protocol');
  });

  it('labels an empty result set as inconclusive rather than as absence', async () => {
    // The search backend is SearxNG scraping upstream engines from one shared
    // IP. Throttled, it returns a well-formed EMPTY result set, not an error —
    // indistinguishable from a genuine miss. Reporting a clean "no results"
    // would invite a confident sourceless conclusion.
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk({ success: true, data: { web: [] } })));

    const result = (await (await newExecutor()).execute('web-search', {
      query: 'something obscure',
    })) as { resultCount: number; reliability?: string; note?: string };

    expect(result.resultCount).toBe(0);
    expect(result.reliability, 'an empty search must be marked unconfirmed').toBe('unconfirmed');
    expect(result.note ?? '').toMatch(/rate-limited|degraded/i);
    expect(result.note ?? '', 'must warn against concluding absence').toMatch(/do not conclude/i);
  });

  it('fails loudly when Firecrawl is not configured, rather than inventing results', async () => {
    delete process.env.FIRECRAWL_API_URL;
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk({ success: true, data: { web: [] } })));

    await expect(
      (await newExecutor()).execute('web-search', { query: 'anything' })
    ).rejects.toThrow(/FIRECRAWL_API_URL is not configured/);
  });

  it('fails loudly when the search backend errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream boom', { status: 502 })));

    await expect(
      (await newExecutor()).execute('web-search', { query: 'anything' })
    ).rejects.toThrow(/HTTP 502/);
  });

  it('fetches a page as markdown through the v2 endpoint', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return jsonOk({
          success: true,
          data: { markdown: '# Example\n\nBody text.', metadata: { title: 'Example Domain' } },
        });
      })
    );

    const result = (await (await newExecutor()).execute('web-fetch', {
      url: 'https://example.com/page',
    })) as { markdown: string; title: string };

    expect(result.markdown).toContain('Body text.');
    expect(result.title).toBe('Example Domain');
    expect(calls[0], 'the platform is aligned on the v2 surface').toBe(`${FIRECRAWL}/v2/scrape`);
  });

  it('refuses a non-http scheme instead of handing it to the fetcher', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      (await newExecutor()).execute('web-fetch', { url: 'file:///etc/passwd' })
    ).rejects.toThrow(/non-http/);
    expect(fetchSpy, 'must be rejected before any request is issued').not.toHaveBeenCalled();
  });

  it('holds concurrent Firecrawl calls to the shared render budget', async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return jsonOk({ success: true, data: { web: [] } });
      })
    );

    const executor = await newExecutor();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => executor.execute('web-search', { query: `q${i}` }))
    );

    // The remote allows 3 concurrent renders across every consumer on the
    // platform, Hermes included. Eight agent turns at once must queue.
    expect(peak, 'must not exceed the configured concurrency gate').toBeLessThanOrEqual(2);
  });
});

describe('file-reader', () => {
  it('throws instead of returning simulated content', async () => {
    const executor = await newExecutor();

    await expect(executor.execute('file-reader', { filePath: '/etc/hosts' })).rejects.toThrow(
      /not implemented/i
    );

    // The exact strings the old stub produced, per file extension.
    await expect(executor.execute('file-reader', { filePath: 'notes.txt' })).rejects.toThrow(
      /SIMULATED content/
    );
  });
});
