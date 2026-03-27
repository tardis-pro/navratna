import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TaskBoard, Task } from './TaskBoard';
import { TaskAssignment } from './TaskAssignment';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { DESIGN_TOKENS } from './TaskDesignTokens';
import { Button } from './TaskButton';
import { TaskCreateForm } from './TaskCreateForm';

import {
  tasksApi,
  useTasksQuery,
  useTaskStatisticsQuery,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskAssignmentRequest,
  TaskFilters,
} from '../api/tasks_api';
import { projectsAPI } from '../api/projects_api';
import { agentsAPI } from '../api/agents_api';
import {
  BarChart3,
  Users,
  Bot,
  Clock,
  CheckCircle,
  AlertTriangle,
  Activity,
  Download,
  Settings,
} from 'lucide-react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

interface ProjectTaskManagerProps {
  projectId: string;
}

type TaskStatistics = {
  total?: number;
  byStatus?: Record<string, number>;
  byAssigneeType?: Record<string, number>;
};

function getApiErrorMessage(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    return err.response?.data?.error ?? err.message ?? 'Unknown error occurred';
  }
  return 'Unknown error occurred';
}

function AssignmentStatCard({
  icon,
  label,
  count,
  total,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  total: number;
  valueColor: string;
}) {
  return (
    <Card
      className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}
    >
      <CardHeader className="pb-3">
        <CardTitle
          className={`text-sm font-medium flex items-center gap-2 ${DESIGN_TOKENS.colors.text}`}
        >
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueColor}`}>{count}</div>
        <div className={`text-xs ${DESIGN_TOKENS.colors.textMuted}`}>
          {total > 0 ? Math.round((count / total) * 100) : 0}% of total
        </div>
      </CardContent>
    </Card>
  );
}

export const ProjectTaskManager: React.FC<ProjectTaskManagerProps> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const [selectedFilters, _setSelectedFilters] = useState<TaskFilters>({});
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedTaskForAssignment, setSelectedTaskForAssignment] = useState<string | null>(null);
  const [showQuickCreateTask, setShowQuickCreateTask] = useState(false);

  // Queries
  const {
    data: _tasksRaw,
    isLoading: tasksLoading,
    error: tasksError,
  } = useQuery({
    ...useTasksQuery(projectId, selectedFilters),
  });
  const tasksData = _tasksRaw as Task[] | undefined;

  const { data: _statsRaw, isLoading: _statsLoading } = useQuery({
    ...useTaskStatisticsQuery(projectId),
  });
  const statisticsData = _statsRaw as TaskStatistics | undefined;

  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsAPI.get(projectId),
  });

  // Mutations
  const createTaskMutation = useMutation({
    mutationFn: (taskData: CreateTaskRequest) => tasksApi.createTask(projectId, taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['taskStatistics', projectId] });
      toast.success('Task created successfully');
    },
    onError: (error: unknown) => {
      toast.error('Failed to create task: ' + getApiErrorMessage(error));
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: UpdateTaskRequest }) =>
      tasksApi.updateTask(taskId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['taskStatistics', projectId] });
      toast.success('Task updated successfully');
    },
    onError: (error: unknown) => {
      toast.error('Failed to update task: ' + getApiErrorMessage(error));
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => tasksApi.deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['taskStatistics', projectId] });
      toast.success('Task deleted successfully');
    },
    onError: (error: unknown) => {
      toast.error('Failed to delete task: ' + getApiErrorMessage(error));
    },
  });

  const assignTaskMutation = useMutation({
    mutationFn: ({ taskId, assignment }: { taskId: string; assignment: TaskAssignmentRequest }) =>
      tasksApi.assignTask(taskId, assignment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      setAssignmentModalOpen(false);
      setSelectedTaskForAssignment(null);
      toast.success('Task assigned successfully');
    },
    onError: (error: unknown) => {
      toast.error('Failed to assign task: ' + getApiErrorMessage(error));
    },
  });

  // Event handlers
  const handleTaskCreate = async (taskData: unknown) => {
    await createTaskMutation.mutateAsync(taskData as CreateTaskRequest);
  };

  const handleTaskUpdate = async (taskId: string, updates: unknown) => {
    await updateTaskMutation.mutateAsync({ taskId, updates: updates as UpdateTaskRequest });
  };

  const handleTaskDelete = async (taskId: string) => {
    await deleteTaskMutation.mutateAsync(taskId);
  };

  const handleTaskAssign = async (taskId: string, assignment: TaskAssignmentRequest) => {
    await assignTaskMutation.mutateAsync({ taskId, assignment });
  };

  const handleGetAssignmentSuggestions = async (taskId: string) => {
    const response = await tasksApi.getAssignmentSuggestions(taskId);
    return response || [];
  };

  const handleGetProjectMembers = async (_membersProjectId: string) => {
    const response = await projectsAPI.getMembers(projectId);
    return response || [];
  };

  const handleGetAvailableAgents = async () => {
    const response = await agentsAPI.list();
    return response || [];
  };

  const _openAssignmentModal = (taskId: string) => {
    setSelectedTaskForAssignment(taskId);
    setAssignmentModalOpen(true);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+T for quick task creation
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setShowQuickCreateTask(true);
      }
      // Escape to close modal
      if (e.key === 'Escape') {
        setShowQuickCreateTask(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Statistics calculations
  const stats = statisticsData ?? {};
  const totalTasks = stats.total ?? 0;
  const completedTasks = stats.byStatus?.completed ?? 0;
  const inProgressTasks = stats.byStatus?.in_progress ?? 0;
  const blockedTasks = stats.byStatus?.blocked ?? 0;
  const humanAssigned = stats.byAssigneeType?.human ?? 0;
  const agentAssigned = stats.byAssigneeType?.agent ?? 0;
  const unassigned = totalTasks - humanAssigned - agentAssigned;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const StatCard: React.FC<{
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactElement<{ className?: string }>;
    color?: string;
  }> = ({ title, value, subtitle, icon, color = DESIGN_TOKENS.colors.textSecondary }) => (
    <Card
      className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p
              className={`text-xs sm:text-sm font-medium ${DESIGN_TOKENS.colors.textMuted} truncate`}
            >
              {title}
            </p>
            <p className={`text-lg sm:text-xl lg:text-2xl font-bold ${color}`}>{value}</p>
            {subtitle && (
              <p className={`text-xs ${DESIGN_TOKENS.colors.textMuted} hidden sm:block`}>
                {subtitle}
              </p>
            )}
          </div>
          <div className={`${color} opacity-70 flex-shrink-0 ml-2`}>
            {React.cloneElement(icon, {
              className: 'w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8',
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const QuickCreateTask: React.FC = () => {
    if (!showQuickCreateTask) return null;

    return (
      <>
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-2 sm:p-4"
          onClick={() => setShowQuickCreateTask(false)}
        />

        <div
          className={`
          fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xs sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl mx-2 sm:mx-4 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto
          ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.radius.lg} 
          ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.shadow} z-[201]
        `}
        >
          <div
            className={`p-3 sm:p-4 lg:${DESIGN_TOKENS.padding.lg} ${DESIGN_TOKENS.colors.border} border-b`}
          >
            <div className="flex items-center justify-between">
              <h2
                className={`text-lg sm:text-xl lg:text-2xl font-bold ${DESIGN_TOKENS.colors.text} flex items-center gap-2`}
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                <span className="hidden sm:inline">Quick Create Task</span>
                <span className="sm:hidden">New Task</span>
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowQuickCreateTask(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <TaskCreateForm
            projectId={projectId}
            onSubmit={async (data) => {
              try {
                await handleTaskCreate(data);
              } catch (error) {
                console.error('Failed to create task:', error);
                throw error;
              }
            }}
            onClose={() => setShowQuickCreateTask(false)}
            formClassName={`p-3 sm:p-4 lg:${DESIGN_TOKENS.padding.lg} space-y-3 sm:space-y-4`}
            fieldClassName={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.colors.text}`}
            selectContentClassName={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}
            gridClassName="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-4 gap-3">
              <div className={`text-xs ${DESIGN_TOKENS.colors.textMuted} hidden sm:block`}>
                Press <kbd className="bg-slate-700 px-1 rounded">Alt+T</kbd> to quickly create tasks
              </div>
              <div className={`flex ${DESIGN_TOKENS.spacing.xs} w-full sm:w-auto justify-end`}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowQuickCreateTask(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Create Task
                </Button>
              </div>
            </div>
          </TaskCreateForm>
        </div>
      </>
    );
  };

  const TaskOverview: React.FC = () => (
    <div className="space-y-4 sm:space-y-6">
      {/* Statistics Grid - More responsive */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${DESIGN_TOKENS.spacing.sm} sm:${DESIGN_TOKENS.spacing.md}`}
      >
        <StatCard
          title="Total Tasks"
          value={totalTasks}
          icon={<Activity className="w-8 h-8" />}
          color="text-blue-400"
        />
        <StatCard
          title="Completion Rate"
          value={`${completionRate}%`}
          subtitle={`${completedTasks} of ${totalTasks} completed`}
          icon={<CheckCircle className="w-8 h-8" />}
          color="text-green-400"
        />
        <StatCard
          title="In Progress"
          value={inProgressTasks}
          icon={<Clock className="w-8 h-8" />}
          color="text-yellow-400"
        />
        <StatCard
          title="Blocked"
          value={blockedTasks}
          icon={<AlertTriangle className="w-8 h-8" />}
          color="text-red-400"
        />
      </div>

      {/* Assignment Overview - More responsive */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-3 ${DESIGN_TOKENS.spacing.sm} sm:${DESIGN_TOKENS.spacing.md}`}
      >
        <AssignmentStatCard
          icon={<Users className="w-4 h-4" />}
          label="Human Assigned"
          count={humanAssigned}
          total={totalTasks}
          valueColor="text-blue-400"
        />
        <AssignmentStatCard
          icon={<Bot className="w-4 h-4" />}
          label="Agent Assigned"
          count={agentAssigned}
          total={totalTasks}
          valueColor="text-purple-400"
        />
        <AssignmentStatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Unassigned"
          count={unassigned}
          total={totalTasks}
          valueColor="text-orange-400"
        />
      </div>

      {/* Status Breakdown */}
      <Card
        className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}
      >
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${DESIGN_TOKENS.colors.text}`}>
            <BarChart3 className="w-5 h-5" />
            Task Status Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(stats.byStatus ?? {}).map(([status, count]) => {
              const percentage =
                totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
              const statusColors: Record<string, string> = {
                todo: 'bg-slate-400',
                in_progress: 'bg-blue-500',
                in_review: 'bg-yellow-500',
                blocked: 'bg-red-500',
                completed: 'bg-green-500',
                cancelled: 'bg-slate-300',
              };

              return (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${statusColors[status] ?? 'bg-slate-400'}`}
                    />
                    <span
                      className={`text-sm font-medium capitalize ${DESIGN_TOKENS.colors.textSecondary}`}
                    >
                      {status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${DESIGN_TOKENS.colors.textMuted}`}>{count}</span>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.textSecondary}`}
                    >
                      {percentage}%
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (tasksError) {
    return (
      <div className={`${DESIGN_TOKENS.padding.lg} text-center`}>
        <div className="text-red-400 mb-2">Error loading tasks</div>
        <div className={`text-sm ${DESIGN_TOKENS.colors.textMuted}`}>
          {tasksError instanceof Error ? tasksError.message : 'Unknown error occurred'}
        </div>
      </div>
    );
  }

  const selectedTask = selectedTaskForAssignment
    ? tasksData?.find((task) => task.id === selectedTaskForAssignment)
    : null;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Header - All devices responsive */}
      <div
        className={`${DESIGN_TOKENS.colors.border} border-b ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} flex-shrink-0`}
      >
        <div className="px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-4 lg:px-8 lg:py-5 xl:px-10 xl:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <h1
                className={`text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold ${DESIGN_TOKENS.colors.text} truncate`}
              >
                {(projectData as { name?: string } | undefined)?.name ?? 'Project'} - Tasks
              </h1>
              {/* Mobile compact description */}
              <p className={`${DESIGN_TOKENS.colors.textMuted} text-xs mt-1 sm:hidden`}>
                Collaborative task management
              </p>
              {/* Tablet+ full description */}
              <div className={`mt-2 hidden sm:block`}>
                <p
                  className={`${DESIGN_TOKENS.colors.textMuted} text-xs sm:text-sm lg:text-base mb-2`}
                >
                  Collaborative task management with intelligent agent assistance
                </p>
                <div className="flex items-center gap-3 md:gap-4 lg:gap-6 text-xs lg:text-sm flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-blue-400"></div>
                    <span className={`${DESIGN_TOKENS.colors.textMuted}`}>Human Tasks</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-purple-400"></div>
                    <span className={`${DESIGN_TOKENS.colors.textMuted}`}>Agent Tasks</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-orange-400"></div>
                    <span className={`${DESIGN_TOKENS.colors.textMuted}`}>Unassigned</span>
                  </div>
                </div>
              </div>
            </div>
            <div className={`flex items-center gap-2 flex-shrink-0 overflow-x-auto pb-1 sm:pb-0`}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowQuickCreateTask(true)}
                className="sm:hidden whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowQuickCreateTask(true)}
                className="hidden sm:flex whitespace-nowrap"
                title="Quick Create Task (Alt+T)"
              >
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden md:inline">New Task</span>
                <span className="md:hidden">New</span>
              </Button>
              <Button variant="outline" size="sm" className="hidden md:flex whitespace-nowrap">
                <Download className="w-4 h-4 mr-2" />
                <span className="hidden lg:inline">Export</span>
              </Button>
              <Button variant="outline" size="sm" className="hidden lg:flex whitespace-nowrap">
                <Settings className="w-4 h-4 mr-2" />
                <span className="hidden xl:inline">Settings</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Proper overflow handling */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="board" className="h-full flex flex-col">
          <div className="flex-shrink-0 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 pt-3 sm:pt-4">
            <TabsList
              className={`w-fit ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}
            >
              <TabsTrigger
                value="board"
                className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm lg:text-base px-3 sm:px-4 lg:px-6 py-2 ${DESIGN_TOKENS.colors.textSecondary} data-[state=active]:${DESIGN_TOKENS.colors.text}`}
              >
                <Activity className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                <span className="hidden sm:inline">Task Board</span>
                <span className="sm:hidden">Board</span>
              </TabsTrigger>
              <TabsTrigger
                value="overview"
                className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm lg:text-base px-3 sm:px-4 lg:px-6 py-2 ${DESIGN_TOKENS.colors.textSecondary} data-[state=active]:${DESIGN_TOKENS.colors.text}`}
              >
                <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                <span className="hidden sm:inline">Overview</span>
                <span className="sm:hidden">Stats</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="board"
            className="flex-1 overflow-hidden px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-3 sm:py-4"
          >
            <div className="h-full overflow-hidden">
              <TaskBoard
                projectId={projectId}
                tasks={tasksData ?? []}
                onTaskCreate={handleTaskCreate}
                onTaskUpdate={handleTaskUpdate}
                onTaskDelete={handleTaskDelete}
                onTaskAssign={handleTaskAssign}
                isLoading={tasksLoading}
              />
            </div>
          </TabsContent>

          <TabsContent
            value="overview"
            className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-3 sm:py-4"
          >
            <TaskOverview />
          </TabsContent>
        </Tabs>
      </div>

      {/* Quick Create Task Modal */}
      <QuickCreateTask />

      {/* Task Assignment Modal */}
      {selectedTaskForAssignment && selectedTask && (
        <TaskAssignment
          taskId={selectedTaskForAssignment}
          taskTitle={selectedTask.title}
          taskType={selectedTask.type}
          currentAssignee={
            selectedTask.assigneeType
              ? {
                  type: selectedTask.assigneeType,
                  id:
                    selectedTask.assigneeType === 'human'
                      ? (selectedTask.assignedToUser?.id ?? '')
                      : (selectedTask.assignedToAgent?.id ?? ''),
                  name:
                    selectedTask.assigneeType === 'human'
                      ? (selectedTask.assignedToUser?.name ?? '')
                      : (selectedTask.assignedToAgent?.name ?? ''),
                }
              : undefined
          }
          onAssign={handleTaskAssign}
          onGetSuggestions={handleGetAssignmentSuggestions as React.ComponentProps<typeof TaskAssignment>['onGetSuggestions']}
          onGetProjectMembers={handleGetProjectMembers}
          onGetAvailableAgents={handleGetAvailableAgents}
          projectId={projectId}
          isOpen={assignmentModalOpen}
          onOpenChange={setAssignmentModalOpen}
        />
      )}
    </div>
  );
};
