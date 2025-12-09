import { APIClient } from './client';

// Types
export interface TaskFilters {
  status?: string | string[];
  priority?: string | string[];
  type?: string | string[];
  assigneeType?: 'human' | 'agent';
  assignedToUserId?: string;
  assignedToAgentId?: string;
  createdBy?: string;
  epic?: string;
  sprint?: string;
  tags?: string[];
  labels?: string[];
  dueDateBefore?: Date;
  dueDateAfter?: Date;
  isOverdue?: boolean;
  isBlocked?: boolean;
  search?: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  projectId: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  type?:
    | 'feature'
    | 'bug'
    | 'enhancement'
    | 'research'
    | 'documentation'
    | 'testing'
    | 'deployment'
    | 'maintenance';
  assigneeType?: 'human' | 'agent';
  assignedToUserId?: string;
  assignedToAgentId?: string;
  dueDate?: string;
  tags?: string[];
  labels?: string[];
  epic?: string;
  sprint?: string;
  estimatedHours?: number;
  customFields?: Record<string, any>;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  type?:
    | 'feature'
    | 'bug'
    | 'enhancement'
    | 'research'
    | 'documentation'
    | 'testing'
    | 'deployment'
    | 'maintenance';
  assigneeType?: 'human' | 'agent';
  assignedToUserId?: string;
  assignedToAgentId?: string;
  dueDate?: string;
  tags?: string[];
  labels?: string[];
  epic?: string;
  sprint?: string;
  customFields?: Record<string, any>;
}

export interface TaskAssignmentRequest {
  assigneeType: 'human' | 'agent';
  assignedToUserId?: string;
  assignedToAgentId?: string;
  reason?: string;
}

export interface TaskProgressUpdate {
  completionPercentage: number;
  timeSpent?: number;
}

// API Functions
export const tasksApi = {
  // Get tasks for a project
  async getProjectTasks(projectId: string, filters?: TaskFilters) {
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

    const queryString = params.toString();
    const url = `/projects/${projectId}/tasks${queryString ? `?${queryString}` : ''}`;

    const response = await APIClient.get(url);
    return response;
  },

  // Get a specific task
  async getTask(taskId: string) {
    const response = await APIClient.get(`/tasks/${taskId}`);
    return response;
  },

  // Create a new task
  async createTask(projectId: string, taskData: CreateTaskRequest) {
    const response = await APIClient.post(`/projects/${projectId}/tasks`, taskData);
    return response;
  },

  // Update a task
  async updateTask(taskId: string, updates: UpdateTaskRequest) {
    const response = await APIClient.put(`/tasks/${taskId}`, updates);
    return response;
  },

  // Delete a task
  async deleteTask(taskId: string) {
    const response = await APIClient.delete(`/tasks/${taskId}`);
    return response;
  },

  // Assign a task
  async assignTask(taskId: string, assignment: TaskAssignmentRequest) {
    const response = await APIClient.post(`/tasks/${taskId}/assign`, assignment);
    return response;
  },

  // Get assignment suggestions
  async getAssignmentSuggestions(taskId: string) {
    const response = await APIClient.get(`/tasks/${taskId}/assignment-suggestions`);
    return response;
  },

  // Update task progress
  async updateTaskProgress(taskId: string, progress: TaskProgressUpdate) {
    const response = await APIClient.put(`/tasks/${taskId}/progress`, progress);
    return response;
  },

  // Get task statistics for a project
  async getTaskStatistics(projectId: string) {
    const response = await APIClient.get(`/projects/${projectId}/tasks/statistics`);
    return response;
  },

  // Get tasks assigned to a user
  async getUserTasks(userId: string, filters?: TaskFilters) {
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

    const queryString = params.toString();
    const url = `/users/${userId}/tasks${queryString ? `?${queryString}` : ''}`;

    const response = await APIClient.get(url);
    return response;
  },

  // Get tasks assigned to an agent
  async getAgentTasks(agentId: string, filters?: TaskFilters) {
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

    const queryString = params.toString();
    const url = `/agents/${agentId}/tasks${queryString ? `?${queryString}` : ''}`;

    const response = await APIClient.get(url);
    return response;
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

export const calculateTaskProgress = (task: any) => {
  if (!task.metrics) return 0;
  return task.metrics.completionPercentage || 0;
};

export const getEstimatedVsActualTime = (task: any) => {
  if (!task.metrics) return { estimated: 0, actual: 0, variance: 0 };

  const estimated = task.metrics.estimatedTime || 0;
  const actual = task.metrics.timeSpent || 0;
  const variance = estimated > 0 ? ((actual - estimated) / estimated) * 100 : 0;

  return { estimated, actual, variance };
};

export const getTaskAssigneeDisplay = (task: any) => {
  if (!task.assigneeType) return 'Unassigned';

  const prefix = task.assigneeType === 'agent' ? '🤖' : '👤';
  const name =
    task.assigneeType === 'human'
      ? task.assignedToUser?.name || task.assignedToUser?.email
      : task.assignedToAgent?.name;

  return name ? `${prefix} ${name}` : 'Unassigned';
};
