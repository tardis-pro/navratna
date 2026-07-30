type TurnQueryRunner = {
  executeQuery<T = unknown>(query: string, parameters?: unknown[]): Promise<T[]>;
};

export type NextTurn = {
  participantId?: string;
  startedAt: Date;
  expectedEndAt?: Date;
  turnNumber: number;
};

// Conditional on the turn number the caller observed, so a second instance that
// read the same turn matches no row instead of overwriting the winner's advance.
// jsonb_set writes currentTurn in place, preserving the rest of state.
const CAS_TURN_SQL = `
  UPDATE discussions
  SET state = jsonb_set(
        jsonb_set(
          COALESCE(state, '{}'::jsonb),
          '{currentTurn}',
          $3::jsonb,
          true
        ),
        '{lastActivity}',
        to_jsonb(NOW()),
        true
      ),
      updated_at = NOW()
  WHERE id = $1
    AND (state -> 'currentTurn' ->> 'turnNumber')::int IS NOT DISTINCT FROM $2::int
  RETURNING id
`;

export async function compareAndSetDiscussionTurn(
  db: TurnQueryRunner,
  discussionId: string,
  observedTurnNumber: number | undefined,
  nextTurn: NextTurn
): Promise<boolean> {
  const rows = await db.executeQuery<{ id: string }>(CAS_TURN_SQL, [
    discussionId,
    observedTurnNumber ?? null,
    JSON.stringify(nextTurn),
  ]);

  return rows.length > 0;
}
