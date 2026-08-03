const PREFIX = 'agent-thread-';
const SEPARATOR = '~';

export interface ThreadRouteId {
  agentId: string;
  /** Undefined for a pre-threads url, which the server resolves to the agent id. */
  threadKey?: string;
}

/**
 * The thread route param used to be exactly `agent-thread-${agentId}`, which made
 * a url one-to-one with an agent and left nowhere to name WHICH thread. The key is
 * appended rather than replacing the agent id so an old bookmark still resolves,
 * and so the agent can be read from the url without a round trip.
 */
export function encodeThreadRouteId({ agentId, threadKey }: ThreadRouteId): string {
  return threadKey ? `${PREFIX}${agentId}${SEPARATOR}${threadKey}` : `${PREFIX}${agentId}`;
}

export function decodeThreadRouteId(routeId: string): ThreadRouteId | null {
  if (!routeId.startsWith(PREFIX)) return null;

  const body = routeId.slice(PREFIX.length);
  if (body === '') return null;

  const separatorAt = body.indexOf(SEPARATOR);
  if (separatorAt === -1) return { agentId: body };

  const agentId = body.slice(0, separatorAt);
  const threadKey = body.slice(separatorAt + SEPARATOR.length);
  if (agentId === '' || threadKey === '') return null;

  return { agentId, threadKey };
}

export function isThreadRouteId(routeId: string): boolean {
  return decodeThreadRouteId(routeId) !== null;
}
