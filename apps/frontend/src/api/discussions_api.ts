/**
 * Discussion Management API Client
 * Handles all discussion-related operations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/api_config';
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

export const discussionsAPI = {
  async list(options?: DiscussionListOptions): Promise<Discussion[]> {
    const response = await APIClient.get<
      Discussion[] | { discussions?: Discussion[]; totalCount?: number; searchTime?: number }
    >(API_ROUTES.DISCUSSIONS.LIST, { params: options });

    if (Array.isArray(response)) {
      return response;
    }

    if (Array.isArray(response?.discussions)) {
      return response.discussions;
    }

    return [];
  },

  async get(id: string): Promise<Discussion> {
    return APIClient.get<Discussion>(`${API_ROUTES.DISCUSSIONS.GET}/${id}`);
  },

  async create(discussion: DiscussionCreate): Promise<Discussion> {
    return APIClient.post<Discussion>(API_ROUTES.DISCUSSIONS.CREATE, discussion);
  },

  async update(id: string, updates: DiscussionUpdate): Promise<Discussion> {
    return APIClient.put<Discussion>(`${API_ROUTES.DISCUSSIONS.UPDATE}/${id}`, updates);
  },

  async delete(id: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.DISCUSSIONS.DELETE}/${id}`);
  },

  async start(id: string, startedBy?: string): Promise<Discussion> {
    const resolvedStartedBy = startedBy ?? getStoredUserId();
    return APIClient.post<Discussion>(`${API_ROUTES.DISCUSSIONS.START}/${id}/start`, {
      ...(resolvedStartedBy ? { startedBy: resolvedStartedBy } : {}),
    });
  },

  async pause(id: string, reason?: string): Promise<Discussion> {
    return APIClient.post<Discussion>(`${API_ROUTES.DISCUSSIONS.PAUSE}/${id}/pause`, { reason });
  },

  async resume(id: string): Promise<Discussion> {
    return APIClient.post<Discussion>(`${API_ROUTES.DISCUSSIONS.RESUME}/${id}/resume`);
  },

  async end(id: string, reason?: string): Promise<Discussion> {
    return APIClient.post<Discussion>(`${API_ROUTES.DISCUSSIONS.END}/${id}/end`, { reason });
  },

  async complete(id: string, summary?: string): Promise<Discussion> {
    return APIClient.post<Discussion>(`${API_ROUTES.DISCUSSIONS.COMPLETE}/${id}/complete`, {
      summary,
    });
  },

  async addParticipant(
    discussionId: string,
    participantId: string
  ): Promise<DiscussionParticipant> {
    return APIClient.post<DiscussionParticipant>(
      `${API_ROUTES.DISCUSSIONS.ADD_PARTICIPANT}/${discussionId}/participants`,
      { participantId }
    );
  },

  async removeParticipant(discussionId: string, participantId: string): Promise<void> {
    return APIClient.delete(
      `${API_ROUTES.DISCUSSIONS.REMOVE_PARTICIPANT}/${discussionId}/participants/${participantId}`
    );
  },

  async sendMessage(discussionId: string, message: MessageRequest): Promise<DiscussionMessage> {
    return APIClient.post<DiscussionMessage>(
      `${API_ROUTES.DISCUSSIONS.SEND_MESSAGE}/${discussionId}/messages`,
      message
    );
  },

  async getMessages(
    discussionId: string,
    options?: {
      page?: number;
      limit?: number;
      since?: string;
    }
  ): Promise<DiscussionMessage[]> {
    const response = await APIClient.get<DiscussionMessage[] | { messages: DiscussionMessage[] }>(
      `${API_ROUTES.DISCUSSIONS.MESSAGES}/${discussionId}/messages`,
      { params: options }
    );
    if (Array.isArray(response)) {
      return response;
    }
    if (response && Array.isArray(response.messages)) {
      return response.messages;
    }
    return [];
  },

  async manageTurn(discussionId: string, turn: TurnRequest): Promise<Discussion> {
    return APIClient.post<Discussion>(
      `${API_ROUTES.DISCUSSIONS.MANAGE_TURN}/${discussionId}/turn`,
      turn
    );
  },

  async getAnalytics(discussionId: string): Promise<SharedDiscussionAnalytics> {
    return APIClient.get<SharedDiscussionAnalytics>(
      `${API_ROUTES.DISCUSSIONS.ANALYTICS}/${discussionId}/analytics`
    );
  },

  async getSummary(discussionId: string): Promise<Record<string, unknown>> {
    return APIClient.get<Record<string, unknown>>(
      `${API_ROUTES.DISCUSSIONS.GET}/${discussionId}/summary`
    );
  },

  async advanceTurn(discussionId: string): Promise<void> {
    await APIClient.post(`${API_ROUTES.DISCUSSIONS.GET}/${discussionId}/advance-turn`);
  },

  async export(discussionId: string, format: 'json' | 'text' | 'pdf' = 'json'): Promise<Blob> {
    const response = await APIClient.get(`${API_ROUTES.DISCUSSIONS.GET}/${discussionId}/export`, {
      params: { format },
      responseType: 'blob',
    });
    return response;
  },

  async getTranscript(discussionId: string): Promise<string> {
    return APIClient.get<string>(`${API_ROUTES.DISCUSSIONS.GET}/${discussionId}/transcript`);
  },

  async search(query: string, filters?: unknown): Promise<Discussion[]> {
    return APIClient.get<Discussion[]>(API_ROUTES.DISCUSSIONS.SEARCH, {
      params: { q: query, ...filters },
    });
  },
};
