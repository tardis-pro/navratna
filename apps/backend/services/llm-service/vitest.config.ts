// Why the alias table: without it this suite is not self-contained — it can only
// run after `pnpm build:shared` has produced dist/ for every @uaip/* package it
// touches.
//
// The failure mode, seen in CI and not locally: `@uaip/*` packages expose an
// `exports` map whose `import` condition points at `./dist/*.js` (the TS sources
// sit behind a custom `@uaip/source` condition that Node does not know about).
// Because these are linked workspace packages, Vitest externalizes them and lets
// Node's ESM resolver do the work, so the specifier resolves to build output. On
// a developer machine a stale dist/ from some earlier build is always lying
// around and everything passes; on a clean checkout that has not built the
// shared packages the same import dies with
//   Error: Cannot find package '@uaip/shared-services/event-bus'
// and the whole file fails to collect — "no tests", not one red assertion.
//
// Setting `resolve.conditions: ['@uaip/source']` does NOT fix this: conditions
// only apply to modules Vite resolves itself, and these were handed to Node.
// Aliasing is what forces Vite to resolve and inline them from source, which is
// also what every other backend service's vitest config does. Keep the subpath
// entries above the bare package entries — Vite matches string aliases by
// prefix, so `@uaip/shared-services` listed first would rewrite
// `@uaip/shared-services/event-bus` into a path that does not exist.
import { mergeConfig, defineProject } from 'vitest/config'
import path from 'path'
import { sharedBackendConfig } from '../../../../vitest.shared.js'

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/llm-service-api',
      setupFiles: ['./src/__tests__/setup.ts'],
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    },
    resolve: {
      alias: {
        '@uaip/shared-services/event-bus': path.resolve(
          import.meta.dirname,
          '../../../shared/services/src/event_bus_service.ts'
        ),
        '@uaip/shared-services/feature-factory': path.resolve(
          import.meta.dirname,
          '../../../shared/services/src/feature_factory.ts'
        ),
        '@uaip/shared-services': path.resolve(import.meta.dirname, '../../../shared/services/src'),
        '@uaip/infra/event_bus': path.resolve(
          import.meta.dirname,
          '../../../shared/infra/src/event_bus.ts'
        ),
        '@uaip/infra/database': path.resolve(
          import.meta.dirname,
          '../../../shared/infra/src/database/index.ts'
        ),
        '@uaip/infra': path.resolve(import.meta.dirname, '../../../shared/infra/src'),
        '@uaip/llm-service': path.resolve(import.meta.dirname, '../../../shared/llm-service/src'),
        '@uaip/middleware': path.resolve(import.meta.dirname, '../../../shared/middleware/src'),
        '@uaip/config': path.resolve(import.meta.dirname, '../../../shared/config/src'),
        '@uaip/types': path.resolve(import.meta.dirname, '../../../packages/shared-types/src'),
        '@uaip/utils': path.resolve(import.meta.dirname, '../../../packages/shared-utils/src'),
      },
    },
  })
)
