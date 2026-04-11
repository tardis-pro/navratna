import type { IncomingMessage, ServerResponse } from "node:http";
import { TardisAuth, type TardisAuthOptions, type TardisUser } from "./index.js";

/**
 * Extend Express Request with the TARDIS user.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TardisUser;
    }
  }
}

interface ExpressLikeRequest extends IncomingMessage {
  user?: TardisUser;
  headers: IncomingMessage["headers"];
}

type NextFunction = (err?: unknown) => void;

/**
 * Express/Connect middleware that validates TARDIS JWT tokens via JWKS.
 *
 * Adds `req.user` with the authenticated user payload. Returns 401 JSON
 * response if no valid token is present.
 *
 * @example
 * ```ts
 * import { tardisAuth } from '@tardis/auth/express';
 * app.use(tardisAuth());
 * app.get('/me', (req, res) => res.json(req.user));
 * ```
 */
export function tardisAuth(options?: TardisAuthOptions) {
  const auth = new TardisAuth(options);

  return async (req: ExpressLikeRequest, res: ServerResponse, next: NextFunction): Promise<void> => {
    const token = auth.extractToken({
      headers: {
        get(name: string) {
          const value = req.headers[name.toLowerCase()];
          return Array.isArray(value) ? value[0] : value ?? null;
        },
      },
    });

    if (!token) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized: no token provided" }));
      return;
    }

    try {
      req.user = await auth.verifyToken(token);
      next();
    } catch {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized: invalid token" }));
    }
  };
}

export { TardisAuth, type TardisAuthOptions, type TardisUser } from "./index.js";
