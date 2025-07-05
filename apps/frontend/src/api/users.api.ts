/**
 * User Management API Client
 * Handles all user-related operations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';
import type { UserRole } from '@uaip/types';

export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  isActive: boolean;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  metadata?: Record<string, any>;
}

export interface UserCreate {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
  metadata?: Record<string, any>;
}

export interface UserUpdate {
  email?: string;
  name?: string;
  role?: UserRole;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

export interface UserListOptions {
  page?: number;
  limit?: number;
  role?: UserRole;
  isActive?: boolean;
  isLocked?: boolean;
  search?: string;
  sortBy?: 'email' | 'name' | 'createdAt' | 'lastLoginAt';
  sortOrder?: 'asc' | 'desc';
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  lockedUsers: number;
  usersByRole: Record<UserRole, number>;
  recentSignups: number;
  recentLogins: number;
}

export interface PasswordResetRequest {
  email: string;
}

export interface BulkUserAction {
  userIds: string[];
  action: 'activate' | 'deactivate' | 'lock' | 'unlock' | 'delete';
}

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

  async bulkAction(action: BulkUserAction): Promise<{ success: number; failed: number; errors?: string[] }> {
    return APIClient.post(API_ROUTES.USERS.BULK_ACTION, action);
  },

  async getStats(): Promise<UserStats> {
    return APIClient.get<UserStats>(API_ROUTES.USERS.STATS);
  },

  async search(query: string): Promise<User[]> {
    return APIClient.get<User[]>(API_ROUTES.USERS.SEARCH, { params: { q: query } });
  },

  async updatePassword(id: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return APIClient.post(`${API_ROUTES.USERS.UPDATE}/${id}/password`, {
      currentPassword,
      newPassword
    });
  },

  async getActivity(id: string, days: number = 30): Promise<any> {
    return APIClient.get(`${API_ROUTES.USERS.GET}/${id}/activity`, { params: { days } });
  },

  async getPermissions(id: string): Promise<string[]> {
    return APIClient.get<string[]>(`${API_ROUTES.USERS.GET}/${id}/permissions`);
  },

  async updatePermissions(id: string, permissions: string[]): Promise<string[]> {
    return APIClient.put<string[]>(`${API_ROUTES.USERS.UPDATE}/${id}/permissions`, { permissions });
  }
};