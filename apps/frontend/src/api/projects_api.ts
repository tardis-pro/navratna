/**
 * Project Management API Client
 * Handles all project-related operations
 */

import { gatewayClient, edenWithCSRFRetry, edenRequest } from './eden';
import { ProjectRole } from '@uaip/types';
import type { ProjectStatus, ProjectMemberRole } from '@uaip/contracts/api';
import type {
  Project,
  ProjectCreate,
  ProjectUpdate,
  ProjectMember,
  ProjectFile,
  ProjectListOptions,
} from '@uaip/contracts/api';

export type {
  Project,
  ProjectCreate,
  ProjectUpdate,
  ProjectMember,
  ProjectFile,
  ProjectListOptions,
};

const projects = gatewayClient.api.v1.projects;

export const projectsAPI = {
  async list(options?: ProjectListOptions): Promise<Project[]> {
    const query: Record<string, unknown> | undefined = options ? { ...options } : undefined;
    const result = await edenWithCSRFRetry(() => projects.get({ query }));

    // The endpoint answers with a paginated envelope ({ projects, total }), not a bare
    // array — callers .map() over this, so hand back the list itself.
    if (result && !Array.isArray(result) && Array.isArray((result as { projects?: Project[] }).projects)) {
      return (result as unknown as { projects: Project[] }).projects;
    }
    return Array.isArray(result) ? result : [];
  },

  async get(id: string): Promise<Project> {
    return edenWithCSRFRetry(() => projects[id].get());
  },

  async create(project: ProjectCreate): Promise<Project> {
    return edenWithCSRFRetry(() => projects.post(project));
  },

  async update(id: string, updates: ProjectUpdate): Promise<Project> {
    return edenWithCSRFRetry(() => projects[id].put(updates));
  },

  async delete(id: string): Promise<void> {
    await edenWithCSRFRetry(() => projects[id].delete());
  },

  async updateStatus(id: string, status: ProjectStatus): Promise<Project> {
    return edenWithCSRFRetry(() => projects[id].status.patch({ status }));
  },

  // Member management
  async getMembers(projectId: string): Promise<ProjectMember[]> {
    return edenWithCSRFRetry(() => projects[projectId].members.get());
  },

  async addMember(
    projectId: string,
    userId: string,
    role: ProjectMemberRole = ProjectRole.MEMBER
  ): Promise<ProjectMember> {
    return edenWithCSRFRetry(() => projects[projectId].members.post({ userId, role }));
  },

  async updateMemberRole(
    projectId: string,
    userId: string,
    role: ProjectMemberRole
  ): Promise<ProjectMember> {
    return edenWithCSRFRetry(() => projects[projectId].members[userId].patch({ role }));
  },

  async removeMember(projectId: string, userId: string): Promise<void> {
    await edenWithCSRFRetry(() => projects[projectId].members[userId].delete());
  },

  // File management
  async getFiles(projectId: string): Promise<ProjectFile[]> {
    return edenWithCSRFRetry(() => projects[projectId].files.get());
  },

  async addFile(
    projectId: string,
    file: {
      path: string;
      content?: string;
      type?: string;
      metadata?: unknown;
    }
  ): Promise<ProjectFile> {
    return edenWithCSRFRetry(() => projects[projectId].files.post(file));
  },

  async updateFile(
    projectId: string,
    fileId: string,
    updates: {
      content?: string;
      metadata?: unknown;
    }
  ): Promise<ProjectFile> {
    return edenWithCSRFRetry(() => projects[projectId].files[fileId].patch(updates));
  },

  async deleteFile(projectId: string, fileId: string): Promise<void> {
    await edenWithCSRFRetry(() => projects[projectId].files[fileId].delete());
  },

  // Tool management
  async getTools(projectId: string): Promise<string[]> {
    return edenWithCSRFRetry(() => projects[projectId].tools.get());
  },

  async assignTools(projectId: string, toolIds: string[]): Promise<void> {
    await edenWithCSRFRetry(() => projects[projectId].tools.post({ toolIds }));
  },

  async removeTools(projectId: string, toolIds: string[]): Promise<void> {
    await edenRequest(`/api/v1/projects/${projectId}/tools`, {
      method: 'DELETE',
      body: { toolIds },
    });
  },

  // Analytics and stats
  async getStats(projectId: string): Promise<unknown> {
    return edenWithCSRFRetry(() => projects[projectId].stats.get());
  },

  async getActivity(projectId: string, days: number = 30): Promise<unknown> {
    return edenWithCSRFRetry(() => projects[projectId].activity.get({ query: { days } }));
  },

  // Bulk operations
  async bulkUpdateStatus(projectIds: string[], status: ProjectStatus): Promise<Project[]> {
    return edenRequest<Project[]>('/api/v1/projects/bulk/status', {
      method: 'PATCH',
      body: { projectIds, status },
    });
  },

  async archive(projectId: string): Promise<Project> {
    return edenWithCSRFRetry(() => projects[projectId].archive.post());
  },

  async unarchive(projectId: string): Promise<Project> {
    return edenWithCSRFRetry(() => projects[projectId].unarchive.post());
  },
};
