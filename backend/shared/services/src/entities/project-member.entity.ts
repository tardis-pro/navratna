import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';
import { ProjectEntity } from './project.entity.js';

export enum ProjectRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export enum MemberStatus {
  ACTIVE = 'active',
  INVITED = 'invited',
  REMOVED = 'removed',
}

export interface ProjectPermissions {
  canEditProject?: boolean;
  canManageMembers?: boolean;
  canUploadFiles?: boolean;
  canDeleteFiles?: boolean;
  canGenerateArtifacts?: boolean;
  canDeleteArtifacts?: boolean;
  canManageSettings?: boolean;
}

@Entity('project_members')
@Index(['projectId'])
@Index(['userId'])
@Index(['role'])
@Index(['status'])
@Index(['projectId', 'userId'], { unique: true })
export class ProjectMemberEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => ProjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({
    type: 'enum',
    enum: ProjectRole,
    default: ProjectRole.MEMBER,
  })
  role!: ProjectRole;

  @Column({
    type: 'enum',
    enum: MemberStatus,
    default: MemberStatus.ACTIVE,
  })
  status!: MemberStatus;

  @Column({ type: 'jsonb', default: {} })
  permissions!: ProjectPermissions;

  @Column({ type: 'uuid', name: 'invited_by_id', nullable: true })
  invitedById?: string;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'invited_by_id' })
  invitedBy?: UserEntity;

  @Column({ type: 'timestamp', name: 'invited_at', nullable: true })
  invitedAt?: Date;

  @Column({ type: 'timestamp', name: 'joined_at', nullable: true })
  joinedAt?: Date;

  @Column({ type: 'timestamp', name: 'removed_at', nullable: true })
  removedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
