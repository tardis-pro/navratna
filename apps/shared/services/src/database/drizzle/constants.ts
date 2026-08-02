export const ADMIN_ORG_ID = '00000000-0000-0000-0000-000000000001';
export const ADMIN_ORG_SLUG = 'admin';
export const ADMIN_ORG_NAME = 'UAIP Admin';

// These must be SEEDED rows — operations.agent_id has no cross-plane FK, so an
// unseeded id is an orphan CrossPlaneGuard cannot tell apart from a typo.
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-0000000000a1';
export const SYSTEM_PERSONA_ID = '00000000-0000-0000-0000-0000000000a2';
export const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-0000000000a3';
export const SYSTEM_USER_EMAIL = 'system@uaip.internal';
export const SYSTEM_AGENT_NAME = 'System';

// Separate 'b' block: the guide is an AGENT, and reusing the 'a' block would
// have given it the same uuid as SYSTEM_USER_ID — two different planes holding
// the same id is indistinguishable from a mis-planed lookup.
export const ONBOARDING_GUIDE_AGENT_ID = '00000000-0000-0000-0000-0000000000b1';
export const ONBOARDING_GUIDE_PERSONA_ID = '00000000-0000-0000-0000-0000000000b2';
export const ONBOARDING_GUIDE_AGENT_NAME = 'Navratna Guide';

/**
 * PLATFORM vs TENANT agents. Every seeded agent is created in ADMIN_ORG_ID
 * (agent_seed.ts), so an org-equality filter would offer a fresh tenant an
 * EMPTY roster and provision nobody. Agents in the admin org are therefore
 * platform-shared — offerable to every tenant — while agents in any other org
 * belong to that tenant alone.
 *
 * This governs CANDIDACY (what may be offered), never AUTHORIZATION: access
 * still requires a user_agent_assignments row scoped to the caller's own org.
 */
export function isPlatformAgentOrg(agentOrganizationId: string | null): boolean {
  return agentOrganizationId === ADMIN_ORG_ID;
}

export function isOfferableToOrg(
  agentOrganizationId: string | null,
  callerOrganizationId: string
): boolean {
  return (
    isPlatformAgentOrg(agentOrganizationId) || agentOrganizationId === callerOrganizationId
  );
}
