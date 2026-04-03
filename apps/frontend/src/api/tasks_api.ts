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

export const tasksApi = {
  async getProjectTasks(projectId: string, filters?: TaskFilters) {
    return edenRequest(`/api/v1/projects/${projectId}/tasks${buildFilterParams(filters)}`, {
      method: 'GET',
    });
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
    return edenRequest(`/api/v1/tasks/${taskId}/assignment-suggestions`, { method: 'GET' });
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
    return edenRequest(`/api/v1/users/${userId}/tasks${buildFilterParams(filters)}`, {
      method: 'GET',
    });
  },

  async getAgentTasks(agentId: string, filters?: TaskFilters) {
    return edenRequest(`/api/v1/agents/${agentId}/tasks${buildFilterParams(filters)}`, {
      method: 'GET',
    });
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
export const getTaskStatusColor = (status: string) => {
  const colors = {
    todo: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-800',
    in_review: 'bg-yellow-100 text-yellow-800',
    blocked: 'bg-red-100 text-red-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
};

export const getTaskPriorityColor = (priority: string) => {
  const colors = {
    low: 'bg-gray-500',
    medium: 'bg-blue-500',
    high: 'bg-orange-500',
    urgent: 'bg-red-500',
  };
  return colors[priority as keyof typeof colors] || 'bg-gray-500';
};

export const getTaskTypeIcon = (type: string) => {
  const icons = {
    feature: '✨',
    bug: '🐛',
    enhancement: '🔧',
    research: '🔍',
    documentation: '📝',
    testing: '🧪',
    deployment: '🚀',
    maintenance: '⚙️',
  };
  return icons[type as keyof typeof icons] || '📋';
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

export const calculateTaskProgress = (task: unknown) => {
  const t = task as { metrics?: { completionPercentage?: number } };
  if (!t?.metrics) return 0;
  return t.metrics.completionPercentage || 0;
};

export const getEstimatedVsActualTime = (task: unknown) => {
  const t = task as { metrics?: { estimatedTime?: number; timeSpent?: number } };
  if (!t?.metrics) return { estimated: 0, actual: 0, variance: 0 };

  const estimated = t.metrics.estimatedTime || 0;
  const actual = t.metrics.timeSpent || 0;
  const variance = estimated > 0 ? ((actual - estimated) / estimated) * 100 : 0;

  return { estimated, actual, variance };
};

export const getTaskAssigneeDisplay = (task: unknown) => {
  const t = task as {
    assigneeType?: string;
    assignedToUser?: { name?: string; email?: string };
    assignedToAgent?: { name?: string };
  };
  if (!t.assigneeType) return 'Unassigned';

  const prefix = t.assigneeType === 'agent' ? '🤖' : '👤';
  const name =
    t.assigneeType === 'human'
      ? t.assignedToUser?.name || t.assignedToUser?.email
      : t.assignedToAgent?.name;

  return name ? `${prefix} ${name}` : 'Unassigned';
};
