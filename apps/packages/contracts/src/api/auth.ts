export type {
  UserRole,
  LoginResponse,
  ChangePasswordRequest,
  ResetPasswordRequest,
} from '@uaip/types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}

export interface ResetPasswordConfirm {
  token: string;
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
    role: string;
  };
  message: string;
}
