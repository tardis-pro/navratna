/**
 * Authentication API Client
 * Handles all authentication-related operations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';
import type { UserRole } from '@uaip/types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name?: string;
    role: UserRole;
  };
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ResetPasswordConfirm {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  organizationName?: string;
}

export interface RegisterResponse {
  user: {
    id: string;
    email: string;
    name?: string;
    role: UserRole;
  };
  message: string;
}

export const authAPI = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return APIClient.post<LoginResponse>(API_ROUTES.AUTH.LOGIN, credentials);
  },

  async logout(): Promise<void> {
    return APIClient.post(API_ROUTES.AUTH.LOGOUT, {});
  },

  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    return APIClient.post<RefreshTokenResponse>(API_ROUTES.AUTH.REFRESH, { refreshToken });
  },

  async resetPassword(request: ResetPasswordRequest): Promise<{ message: string }> {
    return APIClient.post(API_ROUTES.AUTH.RESET_PASSWORD, request);
  },

  async confirmResetPassword(request: ResetPasswordConfirm): Promise<{ message: string }> {
    return APIClient.post(API_ROUTES.AUTH.RESET_PASSWORD_CONFIRM, request);
  },

  async changePassword(request: ChangePasswordRequest): Promise<{ message: string }> {
    return APIClient.post(API_ROUTES.AUTH.CHANGE_PASSWORD, request);
  },

  async getCurrentUser(): Promise<LoginResponse['user']> {
    return APIClient.get(API_ROUTES.AUTH.ME);
  },

  async register(request: RegisterRequest): Promise<RegisterResponse> {
    return APIClient.post<RegisterResponse>(API_ROUTES.AUTH.REGISTER, request);
  },

  async validateToken(token: string): Promise<{ valid: boolean; user?: LoginResponse['user'] }> {
    return APIClient.post(API_ROUTES.AUTH.VALIDATE_TOKEN, { token });
  }
};