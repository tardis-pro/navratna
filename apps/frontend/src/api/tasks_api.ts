import { gatewayClient, edenWithCSRFRetry, edenRequest } from './eden';
import { STALE_TIMES } from './query_config';
import type {
  TaskFilters,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskAssignmentRequest,
  TaskProgressUpdate,
} from '@uaip/contracts/api';

export type {
  TaskFilters,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskAssignmentRequest,
  TaskProgressUpdate,
};

function buildFilterParams(filters?: TaskFilters): string {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          params.append(key, value.join(','));
        } else if (value instanceof Date) {
          params.append(key, value.toISOString());
        } else {
          params.append(key, String(value));
        }
      }
    });
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function unwrapData<T>(response: unknown): T {
  if (typeof response === 'object' && response !== null && 'data' in response) {
    return (response as { data: T }).data;
  }
  return response as T;
}

export const tasksApi = {
  async getProjectTasks(projectId: string, filters?: TaskFilters) {
    const response = await edenRequest<unknown>(`/api/v1/projects/${projectId}/tasks${buildFilterParams(filters)}`, {
      method: 'GET',
    });
    return unwrapData(response);
  },

  async getTask(taskId: string) {
    return edenWithCSRFRetry(() => gatewayClient.api.v1.tasks[taskId].get());
  },

  async createTask(projectId: string, taskData: CreateTaskRequest) {
    return edenWithCSRFRetry(() => gatewayClient.api.v1.projects[projectId].tasks.post(taskData));
  },

  async updateTask(taskId: string, updates: UpdateTaskRequest) {
    return edenWithCSRFRetry(() => gatewayClient.api.v1.tasks[taskId].put(updates));
  },

  async deleteTask(taskId: string) {
    return edenWithCSRFRetry(() => gatewayClient.api.v1.tasks[taskId].delete());
  },

  async assignTask(taskId: string, assignment: TaskAssignmentRequest) {
    return edenWithCSRFRetry(() => gatewayClient.api.v1.tasks[taskId].assign.post(assignment));
  },

  async getAssignmentSuggestions(taskId: string) {
    const response = await edenRequest<unknown>(`/api/v1/tasks/${taskId}/assignment-suggestions`, { method: 'GET' });
    return unwrapData(response);
  },

  async updateTaskProgress(taskId: string, progress: TaskProgressUpdate) {
    return edenWithCSRFRetry(() => gatewayClient.api.v1.tasks[taskId].progress.put(progress));
  },

  async getTaskStatistics(projectId: string) {
    return edenWithCSRFRetry(
      () => gatewayClient.api.v1.projects[projectId].tasks.statistics.get()
    );
  },

  async getUserTasks(userId: string, filters?: TaskFilters) {
    const response = await edenRequest<unknown>(`/api/v1/users/${userId}/tasks${buildFilterParams(filters)}`, {
      method: 'GET',
    });
    return unwrapData(response);
  },

  async getAgentTasks(agentId: string, filters?: TaskFilters) {
    const response = await edenRequest<unknown>(`/api/v1/agents/${agentId}/tasks${buildFilterParams(filters)}`, {
      method: 'GET',
    });
    return unwrapData(response);
  },
};

// React Query hooks for better state management
export const useTasksQuery = (projectId: string, filters?: TaskFilters) => {
  return {
    queryKey: ['tasks', projectId, filters],
    queryFn: () => tasksApi.getProjectTasks(projectId, filters),
    enabled: !!projectId,
  };
};

export const useTaskQuery = (taskId: string) => {
  return {
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.getTask(taskId),
    enabled: !!taskId,
  };
};

export const useTaskStatisticsQuery = (projectId: string) => {
  return {
    queryKey: ['taskStatistics', projectId],
    queryFn: () => tasksApi.getTaskStatistics(projectId),
    enabled: !!projectId,
    staleTime: STALE_TIMES.SLOW,
  };
};

export const useAssignmentSuggestionsQuery = (taskId: string) => {
  return {
    queryKey: ['assignmentSuggestions', taskId],
    queryFn: () => tasksApi.getAssignmentSuggestions(taskId),
    enabled: !!taskId,
  };
};

// Utility functions
type TaskStatusColorMap = Record<string, string>;
const TASK_STATUS_COLORS: TaskStatusColorMap = {
  todo: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  in_review: 'bg-yellow-100 text-yellow-800',
  blocked: 'bg-red-100 text-red-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-500',
};
export const getTaskStatusColor = (status: string) => {
  return TASK_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800';
};

type TaskPriorityColorMap = Record<string, string>;
const TASK_PRIORITY_COLORS: TaskPriorityColorMap = {
  low: 'bg-gray-500',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
};
export const getTaskPriorityColor = (priority: string) => {
  return TASK_PRIORITY_COLORS[priority] ?? 'bg-gray-500';
};

type TaskTypeIconMap = Record<string, string>;
const TASK_TYPE_ICONS: TaskTypeIconMap = {
  feature: '✨',
  bug: '🐛',
  enhancement: '🔧',
  research: '🔍',
  documentation: '📝',
  testing: '🧪',
  deployment: '🚀',
  maintenance: '⚙️',
};
export const getTaskTypeIcon = (type: string) => {
  return TASK_TYPE_ICONS[type] ?? '📋';
};

export const formatTaskNumber = (taskNumber: string) => {
  return taskNumber.toUpperCase();
};

export const isTaskOverdue = (dueDate?: string, status?: string) => {
  if (!dueDate || status === 'completed' || status === 'cancelled') {
    return false;
  }
  return new Date() > new Date(dueDate);
};

export const getTimeUntilDue = (dueDate?: string) => {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `${Math.abs(diffDays)} days overdue`;
  } else if (diffDays === 0) {
    return 'Due today';
  } else if (diffDays === 1) {
    return 'Due tomorrow';
  } else {
    return `Due in ${diffDays} days`;
  }
};

type TaskWithMetrics = { metrics?: { completionPercentage?: number; estimatedTime?: number; timeSpent?: number } };
type TaskWithAssignee = { assigneeType?: string; assignedToUser?: { name?: string; email?: string }; assignedToAgent?: { name?: string } };

export const calculateTaskProgress = (task: unknown) => {
  const taskAny: any = task; // oxlint-disable-line @typescript-eslint/no-explicit-any -- task is unknown; TaskWithMetrics is the expected shape
  const t: TaskWithMetrics = taskAny;
  if (!t?.metrics) return 0;
  return t.metrics.completionPercentage || 0;
};

export const getEstimatedVsActualTime = (task: unknown) => {
  const taskAny: any = task; // oxlint-disable-line @typescript-eslint/no-explicit-any -- task is unknown; TaskWithMetrics is the expected shape
  const t: TaskWithMetrics = taskAny;
  if (!t?.metrics) return { estimated: 0, actual: 0, variance: 0 };

  const estimated = t.metrics.estimatedTime || 0;
  const actual = t.metrics.timeSpent || 0;
  const variance = estimated > 0 ? ((actual - estimated) / estimated) * 100 : 0;

  return { estimated, actual, variance };
};

export const getTaskAssigneeDisplay = (task: unknown) => {
  const taskAny: any = task; // oxlint-disable-line @typescript-eslint/no-explicit-any -- task is unknown; TaskWithAssignee is the expected shape
  const t: TaskWithAssignee = taskAny;
  if (!t.assigneeType) return 'Unassigned';

  const prefix = t.assigneeType === 'agent' ? '🤖' : '👤';
  const name =
    t.assigneeType === 'human'
      ? t.assignedToUser?.name || t.assignedToUser?.email
      : t.assignedToAgent?.name;

  return name ? `${prefix} ${name}` : 'Unassigned';
};
