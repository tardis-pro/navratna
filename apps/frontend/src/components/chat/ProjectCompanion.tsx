// ProjectCompanion — constrained right-panel view of a project
// Shows project name, description, and task list.
// Renders inside CompanionPane's companion slot.

import React from 'react';
import { FolderKanban, CheckCircle2, Circle, Clock } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProjectTask {
  id: string;
  title: string;
  status: 'done' | 'in-progress' | 'todo';
}

interface ProjectCompanionProps {
  projectId: string;
  projectName: string;
  description?: string;
  tasks?: ProjectTask[];
  onClose?: () => void;
}

const statusIcons: Record<ProjectTask['status'], React.ReactNode> = {
  done: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  'in-progress': <Clock className="h-3.5 w-3.5 text-amber-500" />,
  todo: <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />,
};

export const ProjectCompanion: React.FC<ProjectCompanionProps> = ({
  projectName,
  description,
  tasks = [],
}) => {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{projectName}</h3>
        </div>

        {/* Description */}
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        )}

        {/* Task list */}
        {tasks.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Tasks ({tasks.filter((t) => t.status === 'done').length}/{tasks.length})
            </span>
            <ul className="flex flex-col gap-1.5">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 text-xs text-foreground/80">
                  {statusIcons[task.status]}
                  <span className={task.status === 'done' ? 'line-through text-muted-foreground/60' : ''}>
                    {task.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground/60 italic">No tasks yet</p>
        )}
      </div>
    </ScrollArea>
  );
};
