import { logger } from '@uaip/utils';
import { OAuthProviderType } from '@uaip/types';
import { OAuthTokenResolver, type ResolvedOAuthToken } from './oauth_token_resolver';

export const CALENDAR_TOOL_IDS = [
  'calendar-list',
  'calendar-events-list',
  'calendar-event-get',
  'calendar-event-create',
  'calendar-event-update',
  'calendar-event-delete',
  'calendar-freebusy',
] as const;

export type CalendarToolId = (typeof CALENDAR_TOOL_IDS)[number];

export function isCalendarToolId(toolId: string): toolId is CalendarToolId {
  return (CALENDAR_TOOL_IDS as readonly string[]).includes(toolId);
}

export class CalendarToolError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_PARAMS' | 'NOT_CONNECTED' | 'PROVIDER_ERROR'
  ) {
    super(message);
    this.name = 'CalendarToolError';
  }
}

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_PROVIDER_TYPE = OAuthProviderType.GOOGLE;

interface CalendarSummary {
  id: string;
  name: string;
  description?: string;
  timeZone?: string;
  isPrimary: boolean;
  accessRole?: string;
}

interface EventSummary {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  isAllDay: boolean;
  status?: string;
  attendees: string[];
  organizer?: string;
  htmlLink?: string;
}

interface BusyInterval {
  calendarId: string;
  start: string;
  end: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CalendarToolError(`Parameter "${key}" is required`, 'INVALID_PARAMS');
  }
  return value;
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function optionalNumber(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function requireIsoDate(params: Record<string, unknown>, key: string): string {
  const value = requireString(params, key);
  if (Number.isNaN(new Date(value).getTime())) {
    throw new CalendarToolError(`Parameter "${key}" must be an ISO 8601 date`, 'INVALID_PARAMS');
  }
  return value;
}

function optionalIsoDate(params: Record<string, unknown>, key: string): string | undefined {
  const value = optionalString(params, key);
  if (value === undefined) return undefined;
  if (Number.isNaN(new Date(value).getTime())) {
    throw new CalendarToolError(`Parameter "${key}" must be an ISO 8601 date`, 'INVALID_PARAMS');
  }
  return value;
}

function optionalStringArray(params: Record<string, unknown>, key: string): string[] | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new CalendarToolError(`Parameter "${key}" must be an array of strings`, 'INVALID_PARAMS');
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function toCalendarSummary(raw: unknown): CalendarSummary | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    name: asString(raw.summary) ?? id,
    description: asString(raw.description),
    timeZone: asString(raw.timeZone),
    isPrimary: raw.primary === true,
    accessRole: asString(raw.accessRole),
  };
}

/**
 * Google returns `dateTime` for timed events and `date` for all-day events;
 * only one of the two is ever present, which is how all-day is detected.
 */
function readEventBoundary(raw: unknown): { value?: string; isDateOnly: boolean } {
  if (!isRecord(raw)) return { isDateOnly: false };
  const dateTime = asString(raw.dateTime);
  if (dateTime) return { value: dateTime, isDateOnly: false };
  const date = asString(raw.date);
  return { value: date, isDateOnly: Boolean(date) };
}

function toEventSummary(raw: unknown): EventSummary | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;

  const start = readEventBoundary(raw.start);
  const end = readEventBoundary(raw.end);
  const attendees = Array.isArray(raw.attendees)
    ? raw.attendees
        .map((attendee) => (isRecord(attendee) ? asString(attendee.email) : undefined))
        .filter((email): email is string => Boolean(email))
    : [];

  return {
    id,
    title: asString(raw.summary) ?? '(no title)',
    description: asString(raw.description),
    location: asString(raw.location),
    start: start.value,
    end: end.value,
    isAllDay: start.isDateOnly,
    status: asString(raw.status),
    attendees,
    organizer: isRecord(raw.organizer) ? asString(raw.organizer.email) : undefined,
    htmlLink: asString(raw.htmlLink),
  };
}

function buildEventBody(params: Record<string, unknown>, requireTimes: boolean) {
  const startAt = requireTimes ? requireIsoDate(params, 'startAt') : optionalIsoDate(params, 'startAt');
  const endAt = requireTimes ? requireIsoDate(params, 'endAt') : optionalIsoDate(params, 'endAt');
  const attendees = optionalStringArray(params, 'attendees');
  const timeZone = optionalString(params, 'timeZone');

  const body: Record<string, unknown> = {};
  const title = optionalString(params, 'title');
  if (title !== undefined) body.summary = title;
  const description = optionalString(params, 'description');
  if (description !== undefined) body.description = description;
  const location = optionalString(params, 'location');
  if (location !== undefined) body.location = location;
  if (startAt) body.start = { dateTime: startAt, ...(timeZone ? { timeZone } : {}) };
  if (endAt) body.end = { dateTime: endAt, ...(timeZone ? { timeZone } : {}) };
  if (attendees) body.attendees = attendees.map((email) => ({ email }));

  return body;
}

export class CalendarToolService {
  private static instance: CalendarToolService;

  constructor(private readonly tokens: OAuthTokenResolver = OAuthTokenResolver.getInstance()) {}

  static getInstance(): CalendarToolService {
    if (!CalendarToolService.instance) {
      CalendarToolService.instance = new CalendarToolService();
    }
    return CalendarToolService.instance;
  }

  private async requireToken(ownerId: string): Promise<ResolvedOAuthToken> {
    const token = await this.tokens.resolveByProviderType(ownerId, GOOGLE_PROVIDER_TYPE);
    if (!token) {
      throw new CalendarToolError(
        'No Google account is connected. Connect one under Settings → Integrations first.',
        'NOT_CONNECTED'
      );
    }
    if (token.isExpired) {
      throw new CalendarToolError(
        'The connected Google account token has expired. Refresh the connection and retry.',
        'NOT_CONNECTED'
      );
    }
    return token;
  }

  private async call(
    accessToken: string,
    path: string,
    init: { method?: string; query?: Record<string, string | undefined>; body?: unknown } = {}
  ): Promise<unknown> {
    const url = new URL(`${GOOGLE_CALENDAR_BASE}${path}`);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new CalendarToolError(
        `Google Calendar request failed: ${response.status} ${response.statusText}${
          detail ? ` — ${detail.slice(0, 300)}` : ''
        }`,
        'PROVIDER_ERROR'
      );
    }

    if (response.status === 204) return {};
    return response.json().catch(() => ({}));
  }

  async execute(
    toolId: CalendarToolId,
    ownerId: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!ownerId) {
      throw new CalendarToolError(
        'A userId is required to execute this tool',
        'INVALID_PARAMS'
      );
    }

    logger.info('Executing calendar tool', { toolId, ownerId });
    const token = await this.requireToken(ownerId);

    switch (toolId) {
      case 'calendar-list':
        return this.listCalendars(token, params);
      case 'calendar-events-list':
        return this.listEvents(token, params);
      case 'calendar-event-get':
        return this.getEvent(token, params);
      case 'calendar-event-create':
        return this.createEvent(token, params);
      case 'calendar-event-update':
        return this.updateEvent(token, params);
      case 'calendar-event-delete':
        return this.deleteEvent(token, params);
      case 'calendar-freebusy':
        return this.freeBusy(token, params);
    }
  }

  private async listCalendars(token: ResolvedOAuthToken, params: Record<string, unknown>) {
    const response = await this.call(token.accessToken, '/users/me/calendarList', {
      query: { maxResults: String(optionalNumber(params, 'limit') ?? 50) },
    });
    const items = isRecord(response) && Array.isArray(response.items) ? response.items : [];
    const calendars = items
      .map(toCalendarSummary)
      .filter((calendar): calendar is CalendarSummary => calendar !== null);
    return { calendars, count: calendars.length };
  }

  private async listEvents(token: ResolvedOAuthToken, params: Record<string, unknown>) {
    const calendarId = optionalString(params, 'calendarId') ?? 'primary';
    const response = await this.call(
      token.accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        query: {
          timeMin: optionalIsoDate(params, 'timeMin'),
          timeMax: optionalIsoDate(params, 'timeMax'),
          q: optionalString(params, 'query'),
          maxResults: String(optionalNumber(params, 'limit') ?? 50),
          singleEvents: 'true',
          orderBy: 'startTime',
        },
      }
    );
    const items = isRecord(response) && Array.isArray(response.items) ? response.items : [];
    const events = items
      .map(toEventSummary)
      .filter((event): event is EventSummary => event !== null);
    return { calendarId, events, count: events.length };
  }

  private async getEvent(token: ResolvedOAuthToken, params: Record<string, unknown>) {
    const calendarId = optionalString(params, 'calendarId') ?? 'primary';
    const eventId = requireString(params, 'eventId');
    const response = await this.call(
      token.accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    );
    const event = toEventSummary(response);
    if (!event) {
      throw new CalendarToolError('Google returned an unreadable event', 'PROVIDER_ERROR');
    }
    return event;
  }

  private async createEvent(token: ResolvedOAuthToken, params: Record<string, unknown>) {
    const calendarId = optionalString(params, 'calendarId') ?? 'primary';
    requireString(params, 'title');
    const body = buildEventBody(params, true);

    const response = await this.call(
      token.accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: 'POST', body }
    );
    const event = toEventSummary(response);
    if (!event) {
      throw new CalendarToolError('Google returned an unreadable event', 'PROVIDER_ERROR');
    }
    return event;
  }

  private async updateEvent(token: ResolvedOAuthToken, params: Record<string, unknown>) {
    const calendarId = optionalString(params, 'calendarId') ?? 'primary';
    const eventId = requireString(params, 'eventId');
    const body = buildEventBody(params, false);
    if (Object.keys(body).length === 0) {
      throw new CalendarToolError('No fields supplied to update', 'INVALID_PARAMS');
    }

    const response = await this.call(
      token.accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'PATCH', body }
    );
    const event = toEventSummary(response);
    if (!event) {
      throw new CalendarToolError('Google returned an unreadable event', 'PROVIDER_ERROR');
    }
    return event;
  }

  private async deleteEvent(token: ResolvedOAuthToken, params: Record<string, unknown>) {
    const calendarId = optionalString(params, 'calendarId') ?? 'primary';
    const eventId = requireString(params, 'eventId');
    await this.call(
      token.accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' }
    );
    return { deleted: true, calendarId, eventId };
  }

  private async freeBusy(token: ResolvedOAuthToken, params: Record<string, unknown>) {
    const timeMin = requireIsoDate(params, 'timeMin');
    const timeMax = requireIsoDate(params, 'timeMax');
    const calendarIds = optionalStringArray(params, 'calendarIds') ?? ['primary'];

    const response = await this.call(token.accessToken, '/freeBusy', {
      method: 'POST',
      body: { timeMin, timeMax, items: calendarIds.map((id) => ({ id })) },
    });

    const busy: BusyInterval[] = [];
    const calendars = isRecord(response) && isRecord(response.calendars) ? response.calendars : {};
    for (const [calendarId, entry] of Object.entries(calendars)) {
      if (!isRecord(entry) || !Array.isArray(entry.busy)) continue;
      for (const interval of entry.busy) {
        if (!isRecord(interval)) continue;
        const start = asString(interval.start);
        const end = asString(interval.end);
        if (start && end) busy.push({ calendarId, start, end });
      }
    }

    return { timeMin, timeMax, busy, isFree: busy.length === 0 };
  }
}
