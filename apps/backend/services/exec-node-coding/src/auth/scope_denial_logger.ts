/**
 * scope_denial_logger.ts — Node-local structured security logger for JWT scope
 * denial events on exec-node-coding routes.
 *
 * This module is intentionally DB-free: the gateway (capability-registry) is
 * the authoritative audit writer for its own ownership denials. exec-node-coding
 * only writes structured logs here so that host-level log aggregation (OTEL,
 * Loki, etc.) can detect and alert on scope mismatches without requiring a DB
 * connection from the execution node.
 *
 * SECURITY RULES:
 *  - Only route path, mismatch field name, and session/workspace/user IDs
 *    enter the log record. No bearer token, no JWT body, no raw header values.
 *  - The actual token and body values of the mismatched field are never logged
 *    — only the field name (e.g. "sessionId") is recorded.
 *  - Callers must strip any credential-bearing strings before passing ScopeDenialContext.
 */

import { logger } from '@uaip/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Metadata for a JWT scope-denial event on a node route.
 * All fields are IDs or label strings — no bearer tokens, no PEMs, no bodies.
 */
export type ScopeDenialContext = {
  /** HTTP route path (e.g. "/sessions/:id/prompt") — no query params, no body */
  route: string;
  /** Field name that caused the mismatch (e.g. "sessionId") — NOT the value */
  mismatchField: string;
  /** Session ID from the route path (may be the claimed path param) */
  pathSessionId: string;
  /** Session ID from JWT claims (for correlation only) */
  jwtSessionId: string;
  /** User ID from JWT claims (for correlation only) */
  jwtUserId: string;
};

/**
 * Log a structured scope-denial event.
 *
 * Safe to call from any route handler on JWT scope mismatches (HTTP 403).
 * Does NOT contact any external service or database — local structured log only.
 *
 * @example
 * logScopeDenial({
 *   route: '/sessions/:id/prompt',
 *   mismatchField: 'sessionId',
 *   pathSessionId: params.id,
 *   jwtSessionId: claims.sessionId,
 *   jwtUserId: claims.userId,
 * });
 */
export function logScopeDenial(ctx: ScopeDenialContext): void {
  logger.warn('exec-node-coding: JWT scope denial', {
    security_event: 'jwt_scope_denial',
    route: ctx.route,
    mismatch_field: ctx.mismatchField,
    // IDs only — never token values
    path_session_id: ctx.pathSessionId,
    jwt_session_id: ctx.jwtSessionId,
    jwt_user_id: ctx.jwtUserId,
  });
}
