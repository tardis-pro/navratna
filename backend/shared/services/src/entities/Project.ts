import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToMany, JoinTable, Index, ManyToOne } from 'typeorm';
import { ProjectStatus, ProjectPriority, ProjectVisibility } from '@uaip/types';

@Entity('projects')
@Index(['ownerId', 'status'])
@Index(['organizationId', 'status'])
@Index(['createdAt'])
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.ACTIVE })
  status: ProjectStatus;

  @Column({ type: 'enum', enum: ProjectPriority, default: ProjectPriority.MEDIUM })
  priority: ProjectPriority;

  @Column({ type: 'enum', enum: ProjectVisibility, default: ProjectVisibility.PRIVATE })
  visibility: ProjectVisibility;

  @Column({ type: 'uuid' })
  ownerId: string;

  @Column({ type: 'uuid', nullable: true })
  organizationId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string;

  @Column({ type: 'json', nullable: true })
  tags: string[];

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @Column({ type: 'json', nullable: true })
  settings: {
    autoAssignAgents?: boolean;
    allowToolExecution?: boolean;
    requireApproval?: boolean;
    maxBudget?: number;
    allowedTools?: string[];
    notifications?: {
      email?: boolean;
      slack?: boolean;
      webhook?: string;
    };
  };

  @Column({ type: 'date', nullable: true })
  startDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  budget: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  spent: number;

  @Column({ type: 'int', default: 0 })
  taskCount: number;

  @Column({ type: 'int', default: 0 })
  completedTaskCount: number;

  @Column({ type: 'int', default: 0 })
  toolUsageCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ProjectTask, task => task.project)
  tasks: ProjectTask[];

  @OneToMany(() => ProjectToolUsage, usage => usage.project)
  toolUsages: ProjectToolUsage[];

  @OneToMany(() => ProjectAgent, agent => agent.project)
  agents: ProjectAgent[];

  @OneToMany(() => ProjectWorkflow, workflow => workflow.project)
  workflows: ProjectWorkflow[];

  // Computed properties
  get completionPercentage(): number {
    return this.taskCount > 0 ? (this.completedTaskCount / this.taskCount) * 100 : 0;
  }

  get budgetUtilization(): number {
    return this.budget > 0 ? (this.spent / this.budget) * 100 : 0;
  }

  get isOverBudget(): boolean {
    return this.spent > this.budget;
  }

  get isOverdue(): boolean {
    return this.endDate ? new Date() > this.endDate && this.status !== ProjectStatus.COMPLETED : false;
  }
}

@Entity('project_tasks')
@Index(['projectId', 'status'])
@Index(['assignedAgentId'])
export class ProjectTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @Column({ type: 'enum', enum: ProjectPriority, default: ProjectPriority.MEDIUM })
  priority: ProjectPriority;

  @Column({ type: 'uuid', nullable: true })
  assignedAgentId: string;

  @Column({ type: 'uuid', nullable: true })
  assignedUserId: string;

  @Column({ type: 'json', nullable: true })
  requirements: any;

  @Column({ type: 'json', nullable: true })
  outputs: any;

  @Column({ type: 'json', nullable: true })
  tools: string[];

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  estimatedCost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  actualCost: number;

  @Column({ type: 'int', default: 0 })
  estimatedDuration: number; // minutes

  @Column({ type: 'int', default: 0 })
  actualDuration: number; // minutes

  @Column({ type: 'date', nullable: true })
  dueDate: Date;

  @Column({ type: 'date', nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, project => project.tasks)
  project: Project;

  @OneToMany(() => TaskExecution, execution => execution.task)
  executions: TaskExecution[];
}

@Entity('project_tool_usage')
@Index(['projectId', 'toolId'])
@Index(['agentId'])
export class ProjectToolUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid', nullable: true })
  taskId: string;

  @Column({ type: 'varchar', length: 100 })
  toolId: string;

  @Column({ type: 'varchar', length: 100 })
  toolName: string;

  @Column({ type: 'uuid', nullable: true })
  agentId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  operation: string;

  @Column({ type: 'boolean', default: true })
  success: boolean;

  @Column({ type: 'int', default: 0 })
  executionTime: number; // milliseconds

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  cost: number;

  @Column({ type: 'json', nullable: true })
  input: any;

  @Column({ type: 'json', nullable: true })
  output: any;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @CreateDateColumn()
  executedAt: Date;

  @ManyToOne(() => Project, project => project.toolUsages)
  project: Project;

  @ManyToOne(() => ProjectTask, task => task, { nullable: true })
  task: ProjectTask;
}

@Entity('project_agents')
@Index(['projectId', 'agentId'])
export class ProjectAgent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  agentId: string;

  @Column({ type: 'varchar', length: 50, default: 'member' })
  role: string; // 'owner', 'admin', 'member', 'viewer'

  @Column({ type: 'json', nullable: true })
  permissions: string[];

  @Column({ type: 'json', nullable: true })
  allowedTools: string[];

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  budgetAllocation: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  budgetUsed: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  addedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, project => project.agents)
  project: Project;
}

@Entity('project_workflows')
@Index(['projectId'])
export class ProjectWorkflow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status: string; // 'draft', 'active', 'paused', 'completed'

  @Column({ type: 'json' })
  definition: {
    steps: Array<{
      id: string;
      name: string;
      type: string;
      config: any;
      dependencies?: string[];
    }>;
    triggers: Array<{
      type: string;
      config: any;
    }>;
  };

  @Column({ type: 'json', nullable: true })
  executionHistory: Array<{
    id: string;
    startTime: Date;
    endTime?: Date;
    status: string;
    results?: any;
  }>;

  @Column({ type: 'boolean', default: false })
  isTemplate: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, project => project.workflows)
  project: Project;
}

@Entity('task_executions')
@Index(['taskId'])
@Index(['agentId'])
export class TaskExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  taskId: string;

  @Column({ type: 'uuid', nullable: true })
  agentId: string;

  @Column({ type: 'varchar', length: 50, default: 'running' })
  status: string; // 'running', 'completed', 'failed', 'cancelled'

  @Column({ type: 'json', nullable: true })
  input: any;

  @Column({ type: 'json', nullable: true })
  output: any;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'json', nullable: true })
  toolsUsed: string[];

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cost: number;

  @Column({ type: 'int', default: 0 })
  duration: number; // milliseconds

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @ManyToOne(() => ProjectTask, task => task.executions)
  task: ProjectTask;
}