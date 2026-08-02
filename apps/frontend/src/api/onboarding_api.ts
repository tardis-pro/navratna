import { resolveApiOrigin } from '@/config/api_config';
import { csrfService } from '@/services/c_s_r_f_service';
import { EdenClientError } from './eden';
import type {
  OnboardingCompleteData,
  OnboardingSlotKey,
  OnboardingSlotUpdateData,
  OnboardingSlotUpdateRequest,
  OnboardingStartOutcome,
  OnboardingStatusData,
  OnboardingTurnOutcome,
  OnboardingTurnRequest,
} from './onboarding_api.types';

const BASE_PATH = '/api/v1/onboarding';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function buildHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = await csrfService.getToken();
    if (token) headers['X-CSRF-Token'] = token;
  } catch {
    // A missing CSRF token is not fatal here: the request still carries the
    // session cookie, and the server answers 403 if it genuinely requires one.
  }
  return headers;
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || body.success !== true || body.data === undefined) {
    throw new EdenClientError(
      body.message ?? body.error ?? `Request failed with status ${response.status}`,
      response.status,
      body.error
    );
  }

  return body.data;
}

async function request<T>(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${resolveApiOrigin()}${BASE_PATH}${path}`, {
    ...init,
    credentials: 'include',
    headers: await buildHeaders(),
  });
}

export const onboardingAPI = {
  async getInterview(): Promise<OnboardingStatusData> {
    return readEnvelope<OnboardingStatusData>(await request('/interview'));
  },

  /**
   * 409 means this user already finished or abandoned onboarding. The server
   * refuses to reopen it, so the caller must settle rather than retry.
   */
  async startInterview(): Promise<OnboardingStartOutcome> {
    const response = await request('/interview', { method: 'POST' });
    if (response.status === 409) return { kind: 'already_finished' };
    return { kind: 'started', data: await readEnvelope<OnboardingStatusData>(response) };
  },

  /**
   * 409 and 202 are expected control-flow, not failures: the caller must keep
   * the user's typed text and re-render, so they are returned as outcomes.
   * 503 means the extractor could not read the answer — the same turn id may be
   * retried, which the server treats idempotently.
   */
  async sendTurn(body: OnboardingTurnRequest): Promise<OnboardingTurnOutcome> {
    const response = await request('/interview/turns', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (response.status === 409) return { kind: 'conflict' };
    if (response.status === 202) return { kind: 'in_flight' };
    if (response.status === 503) return { kind: 'unavailable' };

    return { kind: 'committed', data: await readEnvelope(response) };
  },

  async updateSlot(
    slotKey: OnboardingSlotKey,
    body: OnboardingSlotUpdateRequest
  ): Promise<OnboardingSlotUpdateData> {
    return readEnvelope<OnboardingSlotUpdateData>(
      await request(`/interview/slots/${slotKey}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
    );
  },

  async complete(): Promise<OnboardingCompleteData> {
    return readEnvelope<OnboardingCompleteData>(
      await request('/interview/complete', { method: 'POST' })
    );
  },

  async skip(): Promise<void> {
    await request('/interview/skip', { method: 'POST' });
  },
};
