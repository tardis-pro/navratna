/**
 * API response envelope normalizer.
 *
 * Centralizes every "what shape did the backend return this time?" branch.
 * `unwrapEden` (see ./eden.ts) already strips the outer `{success, data}`
 * envelope before domain code runs, so this normalizer handles the *next*
 * layer of variance — bare array vs `{items}` vs `{agents}` vs nested
 * `{data:{items}}`, etc. — that different Elysia routes produce.
 *
 * Why one shared normalizer (vs per-domain parsing):
 * - The same class of bug (`response.success && response.data.items`) recurs
 *   across domains whenever a route changes its response shape (memory #2782).
 * - Silent empty branches (`else { /* silently empty *\/ }`) hide the failure.
 * - One canonical normalizer with a structured-logger warning makes the bug
 *   observable and the fix locality-free.
 *
 * Usage:
 *   const agentList = normalizeApiList<Agent>(await uaipAPI.agents.list());
 *   const tool      = normalizeApiItem<Tool>(await uaipAPI.tools.get(id));
 */

import { logger } from '@/utils/browser_logger';

/**
 * Type guard: `unknown` is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard: `unknown` is an array of `T` items. We don't validate the
 * shape of each item — callers own that contract via their generic `T`.
 */
function isArrayOf<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Normalize a possibly-enveloped list response into `T[]`.
 *
 * Handles (returns the array if any matches):
 *   - bare array: `T[]`
 *   - `{success: true, data: T[]}` (defensive: unwrapEden should already strip this,
 *     but if a route bypassed Eden and hit axios, the original envelope is intact)
 *   - `{data: T[]}` (one-arg unwrap leftover)
 *   - `{data: {items: T[]}}`, `{data: {agents: T[]}}` (any single-key wrapper)
 *   - `{agents: T[]}`, `{items: T[]}` (top-level single-key wrappers)
 *   - any `{data: {<singleKey>: T[]}}` (generic single-key fallback)
 *
 * On unrecognized shape: returns `[]` AND logs a structured warning via
 * the project logger (NOT `console.log` — oxlint blocks it). Callers
 * MUST not crash on an empty list.
 */
export function normalizeApiList<T>(raw: unknown): T[] {
  // 1. Bare array — the common case post-unwrapEden.
  if (isArrayOf<T>(raw)) {
    return raw;
  }

  if (!isRecord(raw)) {
    logger.warn('[envelope] normalizeApiList: non-object response', { shape: typeof raw });
    return [];
  }

  // 2. Outer `{success, data}` envelope (only reachable if unwrapEden was
  //    bypassed — e.g. legacy axios path). Defensive.
  if (
    raw['success'] === true &&
    isRecord(raw['data'])
  ) {
    const innerData = raw['data'];
    // Recurse — the inner data may itself be a single-key wrapper.
    return normalizeApiList<T>(innerData);
  }

  // 3. `{data: T[]}` — one-arg unwrap leftover (axios style).
  const dataField = raw['data'];
  if (isArrayOf<T>(dataField)) {
    return dataField;
  }

  // 4. `{data: {items|agents|...: T[]}}` — nested single-key wrapper.
  if (isRecord(dataField)) {
    const inner = extractSingleArrayKey<T>(dataField);
    if (inner !== null) {
      return inner;
    }
  }

  // 5. `{items: T[]}` or `{agents: T[]}` etc. — top-level single-key wrapper.
  const top = extractSingleArrayKey<T>(raw);
  if (top !== null) {
    return top;
  }

  // 6. Unrecognized — log and return empty. The warning is the bug signal:
  //    if it fires, a backend route changed shape and the normalizer needs
  //    a new branch, OR a caller is passing the wrong thing in.
  logger.warn('[envelope] normalizeApiList: unrecognized shape', {
    keys: Object.keys(raw),
    sample: truncateForLog(raw),
  });
  return [];
}

/**
 * Extract the array value from the only array-valued property of `record`.
 * Returns `null` if zero or multiple array-valued properties exist
 * (ambiguous — we don't guess).
 */
function extractSingleArrayKey<T>(record: Record<string, unknown>): T[] | null {
  const arrayKeys: string[] = [];
  for (const key of Object.keys(record)) {
    if (isArrayOf<unknown>(record[key])) {
      arrayKeys.push(key);
    }
  }
  if (arrayKeys.length !== 1) {
    return null;
  }
  return record[arrayKeys[0]!] as T[];
}

/**
 * Normalize a possibly-enveloped single-object response into `T | null`.
 *
 * Handles:
 *   - bare object: `T`
 *   - `{success: true, data: T}`
 *   - `{data: T}`
 *   - any single-key wrapper where the only key's value is an object
 *     (e.g. `{agent: {...}}`)
 *
 * On unrecognized shape: returns `null` AND logs a structured warning.
 */
export function normalizeApiItem<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  // Bare object — the common case post-unwrapEden.
  if (isRecord(raw) && !Array.isArray(raw)) {
    // Already a single object — but be defensive against single-key wrappers.
    // If the object has exactly one key whose value is itself an object
    // (not an array), treat that as the payload.
    const objectKeys = Object.keys(raw).filter((k) =>
      isRecord(raw[k]) && !Array.isArray(raw[k]),
    );
    if (objectKeys.length === 1 && Object.keys(raw).length === 1) {
      return raw[objectKeys[0]!] as T;
    }
    return raw as T;
  }

  if (!isRecord(raw)) {
    logger.warn('[envelope] normalizeApiItem: non-object response', { shape: typeof raw });
    return null;
  }

  // `{success: true, data: T}` defensive (shouldn't reach here after unwrapEden).
  if (raw['success'] === true && isRecord(raw['data'])) {
    return normalizeApiItem<T>(raw['data']);
  }

  // `{data: T}` — one-arg unwrap.
  const dataField = raw['data'];
  if (isRecord(dataField) && !Array.isArray(dataField)) {
    return dataField as T;
  }

  logger.warn('[envelope] normalizeApiItem: unrecognized shape', {
    keys: Object.keys(raw),
    sample: truncateForLog(raw),
  });
  return null;
}

/**
 * Truncate a value for safe structured logging. Keeps keys, truncates
 * string values to ~80 chars so a runaway payload can't blow up the log.
 */
function truncateForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 80 ? `${value.slice(0, 80)}…` : value;
  }
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      out[k] = truncateForLog(value[k]);
    }
    return out;
  }
  return value;
}
