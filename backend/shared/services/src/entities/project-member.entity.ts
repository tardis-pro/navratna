export const ProjectRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;
export type ProjectRole = typeof ProjectRole[keyof typeof ProjectRole];

export const MemberStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
} as const;
export type MemberStatus = typeof MemberStatus[keyof typeof MemberStatus];

export interface ProjectMemberEntity {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  status: MemberStatus;
  permissions?: Record<string, boolean>;
  joinedAt: Date;
  invitedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
