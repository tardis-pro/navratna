import type { UserContext } from '@uaip/types';

interface ContextWithUser {
  user: UserContext;
  [key: string]: unknown;
}

export function getAuthUser(ctx: unknown): UserContext {
  const context = ctx as ContextWithUser;
  if (!context.user?.id) {
    throw new Error('Authentication required: no user in context');
  }
  return context.user;
}

export function getOptionalAuthUser(ctx: unknown): UserContext | null {
  const context = ctx as ContextWithUser;
  return context.user?.id ? context.user : null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
