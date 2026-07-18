import React, { useState, useEffect } from 'react';
import { Bot, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgents } from '../../contexts/AgentContext';
import type { FrontendAgentState as AgentState } from '@uaip/types';

interface MentionPickerProps {
  onSelect: (agent: AgentState) => void;
  onClose: () => void;
  searchQuery: string;
}

export const MentionPicker: React.FC<MentionPickerProps> = ({
  onSelect,
  onClose,
  searchQuery,
}) => {
  const { agents } = useAgents();
  const [filteredAgents, setFilteredAgents] = useState<AgentState[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const agentList = Object.values(agents);

  useEffect(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = agentList.filter((agent) =>
      agent.name.toLowerCase().includes(q) ||
      (agent.role && agent.role.toLowerCase().includes(q))
    );
    setFilteredAgents(filtered);
    setSelectedIndex(0);
  }, [searchQuery, agents]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredAgents.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredAgents.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredAgents.length) % filteredAgents.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(filteredAgents[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [filteredAgents, selectedIndex, onSelect, onClose]);

  if (filteredAgents.length === 0) {
    return (
      <div className="p-3 text-center text-xs text-muted-foreground bg-popover border border-border rounded-lg shadow-md w-64">
        No agents found
      </div>
    );
  }

  // Predefined gradients for agent avatars to make them look sleek
  const gradients = [
    'from-blue-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-red-500',
    'from-indigo-500 to-violet-500',
  ];

  return (
    <div className="w-64 max-h-60 overflow-y-auto bg-popover text-popover-foreground border border-border rounded-lg shadow-lg flex flex-col p-1.5 z-50">
      <div className="flex items-center gap-1.5 px-2 py-1 mb-1 border-b border-border/50 text-[10px] uppercase font-semibold text-muted-foreground">
        <Bot className="w-3 h-3" />
        Summon Agent
      </div>
      <div className="flex flex-col gap-0.5">
        {filteredAgents.map((agent, index) => {
          const isSelected = index === selectedIndex;
          const gradient = gradients[index % gradients.length];
          return (
            <button
              key={agent.id}
              onClick={() => onSelect(agent)}
              className={cn(
                'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors text-sm',
                isSelected
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted/50 text-foreground'
              )}
            >
              <div className={cn(
                'w-6 h-6 rounded-md bg-gradient-to-br flex items-center justify-center text-white shrink-0',
                gradient
              )}>
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{agent.name}</span>
                {agent.role && (
                  <span className="text-[10px] text-muted-foreground truncate">{agent.role}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
