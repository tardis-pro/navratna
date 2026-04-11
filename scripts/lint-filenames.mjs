#!/usr/bin/env node

/**
 * Filename linting script for the Navratna monorepo.
 *
 * Rules:
 *   - Backend .ts files must be snake_case (e.g. my_module.ts)
 *   - React .tsx files must be PascalCase (e.g. MyComponent.tsx)
 *
 * Ignores: node_modules, dist, build, .git, coverage, generated files (*.d.ts)
 */

import { readdir, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';

const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.nx',
  'coverage',
  '.turbo',
  '.next',
]);

const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;

/**
 * Recursively collect files matching an extension under a directory.
 */
async function collectFiles(dir, ext) {
  const results = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...(await collectFiles(fullPath, ext)));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }

  return results;
}

function stemName(filePath) {
  const name = basename(filePath);
  // Strip all extensions (e.g. foo.test.ts -> foo, MyComponent.stories.tsx -> MyComponent)
  const firstDot = name.indexOf('.');
  return firstDot === -1 ? name : name.slice(0, firstDot);
}

const errors = [];

// --- Backend .ts files: must be snake_case ---
const backendTsFiles = await collectFiles('apps/backend', '.ts');
const sharedTsFiles = await collectFiles('apps/shared', '.ts');

for (const file of [...backendTsFiles, ...sharedTsFiles]) {
  const name = basename(file);
  // Skip declaration files
  if (name.endsWith('.d.ts')) continue;

  const stem = stemName(file);
  // Allow index files
  if (stem === 'index') continue;

  if (!SNAKE_CASE_RE.test(stem)) {
    errors.push(`Backend snake_case violation: ${file} (stem: "${stem}")`);
  }
}

// --- React .tsx files: must be PascalCase ---
const frontendTsxFiles = await collectFiles('apps/frontend', '.tsx');

for (const file of frontendTsxFiles) {
  const stem = stemName(file);
  // Allow index files
  if (stem === 'index') continue;

  if (!PASCAL_CASE_RE.test(stem)) {
    errors.push(`React PascalCase violation: ${file} (stem: "${stem}")`);
  }
}

// --- Report ---
if (errors.length > 0) {
  console.error(`Found ${errors.length} filename convention violation(s):\n`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
} else {
  console.log('All filenames conform to naming conventions.');
  process.exit(0);
}
