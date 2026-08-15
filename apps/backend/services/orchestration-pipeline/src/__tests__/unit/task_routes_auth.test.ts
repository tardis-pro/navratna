/**
 * The task router refuses an uncredentialed caller — READS INCLUDED.
 *
 * This file exists in addition to task_routes.test.ts, and the split is the
 * point. That file stubs the auth attachment so it can exercise the controller
 * and service; if the refusal were only asserted there, it would be asserted
 * against a stub that always produces a user, which is no assertion at all.
 * So the middleware here is REAL and nothing is injected.
 *
 * What it is pinning:
 *
 * `task_routes.ts` attached no middleware, and nothing populated `user`. That
 * had two consequences that look opposite and share one cause — reads were open
 * to anyone who could reach the port, and mutations refused EVERYONE, including
 * legitimate signed-in callers, because the id their `requireAuth(user?.id)`
 * check reads was never attached.
 *
 * Reads matter here specifically because the board is where the nightly triage
 * writes its evidence: finding titles, suspect releases, correlated log lines.
 * An open read of it is an open read of the project's diagnostic surface.
 *
 * The repository is deliberately a throwing stub. If auth ever stops guarding a
 * route, that route reaches the controller and the stub raises — so the failure
 * is loud and points at the right place, rather than a 200 with empty data that
 * reads like a passing test.
 */

import { describe, expect, it } from 'vitest';
import { Elysia } from 'elysia';
import { TaskService } from '@uaip/shared-services';
import type { ProjectTaskRepository } from '@uaip/shared-services';
import { TaskController } from '../../controllers/task_controller.js';
import { registerTaskRoutes } from '../../routes/task_routes.js';

const PROJECT_ID = '87da881f-63eb-4e30-9cb9-79583fc65789';
const TASK_ID = '44444444-4444-4444-8444-444444444444';

/** Reached only if a route stopped being guarded. */
const refuseToBeCalled = new Proxy(
  {},
  {
    get() {
      return () => {
        throw new Error('the repository was reached on an unauthenticated request');
      };
    },
  }
) as ProjectTaskRepository;

function buildApp() {
  const service = new TaskService({ repository: refuseToBeCalled });
  return new Elysia().use(registerTaskRoutes(new TaskController(service)));
}

/** Every route that only reads. These were the open ones. */
const READS: Array<[string, string]> = [
  ['project tasks', `/api/v1/projects/${PROJECT_ID}/tasks`],
  ['task statistics', `/api/v1/projects/${PROJECT_ID}/tasks/statistics`],
  ['single task', `/api/v1/tasks/${TASK_ID}`],
  ['assignment suggestions', `/api/v1/tasks/${TASK_ID}/assignment-suggestions`],
];

describe('task routes require authentication', () => {
  it.each(READS)('refuses an unauthenticated read of %s', async (_label, path) => {
    const res = await buildApp().handle(new Request(`http://localhost${path}`));

    expect(res.status).toBe(401);
  });

  it('refuses an unauthenticated mutation', async () => {
    const res = await buildApp().handle(
      new Request(`http://localhost/api/v1/projects/${PROJECT_ID}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'should never be created' }),
      })
    );

    expect(res.status).toBe(401);
  });

  it('refuses a read carrying a malformed bearer token', async () => {
    // A garbage credential must be refused the same way as none at all. A route
    // that only checks for the PRESENCE of a header is a route with no wall.
    const res = await buildApp().handle(
      new Request(`http://localhost/api/v1/projects/${PROJECT_ID}/tasks`, {
        headers: { authorization: 'Bearer not-a-real-jwt' },
      })
    );

    expect(res.status).toBe(401);
  });
});
