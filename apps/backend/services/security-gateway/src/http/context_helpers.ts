import type { UserContext } from '@uaip/types';

import { AuthenticationError } from '@uaip/utils';
interface ContextWithUser {
  user: UserContext;
  [key: string]: unknown;
}

export function getAuthUser(ctx: unknown): UserContext {
  // @ts-expect-error -- Elysia middleware injects user into context but TypeScript cannot infer through unknown
  const context = ctx as ContextWithUser;
  if (!context.user?.id) {
    throw new AuthenticationError('Authentication required: no user in context');
  }
  return context.user;
}

export function getOptionalAuthUser(ctx: unknown): UserContext | null {
  // @ts-expect-error -- Elysia middleware injects user into context but TypeScript cannot infer through unknown
  const context = ctx as ContextWithUser;
  return context.user?.id ? context.user : null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
