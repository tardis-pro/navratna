type ParticipantQueryRunner = {
  executeQuery<T = unknown>(query: string, parameters?: unknown[]): Promise<T[]>;
};

// Admission control AFTER the insert, not a pre-read: the insert path also
// writes persona linkage, permissions and turn config, so it must not be
// reimplemented here. Two instances can both pass a read-then-insert capacity
// check, so instead every active row is ranked by joined_at within its
// discussion and anything past the cap is deactivated again. The ranking is
// deterministic, so concurrent writers agree on who was admitted.
const ENFORCE_CAPACITY_SQL = `
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY joined_at, id) AS position
    FROM discussion_participants
    WHERE discussion_id = $1::uuid AND is_active = true
  )
  UPDATE discussion_participants dp
  SET is_active = false, left_at = NOW()
  FROM ranked
  WHERE dp.id = ranked.id
    AND dp.id = $3::uuid
    AND ranked.position > $2::int
  RETURNING dp.id
`;

export async function enforceParticipantCapacity(
  db: ParticipantQueryRunner,
  discussionId: string,
  maxParticipants: number,
  participantId: string
): Promise<boolean> {
  const evicted = await db.executeQuery<{ id: string }>(ENFORCE_CAPACITY_SQL, [
    discussionId,
    maxParticipants,
    participantId,
  ]);

  return evicted.length === 0;
}
