import type { UserContext } from '@uaip/types';

import { AuthenticationError } from '@uaip/utils';

interface ContextWithUser {
  user: UserContext;
  [key: string]: unknown;
}

function isContextWithUser(ctx: unknown): ctx is ContextWithUser {
  return (
    typeof ctx === 'object' &&
    ctx !== null &&
    'user' in ctx &&
    typeof (ctx as { user?: unknown }).user === 'object' &&
    (ctx as { user?: unknown }).user !== null
  );
}

export function getAuthUser(ctx: unknown): UserContext {
  if (!isContextWithUser(ctx) || !ctx.user.id) {
    throw new AuthenticationError('Authentication required: no user in context');
  }
  return ctx.user;
}

export function getOptionalAuthUser(ctx: unknown): UserContext | null {
  if (!isContextWithUser(ctx)) return null;
  return ctx.user.id ? ctx.user : null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
