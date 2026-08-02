import { UserAgentAssignmentRepository } from './database/repositories/user_agent_assignment_repository';
import { ONBOARDING_GUIDE_AGENT_ID } from './database/drizzle/constants';
import { logger } from '@uaip/utils';

/**
 * Agent access guard — THE ASSIGNMENT ROW IS THE GRANT.
 *
 * All seeded agents live in the admin organization and agent names are
 * globally unique, so org-equality checks (`agent.organizationId ===
 * user.organizationId`) would deny every non-admin-org user. Authorization is
 * therefore: does a user_agent_assignments row exist for (userId, agentId)?
 *
 * Carve-outs:
 * - privileged roles ('admin', 'system') bypass assignment checks entirely
 * - the onboarding guide agent is unassigned to anybody, so callers that
 *   legitimately need it must opt in explicitly via `allowOnboardingGuide`
 *
 * The guide carve-out is deny-by-default because agent_chat_conversations is
 * unique on (organization, user, agent): a generic chat call to the guide
 * would write into the very conversation the interview reads from, letting a
 * user inject text the extractor treats as interview evidence. Only surfaces
 * that need the guide's metadata (never its chat) may opt in.
 */

export interface AgentAccessContext {
  userId: string;
  organizationId: string;
  role?: string;
}

export interface AgentAccessOptions {
  allowOnboardingGuide?: boolean;
}

export class AgentAccessDeniedError extends Error {
  readonly code = 'AGENT_ACCESS_DENIED';

  constructor(agentId: string) {
    super(`Access denied to agent ${agentId}`);
    this.name = 'AgentAccessDeniedError';
  }
}

export { ONBOARDING_GUIDE_AGENT_ID };

// Role literals mirror @uaip/middleware: requireAdmin checks `role !== 'admin'`
// (auth_middleware.ts) and 'system' is the internal system actor
// (agent_middleware.ts). There is no 'service' role in this codebase.
const PRIVILEGED_ROLES = new Set(['admin', 'system']);

const assignmentRepository = new UserAgentAssignmentRepository();

export function isPrivilegedRole(role: string | undefined): boolean {
  return role !== undefined && PRIVILEGED_ROLES.has(role);
}

export async function canAccessAgent(
  ctx: AgentAccessContext,
  agentId: string,
  options: AgentAccessOptions = {}
): Promise<boolean> {
  if (isPrivilegedRole(ctx.role)) return true;
  if (options.allowOnboardingGuide === true && agentId === ONBOARDING_GUIDE_AGENT_ID) return true;

  try {
    return await assignmentRepository.hasAssignment(ctx.userId, agentId, ctx.organizationId);
  } catch (error: unknown) {
    logger.error('canAccessAgent failed', {
      userId: ctx.userId,
      agentId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function assertAgentAccess(
  ctx: AgentAccessContext,
  agentId: string,
  options: AgentAccessOptions = {}
): Promise<void> {
  const allowed = await canAccessAgent(ctx, agentId, options);
  if (!allowed) {
    throw new AgentAccessDeniedError(agentId);
  }
}
