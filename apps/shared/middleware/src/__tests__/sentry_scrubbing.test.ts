/**
 * What Sentry is allowed to send.
 *
 * `beforeSend` is the last thing that runs before an event leaves the process,
 * and it is the only place this codebase scrubs anything. It ran from
 * BaseService, so it ran for every service — and it named cookies and three
 * headers while never touching `event.request.data`, which is where the
 * request-data integration puts the parsed body.
 *
 * What that put in reach of GlitchTip: `POST /auth/login` and
 * `/auth/change-password` carry a plaintext `password`, and
 * `POST /api/v1/knowledge/ingest` carries a per-project `cloneToken`. An error
 * on any of those paths is exactly when an event is captured.
 *
 * These tests pin the scrub, not the wiring. They exist because a leak here is
 * silent, retroactive and lands in a system whose whole purpose is to be read
 * later.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const initMock = vi.hoisted(() => vi.fn());

vi.mock('@sentry/bun', () => ({
  init: initMock,
  onUnhandledRejectionIntegration: vi.fn(() => ({ name: 'onUnhandledRejection' })),
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type SentryEvent = {
  request?: {
    data?: unknown;
    headers?: Record<string, string>;
    cookies?: unknown;
    url?: string;
    method?: string;
  };
};

/** The `beforeSend` the service actually installed. */
function installedBeforeSend(): (event: SentryEvent) => SentryEvent | null {
  const config = initMock.mock.calls[0]?.[0] as
    | { beforeSend?: (event: SentryEvent) => SentryEvent | null }
    | undefined;
  if (!config?.beforeSend) throw new Error('Sentry.init was called without a beforeSend');
  return config.beforeSend;
}

describe('Sentry beforeSend scrubbing', () => {
  let beforeSend: (event: SentryEvent) => SentryEvent | null;

  beforeEach(async () => {
    initMock.mockClear();
    // `initialized` is module state and initSentry is idempotent, so the module
    // is re-imported fresh to guarantee init actually runs for this test.
    vi.resetModules();
    const mod = await import('../sentry.js');
    mod.initSentry({ serviceName: 'test-service', dsn: 'https://key@example.invalid/1' });
    beforeSend = installedBeforeSend();
  });

  it('drops the request body entirely', () => {
    const event = beforeSend({
      request: { data: { username: 'p', password: 'hunter2' }, url: 'https://x/auth/login' },
    });

    // Not "password is removed" — the whole body goes. A denylist of secret-ish
    // field names is a list someone must remember to extend every time a route
    // gains a credential, and forgetting is silent.
    expect(event?.request).not.toHaveProperty('data');
  });

  it('drops a body carrying a clone credential', () => {
    const event = beforeSend({
      request: {
        data: { source: 'https://git/x.git', cloneToken: 'gto_secret' },
        url: 'https://x/api/v1/knowledge/ingest',
      },
    });

    expect(JSON.stringify(event)).not.toContain('gto_secret');
  });

  it('scrubs credential-bearing headers, including the platform service token', () => {
    const event = beforeSend({
      request: {
        headers: {
          authorization: 'Bearer secret-jwt',
          cookie: 'access_token=secret-cookie',
          'x-api-key': 'secret-api-key',
          'x-navratna-service-token': 'secret-service-token',
          'user-agent': 'curl/8.0',
        },
      },
    });

    const serialised = JSON.stringify(event);
    expect(serialised).not.toContain('secret-jwt');
    expect(serialised).not.toContain('secret-cookie');
    expect(serialised).not.toContain('secret-api-key');
    expect(serialised).not.toContain('secret-service-token');
    // Scrubbing must stay surgical — an event with nothing left in it is not
    // worth sending, and the point is to keep Sentry useful.
    expect(serialised).toContain('curl/8.0');
  });

  it('drops cookies', () => {
    const event = beforeSend({ request: { cookies: { access_token: 'secret-cookie' } } });

    expect(event?.request).not.toHaveProperty('cookies');
  });

  it('passes through an event with no request attached', () => {
    // Most events have no request context; scrubbing must not throw on them.
    expect(() => beforeSend({})).not.toThrow();
    expect(beforeSend({})).toEqual({});
  });

  it('keeps the url and method, which are what make an event diagnosable', () => {
    const event = beforeSend({
      request: { url: 'https://x/api/v1/knowledge/ingest', method: 'POST', data: { a: 1 } },
    });

    expect(event?.request?.url).toBe('https://x/api/v1/knowledge/ingest');
    expect(event?.request?.method).toBe('POST');
  });
});
