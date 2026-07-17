import Elysia from 'elysia';
import type { CodingNodeConfig } from './config.js';
import { createJwtAuth } from './auth/jwt_auth.js';
import type { SessionRegistry } from './session/session_registry.js';
import { createHealthRoutes } from './routes/health_routes.js';
import { createSessionRoutes } from './routes/session_routes.js';
import { createEventsRoutes } from './routes/events_routes.js';

function errorStatus(error: unknown, code: unknown): number {
  if (typeof error === 'object' && error !== null) {
    if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
    if ('status' in error && typeof error.status === 'number') return error.status;
  }
  if (code === 'NOT_FOUND') return 404;
  if (code === 'VALIDATION') return 422;
  if (code === 'PARSE' || code === 'INVALID_COOKIE_SIGNATURE') return 400;
  return 500;
}

export function buildAgentServer(_config: CodingNodeConfig, registry: SessionRegistry) {
  const protectedRoutes = createJwtAuth()
    .use(createSessionRoutes(registry, _config))
    .use(createEventsRoutes(registry));

  return new Elysia()
    .use(createHealthRoutes(_config.nodeId, () => registry.count()))
    .use(protectedRoutes)
    .onError(({ code, error, set }) => {
      set.status = errorStatus(error, code);
      return { error: error instanceof Error ? error.message : String(error) };
    });
}
