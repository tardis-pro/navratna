import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { ProjectEntity } from './project.entity.js';
import { UserEntity } from './user.entity.js';
import { Agent } from './agent.entity.js';

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  IN_REVIEW = 'in_review',
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TaskType {
  FEATURE = 'feature',
  BUG = 'bug',
  ENHANCEMENT = 'enhancement',
  RESEARCH = 'research',
  DOCUMENTATION = 'documentation',
  TESTING = 'testing',
  DEPLOYMENT = 'deployment',
  MAINTENANCE = 'maintenance',
}

export enum AssigneeType {
  HUMAN = 'human',
  AGENT = 'agent',
}

export interface TaskSettings {
  allowReassignment?: boolean;
  requireApproval?: boolean;
  autoAssignToAgent?: boolean;
  estimatedHours?: number;
  timeTracking?: boolean;
  notifyOnStatusChange?: boolean;
  notifyOnComments?: boolean;
}

export interface TaskMetrics {
  timeSpent?: number; // in minutes
  estimatedTime?: number; // in minutes
  actualTime?: number; // in minutes
  completionPercentage?: number;
  reopenCount?: number;
  commentCount?: number;
  attachmentCount?: number;
}

@Entity('tasks')
@Index(['projectId'])
@Index(['status'])
@Index(['priority'])
@Index(['assigneeType'])
@Index(['assignedToUserId'])
@Index(['assignedToAgentId'])
@Index(['createdBy'])
@Index(['dueDate'])
@Index(['createdAt'])
@Index(['status', 'priority'])
@Index(['projectId', 'status'])
@Index(['assigneeType', 'assignedToUserId'])
@Index(['assigneeType', 'assignedToAgentId'])
export class TaskEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => ProjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.TODO,
  })
  status!: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  priority!: TaskPriority;

  @Column({
    type: 'enum',
    enum: TaskType,
    default: TaskType.FEATURE,
  })
  type!: TaskType;

  // Assignment fields - either human or agent
  @Column({
    type: 'enum',
    enum: AssigneeType,
    name: 'assignee_type',
    nullable: true,
  })
  assigneeType?: AssigneeType;

  @Column({ type: 'uuid', name: 'assigned_to_user_id', nullable: true })
  assignedToUserId?: string;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'assigned_to_user_id' })
  assignedToUser?: UserEntity;

  @Column({ type: 'uuid', name: 'assigned_to_agent_id', nullable: true })
  assignedToAgentId?: string;

  @ManyToOne(() => Agent, { nullable: true })
  @JoinColumn({ name: 'assigned_to_agent_id' })
  assignedToAgent?: Agent;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'created_by' })
  creator!: UserEntity;

  @Column({ type: 'uuid', name: 'assigned_by_id', nullable: true })
  assignedById?: string;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'assigned_by_id' })
  assignedBy?: UserEntity;

  // Timing fields
  @Column({ type: 'timestamp', name: 'due_date', nullable: true })
  dueDate?: Date;

  @Column({ type: 'timestamp', name: 'started_at', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completedAt?: Date;

  @Column({ type: 'timestamp', name: 'assigned_at', nullable: true })
  assignedAt?: Date;

  @Column({ type: 'timestamp', name: 'last_activity_at', nullable: true })
  lastActivityAt?: Date;

  // Task organization
  @Column({ type: 'varchar', length: 20, nullable: true })
  taskNumber?: string; // e.g., "PROJ-123"

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'json', nullable: true })
  labels?: string[];

  @Column({ type: 'varchar', length: 50, nullable: true })
  epic?: string; // Related epic or feature group

  @Column({ type: 'varchar', length: 50, nullable: true })
  sprint?: string; // Sprint identifier

  // Dependencies
  @Column({ type: 'json', nullable: true })
  dependsOn?: string[]; // Array of task IDs this task depends on

  @Column({ type: 'json', nullable: true })
  blockedBy?: string[]; // Array of task IDs that block this task

  // Configuration and metrics
  @Column({ type: 'jsonb', default: {} })
  settings!: TaskSettings;

  @Column({ type: 'jsonb', default: {} })
  metrics!: TaskMetrics;

  // Comments and attachments
  @Column({ type: 'integer', name: 'comment_count', default: 0 })
  commentCount!: number;

  @Column({ type: 'integer', name: 'attachment_count', default: 0 })
  attachmentCount!: number;

  // Activity tracking
  @Column({ type: 'jsonb', default: '[]' })
  activityLog!: any[];

  // Custom fields for flexibility
  @Column({ type: 'jsonb', nullable: true })
  customFields?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Soft delete support
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt?: Date;

  @Column({ type: 'uuid', name: 'deleted_by_id', nullable: true })
  deletedById?: string;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'deleted_by_id' })
  deletedBy?: UserEntity;

  // Validation constraints
  constructor() {
    super();
    // Ensure only one assignee type is set
    if (this.assigneeType === AssigneeType.HUMAN && this.assignedToAgentId) {
      throw new Error('Cannot assign to both human and agent');
    }
    if (this.assigneeType === AssigneeType.AGENT && this.assignedToUserId) {
      throw new Error('Cannot assign to both agent and human');
    }
  }

  // Helper methods
  get isAssigned(): boolean {
    return !!(this.assignedToUserId || this.assignedToAgentId);
  }

  get isOverdue(): boolean {
    if (!this.dueDate) return false;
    return new Date() > this.dueDate && this.status !== TaskStatus.COMPLETED;
  }

  get isBlocked(): boolean {
    return this.status === TaskStatus.BLOCKED || (this.blockedBy && this.blockedBy.length > 0);
  }

  get assigneeName(): string {
    if (this.assigneeType === AssigneeType.HUMAN && this.assignedToUser) {
      return this.assignedToUser.name || this.assignedToUser.email;
    }
    if (this.assigneeType === AssigneeType.AGENT && this.assignedToAgent) {
      return this.assignedToAgent.name;
    }
    return 'Unassigned';
  }

  get assigneeDisplayName(): string {
    const name = this.assigneeName;
    if (name === 'Unassigned') return name;

    const typePrefix = this.assigneeType === AssigneeType.AGENT ? '🤖' : '👤';
    return `${typePrefix} ${name}`;
  }

  get estimatedHours(): number {
    return this.settings.estimatedHours || 0;
  }

  get actualHours(): number {
    return this.metrics.actualTime ? this.metrics.actualTime / 60 : 0;
  }

  get completionPercentage(): number {
    return this.metrics.completionPercentage || 0;
  }
}
