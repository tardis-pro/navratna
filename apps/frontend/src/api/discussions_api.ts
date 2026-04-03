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
      return response['discussions'] as Discussion[];
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

  async sendMessage(discussionId: string, message: MessageRequest): Promise<DiscussionMessage> {
    return edenRequest(`/api/v1/discussions/${discussionId}/messages`, {
      method: 'POST',
      body: message,
    });
  },

  async getMessages(
    discussionId: string,
    options?: {
      page?: number;
      limit?: number;
      since?: string;
    }
  ): Promise<DiscussionMessage[]> {
    const response = await edenWithCSRFRetry(() =>
      discussions({ id: discussionId }).messages.get({ query: options })
    );
    if (Array.isArray(response)) {
      return response;
    }
    if (isRecord(response) && 'messages' in response && Array.isArray(response['messages'])) {
      return response['messages'] as DiscussionMessage[];
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
