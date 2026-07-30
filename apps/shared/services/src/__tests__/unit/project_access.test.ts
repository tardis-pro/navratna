import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getProject once accepted a userId and ignored it, so any authenticated user
 * could read any project by id. A caller that identifies itself must be the
 * owner or a member, and a non-member must be indistinguishable from a missing
 * project.
 */

const project = { id: 'proj-1', ownerId: 'owner-1', name: 'P' };

const projectRepository = { findOne: vi.fn(async () => project) };
const memberRepository = { findOne: vi.fn(async () => null as unknown) };

const { ProjectManagementService } = await import('../../project_management_service.js');

function makeService() {
  const service = Object.create(ProjectManagementService.prototype) as InstanceType<
    typeof ProjectManagementService
  >;
  Reflect.set(service, 'projectRepository', projectRepository);
  Reflect.set(service, 'memberRepository', memberRepository);
  return service;
}

describe('getProject access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectRepository.findOne.mockResolvedValue(project);
    memberRepository.findOne.mockResolvedValue(null);
  });

  it('returns the project for its owner', async () => {
    await expect(makeService().getProject('proj-1', 'owner-1')).resolves.toEqual(project);
  });

  it('returns the project for a member', async () => {
    memberRepository.findOne.mockResolvedValue({ id: 'm1', projectId: 'proj-1', userId: 'u2' });

    await expect(makeService().getProject('proj-1', 'u2')).resolves.toEqual(project);
  });

  it('hides the project from a non-member', async () => {
    await expect(makeService().getProject('proj-1', 'stranger')).resolves.toBeNull();
  });

  it('still allows an internal lookup with no userId', async () => {
    await expect(makeService().getProject('proj-1')).resolves.toEqual(project);
  });
});
