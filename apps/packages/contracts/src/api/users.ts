export type {
  User,
  UserRole,
  UserStats,
  UserLLMPreference,
  PasswordResetRequest,
  BulkUserAction,
  CreateUserRequest as UserCreate,
  UpdateUserRequest as UserUpdate,
} from '@uaip/types';

export interface UserListOptions {
  page?: number;
  limit?: number;
  role?: string;
  isActive?: boolean;
  isLocked?: boolean;
  search?: string;
  sortBy?: 'email' | 'name' | 'createdAt' | 'lastLoginAt';
  sortOrder?: 'asc' | 'desc';
}
