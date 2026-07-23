import type { CreateDiscussionRequest } from '@uaip/types';
import { DiscussionVisibility, ParticipantRole, TurnStrategy } from '@uaip/types';

const MAX_TOPIC_LENGTH = 500;
const MAX_TITLE_LENGTH = 200;
const TITLE_PREFIX = 'Discussion: ';

export type DiscussionStartContext = Partial<CreateDiscussionRequest>;

export interface BuildDiscussionRequestParams {
  topic?: string;
  userId: string;
  selectedAgentIds: string[];
  maxRounds?: number;
  context?: DiscussionStartContext;
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

export function buildDiscussionCreateRequest(
  params: BuildDiscussionRequestParams
): CreateDiscussionRequest {
  const rawTopic = params.topic || 'General Discussion';
  const topic = truncateText(rawTopic, MAX_TOPIC_LENGTH);
  const context = params.context ?? {};
  const artifactConfig = context.artifactConfig;
  const metadata = {
    ...context.metadata,
    ...(artifactConfig ? { artifactConfig } : {}),
  };

  return {
    ...context,
    title:
      context.title ??
      `${TITLE_PREFIX}${truncateText(rawTopic, MAX_TITLE_LENGTH - TITLE_PREFIX.length)}`,
    description: context.description ?? `Automated discussion on ${topic}`,
    topic,
    createdBy: params.userId,
    initialParticipants: params.selectedAgentIds.map((agentId) => ({
      agentId,
      role: ParticipantRole.PARTICIPANT,
    })),
    settings: {
      maxDuration: 3600,
      ...context.settings,
      ...(params.maxRounds !== undefined ? { maxMessages: params.maxRounds } : {}),
    },
    turnStrategy: context.turnStrategy ?? {
      strategy: TurnStrategy.ROUND_ROBIN,
      config: { type: 'round_robin', skipInactive: true, maxSkips: 1 },
    },
    visibility: context.visibility ?? DiscussionVisibility.PRIVATE,
    metadata,
    ...(artifactConfig ? { artifactConfig } : {}),
  };
}
