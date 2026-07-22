/**
 * Authentication API Client
 * Handles all authentication-related operations
 */

import { gatewayClient, edenWithCSRFRetry } from './eden';
import type {
  LoginCredentials,
  LoginResponse,
  RefreshTokenResponse,
  ChangePasswordRequest,
} from '@uaip/contracts/api';

const auth = gatewayClient.api.v1.auth

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function toLoginUser(value: unknown): LoginResponse['user'] {
  // Login response shape: { user: { id, email, ... } }
  // /me response shape: { id, email, ... } (flat)
  const outer = isRecord(value) ? value : {}
  const inner = isRecord(Reflect.get(outer, 'user')) ? (Reflect.get(outer, 'user') as Record<string, unknown>) : outer
  const email = getString(Reflect.get(inner, 'email')) ?? ''
  const firstName = getString(Reflect.get(inner, 'firstName')) ?? ''
  const lastName = getString(Reflect.get(inner, 'lastName')) ?? ''

  return {
    id: getString(Reflect.get(inner, 'id')) ?? '',
    email,
    name: `${firstName} ${lastName}`.trim() || email,
    role: getString(Reflect.get(inner, 'role')) ?? '',
  }
}

export const authAPI = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await edenWithCSRFRetry(() => auth.login.post(credentials))
    return { user: toLoginUser(response) }
  },

  async logout(): Promise<void> {
    await edenWithCSRFRetry(() => auth.logout.post());
  },

  async refreshToken(): Promise<RefreshTokenResponse> {
    await edenWithCSRFRetry(() => auth.refresh.post());
    return { token: '', refreshToken: '' };
  },

  async changePassword(request: ChangePasswordRequest): Promise<{ message: string }> {
    const response = await edenWithCSRFRetry(() => auth['change-password'].post(request));
    return { message: getString(Reflect.get(isRecord(response) ? response : {}, 'message')) ?? '' };
  },

  async getCurrentUser(): Promise<LoginResponse['user']> {
    const response = await edenWithCSRFRetry(() => auth.me.get());
    return toLoginUser(response);
  },
};
