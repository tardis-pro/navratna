import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, User, Bot, Clock, Calendar, AlertTriangle, CheckCircle, Circle, Pause, X, GripVertical } from 'lucide-react';
import { format } from 'date-fns';

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

// Types
interface Task {
  id: string;
  taskNumber: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  type: 'feature' | 'bug' | 'enhancement' | 'research' | 'documentation' | 'testing' | 'deployment' | 'maintenance';
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
  onTaskUpdate: (taskId: string, updates: any) => Promise<void>;
  onTaskCreate: (task: any) => Promise<void>;
  onTaskDelete: (taskId: string) => Promise<void>;
  onTaskAssign: (taskId: string, assignment: any) => Promise<void>;
  isLoading?: boolean;
}

const statusColumns = [
  { id: 'todo', title: 'To Do', color: 'bg-slate-800/60' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-blue-900/40' },
  { id: 'in_review', title: 'In Review', color: 'bg-yellow-900/40' },
  { id: 'blocked', title: 'Blocked', color: 'bg-red-900/40' },
  { id: 'completed', title: 'Completed', color: 'bg-green-900/40' }
];

const priorityColors = {
  low: 'bg-slate-500',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500'
};

const typeIcons = {
  feature: '✨',
  bug: '🐛',
  enhancement: '🔧',
  research: '🔍',
  documentation: '📝',
  testing: '🧪',
  deployment: '🚀',
  maintenance: '⚙️'
};

const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}> = ({ children, onClick, variant = 'ghost', size = 'md', className = '', type = 'button' }) => {
  const variants = {
    primary: `bg-gradient-to-r ${DESIGN_TOKENS.colors.primary} text-white hover:scale-105`,
    secondary: `${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.text}`,
    ghost: `${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.textSecondary}`,
    danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
  };
  
  const sizes = {
    sm: `${DESIGN_TOKENS.padding.sm} text-xs`,
    md: `${DESIGN_TOKENS.padding.md} text-sm`, 
    lg: `${DESIGN_TOKENS.padding.lg} text-base`,
  };

  return (
    <button
      type={type}
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

export const TaskBoard: React.FC<TaskBoardProps> = ({
  projectId,
  tasks,
  onTaskUpdate,
  onTaskCreate,
  onTaskDelete,
  onTaskAssign,
  isLoading = false
}) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    assigneeType: 'all',
    priority: 'all',
    type: 'all',
    search: ''
  });

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const filtered = tasks.filter(task => {
      if (filters.assigneeType !== 'all' && task.assigneeType !== filters.assigneeType) return false;
      if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
      if (filters.type !== 'all' && task.type !== filters.type) return false;
      if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase()) &&
          !task.description?.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });

    return statusColumns.reduce((acc, column) => {
      acc[column.id] = filtered.filter(task => task.status === column.id);
      return acc;
    }, {} as Record<string, Task[]>);
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
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono ${DESIGN_TOKENS.colors.textMuted}`}>{task.taskNumber}</span>
                <Badge variant="outline" className={`text-xs ${priorityColors[task.priority]} text-white`}>
                  {task.priority}
                </Badge>
              </div>
              <span className="text-lg">{typeIcons[task.type]}</span>
            </div>
            <CardTitle className={`text-sm font-medium line-clamp-2 ${DESIGN_TOKENS.colors.text}`}>
              {task.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {task.description && (
              <p className={`text-xs ${DESIGN_TOKENS.colors.textMuted} mb-2 line-clamp-2`}>{task.description}</p>
            )}
            
            <div className="flex items-center justify-between mb-2">
              <div className={`flex items-center gap-1 text-xs ${DESIGN_TOKENS.colors.textMuted}`}>
                {task.assigneeType === 'human' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                <span className="truncate max-w-20">{task.assigneeDisplayName}</span>
              </div>
              {task.dueDate && (
                <div className={`flex items-center gap-1 text-xs ${task.isOverdue ? 'text-red-400' : DESIGN_TOKENS.colors.textMuted}`}>
                  <Calendar className="w-3 h-3" />
                  <span>{format(new Date(task.dueDate), 'MMM d')}</span>
                </div>
              )}
            </div>

            {task.metrics.completionPercentage > 0 && (
              <div className="mb-2">
                <div className="flex justify-between text-xs mb-1">
                  <span>Progress</span>
                  <span>{task.metrics.completionPercentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${task.metrics.completionPercentage}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {task.tags?.slice(0, 2).map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs px-1 py-0">
                    {tag}
                  </Badge>
                ))}
                {task.tags && task.tags.length > 2 && (
                  <Badge variant="secondary" className="text-xs px-1 py-0">
                    +{task.tags.length - 2}
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

  const StatusColumn: React.FC<{ column: typeof statusColumns[0]; tasks: Task[] }> = ({ column, tasks }) => (
    <div className="flex-1 min-w-72">
      <motion.div 
        className={`${DESIGN_TOKENS.radius.lg} ${DESIGN_TOKENS.padding.lg} ${column.color} ${DESIGN_TOKENS.backdrop} min-h-screen ${DESIGN_TOKENS.colors.border} border`}
        data-column-id={column.id}
        animate={{
          backgroundColor: dragOverColumn === column.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
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
          <h3 className={`font-semibold ${DESIGN_TOKENS.colors.text}`}>{column.title}</h3>
          <Badge variant="secondary" className={`text-xs ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.textSecondary}`}>
            {tasks.length}
          </Badge>
        </div>
        
        <div className={`min-h-20 ${DESIGN_TOKENS.transition} ${
          dragOverColumn === column.id ? `bg-white bg-opacity-20 ${DESIGN_TOKENS.radius.lg} border-2 border-dashed border-white/50` : ''
        }`}>
          <AnimatePresence>
            {tasks.map((task, index) => (
              <TaskCard key={task.id} task={task} index={index} />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );

  const CreateTaskDialog: React.FC = () => {
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
      
      await onTaskCreate({
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
      setIsCreateDialogOpen(false);
    };

    return (
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogTrigger asChild>
          <Button className="mb-4">
            <Plus className="w-4 h-4 mr-2" />
            Create Task
          </Button>
        </DialogTrigger>
        <DialogContent className={`max-w-md ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}>
          <DialogHeader>
            <DialogTitle className={DESIGN_TOKENS.colors.text}>Create New Task</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              placeholder="Task title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              required
            />
            <Textarea
              placeholder="Description (optional)"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={formData.priority} onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
              <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
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
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                placeholder="Due date"
                value={formData.dueDate}
                onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="Estimated hours"
                value={formData.estimatedHours}
                onChange={(e) => setFormData(prev => ({ ...prev, estimatedHours: e.target.value }))}
                min="0"
                step="0.5"
              />
            </div>
            <Input
              placeholder="Tags (comma-separated)"
              value={formData.tags}
              onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">Create Task</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header with filters and create button */}
      <div className={`${DESIGN_TOKENS.colors.border} border-b ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.padding.lg} space-y-4`}>
        <div className="flex items-center justify-between">
          <h2 className={`text-xl font-semibold ${DESIGN_TOKENS.colors.text}`}>Task Board</h2>
          <CreateTaskDialog />
        </div>
        
        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Search tasks..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="max-w-xs"
          />
          <Select value={filters.assigneeType} onValueChange={(value) => setFilters(prev => ({ ...prev, assigneeType: value }))}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="human">Human</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.priority} onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value }))}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.type} onValueChange={(value) => setFilters(prev => ({ ...prev, type: value }))}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
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
      </div>

      {/* Task board */}
      <div className={`flex-1 overflow-x-auto ${DESIGN_TOKENS.colors.surface}/30`}>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className={DESIGN_TOKENS.colors.textMuted}>Loading tasks...</div>
          </div>
        ) : (
          <div className={`flex ${DESIGN_TOKENS.spacing.md} ${DESIGN_TOKENS.padding.lg} min-w-max`}>
            {statusColumns.map(column => (
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
          <DialogContent className={`max-w-2xl ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.colors.border} border`}>
            <DialogHeader>
              <DialogTitle className={`flex items-center gap-2 ${DESIGN_TOKENS.colors.text}`}>
                <span className={`text-sm font-mono ${DESIGN_TOKENS.colors.textMuted}`}>{selectedTask.taskNumber}</span>
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
                    {selectedTask.assigneeType === 'human' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    <span>{selectedTask.assigneeDisplayName}</span>
                  </div>
                </div>
                
                {selectedTask.dueDate && (
                  <div>
                    <h4 className={`font-medium mb-2 ${DESIGN_TOKENS.colors.text}`}>Due Date</h4>
                    <div className={`flex items-center gap-2 ${selectedTask.isOverdue ? 'text-red-400' : DESIGN_TOKENS.colors.textSecondary}`}>
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
                    <div className={`flex justify-between text-sm ${DESIGN_TOKENS.colors.textSecondary}`}>
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
                    {selectedTask.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className={`${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.textSecondary}`}>{tag}</Badge>
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