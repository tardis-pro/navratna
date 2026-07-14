// exec-node-coding — GET /healthz
// Returns 200 with basic uptime info. No auth required (used by load-balancer probes).

import Elysia, { t } from 'elysia';

export function createHealthRoutes(nodeId: string, sessionCount: () => number) {
  return new Elysia().get(
    '/healthz',
    () => ({
      ok: true,
      nodeId,
      activeSessions: sessionCount(),
      uptimeSec: Math.floor(process.uptime()),
    }),
    {
      response: t.Object({
        ok: t.Boolean(),
        nodeId: t.String(),
        activeSessions: t.Number(),
        uptimeSec: t.Number(),
      }),
    }
  );
}
