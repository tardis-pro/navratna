import { getControlPool } from '../database/drizzle/clients/index';

export async function updateTableRow(
  table: string,
  id: string,
  data: Record<string, unknown>,
  findFn: (id: string) => Promise<Record<string, unknown> | null>
): Promise<Record<string, unknown> | null> {
  const keys = Object.keys(data);
  if (keys.length === 0) return findFn(id);
  const pool = getControlPool();
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = [id, ...keys.map((k) => data[k])];
  const result = await pool.query(
    `UPDATE ${table} SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}
