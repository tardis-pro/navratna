/**
 * Project Management API Client
 * Handles all project-related operations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/api_config';
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

export const projectsAPI = {
  async list(options?: ProjectListOptions): Promise<Project[]> {
    return APIClient.get<Project[]>(API_ROUTES.PROJECTS.LIST, { params: options });
  },

  async get(id: string): Promise<Project> {
    return APIClient.get<Project>(`${API_ROUTES.PROJECTS.GET}/${id}`);
  },

  async create(project: ProjectCreate): Promise<Project> {
    return APIClient.post<Project>(API_ROUTES.PROJECTS.CREATE, project);
  },

  async update(id: string, updates: ProjectUpdate): Promise<Project> {
    return APIClient.put<Project>(`${API_ROUTES.PROJECTS.UPDATE}/${id}`, updates);
  },

  async delete(id: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.PROJECTS.DELETE}/${id}`);
  },

  async updateStatus(id: string, status: ProjectStatus): Promise<Project> {
    return APIClient.patch<Project>(`${API_ROUTES.PROJECTS.UPDATE}/${id}/status`, { status });
  },

  // Member management
  async getMembers(projectId: string): Promise<ProjectMember[]> {
    return APIClient.get<ProjectMember[]>(`${API_ROUTES.PROJECTS.GET}/${projectId}/members`);
  },

  async addMember(
    projectId: string,
    userId: string,
    role: ProjectMemberRole = 'member'
  ): Promise<ProjectMember> {
    return APIClient.post<ProjectMember>(`${API_ROUTES.PROJECTS.GET}/${projectId}/members`, {
      userId,
      role,
    });
  },

  async updateMemberRole(
    projectId: string,
    userId: string,
    role: ProjectMemberRole
  ): Promise<ProjectMember> {
    return APIClient.patch<ProjectMember>(
      `${API_ROUTES.PROJECTS.GET}/${projectId}/members/${userId}`,
      {
        role,
      }
    );
  },

  async removeMember(projectId: string, userId: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.PROJECTS.GET}/${projectId}/members/${userId}`);
  },

  // File management
  async getFiles(projectId: string): Promise<ProjectFile[]> {
    return APIClient.get<ProjectFile[]>(`${API_ROUTES.PROJECTS.GET}/${projectId}/files`);
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
    return APIClient.post<ProjectFile>(`${API_ROUTES.PROJECTS.GET}/${projectId}/files`, file);
  },

  async updateFile(
    projectId: string,
    fileId: string,
    updates: {
      content?: string;
      metadata?: unknown;
    }
  ): Promise<ProjectFile> {
    return APIClient.patch<ProjectFile>(
      `${API_ROUTES.PROJECTS.GET}/${projectId}/files/${fileId}`,
      updates
    );
  },

  async deleteFile(projectId: string, fileId: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.PROJECTS.GET}/${projectId}/files/${fileId}`);
  },

  // Tool management
  async getTools(projectId: string): Promise<string[]> {
    return APIClient.get<string[]>(`${API_ROUTES.PROJECTS.GET}/${projectId}/tools`);
  },

  async assignTools(projectId: string, toolIds: string[]): Promise<void> {
    return APIClient.post(`${API_ROUTES.PROJECTS.GET}/${projectId}/tools`, { toolIds });
  },

  async removeTools(projectId: string, toolIds: string[]): Promise<void> {
    return APIClient.delete(`${API_ROUTES.PROJECTS.GET}/${projectId}/tools`, {
      data: { toolIds },
    });
  },

  // Analytics and stats
  async getStats(projectId: string): Promise<unknown> {
    return APIClient.get(`${API_ROUTES.PROJECTS.GET}/${projectId}/stats`);
  },

  async getActivity(projectId: string, days: number = 30): Promise<unknown> {
    return APIClient.get(`${API_ROUTES.PROJECTS.GET}/${projectId}/activity`, {
      params: { days },
    });
  },

  // Bulk operations
  async bulkUpdateStatus(projectIds: string[], status: ProjectStatus): Promise<Project[]> {
    return APIClient.patch<Project[]>(`${API_ROUTES.PROJECTS.UPDATE}/bulk/status`, {
      projectIds,
      status,
    });
  },

  async archive(projectId: string): Promise<Project> {
    return APIClient.post<Project>(`${API_ROUTES.PROJECTS.UPDATE}/${projectId}/archive`);
  },

  async unarchive(projectId: string): Promise<Project> {
    return APIClient.post<Project>(`${API_ROUTES.PROJECTS.UPDATE}/${projectId}/unarchive`);
  },
};
