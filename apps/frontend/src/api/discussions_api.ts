/**
 * Discussion Management API Client
 * Handles all discussion-related operations
 */

import { coreClient, edenWithCSRFRetry, edenRequest, unwrapEden as _unwrapEden } from './eden';
import { getStoredUserId } from '@/utils/auth_storage';
import type {
  Discussion,
  DiscussionParticipant,
  DiscussionMessage,
  CreateDiscussionRequest,
  UpdateDiscussionRequest,
  DiscussionAnalytics as SharedDiscussionAnalytics,
  MessageRequest,
  TurnRequest,
  DiscussionListOptions,
} from '@uaip/contracts/api';

export type DiscussionCreate = CreateDiscussionRequest;

export type DiscussionUpdate = UpdateDiscussionRequest;

export type DiscussionAnalytics = SharedDiscussionAnalytics;

export type { MessageRequest, TurnRequest, DiscussionListOptions };

/**
 * `order: 'desc'` returns the NEWEST messages first. Needed for a preview, where
 * fetching ascending would return the oldest page and force reading the whole
 * transcript just to find the latest line.
 */
export interface DiscussionMessageQuery {
  page?: number;
  limit?: number;
  since?: string;
  order?: 'asc' | 'desc';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const discussions = coreClient.api.v1.discussions

export const discussionsAPI = {
  async list(options?: DiscussionListOptions): Promise<Discussion[]> {
    const response = await edenWithCSRFRetry(() => discussions.get({ query: options }));

    if (Array.isArray(response)) {
      return response;
    }

    if (isRecord(response) && 'discussions' in response && Array.isArray(response['discussions'])) {
      const arr: any = response['discussions']; // oxlint-disable-line @typescript-eslint/no-explicit-any -- elements are Discussion objects; runtime-validated
      return arr;
    }

    if (isRecord(response) && 'data' in response && Array.isArray(response['data'])) {
      const arr: any = response['data']; // oxlint-disable-line @typescript-eslint/no-explicit-any -- elements are Discussion objects; runtime-validated
      return arr;
    }

    return [];
  },

  async get(id: string): Promise<Discussion> {
    return edenWithCSRFRetry(() => discussions({ id }).get());
  },

  async create(discussion: DiscussionCreate): Promise<Discussion> {
    return edenWithCSRFRetry(() => discussions.post(discussion));
  },

  async update(id: string, updates: DiscussionUpdate): Promise<Discussion> {
    return edenWithCSRFRetry(() => discussions({ id }).put(updates));
  },

  async delete(id: string): Promise<void> {
    return edenRequest(`/api/v1/discussions/${id}`, { method: 'DELETE' });
  },

  async start(id: string, startedBy?: string): Promise<Discussion> {
    const resolvedStartedBy = startedBy ?? getStoredUserId();
    return edenWithCSRFRetry(() =>
      discussions({ id }).start.post(resolvedStartedBy ? { startedBy: resolvedStartedBy } : {})
    );
  },

  async pause(id: string, reason?: string): Promise<Discussion> {
    return edenRequest(`/api/v1/discussions/${id}/pause`, { method: 'POST', body: { reason } });
  },

  async resume(id: string): Promise<Discussion> {
    return edenRequest(`/api/v1/discussions/${id}/resume`, { method: 'POST' });
  },

  async end(id: string, reason?: string): Promise<Discussion> {
    return edenWithCSRFRetry(() => discussions({ id }).end.post({ reason }));
  },

  async complete(id: string, summary?: string): Promise<Discussion> {
    return edenRequest(`/api/v1/discussions/${id}/complete`, {
      method: 'POST',
      body: { summary },
    });
  },

  async addParticipant(
    discussionId: string,
    participantId: string
  ): Promise<DiscussionParticipant> {
    return edenWithCSRFRetry(() =>
      discussions({ id: discussionId }).participants.post({ agentId: participantId })
    );
  },

  async removeParticipant(discussionId: string, participantId: string): Promise<void> {
    return edenWithCSRFRetry(() =>
      discussions({ id: discussionId }).participants({ pid: participantId }).delete()
    );
  },

  /**
   * Posts AS a specific participant. The participant id is part of the path
   * because the server refuses (403) unless it belongs to the caller — one user
   * can never post as another. There is no actor-neutral message route: the old
   * POST /:id/messages was never implemented and always 404'd.
   */
  async sendParticipantMessage(
    discussionId: string,
    participantId: string,
    message: MessageRequest
  ): Promise<DiscussionMessage> {
    return edenRequest(
      `/api/v1/discussions/${discussionId}/participants/${participantId}/messages`,
      { method: 'POST', body: message }
    );
  },

  async getMessages(
    discussionId: string,
    options?: DiscussionMessageQuery
  ): Promise<DiscussionMessage[]> {
    const response = await edenWithCSRFRetry(() =>
      discussions({ id: discussionId }).messages.get({ query: options })
    );
    if (Array.isArray(response)) {
      return response;
    }
    if (isRecord(response) && 'messages' in response && Array.isArray(response['messages'])) {
      const arr: any = response['messages']; // oxlint-disable-line @typescript-eslint/no-explicit-any -- elements are DiscussionMessage objects; runtime-validated
      return arr;
    }
    return [];
  },

  async manageTurn(discussionId: string, turn: TurnRequest): Promise<Discussion> {
    return edenRequest(`/api/v1/discussions/${discussionId}/turn`, {
      method: 'POST',
      body: turn,
    });
  },

  async getAnalytics(discussionId: string): Promise<SharedDiscussionAnalytics> {
    return edenWithCSRFRetry(() => discussions({ id: discussionId }).analytics.get());
  },

  async getSummary(discussionId: string): Promise<Record<string, unknown>> {
    return edenWithCSRFRetry(() => discussions({ id: discussionId }).summary.get());
  },

  async advanceTurn(discussionId: string): Promise<void> {
    await edenWithCSRFRetry(() => discussions({ id: discussionId })['advance-turn'].post());
  },

  async export(discussionId: string, format: 'json' | 'text' | 'pdf' = 'json'): Promise<Blob> {
    return edenRequest<Blob>(
      `/api/v1/discussions/${discussionId}/export?format=${encodeURIComponent(format)}`,
      { method: 'GET', responseType: 'blob' }
    );
  },

  async getTranscript(discussionId: string): Promise<string> {
    return edenRequest(`/api/v1/discussions/${discussionId}/transcript`, { method: 'GET' });
  },

  async search(query: string, filters?: unknown): Promise<Discussion[]> {
    const queryFilters = isRecord(filters) ? filters : {};
    return edenWithCSRFRetry(() =>
      discussions.search.get({ query: { q: query, ...queryFilters } })
    );
  },
};
