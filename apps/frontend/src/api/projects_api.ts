/**
 * Project Management API Client
 * Handles all project-related operations
 */

import { gatewayClient, edenWithCSRFRetry, edenRequest } from './eden';
import { GitHubRepo, LinkGitRepoData, ProjectRole } from '@uaip/types';
import type {
  ProjectStatus,
  ProjectMemberRole,
  LinkGitHubRepoRequest as LinkGitHubRepoRequestType,
} from '@uaip/contracts/api';
import type {
  Project,
  ProjectCreate,
  ProjectUpdate,
  ProjectMember,
  ProjectFile,
  ProjectListOptions,
} from '@uaip/contracts/api';
import type { ProjectMetrics } from '@uaip/types';

/**
 * Mirrors the server's ProjectChatSettings. Declared here rather than imported
 * from shared-services because that package is backend-only.
 */
export interface ProjectChatSettings {
  instructions: string | null;
  defaultAgentId: string | null;
}

function hasProjectsArray(value: unknown): value is { projects: Project[] } {
  if (typeof value !== 'object' || value === null || !('projects' in value)) {
    return false;
  }
  return Array.isArray(value.projects);
}

export type {
  Project,
  ProjectCreate,
  ProjectUpdate,
  ProjectMember,
  ProjectFile,
  ProjectListOptions,
  GitHubRepo,
  LinkGitRepoData,
  LinkGitHubRepoRequestType as LinkGitHubRepoRequest,
};

const projects = gatewayClient.api.v1.projects;

export const projectsAPI = {
  async list(options?: ProjectListOptions): Promise<Project[]> {
    const query: Record<string, unknown> | undefined = options ? { ...options } : undefined;
    const result = await edenWithCSRFRetry(() => projects.get({ query }));

    // The endpoint answers with a paginated envelope ({ projects, total }), not a bare
    // array — callers .map() over this, so hand back the list itself.
    if (hasProjectsArray(result)) {
      return result.projects;
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

  /**
   * The chat configuration every thread in the project inherits.
   *
   * Uses edenRequest rather than the typed treaty client because the treaty
   * types are generated from the gateway's route tree — a route added in the
   * same change set is not in them until the gateway is rebuilt, and a path this
   * short does not need the indirection.
   */
  async getChatSettings(projectId: string): Promise<ProjectChatSettings> {
    const response = await edenRequest<Partial<ProjectChatSettings> | null>(
      `/api/v1/projects/${projectId}/chat-settings`,
      { method: 'GET' }
    );

    return {
      instructions: response?.instructions ?? null,
      defaultAgentId: response?.defaultAgentId ?? null,
    };
  },

  /**
   * Omitting a field leaves it unchanged; passing null clears it. Callers must
   * not send `undefined` expecting a clear — that is what null is for.
   */
  async updateChatSettings(
    projectId: string,
    patch: Partial<ProjectChatSettings>
  ): Promise<ProjectChatSettings> {
    const response = await edenRequest<Partial<ProjectChatSettings> | null>(
      `/api/v1/projects/${projectId}/chat-settings`,
      { method: 'PUT', body: patch }
    );

    return {
      instructions: response?.instructions ?? null,
      defaultAgentId: response?.defaultAgentId ?? null,
    };
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

  // Gateway names these /metrics and /analytics; /stats and /activity do not exist.
  async getStats(projectId: string): Promise<ProjectMetrics> {
    return edenRequest<ProjectMetrics>(`/api/v1/projects/${projectId}/metrics`, {
      method: 'GET',
    });
  },

  async getActivity(projectId: string): Promise<ProjectMetrics> {
    return edenRequest<ProjectMetrics>(`/api/v1/projects/${projectId}/analytics`, {
      method: 'GET',
    });
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

  // GitHub linking
  async listGitHubRepos(projectId: string): Promise<GitHubRepo[]> {
    return edenRequest<GitHubRepo[]>(`/api/v1/projects/${projectId}/github/repos`, {
      method: 'GET',
    });
  },

  async linkGitHubRepo(projectId: string, request: Omit<LinkGitHubRepoRequestType, 'projectId'>): Promise<Project> {
    return edenRequest<Project>(`/api/v1/projects/${projectId}/link-github`, {
      method: 'POST',
      body: request,
    });
  },

  async linkGitRepo(projectId: string, data: Omit<LinkGitRepoData, 'projectId'>): Promise<Project> {
    return edenRequest<Project>(`/api/v1/projects/${projectId}/link-git`, {
      method: 'POST',
      body: data,
    });
  },

  async unarchive(projectId: string): Promise<Project> {
    return edenWithCSRFRetry(() => projects[projectId].unarchive.post());
  },
};
