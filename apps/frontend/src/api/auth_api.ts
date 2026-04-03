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
  const user = isRecord(value) ? value : {}
  const email = getString(Reflect.get(user, 'email')) ?? ''
  const firstName = getString(Reflect.get(user, 'firstName')) ?? ''
  const lastName = getString(Reflect.get(user, 'lastName')) ?? ''

  return {
    id: getString(Reflect.get(user, 'id')) ?? '',
    email,
    name: `${firstName} ${lastName}`.trim() || email,
    role: getString(Reflect.get(user, 'role')) ?? '',
  }
}

export const authAPI = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await edenWithCSRFRetry(() => auth.login.post(credentials))

    return {
      token: '',
      user: toLoginUser(response),
    };
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
