// ContextChipBar — removable context chips strip (project/task/doc)
// Renders below the composer input when context items are attached.
// Clicking a chip opens its companion pane; X removes it.

import React from 'react';
import { X, FolderKanban, CheckSquare, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ContextChip {
  id: string;
  type: 'project' | 'task' | 'doc';
  label: string;
  /** Resource identifier for fetching companion data */
  resourceId?: string;
}

interface ContextChipBarProps {
  chips: ContextChip[];
  activeChipId?: string | null;
  onChipClick: (chip: ContextChip) => void;
  onRemove: (chipId: string) => void;
  className?: string;
}

const chipIcons: Record<ContextChip['type'], React.ReactNode> = {
  project: <FolderKanban className="h-3 w-3" />,
  task: <CheckSquare className="h-3 w-3" />,
  doc: <FileText className="h-3 w-3" />,
};

export const ContextChipBar: React.FC<ContextChipBarProps> = ({
  chips,
  activeChipId,
  onChipClick,
  onRemove,
  className,
}) => {
  if (chips.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 px-3 py-2', className)}>
      {chips.map((chip) => {
        const isActive = chip.id === activeChipId;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onChipClick(chip)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
              isActive
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border/50 bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
            aria-label={`${chip.type}: ${chip.label}${isActive ? ' (active)' : ''}`}
            aria-pressed={isActive}
          >
            {chipIcons[chip.type]}
            <span className="max-w-[120px] truncate">{chip.label}</span>
            <span
              role="button"
              tabIndex={0}
              aria-label={`Remove ${chip.label}`}
              className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(chip.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onRemove(chip.id);
                }
              }}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          </button>
        );
      })}
      {chips.length >= 3 && (
        <span className="text-[10px] text-muted-foreground/60">max 3</span>
      )}
    </div>
  );
};
