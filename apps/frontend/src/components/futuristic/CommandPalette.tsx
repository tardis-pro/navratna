import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, Database, BarChart3, MessageSquare, Layout, Settings, Sparkles } from 'lucide-react';
import { PortalConfig } from './PortalManager';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePortal: (template: PortalConfig, customProps?: any) => string;
  templates: PortalConfig[];
}

interface Command {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  category: 'portal' | 'layout' | 'system' | 'ai';
  keywords: string[];
}

const SYSTEM_COMMANDS: Omit<Command, 'action'>[] = [
  {
    id: 'create-agent',
    title: 'Create AI Agent',
    description: 'Spawn a new AI agent portal',
    icon: Zap,
    category: 'portal',
    keywords: ['agent', 'ai', 'create', 'spawn', 'bot']
  },
  {
    id: 'create-tool',
    title: 'Create Analysis Tool',
    description: 'Add a data analysis tool portal',
    icon: BarChart3,
    category: 'portal',
    keywords: ['tool', 'analysis', 'data', 'chart', 'graph']
  },
  {
    id: 'create-data',
    title: 'Create Data Stream',
    description: 'Connect to a live data feed',
    icon: Database,
    category: 'portal',
    keywords: ['data', 'stream', 'feed', 'database', 'live']
  },
  {
    id: 'arrange-grid',
    title: 'Arrange in Grid',
    description: 'Organize portals in a grid layout',
    icon: Layout,
    category: 'layout',
    keywords: ['grid', 'arrange', 'organize', 'layout', 'tidy']
  },
  {
    id: 'neural-connect',
    title: ' Connect',
    description: 'Auto-connect related portals',
    icon: Sparkles,
    category: 'ai',
    keywords: ['connect', 'neural', 'auto', 'ai', 'smart', 'link']
  },
  {
    id: 'workspace-optimize',
    title: 'Optimize Workspace',
    description: 'AI-powered workspace optimization',
    icon: Settings,
    category: 'ai',
    keywords: ['optimize', 'ai', 'smart', 'improve', 'enhance']
  }
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onCreatePortal,
  templates
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate commands from templates and system commands
  const commands: Command[] = [
    ...templates.map(template => ({
      id: `create-${template.id}`,
      title: `Create ${template.title}`,
      description: `Add a new ${template.type} portal to your workspace`,
      icon: template.type === 'agent' ? Zap : 
            template.type === 'tool' ? BarChart3 : 
            template.type === 'data' ? Database :
            template.type === 'communication' ? MessageSquare : Layout,
      action: () => {
        onCreatePortal(template);
        onClose();
      },
      category: 'portal' as const,
      keywords: [template.type, template.title.toLowerCase(), 'create', 'add', 'new']
    })),
    ...SYSTEM_COMMANDS.map(cmd => ({
      ...cmd,
      action: () => {
        // Handle system commands
        console.log(`Executing command: ${cmd.id}`);
        onClose();
      }
    }))
  ];

  // Filter commands based on query
  const filteredCommands = commands.filter(command => {
    if (!query) return true;
    const searchText = query.toLowerCase();
    return (
      command.title.toLowerCase().includes(searchText) ||
      command.description.toLowerCase().includes(searchText) ||
      command.keywords.some(keyword => keyword.includes(searchText))
    );
  });

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const getCategoryColor = (category: Command['category']) => {
    switch (category) {
      case 'portal': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'layout': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      case 'ai': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'system': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Command Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50"
          >
            <div className="w-[600px] max-h-[500px] bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl shadow-blue-500/10 overflow-hidden">
              
              {/*  Header */}
              <div className="relative">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
                <div className="p-6 border-b border-slate-700/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search commands or type to create..."
                      className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-blue-500/50 focus:bg-slate-800/70 transition-all"
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="flex items-center gap-2 text-slate-400 text-xs">
                        <span>↑↓ navigate</span>
                        <span>↵ execute</span>
                        <span>esc close</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Commands List */}
              <div className="max-h-80 overflow-y-auto">
                {filteredCommands.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-slate-700/50 rounded-2xl flex items-center justify-center">
                      <Search className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-slate-400 text-sm">No commands found</p>
                    <p className="text-slate-500 text-xs mt-1">Try a different search term</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {filteredCommands.map((command, index) => {
                      const Icon = command.icon;
                      const isSelected = index === selectedIndex;
                      
                      return (
                        <motion.div
                          key={command.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.02 }}
                          onClick={command.action}
                          className={`
                            relative flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all
                            ${isSelected 
                              ? 'bg-blue-500/10 border border-blue-500/20' 
                              : 'hover:bg-slate-700/30 border border-transparent'
                            }
                          `}
                        >
                          {/* Command Icon */}
                          <div className={`
                            w-10 h-10 rounded-lg flex items-center justify-center transition-all
                            ${isSelected ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700/50 text-slate-400'}
                          `}>
                            <Icon className="w-5 h-5" />
                          </div>

                          {/* Command Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <h3 className={`font-medium ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                {command.title}
                              </h3>
                              <span className={`
                                px-2 py-0.5 rounded-md text-xs font-medium border
                                ${getCategoryColor(command.category)}
                              `}>
                                {command.category}
                              </span>
                            </div>
                            <p className="text-slate-400 text-sm mt-1 truncate">
                              {command.description}
                            </p>
                          </div>

                          {/* Selection Indicator */}
                          {isSelected && (
                            <motion.div
                              layoutId="selection"
                              className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-cyan-400 rounded-r-full"
                            />
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/*  Footer */}
              <div className="relative">
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent" />
                <div className="p-4 bg-slate-900/50 border-t border-slate-700/50">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-4">
                      <span>{filteredCommands.length} commands</span>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        <span> interface active</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Powered by AI</span>
                      <Sparkles className="w-3 h-3 text-purple-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}; 