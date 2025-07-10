import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, User, Bot, Clock, Calendar, AlertTriangle, CheckCircle, Circle, Pause, X, GripVertical } from 'lucide-react';
import { format } from 'date-fns';

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
  { id: 'todo', title: 'To Do', color: 'bg-gray-100' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-blue-100' },
  { id: 'in_review', title: 'In Review', color: 'bg-yellow-100' },
  { id: 'blocked', title: 'Blocked', color: 'bg-red-100' },
  { id: 'completed', title: 'Completed', color: 'bg-green-100' }
];

const priorityColors = {
  low: 'bg-gray-500',
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
        className={`cursor-pointer transition-all hover:shadow-md ${
          draggedTask?.id === task.id ? 'shadow-lg opacity-80' : ''
        } ${task.isOverdue ? 'border-red-300' : ''}`}
        onClick={() => setSelectedTask(task)}
      >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-gray-500">{task.taskNumber}</span>
                <Badge variant="outline" className={`text-xs ${priorityColors[task.priority]} text-white`}>
                  {task.priority}
                </Badge>
              </div>
              <span className="text-lg">{typeIcons[task.type]}</span>
            </div>
            <CardTitle className="text-sm font-medium line-clamp-2">
              {task.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {task.description && (
              <p className="text-xs text-gray-600 mb-2 line-clamp-2">{task.description}</p>
            )}
            
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                {task.assigneeType === 'human' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                <span className="truncate max-w-20">{task.assigneeDisplayName}</span>
              </div>
              {task.dueDate && (
                <div className={`flex items-center gap-1 text-xs ${task.isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
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
        className={`rounded-lg p-4 ${column.color} min-h-screen`}
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
          <h3 className="font-semibold text-gray-700">{column.title}</h3>
          <Badge variant="secondary" className="text-xs">
            {tasks.length}
          </Badge>
        </div>
        
        <div className={`min-h-20 transition-colors ${
          dragOverColumn === column.id ? 'bg-white bg-opacity-30 rounded-lg border-2 border-dashed border-white' : ''
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
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
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Task</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header with filters and create button */}
      <div className="border-b bg-white p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Task Board</h2>
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
      <div className="flex-1 overflow-x-auto bg-gray-50">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading tasks...</div>
          </div>
        ) : (
          <div className="flex gap-4 p-4 min-w-max">
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
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="text-sm font-mono text-gray-500">{selectedTask.taskNumber}</span>
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
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-gray-600">{selectedTask.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Assignment</h4>
                  <div className="flex items-center gap-2">
                    {selectedTask.assigneeType === 'human' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    <span>{selectedTask.assigneeDisplayName}</span>
                  </div>
                </div>
                
                {selectedTask.dueDate && (
                  <div>
                    <h4 className="font-medium mb-2">Due Date</h4>
                    <div className={`flex items-center gap-2 ${selectedTask.isOverdue ? 'text-red-500' : ''}`}>
                      <Calendar className="w-4 h-4" />
                      <span>{format(new Date(selectedTask.dueDate), 'PPP')}</span>
                    </div>
                  </div>
                )}
              </div>

              {selectedTask.metrics.completionPercentage > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Progress</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Completion</span>
                      <span>{selectedTask.metrics.completionPercentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
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
                  <h4 className="font-medium mb-2">Tags</h4>
                  <div className="flex gap-1 flex-wrap">
                    {selectedTask.tags.map(tag => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
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