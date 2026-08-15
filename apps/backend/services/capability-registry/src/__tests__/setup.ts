/**
 * Package-wide test bootstrap.
 *
 * WHY THIS EXISTS
 * ---------------
 * `@uaip/config` deliberately fails fast at *module evaluation* time when
 * JWT_SECRET / JWT_REFRESH_SECRET / DELETION_HASH_SALT are absent — a service
 * that boots without them would silently sign tokens with a default, so the
 * throw is correct and must not be softened.
 *
 * The failure mode that produced this file: almost every module in this
 * service reaches `@uaip/config` transitively (`@uaip/middleware`,
 * `@uaip/infra`, `@uaip/shared-services` all import it), so a test file that
 * merely imports the unit under test explodes during *collection* with
 * "FATAL: JWT_SECRET environment variable is required" — no test ever runs,
 * and the reported error points at shared config rather than at anything the
 * test did. Worse, when the throw happens inside a `vi.mock(..., importOriginal)`
 * factory, vitest reports only the generic "There was an error when mocking a
 * module … no top level variables inside", which sends you hunting a hoisting
 * bug that does not exist.
 *
 * Individual test files in this package had been pasting a `vi.hoisted()` env
 * preamble to work around it, which is per-file and therefore forgettable —
 * eleven files had forgotten. Setting the test env once, here, is what the
 * other backend services already do (orchestration-pipeline, llm-service,
 * discussion-orchestration, shared/services, shared/discussion all ship a
 * `src/__tests__/setup.ts` of exactly this shape).
 *
 * `??=` rather than `=`: a real value from the environment (CI secret, local
 * .env) must still win, so this only supplies a floor.
 */
process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.DELETION_HASH_SALT ??= 'test-deletion-hash-salt';
