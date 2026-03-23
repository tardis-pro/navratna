export const TaskStatus = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
} as const;
export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;
export type TaskPriority = typeof TaskPriority[keyof typeof TaskPriority];

export const TaskType = {
  FEATURE: 'feature',
  BUG: 'bug',
  ENHANCEMENT: 'enhancement',
  DOCUMENTATION: 'documentation',
  RESEARCH: 'research',
  TESTING: 'testing',
} as const;
export type TaskType = typeof TaskType[keyof typeof TaskType];

export const AssigneeType = {
  HUMAN: 'human',
  AGENT: 'agent',
} as const;
export type AssigneeType = typeof AssigneeType[keyof typeof AssigneeType];

export interface TaskSettings {
  timeTracking?: boolean;
  notifyOnStatusChange?: boolean;
  notifyOnComments?: boolean;
  estimatedHours?: number;
}

export interface TaskMetrics {
  timeSpent: number;
  estimatedTime: number;
  completionPercentage: number;
  reopenCount: number;
  commentCount: number;
  attachmentCount: number;
}

export interface TaskActivityEntry {
  id: string;
  timestamp: Date;
  action: string;
  userId: string;
  userName: string;
  details: Record<string, unknown>;
  oldValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
}

export interface TaskEntity {
  id: string;
  title: string;
  description?: string;
  taskNumber: string;
  projectId: string;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  assigneeType?: AssigneeType;
  assignedToUserId?: string;
  assignedToAgentId?: string;
  assignedById?: string;
  assignedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  dueDate?: Date;
  tags?: string[];
  labels?: string[];
  epic?: string;
  sprint?: string;
  settings: TaskSettings;
  metrics: TaskMetrics;
  activityLog: TaskActivityEntry[];
  blockedBy?: string[];
  deletedAt?: Date;
  deletedById?: string;
  lastActivityAt: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  project?: Record<string, unknown>;
  assignedToUser?: Record<string, unknown>;
  assignedToAgent?: Record<string, unknown>;
  creator?: Record<string, unknown>;
  assignedBy?: Record<string, unknown>;
  assigneeDisplayName?: string;
}
