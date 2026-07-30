/**
 * User Management API Client
 * Handles all user-related operations
 */

import { gatewayClient, edenWithCSRFRetry } from './eden';
import type { UserLLMPreference } from '@uaip/contracts/api';
import type {
  User,
  UserCreate,
  UserUpdate,
  UserListOptions,
  UserStats,
  PasswordResetRequest,
  BulkUserAction,
} from '@uaip/contracts/api';

export type {
  User,
  UserCreate,
  UserUpdate,
  UserListOptions,
  UserStats,
  PasswordResetRequest,
  BulkUserAction,
};

const users = gatewayClient.api.v1.users;

export const usersAPI = {
  async list(options?: UserListOptions): Promise<User[]> {
    return edenWithCSRFRetry(() => users.get({ query: options }));
  },

  async get(id: string): Promise<User> {
    return edenWithCSRFRetry(() => users[id].get());
  },

  async create(user: UserCreate): Promise<User> {
    return edenWithCSRFRetry(() => users.post(user));
  },

  async update(id: string, updates: UserUpdate): Promise<User> {
    return edenWithCSRFRetry(() => users[id].put(updates));
  },

  async delete(id: string): Promise<void> {
    await edenWithCSRFRetry(() => users[id].delete());
  },

  async resetPassword(request: PasswordResetRequest): Promise<{ message: string }> {
    return edenWithCSRFRetry(() => users['reset-password'].post(request));
  },

  async unlock(id: string): Promise<User> {
    return edenWithCSRFRetry(() => users[id].unlock.post());
  },

  async lock(id: string, reason?: string): Promise<User> {
    return edenWithCSRFRetry(() => users[id].lock.post({ reason }));
  },

  async activate(id: string): Promise<User> {
    return edenWithCSRFRetry(() => users[id].activate.post());
  },

  async deactivate(id: string, reason?: string): Promise<User> {
    return edenWithCSRFRetry(() => users[id].deactivate.post({ reason }));
  },

  async bulkAction(
    action: BulkUserAction
  ): Promise<{ success: number; failed: number; errors?: string[] }> {
    return edenWithCSRFRetry(() => users.bulk.post(action));
  },

  async getStats(): Promise<UserStats> {
    return edenWithCSRFRetry(() => users.stats.get());
  },

  async search(query: string): Promise<User[]> {
    return edenWithCSRFRetry(() => users.search.get({ query: { q: query } }));
  },

  async updatePassword(
    id: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    return edenWithCSRFRetry(() => users[id].password.post({ currentPassword, newPassword }));
  },

  async getPermissions(id: string): Promise<string[]> {
    return edenWithCSRFRetry(() => users[id].permissions.get());
  },

  async updatePermissions(id: string, permissions: string[]): Promise<string[]> {
    return edenWithCSRFRetry(() => users[id].permissions.put({ permissions }));
  },

  async getUserLLMPreferences(): Promise<UserLLMPreference[]> {
    return edenWithCSRFRetry(() => users['llm-preferences'].get());
  },

  async updateUserLLMPreferences(preferences: UserLLMPreference[]): Promise<UserLLMPreference[]> {
    return edenWithCSRFRetry(() => users['llm-preferences'].put({ preferences }));
  },
};
