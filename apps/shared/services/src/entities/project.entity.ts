export const ProjectStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
  ON_HOLD: 'on_hold',
} as const;
export type ProjectStatus = typeof ProjectStatus[keyof typeof ProjectStatus];

export const ProjectVisibility = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  INTERNAL: 'internal',
} as const;
export type ProjectVisibility = typeof ProjectVisibility[keyof typeof ProjectVisibility];

export interface ProjectEntity {
  id: string;
  name: string;
  description?: string;
  slug: string;
  ownerId: string;
  type?: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  tags?: string[];
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  fileCount?: number;
  artifactCount?: number;
  totalSizeBytes?: number;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
