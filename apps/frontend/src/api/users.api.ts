/**
 * User Management API Client
 * Handles all user-related operations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';
import type { UserRole, UserLLMPreference } from '@uaip/types';
import type {
  User,
  UserCreate,
  UserUpdate,
  UserListOptions,
  UserStats,
  PasswordResetRequest,
  BulkUserAction,
} from '@uaip/types';

export type { User, UserCreate, UserUpdate, UserListOptions, UserStats, PasswordResetRequest, BulkUserAction };

export const usersAPI = {
  async list(options?: UserListOptions): Promise<User[]> {
    return APIClient.get<User[]>(API_ROUTES.USERS.LIST, { params: options });
  },

  async get(id: string): Promise<User> {
    return APIClient.get<User>(`${API_ROUTES.USERS.GET}/${id}`);
  },

  async create(user: UserCreate): Promise<User> {
    return APIClient.post<User>(API_ROUTES.USERS.CREATE, user);
  },

  async update(id: string, updates: UserUpdate): Promise<User> {
    return APIClient.put<User>(`${API_ROUTES.USERS.UPDATE}/${id}`, updates);
  },

  async delete(id: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.USERS.DELETE}/${id}`);
  },

  async resetPassword(request: PasswordResetRequest): Promise<{ message: string }> {
    return APIClient.post(API_ROUTES.USERS.RESET_PASSWORD, request);
  },

  async unlock(id: string): Promise<User> {
    return APIClient.post<User>(`${API_ROUTES.USERS.UNLOCK}/${id}/unlock`);
  },

  async lock(id: string, reason?: string): Promise<User> {
    return APIClient.post<User>(`${API_ROUTES.USERS.LOCK}/${id}/lock`, { reason });
  },

  async activate(id: string): Promise<User> {
    return APIClient.post<User>(`${API_ROUTES.USERS.ACTIVATE}/${id}/activate`);
  },

  async deactivate(id: string, reason?: string): Promise<User> {
    return APIClient.post<User>(`${API_ROUTES.USERS.DEACTIVATE}/${id}/deactivate`, { reason });
  },

  async bulkAction(
    action: BulkUserAction
  ): Promise<{ success: number; failed: number; errors?: string[] }> {
    return APIClient.post(API_ROUTES.USERS.BULK_ACTION, action);
  },

  async getStats(): Promise<UserStats> {
    return APIClient.get<UserStats>(API_ROUTES.USERS.STATS);
  },

  async search(query: string): Promise<User[]> {
    return APIClient.get<User[]>(API_ROUTES.USERS.SEARCH, { params: { q: query } });
  },

  async updatePassword(
    id: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    return APIClient.post(`${API_ROUTES.USERS.UPDATE}/${id}/password`, {
      currentPassword,
      newPassword,
    });
  },

  async getActivity(id: string, days: number = 30): Promise<unknown> {
    return APIClient.get(`${API_ROUTES.USERS.GET}/${id}/activity`, { params: { days } });
  },

  async getPermissions(id: string): Promise<string[]> {
    return APIClient.get<string[]>(`${API_ROUTES.USERS.GET}/${id}/permissions`);
  },

  async updatePermissions(id: string, permissions: string[]): Promise<string[]> {
    return APIClient.put<string[]>(`${API_ROUTES.USERS.UPDATE}/${id}/permissions`, { permissions });
  },

  async getUserLLMPreferences(): Promise<UserLLMPreference[]> {
    return APIClient.get<UserLLMPreference[]>('/api/v1/users/llm-preferences');
  },

  async updateUserLLMPreferences(preferences: UserLLMPreference[]): Promise<UserLLMPreference[]> {
    return APIClient.put<UserLLMPreference[]>('/api/v1/users/llm-preferences', { preferences });
  },
};
