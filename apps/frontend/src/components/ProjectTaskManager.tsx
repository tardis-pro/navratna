import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TaskBoard } from './TaskBoard';
import { TaskAssignment } from './TaskAssignment';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Design System Tokens - matching DesktopUnified
const DESIGN_TOKENS = {
  colors: {
    primary: 'from-blue-400 to-cyan-400',
    surface: 'bg-slate-900/90',
    surfaceHover: 'hover:bg-slate-700/50',
    border: 'border-slate-700/50',
    text: 'text-white',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-400',
  },
  spacing: {
    xs: 'gap-2',
    sm: 'gap-3', 
    md: 'gap-4',
    lg: 'gap-6',
  },
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl', 
    lg: 'rounded-2xl',
  },
  padding: {
    sm: 'p-1',
    md: 'p-2',
    lg: 'p-4',
  },
  backdrop: 'backdrop-blur-xl',
  transition: 'transition-all duration-200',
  shadow: 'shadow-xl',
};

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

const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ children, onClick, variant = 'ghost', size = 'md', className = '' }) => {
  const variants = {
    primary: `bg-gradient-to-r ${DESIGN_TOKENS.colors.primary} text-white hover:scale-105`,
    secondary: `${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.text}`,
    ghost: `${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.textSecondary}`,
    danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
    outline: `${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.text}`,
  };
  
  const sizes = {
    sm: `${DESIGN_TOKENS.padding.sm} text-xs`,
    md: `${DESIGN_TOKENS.padding.md} text-sm`, 
    lg: `${DESIGN_TOKENS.padding.lg} text-base`,
  };

  return (
    <button
      onClick={onClick}
      className={`
        ${variants[variant]} ${sizes[size]} ${DESIGN_TOKENS.radius.md} 
        ${DESIGN_TOKENS.transition} flex items-center ${DESIGN_TOKENS.spacing.sm}
        ${className}
      `}
    >
      {children}
    </button>
  );
};

export const ProjectTaskManager: React.FC<ProjectTaskManagerProps> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const [selectedFilters, setSelectedFilters] = useState<TaskFilters>({});
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedTaskForAssignment, setSelectedTaskForAssignment] = useState<string | null>(null);
  const [showQuickCreateTask, setShowQuickCreateTask] = useState(false);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setShowQuickCreateTask(true);
      }
      if (e.key === 'Escape') {
        setShowQuickCreateTask(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
  }> = ({ title, value, subtitle, icon, color = DESIGN_TOKENS.colors.textSecondary }) => (
    <Card className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className={`text-xs sm:text-sm font-medium ${DESIGN_TOKENS.colors.textMuted} truncate`}>{title}</p>
            <p className={`text-lg sm:text-xl lg:text-2xl font-bold ${color}`}>{value}</p>
            {subtitle && <p className={`text-xs ${DESIGN_TOKENS.colors.textMuted} hidden sm:block`}>{subtitle}</p>}
          </div>
          <div className={`${color} opacity-70 flex-shrink-0 ml-2`}>
            {React.cloneElement(icon as React.ReactElement, { 
              className: 'w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8' 
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const QuickCreateTask: React.FC = () => {
    const [formData, setFormData] = useState({
      title: '',
      description: '',
      priority: 'medium',
      type: 'feature',
      dueDate: '',
      estimatedHours: '',
      tags: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      try {
        await handleTaskCreate({
          ...formData,
          projectId,
          dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined,
          estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : undefined,
          tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : undefined
        });

        setFormData({
          title: '',
          description: '',
          priority: 'medium',
          type: 'feature',
          dueDate: '',
          estimatedHours: '',
          tags: ''
        });
        setShowQuickCreateTask(false);
      } catch (error) {
        console.error('Failed to create task:', error);
      }
    };

    if (!showQuickCreateTask) return null;

    return (
      <>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowQuickCreateTask(false)} />
        
        <div className={`
          fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl 
          ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.radius.lg} 
          ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.shadow} z-[201] overflow-hidden
        `}>
          <div className={`${DESIGN_TOKENS.padding.lg} ${DESIGN_TOKENS.colors.border} border-b`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-xl font-bold ${DESIGN_TOKENS.colors.text} flex items-center gap-2`}>
                <Plus className="w-5 h-5 text-blue-400" />
                Quick Create Task
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowQuickCreateTask(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className={`${DESIGN_TOKENS.padding.lg} space-y-4`}>
            <div className="grid grid-cols-1 gap-4">
              <Input
                placeholder="Task title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
                className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.colors.text}`}
              />
              
              <Textarea
                placeholder="Description (optional)"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.colors.text}`}
              />
              
              <div className="grid grid-cols-2 gap-3">
                <Select value={formData.priority} onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}>
                  <SelectTrigger className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.colors.text}`}>
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
                  <SelectTrigger className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.colors.text}`}>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="enhancement">Enhancement</SelectItem>
                    <SelectItem value="research">Research</SelectItem>
                    <SelectItem value="documentation">Documentation</SelectItem>
                    <SelectItem value="testing">Testing</SelectItem>
                    <SelectItem value="deployment">Deployment</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="date"
                  placeholder="Due date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                  className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.colors.text}`}
                />
                <Input
                  type="number"
                  placeholder="Estimated hours"
                  value={formData.estimatedHours}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimatedHours: e.target.value }))}
                  min="0"
                  step="0.5"
                  className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.colors.text}`}
                />
              </div>
              
              <Input
                placeholder="Tags (comma-separated)"
                value={formData.tags}
                onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.colors.text}`}
              />
            </div>
            
            <div className="flex justify-between items-center pt-4">
              <div className={`text-xs ${DESIGN_TOKENS.colors.textMuted}`}>
                Press <kbd className="bg-slate-700 px-1 rounded">Ctrl+Shift+T</kbd> to quickly create tasks
              </div>
              <div className={`flex ${DESIGN_TOKENS.spacing.xs}`}>
                <Button type="button" variant="secondary" onClick={() => setShowQuickCreateTask(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Create Task
                </Button>
              </div>
            </div>
          </form>
        </div>
      </>
    );
  };

  const TaskOverview: React.FC = () => (
    <div className="space-y-4 sm:space-y-6">
      {/* Statistics Grid - More responsive */}
      <div className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 ${DESIGN_TOKENS.spacing.sm} sm:${DESIGN_TOKENS.spacing.md}`}>
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
      <div className={`grid grid-cols-1 sm:grid-cols-3 ${DESIGN_TOKENS.spacing.sm} sm:${DESIGN_TOKENS.spacing.md}`}>
        <Card className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}>
          <CardHeader className="pb-3">
            <CardTitle className={`text-sm font-medium flex items-center gap-2 ${DESIGN_TOKENS.colors.text}`}>
              <Users className="w-4 h-4" />
              Human Assigned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{humanAssigned}</div>
            <div className={`text-xs ${DESIGN_TOKENS.colors.textMuted}`}>
              {totalTasks > 0 ? Math.round((humanAssigned / totalTasks) * 100) : 0}% of total
            </div>
          </CardContent>
        </Card>

        <Card className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}>
          <CardHeader className="pb-3">
            <CardTitle className={`text-sm font-medium flex items-center gap-2 ${DESIGN_TOKENS.colors.text}`}>
              <Bot className="w-4 h-4" />
              Agent Assigned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">{agentAssigned}</div>
            <div className={`text-xs ${DESIGN_TOKENS.colors.textMuted}`}>
              {totalTasks > 0 ? Math.round((agentAssigned / totalTasks) * 100) : 0}% of total
            </div>
          </CardContent>
        </Card>

        <Card className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}>
          <CardHeader className="pb-3">
            <CardTitle className={`text-sm font-medium flex items-center gap-2 ${DESIGN_TOKENS.colors.text}`}>
              <AlertTriangle className="w-4 h-4" />
              Unassigned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-400">{unassigned}</div>
            <div className={`text-xs ${DESIGN_TOKENS.colors.textMuted}`}>
              {totalTasks > 0 ? Math.round((unassigned / totalTasks) * 100) : 0}% of total
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${DESIGN_TOKENS.colors.text}`}>
            <BarChart3 className="w-5 h-5" />
            Task Status Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(stats.byStatus || {}).map(([status, count]) => {
              const percentage = totalTasks > 0 ? Math.round((count as number / totalTasks) * 100) : 0;
              const statusColors = {
                todo: 'bg-slate-400',
                in_progress: 'bg-blue-500',
                in_review: 'bg-yellow-500',
                blocked: 'bg-red-500',
                completed: 'bg-green-500',
                cancelled: 'bg-slate-300'
              };
              
              return (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${statusColors[status as keyof typeof statusColors]}`} />
                    <span className={`text-sm font-medium capitalize ${DESIGN_TOKENS.colors.textSecondary}`}>{status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${DESIGN_TOKENS.colors.textMuted}`}>{count}</span>
                    <Badge variant="secondary" className={`text-xs ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.textSecondary}`}>
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

  const selectedTask = selectedTaskForAssignment ? 
    tasksData?.find((task: any) => task.id === selectedTaskForAssignment) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header - More responsive */}
      <div className={`${DESIGN_TOKENS.colors.border} border-b ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} p-4 sm:${DESIGN_TOKENS.padding.lg}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className={`text-xl sm:text-2xl font-bold ${DESIGN_TOKENS.colors.text} truncate`}>
              {projectData?.name || 'Project'} - Tasks
            </h1>
            <p className={`${DESIGN_TOKENS.colors.textMuted} mt-1 text-sm hidden sm:block`}>
              Manage and track tasks with human and agent assignments
            </p>
          </div>
          <div className={`flex items-center ${DESIGN_TOKENS.spacing.xs} flex-shrink-0`}>
            <Button 
              variant="primary" 
              size="sm"
              onClick={() => setShowQuickCreateTask(true)}
              className="sm:hidden"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button 
              variant="primary" 
              size="sm"
              onClick={() => setShowQuickCreateTask(true)}
              className="hidden sm:flex"
              title="Quick Create Task (Ctrl+Shift+T)"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Task
            </Button>
            <Button variant="outline" size="sm" className="hidden md:flex">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm" className="hidden lg:flex">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - More responsive */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="board" className="h-full flex flex-col">
          <TabsList className={`mx-4 sm:mx-6 mt-4 w-fit ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}>
            <TabsTrigger value="board" className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm ${DESIGN_TOKENS.colors.textSecondary} data-[state=active]:${DESIGN_TOKENS.colors.text}`}>
              <Activity className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Task Board</span>
              <span className="sm:hidden">Board</span>
            </TabsTrigger>
            <TabsTrigger value="overview" className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm ${DESIGN_TOKENS.colors.textSecondary} data-[state=active]:${DESIGN_TOKENS.colors.text}`}>
              <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Overview</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="flex-1 mx-2 sm:mx-4 lg:mx-6 mb-4 sm:mb-6 mt-4">
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

          <TabsContent value="overview" className="flex-1 mx-2 sm:mx-4 lg:mx-6 mb-4 sm:mb-6 mt-4 overflow-y-auto">
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