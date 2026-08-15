/**
 * Service-credential ingress for provisioning a project (`tardis init`).
 *
 * WHY A SEPARATE PATH, NOT `POST /api/v1/projects`
 * ------------------------------------------------
 * The obvious shape is to let POST past the edge on the existing collection
 * route. nginx cannot express that safely: `auth_request` takes a literal URI or
 * `off` and does NOT accept a variable, so it cannot be selected per-method
 * inside one location. Every workaround goes through `if()`, which may not
 * contain `auth_request` and which inherits the surrounding one into its block —
 * i.e. the config would silently either keep authenticating POST or stop
 * authenticating GET, and which one you got would depend on nginx internals.
 *
 * A dedicated exact path removes the conditional entirely. `/api/v1/projects`
 * keeps its session gate for every method, and this route carries its own
 * authentication.
 *
 * THE CREDENTIAL IS CHECKED HERE, NOT AT THE EDGE
 * -----------------------------------------------
 * A pre-authentication nginx location in front of a handler that trusts the edge
 * would move the wall rather than open a door: project creation mints identity,
 * so an edge-only gate turns it into an unauthenticated LAN endpoint. This
 * handler therefore verifies the credential itself and refuses without it, in
 * constant time, and fails closed when PROJECT_PROVISION_TOKEN is unset. Same
 * discipline as the webhook receivers, which verify their own HMAC despite
 * sitting behind a pre-auth location.
 *
 * It deliberately does NOT use withOptionalAuth: that derives `user` from a JWT,
 * a service caller has none, and the point is an explicit second credential path
 * rather than minting a fake session.
 */

import { timingSafeEqual } from 'node:crypto';
import { Elysia, t } from 'elysia';
import { logger } from '@uaip/utils';
import { getControlPool } from '@uaip/shared-services/drizzle/clients';

const SERVICE_TOKEN_HEADER = 'x-navratna-service-token';

/** Slug is the join key to the tardis project record, so it is constrained. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

const ErrorSchema = t.Object({ success: t.Literal(false), error: t.String() });

export interface ServiceTokenCheck {
  valid: boolean;
  error?: string;
}

/**
 * Constant-time comparison of the presented service token.
 *
 * Exported for tests: a credential check that is never exercised is
 * indistinguishable from one that always passes.
 */
export function verifyServiceToken(
  presented: string | null,
  expected: string | undefined
): ServiceTokenCheck {
  if (!expected) {
    return {
      valid: false,
      error: 'PROJECT_PROVISION_TOKEN is not configured; project provisioning is disabled',
    };
  }
  if (!presented) {
    return { valid: false, error: `Missing ${SERVICE_TOKEN_HEADER} header` };
  }

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, and the throw would itself leak
  // length, so compare lengths first and return the same generic error either way.
  if (a.length !== b.length) return { valid: false, error: 'Invalid service token' };
  if (!timingSafeEqual(a, b)) return { valid: false, error: 'Invalid service token' };
  return { valid: true };
}

/**
 * The user rows created projects are attributed to. A service call has no acting
 * user, so PROJECT_PROVISION_OWNER_ID wins when set and the first admin is the
 * fallback — the same rule link_project_to_mcp_server already uses, kept
 * identical so both paths attribute a project the same way.
 *
 * The owner is NOT taken from the request body: the token authorises creating a
 * project, not planting one under an arbitrary user.
 */
async function resolveOwnerId(): Promise<string | null> {
  const configured = process.env.PROJECT_PROVISION_OWNER_ID?.trim();
  if (configured) return configured;

  const pool = getControlPool();
  const result = await pool.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`);
  return result.rows[0]?.id ?? null;
}

export function registerProjectProvisionRoutes() {
  return new Elysia().post(
    '/api/v1/projects/provision',
    async (ctx) => {
      const check = verifyServiceToken(
        ctx.request.headers.get(SERVICE_TOKEN_HEADER),
        process.env.PROJECT_PROVISION_TOKEN
      );
      if (!check.valid) {
        logger.warn('Project provision refused', { error: check.error });
        ctx.set.status = 401;
        return { success: false as const, error: check.error ?? 'Unauthorized' };
      }

      const body = ctx.body as { slug: string; name?: string; description?: string };
      const slug = body.slug?.trim();
      if (!slug || !SLUG_PATTERN.test(slug)) {
        ctx.set.status = 400;
        return {
          success: false as const,
          error: 'slug must be 1-32 chars, lowercase alphanumeric or hyphen, starting alphanumeric',
        };
      }

      try {
        const pool = getControlPool();

        // IDEMPOTENT BY SLUG. `tardis init` is re-runnable, and a second run must
        // return the existing id rather than minting a second project that would
        // split the identity join this endpoint exists to establish.
        const existing = await pool.query(`SELECT id, slug FROM projects WHERE slug = $1 LIMIT 1`, [slug]);
        if (existing.rows[0]) {
          logger.info('Project provision reused an existing project', { slug, projectId: existing.rows[0].id });
          return {
            success: true as const,
            data: { projectId: String(existing.rows[0].id), slug, created: false },
          };
        }

        const ownerId = await resolveOwnerId();
        if (!ownerId) {
          logger.error('Project provision has no owner to attribute to', { slug });
          ctx.set.status = 503;
          return {
            success: false as const,
            error: 'No owner available: set PROJECT_PROVISION_OWNER_ID or create an admin user',
          };
        }

        // slug is written explicitly: the column is NOT NULL and
        // ProjectService.createProject does not set it, so going through that
        // service would depend on a database default to satisfy the constraint.
        const created = await pool.query(
          `INSERT INTO projects (name, description, slug, owner_id, type)
           VALUES ($1, $2, $3, $4, 'tardis') RETURNING id`,
          [body.name?.trim() || slug, body.description?.trim() || null, slug, ownerId]
        );

        const projectId = String(created.rows[0].id);
        logger.info('Project provisioned', { slug, projectId, ownerId });
        return { success: true as const, data: { projectId, slug, created: true } };
      } catch (error) {
        logger.error('Project provision failed', {
          slug,
          error: error instanceof Error ? error.message : String(error),
        });
        ctx.set.status = 500;
        return { success: false as const, error: 'Failed to provision project' };
      }
    },
    {
      body: t.Object({
        slug: t.String(),
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({ projectId: t.String(), slug: t.String(), created: t.Boolean() }),
        }),
        400: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
        503: ErrorSchema,
      },
    }
  );
}
