export type {
  Project,
  ProjectStatus,
  ProjectType,
  ProjectRole as ProjectMemberRole,
} from '@uaip/types';

export interface ProjectCreate {
  name: string;
  description?: string;
  type: string;
  visibility?: 'public' | 'private' | 'internal';
  recommendedAgents?: string[];
  settings?: unknown;
  metadata?: unknown;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  status?: string;
  type?: string;
  visibility?: 'public' | 'private' | 'internal';
  recommendedAgents?: string[];
  settings?: unknown;
  metadata?: unknown;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  joinedAt: string;
  user?: { id: string; email: string; name?: string };
}

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  content?: string;
  type: string;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListOptions {
  page?: number;
  limit?: number;
  status?: string;
  visibility?: 'public' | 'private' | 'internal';
  ownerId?: string;
  memberId?: string;
  search?: string;
}
