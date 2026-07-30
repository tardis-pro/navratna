import { DiscussionStatus } from '@uaip/types';

type StatusQueryRunner = {
  executeQuery<T = unknown>(query: string, parameters?: unknown[]): Promise<T[]>;
};

export type CompareAndSetResult =
  | { updated: true; status: DiscussionStatus }
  | { updated: false };

// Conditional on the source state so the database, not a per-process lock,
// decides the winner: a second Fly machine that lost the race matches no row.
const CAS_STATUS_SQL = `
  UPDATE discussions
  SET status = $2, updated_at = NOW()
  WHERE id = $1 AND status = ANY($3::text[])
  RETURNING id, status
`;

export async function compareAndSetDiscussionStatus(
  db: StatusQueryRunner,
  discussionId: string,
  target: DiscussionStatus,
  allowedSourceStates: readonly DiscussionStatus[]
): Promise<CompareAndSetResult> {
  const rows = await db.executeQuery<{ id: string; status: string }>(CAS_STATUS_SQL, [
    discussionId,
    target,
    allowedSourceStates,
  ]);

  return rows.length > 0 ? { updated: true, status: target } : { updated: false };
}
