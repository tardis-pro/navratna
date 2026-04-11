import type { Context, MiddlewareHandler } from "hono";
import { TardisAuth, type TardisAuthOptions, type TardisUser } from "./index.js";

/**
 * Type-safe variable declaration for Hono context.
 */
type TardisAuthEnv = {
  Variables: {
    user: TardisUser;
  };
};

/**
 * Hono middleware that validates TARDIS JWT tokens via JWKS.
 *
 * Sets `c.get('user')` with the authenticated user payload.
 * Returns 401 JSON if no valid token is present.
 *
 * Works with Cloudflare Workers, Deno, Bun, and Node.js.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { tardisAuth } from '@tardis/auth/hono';
 *
 * const app = new Hono();
 * app.use('*', tardisAuth());
 * app.get('/me', (c) => c.json(c.get('user')));
 * ```
 */
export function tardisAuth(options?: TardisAuthOptions): MiddlewareHandler<TardisAuthEnv> {
  const auth = new TardisAuth(options);

  return async (c: Context<TardisAuthEnv>, next) => {
    const token = auth.extractToken(c.req.raw);

    if (!token) {
      return c.json({ error: "Unauthorized: no token provided" }, 401);
    }

    try {
      const user = await auth.verifyToken(token);
      c.set("user", user);
      await next();
    } catch {
      return c.json({ error: "Unauthorized: invalid token" }, 401);
    }
  };
}

export { TardisAuth, type TardisAuthOptions, type TardisUser } from "./index.js";
