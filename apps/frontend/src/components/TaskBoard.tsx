import React, { useState, _useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  User,
  Bot,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle,
  _Circle,
  _Pause,
  _X,
  _GripVertical,
} from 'lucide-react';
import { format } from 'date-fns';
import { DESIGN_TOKENS, PRIORITY_OPTION_VALUES, TYPE_OPTION_VALUES } from './TaskDesignTokens';
import { Button } from './TaskButton';
import { TaskCreateForm } from './TaskCreateForm';

// Types
interface Task {
  id: string;
  taskNumber: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  type:
    | 'feature'
    | 'bug'
    | 'enhancement'
    | 'research'
    | 'documentation'
    | 'testing'
    | 'deployment'
    | 'maintenance';
  assigneeType?: 'human' | 'agent';
  assignedToUser?: { id: string; name: string; email: string };
  assignedToAgent?: { id: string; name: string };
  creator: { id: string; name: string; email: string };
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
  metrics: {
    completionPercentage: number;
    timeSpent?: number;
    estimatedTime?: number;
  };
  tags?: string[];
  labels?: string[];
  isOverdue: boolean;
  isBlocked: boolean;
  assigneeDisplayName: string;
}

interface TaskBoardProps {
  projectId: string;
  tasks: Task[];
  onTaskUpdate: (taskId: string, updates: unknown) => Promise<void>;
  onTaskCreate: (task: unknown) => Promise<void>;
  onTaskDelete: (taskId: string) => Promise<void>;
  onTaskAssign: (taskId: string, assignment: unknown) => Promise<void>;
  isLoading?: boolean;
}

const statusColumns = [
  { id: 'todo', title: 'To Do', color: 'bg-slate-800/60' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-blue-900/40' },
  { id: 'in_review', title: 'In Review', color: 'bg-yellow-900/40' },
  { id: 'blocked', title: 'Blocked', color: 'bg-red-900/40' },
  { id: 'completed', title: 'Completed', color: 'bg-green-900/40' },
];

const priorityColors = {
  low: 'bg-slate-500',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
};

const typeIcons = {
  feature: '✨',
  bug: '🐛',
  enhancement: '🔧',
  research: '🔍',
  documentation: '📝',
  testing: '🧪',
  deployment: '🚀',
  maintenance: '⚙️',
};

export const TaskBoard: React.FC<TaskBoardProps> = ({
  projectId,
  tasks,
  onTaskUpdate,
  onTaskCreate,
  _onTaskDelete,
  _onTaskAssign,
  isLoading = false,
}) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    assigneeType: 'all',
    priority: 'all',
    type: 'all',
    search: '',
  });

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const filtered = tasks.filter((task) => {
      if (filters.assigneeType !== 'all' && task.assigneeType !== filters.assigneeType)
        return false;
      if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
      if (filters.type !== 'all' && task.type !== filters.type) return false;
      if (
        filters.search &&
        !task.title.toLowerCase().includes(filters.search.toLowerCase()) &&
        !task.description?.toLowerCase().includes(filters.search.toLowerCase())
      )
        return false;
      return true;
    });

    return statusColumns.reduce(
      (acc, column) => {
        acc[column.id] = filtered.filter((task) => task.status === column.id);
        return acc;
      },
      {} as Record<string, Task[]>
    );
  }, [tasks, filters]);

  const handleTaskMove = async (taskId: string, newStatus: string) => {
    if (newStatus !== draggedTask?.status) {
      await onTaskUpdate(taskId, { status: newStatus });
    }
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const TaskCard: React.FC<{ task: Task; index: number }> = ({ task, index }) => (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.1}
      onDragStart={() => setDraggedTask(task)}
      onDragEnd={(_, info) => {
        const element = document.elementFromPoint(info.point.x, info.point.y);
        const columnElement = element?.closest('[data-column-id]');
        if (columnElement) {
          const newStatus = columnElement.getAttribute('data-column-id');
          if (newStatus && newStatus !== task.status) {
            handleTaskMove(task.id, newStatus);
          }
        }
        setDraggedTask(null);
      }}
      whileHover={{ scale: 1.02, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
      whileDrag={{ scale: 1.05, rotate: 2, zIndex: 1000 }}
      className="mb-3"
    >
      <Card
        className={`
          cursor-pointer ${DESIGN_TOKENS.transition} hover:shadow-md 
          ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border
          ${draggedTask?.id === task.id ? 'shadow-lg opacity-80' : ''} 
          ${task.isOverdue ? 'border-red-400/50' : ''}
        `}
        onClick={() => setSelectedTask(task)}
      >
        <CardHeader className="pb-1 px-2 pt-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1">
              <span className={`text-xs font-mono ${DESIGN_TOKENS.colors.textMuted}`}>
                {task.taskNumber}
              </span>
              <Badge
                variant="outline"
                className={`text-xs ${priorityColors[task.priority]} text-white px-1 py-0`}
              >
                {task.priority}
              </Badge>
            </div>
            <span className="text-sm">{typeIcons[task.type]}</span>
          </div>
          <CardTitle className={`text-xs font-medium line-clamp-2 ${DESIGN_TOKENS.colors.text}`}>
            {task.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-2 pb-2">
          {task.description && (
            <p className={`text-xs ${DESIGN_TOKENS.colors.textMuted} mb-1 line-clamp-1`}>
              {task.description}
            </p>
          )}

          <div className="flex items-center justify-between mb-1">
            <div className={`flex items-center gap-1 text-xs ${DESIGN_TOKENS.colors.textMuted}`}>
              {task.assigneeType === 'human' ? (
                <User className="w-3 h-3" />
              ) : (
                <Bot className="w-3 h-3" />
              )}
              <span className="truncate max-w-16">{task.assigneeDisplayName}</span>
            </div>
            {task.dueDate && (
              <div
                className={`flex items-center gap-1 text-xs ${task.isOverdue ? 'text-red-400' : DESIGN_TOKENS.colors.textMuted}`}
              >
                <Calendar className="w-3 h-3" />
                <span>{format(new Date(task.dueDate), 'MMM d')}</span>
              </div>
            )}
          </div>

          {task.metrics.completionPercentage > 0 && (
            <div className="mb-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-xs">Progress</span>
                <span className="text-xs">{task.metrics.completionPercentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1">
                <div
                  className="bg-blue-500 h-1 rounded-full transition-all"
                  style={{ width: `${task.metrics.completionPercentage}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {task.tags?.slice(0, 1).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs px-1 py-0">
                  {tag}
                </Badge>
              ))}
              {task.tags && task.tags.length > 1 && (
                <Badge variant="secondary" className="text-xs px-1 py-0">
                  +{task.tags.length - 1}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1">
              {task.isBlocked && <AlertTriangle className="w-3 h-3 text-red-500" />}
              {task.isOverdue && <Clock className="w-3 h-3 text-red-500" />}
              {task.status === 'completed' && <CheckCircle className="w-3 h-3 text-green-500" />}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  const StatusColumn: React.FC<{ column: (typeof statusColumns)[0]; tasks: Task[] }> = ({
    column,
    tasks: columnTasks,
  }) => (
    <div className="flex-1 min-w-40">
      <motion.div
        className={`${DESIGN_TOKENS.radius.lg} ${DESIGN_TOKENS.padding.lg} ${column.color} ${DESIGN_TOKENS.backdrop} min-h-screen ${DESIGN_TOKENS.colors.border} border`}
        data-column-id={column.id}
        animate={{
          backgroundColor:
            dragOverColumn === column.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverColumn(column.id);
        }}
        onDragLeave={() => setDragOverColumn(null)}
        onDrop={(e) => {
          e.preventDefault();
          if (draggedTask && draggedTask.status !== column.id) {
            handleTaskMove(draggedTask.id, column.id);
          }
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-sm font-semibold ${DESIGN_TOKENS.colors.text}`}>{column.title}</h3>
          <Badge
            variant="secondary"
            className={`text-xs ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.textSecondary}`}
          >
            {columnTasks.length}
          </Badge>
        </div>

        <div
          className={`min-h-20 ${DESIGN_TOKENS.transition} ${
            dragOverColumn === column.id
              ? `bg-white bg-opacity-20 ${DESIGN_TOKENS.radius.lg} border-2 border-dashed border-white/50`
              : ''
          }`}
        >
          <AnimatePresence>
            {columnTasks.map((task, index) => (
              <TaskCard key={task.id} task={task} index={index} />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );

  const CreateTaskDialog: React.FC = () => (
    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
      <DialogTrigger asChild>
        <Button className="mb-4">
          <Plus className="w-4 h-4 mr-2" />
          Create Task
        </Button>
      </DialogTrigger>
      <DialogContent
        className={`max-w-md ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}
      >
        <DialogHeader>
          <DialogTitle className={DESIGN_TOKENS.colors.text}>Create New Task</DialogTitle>
        </DialogHeader>
        <TaskCreateForm
          projectId={projectId}
          onSubmit={onTaskCreate}
          onClose={() => setIsCreateDialogOpen(false)}
        >
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Task
            </Button>
          </div>
        </TaskCreateForm>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header with filters and create button */}
      <div
        className={`${DESIGN_TOKENS.colors.border} border-b ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.padding.lg} space-y-4`}
      >
        <div className="flex items-center justify-between">
          <h2 className={`text-xl font-semibold ${DESIGN_TOKENS.colors.text}`}>Task Board</h2>
          <CreateTaskDialog />
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Search tasks..."
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            className="max-w-xs"
          />
          <Select
            value={filters.assigneeType}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, assigneeType: value }))}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="human">Human</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.priority}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, priority: value }))}
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {PRIORITY_OPTION_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.type}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {TYPE_OPTION_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Task board */}
      <div className={`flex-1 overflow-x-auto ${DESIGN_TOKENS.colors.surface}/30`}>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className={DESIGN_TOKENS.colors.textMuted}>Loading tasks...</div>
          </div>
        ) : (
          <div className={`flex ${DESIGN_TOKENS.spacing.md} ${DESIGN_TOKENS.padding.lg} min-w-max`}>
            {statusColumns.map((column) => (
              <StatusColumn
                key={column.id}
                column={column}
                tasks={tasksByStatus[column.id] || []}
              />
            ))}
          </div>
        )}
      </div>

      {/* Task detail dialog */}
      {selectedTask && (
        <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
          <DialogContent
            className={`max-w-2xl ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}
          >
            <DialogHeader>
              <DialogTitle className={`flex items-center gap-2 ${DESIGN_TOKENS.colors.text}`}>
                <span className={`text-sm font-mono ${DESIGN_TOKENS.colors.textMuted}`}>
                  {selectedTask.taskNumber}
                </span>
                <span>{selectedTask.title}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={`${priorityColors[selectedTask.priority]} text-white`}>
                  {selectedTask.priority}
                </Badge>
                <Badge variant="outline">{selectedTask.type}</Badge>
                <Badge variant="outline">{selectedTask.status.replace('_', ' ')}</Badge>
              </div>

              {selectedTask.description && (
                <div>
                  <h4 className={`font-medium mb-2 ${DESIGN_TOKENS.colors.text}`}>Description</h4>
                  <p className={DESIGN_TOKENS.colors.textSecondary}>{selectedTask.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className={`font-medium mb-2 ${DESIGN_TOKENS.colors.text}`}>Assignment</h4>
                  <div className={`flex items-center gap-2 ${DESIGN_TOKENS.colors.textSecondary}`}>
                    {selectedTask.assigneeType === 'human' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                    <span>{selectedTask.assigneeDisplayName}</span>
                  </div>
                </div>

                {selectedTask.dueDate && (
                  <div>
                    <h4 className={`font-medium mb-2 ${DESIGN_TOKENS.colors.text}`}>Due Date</h4>
                    <div
                      className={`flex items-center gap-2 ${selectedTask.isOverdue ? 'text-red-400' : DESIGN_TOKENS.colors.textSecondary}`}
                    >
                      <Calendar className="w-4 h-4" />
                      <span>{format(new Date(selectedTask.dueDate), 'PPP')}</span>
                    </div>
                  </div>
                )}
              </div>

              {selectedTask.metrics.completionPercentage > 0 && (
                <div>
                  <h4 className={`font-medium mb-2 ${DESIGN_TOKENS.colors.text}`}>Progress</h4>
                  <div className="space-y-2">
                    <div
                      className={`flex justify-between text-sm ${DESIGN_TOKENS.colors.textSecondary}`}
                    >
                      <span>Completion</span>
                      <span>{selectedTask.metrics.completionPercentage}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${selectedTask.metrics.completionPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedTask.tags && selectedTask.tags.length > 0 && (
                <div>
                  <h4 className={`font-medium mb-2 ${DESIGN_TOKENS.colors.text}`}>Tags</h4>
                  <div className="flex gap-1 flex-wrap">
                    {selectedTask.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.textSecondary}`}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
