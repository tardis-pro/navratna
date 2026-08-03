export interface MentionCandidate {
  id: string;
  name: string;
}

const MENTION_PATTERN = /@([A-Za-z0-9_]+)/g;

const toToken = (name: string): string => name.trim().replace(/\s+/g, '_').toLowerCase();

/**
 * Turns the `@Name` tokens still present in the composer into real agent ids.
 *
 * The tokens are display names, not ids, so they are matched against agents the
 * user actually picked or can see. An unmatched token resolves to NOTHING rather
 * than being sent as a pseudo-id: the server authorizes every id it receives, and
 * inventing one would either be rejected or, worse, collide with a real agent.
 */
export function resolveMentionedAgentIds(
  text: string,
  candidates: MentionCandidate[]
): string[] {
  const byToken = new Map<string, string>();
  for (const candidate of candidates) {
    const token = toToken(candidate.name);
    if (token !== '' && !byToken.has(token)) byToken.set(token, candidate.id);
  }

  const resolved: string[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const agentId = byToken.get(match[1]!.toLowerCase());
    if (agentId && !resolved.includes(agentId)) resolved.push(agentId);
  }

  return resolved;
}
