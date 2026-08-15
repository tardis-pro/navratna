import { defineConfig } from 'vitest/config';
import fs from 'fs';
import path from 'path';

/**
 * Point every `@uaip/*` import at SOURCE, derived from each package's own
 * exports map.
 *
 * Without this the suite tests BUILD OUTPUT. `@uaip/*` are linked workspace
 * packages, so Vitest externalises them and Node's ESM resolver reads the
 * `exports` map — whose `import` condition points at ./dist/*.js, because the
 * TypeScript sources sit behind a custom `@uaip/source` condition Node knows
 * nothing about. On a machine with stale dist the tests pass against code that
 * no longer exists; on a clean checkout they die at collection. Both are wrong,
 * and the first is worse because it is quiet.
 *
 * `resolve.conditions: ['@uaip/source']` does NOT fix it — conditions apply only
 * to modules Vite resolves itself, and workspace packages are handed to Node.
 *
 * DERIVED RATHER THAN HAND-WRITTEN. This service imports five subpaths and none
 * of them maps naively: `@uaip/shared-services/drizzle/clients` lives at
 * src/database/drizzle/clients/index.ts, and there is no src/drizzle directory
 * at all — a bare-package alias would rewrite these into paths that do not
 * exist. Reading the exports map means the aliases cannot drift out of step with
 * it, which a copied table certainly would.
 *
 * Subpath entries are emitted BEFORE bare-package ones, and longest-first among
 * themselves, because Vite matches string aliases by prefix: `@uaip/shared-services`
 * listed first would swallow `@uaip/shared-services/drizzle/clients` before the
 * specific entry was ever reached.
 */
function sourceAliases(): Array<{ find: string; replacement: string }> {
  const packages = [
    'apps/shared/services',
    'apps/shared/agent-intelligence',
    'apps/shared/discussion',
  ];
  const repoRoot = path.resolve(__dirname, '../../../..');
  const subpaths: Array<{ find: string; replacement: string }> = [];
  const bare: Array<{ find: string; replacement: string }> = [];

  for (const rel of packages) {
    const dir = path.join(repoRoot, rel);
    let pkg: { name?: string; exports?: Record<string, unknown> };
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      // Skipped rather than guessed at: a wrong alias silently resolves to the
      // wrong file, which is worse than no alias failing loudly at import.
      continue;
    }
    if (!pkg.name || !pkg.exports) continue;

    for (const [entry, target] of Object.entries(pkg.exports)) {
      const src =
        typeof target === 'string'
          ? target
          : (target as Record<string, string> | null)?.['@uaip/source'];
      if (typeof src !== 'string') continue;
      const find = entry === '.' ? pkg.name : `${pkg.name}/${entry.replace(/^\.\//, '')}`;
      const replacement = path.join(dir, src);
      (entry === '.' ? bare : subpaths).push({ find, replacement });
    }
  }

  subpaths.sort((a, b) => b.find.length - a.find.length);
  return [...subpaths, ...bare];
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: ['node_modules', 'dist', 'src/__tests__', '**/*.test.ts', '**/*.config.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: [
      ...sourceAliases(),
      { find: '@tests', replacement: path.resolve(__dirname, './src/__tests__') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
});
