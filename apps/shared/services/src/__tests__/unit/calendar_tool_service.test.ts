import {
  CalendarToolService,
  CalendarToolError,
  isCalendarToolId,
  CALENDAR_TOOL_IDS,
} from '../../services/calendar_tool_service';
import type { OAuthTokenResolver, ResolvedOAuthToken } from '../../services/oauth_token_resolver';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const token = (overrides: Partial<ResolvedOAuthToken> = {}): ResolvedOAuthToken => ({
  connectionId: 'conn-1',
  providerId: 'provider-1',
  providerType: 'google',
  accessToken: 'ya29.token',
  scopes: ['https://www.googleapis.com/auth/calendar'],
  isExpired: false,
  ...overrides,
});

interface Harness {
  service: CalendarToolService;
  resolve: ReturnType<typeof vi.fn>;
  fetchMock: ReturnType<typeof vi.fn>;
}

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: 'OK',
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const makeHarness = (resolved: ResolvedOAuthToken | null = token()): Harness => {
  const resolve = vi.fn().mockResolvedValue(resolved);
  const resolver = { resolveByProviderType: resolve } as unknown as OAuthTokenResolver;
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
  vi.stubGlobal('fetch', fetchMock);
  return { service: new CalendarToolService(resolver), resolve, fetchMock };
};

const lastCall = (fetchMock: ReturnType<typeof vi.fn>) => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: new URL(String(url)), init: (init ?? {}) as RequestInit };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tool id registry', () => {
  it('recognises every registered calendar tool id', () => {
    for (const id of CALENDAR_TOOL_IDS) {
      expect(isCalendarToolId(id)).toBe(true);
    }
  });

  it('does not claim unrelated tool ids', () => {
    expect(isCalendarToolId('task-list')).toBe(false);
    expect(isCalendarToolId('shell-exec')).toBe(false);
  });
});

describe('connection requirements', () => {
  it('refuses to run without a userId rather than resolving a token', async () => {
    const { service, resolve } = makeHarness();

    await expect(service.execute('calendar-list', '', {})).rejects.toThrow(CalendarToolError);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('explains that no Google account is connected', async () => {
    const { service, fetchMock } = makeHarness(null);

    await expect(service.execute('calendar-list', USER_ID, {})).rejects.toThrow(
      /No Google account is connected/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to call the provider with an expired token', async () => {
    const { service, fetchMock } = makeHarness(token({ isExpired: true }));

    await expect(service.execute('calendar-list', USER_ID, {})).rejects.toThrow(/expired/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the resolved token as a bearer credential', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    await service.execute('calendar-list', USER_ID, {});

    const { init } = lastCall(fetchMock);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ya29.token');
  });
});

describe('calendar-list', () => {
  it('maps calendars and flags the primary one', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          { id: 'primary-cal', summary: 'Work', primary: true, timeZone: 'Asia/Kolkata' },
          { id: 'other-cal', summary: 'Personal' },
        ],
      })
    );

    const result = (await service.execute('calendar-list', USER_ID, {})) as {
      calendars: { id: string; isPrimary: boolean }[];
      count: number;
    };

    expect(result.count).toBe(2);
    expect(result.calendars[0]).toMatchObject({ id: 'primary-cal', isPrimary: true });
    expect(result.calendars[1].isPrimary).toBe(false);
  });

  it('drops entries with no id instead of emitting broken rows', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ summary: 'No id' }, { id: 'ok' }] }));

    const result = (await service.execute('calendar-list', USER_ID, {})) as { count: number };

    expect(result.count).toBe(1);
  });
});

describe('calendar-events-list', () => {
  it('defaults to the primary calendar and requests expanded single events', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    await service.execute('calendar-events-list', USER_ID, {});

    const { url } = lastCall(fetchMock);
    expect(url.pathname).toContain('/calendars/primary/events');
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('orderBy')).toBe('startTime');
  });

  it('passes the time window and search query through', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    await service.execute('calendar-events-list', USER_ID, {
      timeMin: '2026-08-03T00:00:00Z',
      timeMax: '2026-08-10T00:00:00Z',
      query: 'review',
    });

    const { url } = lastCall(fetchMock);
    expect(url.searchParams.get('timeMin')).toBe('2026-08-03T00:00:00Z');
    expect(url.searchParams.get('timeMax')).toBe('2026-08-10T00:00:00Z');
    expect(url.searchParams.get('q')).toBe('review');
  });

  it('distinguishes all-day events from timed ones', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          { id: 'timed', summary: 'Standup', start: { dateTime: '2026-08-04T10:00:00Z' } },
          { id: 'allday', summary: 'Holiday', start: { date: '2026-08-05' } },
        ],
      })
    );

    const result = (await service.execute('calendar-events-list', USER_ID, {})) as {
      events: { id: string; isAllDay: boolean }[];
    };

    expect(result.events.find((e) => e.id === 'timed')?.isAllDay).toBe(false);
    expect(result.events.find((e) => e.id === 'allday')?.isAllDay).toBe(true);
  });

  it('flattens attendee emails', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 'e1',
            summary: 'Sync',
            attendees: [{ email: 'a@example.com' }, { email: 'b@example.com' }, {}],
          },
        ],
      })
    );

    const result = (await service.execute('calendar-events-list', USER_ID, {})) as {
      events: { attendees: string[] }[];
    };

    expect(result.events[0].attendees).toEqual(['a@example.com', 'b@example.com']);
  });

  it('rejects a malformed timeMin', async () => {
    const { service } = makeHarness();

    await expect(
      service.execute('calendar-events-list', USER_ID, { timeMin: 'next tuesday' })
    ).rejects.toThrow(/ISO 8601/);
  });

  it('url-encodes a calendar id containing an @', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    await service.execute('calendar-events-list', USER_ID, {
      calendarId: 'team@group.calendar.google.com',
    });

    const { url } = lastCall(fetchMock);
    expect(url.pathname).toContain('team%40group.calendar.google.com');
  });
});

describe('calendar-event-create', () => {
  it('requires a title and both boundaries', async () => {
    const { service } = makeHarness();

    await expect(
      service.execute('calendar-event-create', USER_ID, {
        startAt: '2026-08-04T10:00:00Z',
        endAt: '2026-08-04T11:00:00Z',
      })
    ).rejects.toThrow(/Parameter "title" is required/);

    await expect(
      service.execute('calendar-event-create', USER_ID, { title: 'x' })
    ).rejects.toThrow(/Parameter "startAt" is required/);
  });

  it('POSTs a Google-shaped event body', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(jsonResponse({ id: 'new-event', summary: 'Design review' }));

    await service.execute('calendar-event-create', USER_ID, {
      title: 'Design review',
      startAt: '2026-08-04T10:00:00Z',
      endAt: '2026-08-04T11:00:00Z',
      timeZone: 'Asia/Kolkata',
      attendees: ['someone@example.com'],
    });

    const { init } = lastCall(fetchMock);
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      summary: 'Design review',
      start: { dateTime: '2026-08-04T10:00:00Z', timeZone: 'Asia/Kolkata' },
      end: { dateTime: '2026-08-04T11:00:00Z', timeZone: 'Asia/Kolkata' },
      attendees: [{ email: 'someone@example.com' }],
    });
  });
});

describe('calendar-event-update', () => {
  it('PATCHes only the supplied fields', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(jsonResponse({ id: 'e1', summary: 'Renamed' }));

    await service.execute('calendar-event-update', USER_ID, {
      eventId: 'e1',
      title: 'Renamed',
    });

    const { init } = lastCall(fetchMock);
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ summary: 'Renamed' });
  });

  it('refuses an update with no fields to change', async () => {
    const { service, fetchMock } = makeHarness();

    await expect(
      service.execute('calendar-event-update', USER_ID, { eventId: 'e1' })
    ).rejects.toThrow(/No fields supplied/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires an eventId', async () => {
    const { service } = makeHarness();

    await expect(
      service.execute('calendar-event-update', USER_ID, { title: 'x' })
    ).rejects.toThrow(/Parameter "eventId" is required/);
  });
});

describe('calendar-event-delete', () => {
  it('issues a DELETE and tolerates an empty 204 body', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      statusText: 'No Content',
      json: async () => {
        throw new Error('no body');
      },
      text: async () => '',
    });

    const result = await service.execute('calendar-event-delete', USER_ID, { eventId: 'e1' });

    expect(lastCall(fetchMock).init.method).toBe('DELETE');
    expect(result).toMatchObject({ deleted: true, eventId: 'e1' });
  });
});

describe('calendar-freebusy', () => {
  it('requires both window boundaries', async () => {
    const { service } = makeHarness();

    await expect(
      service.execute('calendar-freebusy', USER_ID, { timeMin: '2026-08-04T12:00:00Z' })
    ).rejects.toThrow(/Parameter "timeMax" is required/);
  });

  it('flattens busy intervals across calendars', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(
      jsonResponse({
        calendars: {
          primary: { busy: [{ start: '2026-08-04T13:00:00Z', end: '2026-08-04T14:00:00Z' }] },
          other: { busy: [{ start: '2026-08-04T15:00:00Z', end: '2026-08-04T16:00:00Z' }] },
        },
      })
    );

    const result = (await service.execute('calendar-freebusy', USER_ID, {
      timeMin: '2026-08-04T12:00:00Z',
      timeMax: '2026-08-04T18:00:00Z',
    })) as { busy: { calendarId: string }[]; isFree: boolean };

    expect(result.busy).toHaveLength(2);
    expect(result.busy.map((b) => b.calendarId)).toEqual(['primary', 'other']);
    expect(result.isFree).toBe(false);
  });

  it('reports a fully free window', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue(jsonResponse({ calendars: { primary: { busy: [] } } }));

    const result = (await service.execute('calendar-freebusy', USER_ID, {
      timeMin: '2026-08-04T12:00:00Z',
      timeMax: '2026-08-04T18:00:00Z',
    })) as { isFree: boolean };

    expect(result.isFree).toBe(true);
  });
});

describe('provider failures', () => {
  it('surfaces a Google error instead of returning a success envelope', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({}),
      text: async () => '{"error":"insufficientPermissions"}',
    });

    await expect(service.execute('calendar-list', USER_ID, {})).rejects.toThrow(
      /Google Calendar request failed: 403/
    );
  });

  it('classifies provider failures separately from bad input', async () => {
    const { service, fetchMock } = makeHarness();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({}),
      text: async () => '',
    });

    await expect(service.execute('calendar-list', USER_ID, {})).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
  });
});
