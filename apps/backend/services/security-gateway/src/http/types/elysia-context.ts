// Types imported from @uaip/types for reference/compatibility:
// import type { UserContext, AuthContext, RequiredAuthContext } from '@uaip/types';
// Local definitions below serve service-specific needs and may differ from shared-types

/**
 * Elysia Context Types
 *
 * Type definitions for Elysia handler context objects.
 * These types ensure proper typing for handler parameters.
 */

/**
 * Authenticated user object injected by auth middleware
 */
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  sessionId?: string;
  permissions?: string[];
  securityClearance?: string;
}

/**
 * Base Elysia context available to all handlers
 */
export interface ElysiaContext<TBody = unknown, TParams = unknown, TQuery = unknown> {
  body: TBody;
  set: {
    status?: number;
    headers?: Record<string, string>;
  };
  params: TParams;
  query: TQuery;
  request: Request;
  headers: Record<string, string>;
}

/**
 * Context with optional authentication (user may be null)
 */
export interface OptionalAuthContext<
  TBody = unknown,
  TParams = unknown,
  TQuery = unknown,
> extends ElysiaContext<TBody, TParams, TQuery> {
  user: AuthUser | null;
}

/**
 * Context with required authentication (user is always present)
 */
export interface RequiredAuthContext<
  TBody = unknown,
  TParams = unknown,
  TQuery = unknown,
> extends ElysiaContext<TBody, TParams, TQuery> {
  user: AuthUser;
}

/**
 * Helper type for extracting handler context
 */
export type HandlerContext<
  TAuth extends 'none' | 'optional' | 'required' = 'none',
  TBody = unknown,
  TParams = unknown,
  TQuery = unknown,
> = TAuth extends 'required'
  ? RequiredAuthContext<TBody, TParams, TQuery>
  : TAuth extends 'optional'
    ? OptionalAuthContext<TBody, TParams, TQuery>
    : ElysiaContext<TBody, TParams, TQuery>;

/**
 * Helper to extract authenticated user from Elysia context
 * Use this when TypeScript can't infer the user from middleware
 *
 * @example
 * const userId = getAuthUser(context).id
 */
export function getAuthUser(context: Record<string, unknown>): AuthUser {
  return context.user as AuthUser;
}
