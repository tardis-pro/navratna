import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TaskBoard } from './TaskBoard';
import { TaskAssignment } from './TaskAssignment';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  tasksApi, 
  useTasksQuery, 
  useTaskStatisticsQuery,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskAssignmentRequest,
  TaskFilters
} from '@/api/tasks.api';
import { projectsAPI } from '@/api/projects.api';
import { agentsAPI } from '@/api/agents.api';
import { 
  BarChart3, 
  Users, 
  Bot, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  TrendingUp,
  Activity,
  Calendar,
  Filter,
  Download,
  Settings
} from 'lucide-react';
import { toast } from 'sonner';

interface ProjectTaskManagerProps {
  projectId: string;
}

export const ProjectTaskManager: React.FC<ProjectTaskManagerProps> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const [selectedFilters, setSelectedFilters] = useState<TaskFilters>({});
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedTaskForAssignment, setSelectedTaskForAssignment] = useState<string | null>(null);

  // Queries
  const { data: tasksData, isLoading: tasksLoading, error: tasksError } = useQuery(
    useTasksQuery(projectId, selectedFilters)
  );

  const { data: statisticsData, isLoading: statsLoading } = useQuery(
    useTaskStatisticsQuery(projectId)
  );

  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsAPI.get(projectId)
  });

  // Mutations
  const createTaskMutation = useMutation({
    mutationFn: (taskData: CreateTaskRequest) => tasksApi.createTask(projectId, taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['taskStatistics', projectId] });
      toast.success('Task created successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to create task: ' + (error.response?.data?.error || error.message));
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: UpdateTaskRequest }) =>
      tasksApi.updateTask(taskId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['taskStatistics', projectId] });
      toast.success('Task updated successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to update task: ' + (error.response?.data?.error || error.message));
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => tasksApi.deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['taskStatistics', projectId] });
      toast.success('Task deleted successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to delete task: ' + (error.response?.data?.error || error.message));
    }
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
    onError: (error: any) => {
      toast.error('Failed to assign task: ' + (error.response?.data?.error || error.message));
    }
  });

  // Event handlers
  const handleTaskCreate = async (taskData: any) => {
    await createTaskMutation.mutateAsync(taskData);
  };

  const handleTaskUpdate = async (taskId: string, updates: any) => {
    await updateTaskMutation.mutateAsync({ taskId, updates });
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

  const handleGetProjectMembers = async (projectId: string) => {
    const response = await projectsAPI.getMembers(projectId);
    return response || [];
  };

  const handleGetAvailableAgents = async () => {
    const response = await agentsAPI.list();
    return response || [];
  };

  const openAssignmentModal = (taskId: string) => {
    setSelectedTaskForAssignment(taskId);
    setAssignmentModalOpen(true);
  };

  // Statistics calculations
  const stats = statisticsData || {};
  const totalTasks = stats.total || 0;
  const completedTasks = stats.byStatus?.completed || 0;
  const inProgressTasks = stats.byStatus?.in_progress || 0;
  const blockedTasks = stats.byStatus?.blocked || 0;
  const humanAssigned = stats.byAssigneeType?.human || 0;
  const agentAssigned = stats.byAssigneeType?.agent || 0;
  const unassigned = totalTasks - humanAssigned - agentAssigned;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const StatCard: React.FC<{ 
    title: string; 
    value: string | number; 
    subtitle?: string; 
    icon: React.ReactNode; 
    color?: string;
  }> = ({ title, value, subtitle, icon, color = "text-gray-600" }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
          <div className={`${color} opacity-70`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );

  const TaskOverview: React.FC = () => (
    <div className="space-y-6">
      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Tasks"
          value={totalTasks}
          icon={<Activity className="w-8 h-8" />}
          color="text-blue-600"
        />
        <StatCard
          title="Completion Rate"
          value={`${completionRate}%`}
          subtitle={`${completedTasks} of ${totalTasks} completed`}
          icon={<CheckCircle className="w-8 h-8" />}
          color="text-green-600"
        />
        <StatCard
          title="In Progress"
          value={inProgressTasks}
          icon={<Clock className="w-8 h-8" />}
          color="text-yellow-600"
        />
        <StatCard
          title="Blocked"
          value={blockedTasks}
          icon={<AlertTriangle className="w-8 h-8" />}
          color="text-red-600"
        />
      </div>

      {/* Assignment Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Human Assigned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{humanAssigned}</div>
            <div className="text-xs text-gray-500">
              {totalTasks > 0 ? Math.round((humanAssigned / totalTasks) * 100) : 0}% of total
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Agent Assigned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{agentAssigned}</div>
            <div className="text-xs text-gray-500">
              {totalTasks > 0 ? Math.round((agentAssigned / totalTasks) * 100) : 0}% of total
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Unassigned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{unassigned}</div>
            <div className="text-xs text-gray-500">
              {totalTasks > 0 ? Math.round((unassigned / totalTasks) * 100) : 0}% of total
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Task Status Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(stats.byStatus || {}).map(([status, count]) => {
              const percentage = totalTasks > 0 ? Math.round((count as number / totalTasks) * 100) : 0;
              const statusColors = {
                todo: 'bg-gray-400',
                in_progress: 'bg-blue-500',
                in_review: 'bg-yellow-500',
                blocked: 'bg-red-500',
                completed: 'bg-green-500',
                cancelled: 'bg-gray-300'
              };
              
              return (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${statusColors[status as keyof typeof statusColors]}`} />
                    <span className="text-sm font-medium capitalize">{status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">{count}</span>
                    <Badge variant="secondary" className="text-xs">
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
      <div className="p-6 text-center">
        <div className="text-red-600 mb-2">Error loading tasks</div>
        <div className="text-sm text-gray-500">
          {tasksError instanceof Error ? tasksError.message : 'Unknown error occurred'}
        </div>
      </div>
    );
  }

  const selectedTask = selectedTaskForAssignment ? 
    tasksData?.find((task: any) => task.id === selectedTaskForAssignment) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {projectData?.name || 'Project'} - Task Management
            </h1>
            <p className="text-gray-600 mt-1">
              Manage and track tasks with human and agent assignments
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="board" className="h-full flex flex-col">
          <TabsList className="mx-6 mt-4 w-fit">
            <TabsTrigger value="board" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Task Board
            </TabsTrigger>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Overview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="flex-1 mx-6 mb-6 mt-4">
            <TaskBoard
              projectId={projectId}
              tasks={tasksData || []}
              onTaskCreate={handleTaskCreate}
              onTaskUpdate={handleTaskUpdate}
              onTaskDelete={handleTaskDelete}
              onTaskAssign={handleTaskAssign}
              isLoading={tasksLoading}
            />
          </TabsContent>

          <TabsContent value="overview" className="flex-1 mx-6 mb-6 mt-4 overflow-y-auto">
            <TaskOverview />
          </TabsContent>
        </Tabs>
      </div>

      {/* Task Assignment Modal */}
      {selectedTaskForAssignment && selectedTask && (
        <TaskAssignment
          taskId={selectedTaskForAssignment}
          taskTitle={selectedTask.title}
          taskType={selectedTask.type}
          currentAssignee={selectedTask.assigneeType ? {
            type: selectedTask.assigneeType,
            id: selectedTask.assigneeType === 'human' ? selectedTask.assignedToUser?.id : selectedTask.assignedToAgent?.id,
            name: selectedTask.assigneeType === 'human' ? selectedTask.assignedToUser?.name : selectedTask.assignedToAgent?.name
          } : undefined}
          onAssign={handleTaskAssign}
          onGetSuggestions={handleGetAssignmentSuggestions}
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