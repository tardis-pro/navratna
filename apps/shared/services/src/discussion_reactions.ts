export type ReactionMap = Record<string, string[]>;

type ReactionQueryRunner = {
  executeQuery<T = unknown>(query: string, parameters?: unknown[]): Promise<T[]>;
};

// Single-statement merge: a read-modify-write of the whole JSONB object loses a
// concurrent reaction to the same message. The `- $3` array-subtract before the
// append makes re-adding the same participant a no-op. The discussion_id
// predicate is authorization: without it any known message id is writable.
const ADD_REACTION_SQL = `
  UPDATE discussion_messages
  SET reactions = jsonb_set(
        COALESCE(
          CASE WHEN jsonb_typeof(reactions) = 'object' THEN reactions ELSE NULL END,
          '{}'::jsonb
        ),
        ARRAY[$2::text],
        COALESCE(
          CASE
            WHEN jsonb_typeof(reactions -> $2::text) = 'array'
            THEN (reactions -> $2::text) - $3::text
            ELSE NULL
          END,
          '[]'::jsonb
        ) || to_jsonb($3::text),
        true
      )
  WHERE id = $1 AND discussion_id = $4
  RETURNING reactions
`;

function isReactionMap(value: unknown): value is ReactionMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (entry) => Array.isArray(entry) && entry.every((id) => typeof id === 'string')
  );
}

export async function addReactionToMessage(
  db: ReactionQueryRunner,
  discussionId: string,
  messageId: string,
  participantId: string,
  emoji: string
): Promise<ReactionMap> {
  const rows = await db.executeQuery<{ reactions: unknown }>(ADD_REACTION_SQL, [
    messageId,
    emoji,
    participantId,
    discussionId,
  ]);

  const updated = rows[0];
  if (!updated) {
    throw new Error(`Message not found in discussion ${discussionId}: ${messageId}`);
  }

  return isReactionMap(updated.reactions) ? updated.reactions : {};
}
