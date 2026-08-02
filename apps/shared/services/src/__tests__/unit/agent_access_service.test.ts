import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentAccessContext } from '../../agent_access_service';

/**
 * THE ASSIGNMENT ROW IS THE GRANT.
 *
 * Access to an agent is decided by the existence of a user_agent_assignments
 * row, never by comparing organization ids — all seeded agents live in the
 * admin org, so org-equality checks would deny every non-admin-org user.
 * These tests pin the three grant paths: assignment row, privileged role,
 * and the onboarding-guide carve-out.
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    hasAssignment: vi.fn(),
  },
}));

vi.mock('../../database/repositories/user_agent_assignment_repository', () => ({
  UserAgentAssignmentRepository: class {
    hasAssignment = mocks.hasAssignment;
  },
}));

const {
  AgentAccessDeniedError,
  ONBOARDING_GUIDE_AGENT_ID,
  assertAgentAccess,
  canAccessAgent,
  isPrivilegedRole,
} = await import('../../agent_access_service');

const USER_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '33333333-3333-4333-8333-333333333333';
const AGENT_ID = '44444444-4444-4444-8444-444444444444';

const contextWithRole = (role?: string): AgentAccessContext => ({
  userId: USER_ID,
  organizationId: ORG_ID,
  role,
});

beforeEach(() => {
  mocks.hasAssignment.mockReset();
});

describe('canAccessAgent', () => {
  it('denies access when the user has no assignment row', async () => {
    mocks.hasAssignment.mockResolvedValue(false);

    const allowed = await canAccessAgent(contextWithRole('user'), AGENT_ID);

    expect(allowed).toBe(false);
    expect(mocks.hasAssignment).toHaveBeenCalledWith(USER_ID, AGENT_ID, ORG_ID);
  });

  it('grants access when an assignment row exists', async () => {
    mocks.hasAssignment.mockResolvedValue(true);

    const allowed = await canAccessAgent(contextWithRole('user'), AGENT_ID);

    expect(allowed).toBe(true);
  });

  it('grants access to admins regardless of assignment', async () => {
    mocks.hasAssignment.mockResolvedValue(false);

    const allowed = await canAccessAgent(contextWithRole('admin'), AGENT_ID);

    expect(allowed).toBe(true);
    expect(mocks.hasAssignment).not.toHaveBeenCalled();
  });

  it('denies the onboarding guide agent by default', async () => {
    mocks.hasAssignment.mockResolvedValue(false);

    const allowed = await canAccessAgent(contextWithRole('user'), ONBOARDING_GUIDE_AGENT_ID);

    expect(allowed).toBe(false);
  });

  it('grants the onboarding guide agent only when the caller opts in', async () => {
    mocks.hasAssignment.mockResolvedValue(false);

    const allowed = await canAccessAgent(contextWithRole('user'), ONBOARDING_GUIDE_AGENT_ID, {
      allowOnboardingGuide: true,
    });

    expect(allowed).toBe(true);
    expect(mocks.hasAssignment).not.toHaveBeenCalled();
  });

  it('does not extend the opt-in carve-out to any other agent', async () => {
    mocks.hasAssignment.mockResolvedValue(false);

    const allowed = await canAccessAgent(contextWithRole('user'), AGENT_ID, {
      allowOnboardingGuide: true,
    });

    expect(allowed).toBe(false);
    expect(mocks.hasAssignment).toHaveBeenCalledWith(USER_ID, AGENT_ID, ORG_ID);
  });
});

describe('assertAgentAccess', () => {
  it('assertAgentAccess throws AgentAccessDeniedError carrying code AGENT_ACCESS_DENIED', async () => {
    mocks.hasAssignment.mockResolvedValue(false);

    let thrown: unknown;
    try {
      await assertAgentAccess(contextWithRole('user'), AGENT_ID);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AgentAccessDeniedError);
    expect(thrown).toMatchObject({ code: 'AGENT_ACCESS_DENIED' });
  });

  it('resolves without throwing when access is granted', async () => {
    mocks.hasAssignment.mockResolvedValue(true);

    await expect(assertAgentAccess(contextWithRole('user'), AGENT_ID)).resolves.toBeUndefined();
  });

  it('forwards the onboarding-guide opt-in to canAccessAgent', async () => {
    mocks.hasAssignment.mockResolvedValue(false);

    await expect(
      assertAgentAccess(contextWithRole('user'), ONBOARDING_GUIDE_AGENT_ID, {
        allowOnboardingGuide: true,
      })
    ).resolves.toBeUndefined();
  });

  it('throws for the onboarding guide when the caller does not opt in', async () => {
    mocks.hasAssignment.mockResolvedValue(false);

    await expect(
      assertAgentAccess(contextWithRole('user'), ONBOARDING_GUIDE_AGENT_ID)
    ).rejects.toBeInstanceOf(AgentAccessDeniedError);
  });
});

describe('isPrivilegedRole', () => {
  it('isPrivilegedRole rejects unknown roles', () => {
    expect(isPrivilegedRole('service')).toBe(false);
    expect(isPrivilegedRole('user')).toBe(false);
    expect(isPrivilegedRole(undefined)).toBe(false);
    expect(isPrivilegedRole('admin')).toBe(true);
    expect(isPrivilegedRole('system')).toBe(true);
  });
});
