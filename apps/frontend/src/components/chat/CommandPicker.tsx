import React, { useState, useEffect } from 'react';
import { FolderKanban, CheckSquare, FileText, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectsAPI } from '@/api/projects_api';
import type { Project } from '@uaip/types';

export interface CommandOption {
  type: 'project' | 'task' | 'doc';
  label: string;
  icon: React.ReactNode;
  /**
   * Real backend id of the selected resource. A project chip without one is
   * useless downstream: chat sends it as projectId, and an integration tool's
   * credential is resolved from the (project, agent) binding, so a synthesized id
   * matches no binding and every such tool is refused.
   */
  resourceId?: string;
}

interface CommandPickerProps {
  onSelect: (command: CommandOption) => void;
  onClose: () => void;
  searchQuery: string;
}

export const CommandPicker: React.FC<CommandPickerProps> = ({
  onSelect,
  onClose,
  searchQuery,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);

  // Real projects, not a hardcoded '/project' placeholder: the chosen id becomes
  // the chat's projectId, which the backend resolves an integration credential
  // from. A synthesized id matches no binding, so every integration tool is
  // refused while the picker still looks functional.
  useEffect(() => {
    let cancelled = false;
    projectsAPI
      .list()
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const commandOptions: CommandOption[] = [
    ...projects.map((project) => ({
      type: 'project' as const,
      label: project.name,
      resourceId: project.id,
      icon: <FolderKanban className="w-3.5 h-3.5" />,
    })),
    {
      type: 'task',
      label: 'task',
      icon: <CheckSquare className="w-3.5 h-3.5" />,
    },
    {
      type: 'doc',
      label: 'doc',
      icon: <FileText className="w-3.5 h-3.5" />,
    },
  ];

  const filteredCommands = commandOptions.filter((cmd) =>
    cmd.label.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredCommands.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(filteredCommands[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [filteredCommands, selectedIndex, onSelect, onClose]);

  if (filteredCommands.length === 0) {
    return (
      <div className="p-3 text-center text-xs text-muted-foreground bg-popover border border-border rounded-lg shadow-md w-48">
        No commands found
      </div>
    );
  }

  return (
    <div className="w-48 bg-popover text-popover-foreground border border-border rounded-lg shadow-lg flex flex-col p-1.5 z-50">
      <div className="flex items-center gap-1.5 px-2 py-1 mb-1 border-b border-border/50 text-[10px] uppercase font-semibold text-muted-foreground">
        <Terminal className="w-3 h-3" />
        Insert Context Command
      </div>
      <div className="flex flex-col gap-0.5">
        {filteredCommands.map((cmd, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={cmd.type}
              onClick={() => onSelect(cmd)}
              className={cn(
                'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors text-sm',
                isSelected
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted/50 text-foreground'
              )}
            >
              <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                {cmd.icon}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-medium">/{cmd.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
