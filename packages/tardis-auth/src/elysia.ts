import { Elysia } from "elysia";
import { TardisAuth, type TardisAuthOptions, type TardisUser } from "./index.js";

/**
 * Elysia plugin that validates TARDIS JWT tokens via JWKS.
 *
 * Adds `user` to the request context (derive). Returns 401 if no valid token.
 *
 * @example
 * ```ts
 * import { tardisAuth } from '@tardis/auth/elysia';
 * const app = new Elysia().use(tardisAuth()).get('/me', ({ user }) => user);
 * ```
 */
export function tardisAuth(options?: TardisAuthOptions) {
  const auth = new TardisAuth(options);

  return new Elysia({ name: "@tardis/auth" }).derive(
    async ({ request, set }): Promise<{ user: TardisUser }> => {
      const token = auth.extractToken(request);

      if (!token) {
        set.status = 401;
        throw new Error("Unauthorized: no token provided");
      }

      try {
        const user = await auth.verifyToken(token);
        return { user };
      } catch {
        set.status = 401;
        throw new Error("Unauthorized: invalid token");
      }
    },
  );
}

export { TardisAuth, type TardisAuthOptions, type TardisUser } from "./index.js";
