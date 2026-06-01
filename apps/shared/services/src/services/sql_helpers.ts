import { getControlPool } from '../database/drizzle/clients/index';

const ALLOWED_TABLES = new Set([
  'projects',
  'users',
  'sessions',
  'tokens',
  'tools',
  'mcp_servers',
  'operations',
  'tasks',
  'security_policies',
  'audit_events',
]);

const IDENTIFIER_RE = /^[a-z][a-z0-9_]{0,62}$/;

function assertSafeIdentifier(value: string, kind: 'table' | 'column'): void {
  if (kind === 'table' && !ALLOWED_TABLES.has(value)) {
    throw new Error(`sql_helpers: table "${value}" is not in the allowed list`);
  }
  if (!IDENTIFIER_RE.test(value)) {
    throw new Error(`sql_helpers: ${kind} "${value}" contains disallowed characters`);
  }
}

export async function updateTableRow(
  table: string,
  id: string,
  data: Record<string, unknown>,
  findFn: (id: string) => Promise<Record<string, unknown> | null>
): Promise<Record<string, unknown> | null> {
  assertSafeIdentifier(table, 'table');
  const keys = Object.keys(data);
  if (keys.length === 0) return findFn(id);
  for (const k of keys) assertSafeIdentifier(k, 'column');
  const pool = getControlPool();
  const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
  const values = [id, ...keys.map((k) => data[k])];
  const result = await pool.query(
    `UPDATE "${table}" SET ${setClauses}, "updated_at" = NOW() WHERE "id" = $1 RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}
