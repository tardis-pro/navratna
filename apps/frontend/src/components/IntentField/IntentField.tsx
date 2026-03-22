import React, { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, Command, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import {
  Command as CommandPrimitive,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { useIntentDetection } from './useIntentDetection';
import { AGENT_ACTIVITY_EVENT, type AgentActivityEventDetail } from '@/types/microexpression';
import type { IntentFieldProps, IntentOption } from './IntentField.types';
import { INTENT_ICONS } from './IntentField.types';

const CATEGORY_COLORS: Record<IntentOption['type'], string> = {
  agent: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  portal: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  sop: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  knowledge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  action: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
};

export const IntentField = forwardRef<HTMLButtonElement, IntentFieldProps>(
  (
    {
      open: controlledOpen,
      onOpenChange,
      defaultSearch = '',
      onSelect,
      placeholder = 'Search agents, portals, knowledge...',
      triggerClassName,
      contentClassName,
      showTrigger = true,
      agentId,
      conversationId,
    },
    ref
  ) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const [search, setSearch] = useState(defaultSearch);
    const wasLoadingRef = useRef(false);

    const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setIsOpen = onOpenChange || setInternalOpen;

    const {
      results,
      isLoading,
      connected,
      search: performSearch,
      clear,
    } = useIntentDetection({
      agentId,
      conversationId,
    });
    const wasConnectedRef = useRef(connected);

    const dispatchActivity = useCallback((detail: AgentActivityEventDetail) => {
      window.dispatchEvent(
        new CustomEvent(AGENT_ACTIVITY_EVENT, {
          detail: {
            ...detail,
            source: detail.source || 'intent-field',
            timestamp: detail.timestamp || Date.now(),
          },
        })
      );
    }, []);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          setIsOpen(true);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setIsOpen]);

    useEffect(() => {
      if (isOpen) {
        dispatchActivity({ type: 'intent-open' });
        setSearch('');
        clear();
      } else {
        dispatchActivity({ type: 'intent-close' });
      }
    }, [clear, dispatchActivity, isOpen]);

    useEffect(() => {
      if (isOpen) {
        if (search.trim().length > 0) {
          dispatchActivity({
            type: 'user-typing',
            metadata: { queryLength: search.trim().length },
          });
        }
        performSearch(search);
      }
    }, [dispatchActivity, isOpen, performSearch, search]);

    useEffect(() => {
      if (!isOpen) {
        wasLoadingRef.current = false;
        return;
      }

      if (isLoading && !wasLoadingRef.current) {
        dispatchActivity({ type: 'task-start', metadata: { query: search } });
      }

      if (!isLoading && wasLoadingRef.current) {
        if (search.trim().length >= 2 && results.totalCount === 0) {
          dispatchActivity({
            type: 'ambiguous-intent',
            metadata: { query: search, totalCount: results.totalCount },
          });
        } else {
          dispatchActivity({ type: 'task-complete', metadata: { totalCount: results.totalCount } });
        }
      }

      if (!connected && wasConnectedRef.current && search.trim().length >= 2) {
        dispatchActivity({ type: 'resource-pressure', metadata: { connected } });
      }

      wasLoadingRef.current = isLoading;
      wasConnectedRef.current = connected;
    }, [connected, dispatchActivity, isLoading, isOpen, results.totalCount, search]);

    const handleSelect = useCallback(
      (option: IntentOption) => {
        if (onSelect) {
          onSelect(option);
        }
        setIsOpen(false);
        setSearch('');
      },
      [onSelect, setIsOpen]
    );

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        setIsOpen(newOpen);
        if (!newOpen) {
          setSearch('');
          clear();
        }
      },
      [setIsOpen, clear]
    );

    const triggerButton = showTrigger ? (
      <DialogTrigger asChild>
        <button
          ref={ref}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-2 text-sm',
            'bg-gradient-to-r from-slate-800/80 to-slate-900/80',
            'border border-slate-600/50 rounded-lg',
            'text-slate-300 hover:text-white',
            'hover:border-blue-500/50 hover:bg-slate-800',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
            triggerClassName
          )}
        >
          <Search className="w-4 h-4 text-slate-400" />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono bg-slate-700/50 rounded border border-slate-600/50 text-slate-400">
            <Command className="w-3 h-3" />K
          </kbd>
        </button>
      </DialogTrigger>
    ) : null;

    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        {triggerButton}
        <DialogContent
          className={cn(
            'p-0 gap-0 max-w-2xl w-[95vw] sm:w-full',
            'bg-gradient-to-br from-slate-900/98 via-slate-800/98 to-slate-900/98',
            'border-slate-700/50 backdrop-blur-xl',
            'shadow-2xl shadow-blue-500/10',
            'overflow-hidden',
            contentClassName
          )}
        >
          <div className="relative">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />

            <CommandPrimitive className="w-full" filter={() => 1}>
              <div className="flex items-center border-b border-slate-700/50 px-4">
                <div className="relative flex-1">
                  <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <CommandInput
                    value={search}
                    onValueChange={setSearch}
                    placeholder={placeholder}
                    className={cn(
                      'h-14 pl-8 pr-20 text-base',
                      'bg-transparent border-none',
                      'text-white placeholder:text-slate-500',
                      'focus:ring-0 focus:outline-none'
                    )}
                  />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                    {connected && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        <span className="hidden sm:inline">AI</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <CommandList className="max-h-[400px] overflow-y-auto">
                <CommandEmpty className="py-8 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="w-8 h-8 text-slate-600" />
                    <p className="text-slate-400 text-sm">No results found</p>
                    <p className="text-slate-500 text-xs">Try a different search term</p>
                  </div>
                </CommandEmpty>

                <AnimatePresence mode="popLayout">
                  {results.categories.map((category, categoryIndex) => (
                    <motion.div
                      key={category.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: categoryIndex * 0.05 }}
                    >
                      <CommandGroup
                        heading={category.name}
                        className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-slate-400 [&_[cmdk-group-heading]]:bg-slate-800/50"
                      >
                        {category.options.map((option, optionIndex) => (
                          <motion.div
                            key={option.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: categoryIndex * 0.05 + optionIndex * 0.02 }}
                          >
                            <CommandItem
                              value={option.title}
                              onSelect={() => handleSelect(option)}
                              className={cn(
                                'mx-2 my-1 px-3 py-3 rounded-lg',
                                'flex items-center gap-3',
                                'cursor-pointer',
                                'data-[selected=true]:bg-blue-500/10',
                                'data-[selected=true]:border-blue-500/30',
                                'border border-transparent',
                                'transition-all duration-150',
                                'aria-selected:bg-blue-500/10'
                              )}
                            >
                              <div
                                className={cn(
                                  'w-9 h-9 rounded-lg flex items-center justify-center text-lg',
                                  'bg-slate-700/50 border border-slate-600/30',
                                  'data-[selected=true]:bg-blue-500/20'
                                )}
                              >
                                {option.icon || INTENT_ICONS[option.type]}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-200 truncate">
                                    {option.title}
                                  </span>
                                  <span
                                    className={cn(
                                      'px-1.5 py-0.5 rounded text-[10px] font-medium border',
                                      CATEGORY_COLORS[option.type]
                                    )}
                                  >
                                    {option.type}
                                  </span>
                                  {option.relevanceScore !== undefined &&
                                    option.relevanceScore > 0.8 && (
                                      <Sparkles className="w-3 h-3 text-amber-400" />
                                    )}
                                </div>
                                {option.description && (
                                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                                    {option.description}
                                  </p>
                                )}
                              </div>

                              {option.relevanceScore !== undefined && (
                                <div className="text-xs text-slate-500 tabular-nums">
                                  {Math.round(option.relevanceScore * 100)}%
                                </div>
                              )}
                            </CommandItem>
                          </motion.div>
                        ))}
                      </CommandGroup>
                      {categoryIndex < results.categories.length - 1 && (
                        <CommandSeparator className="my-1 bg-slate-700/30" />
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </CommandList>

              <div className="relative">
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/40 to-transparent" />
                <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500 bg-slate-900/50 border-t border-slate-700/50">
                  <div className="flex items-center gap-4">
                    <span>{results.totalCount} results</span>
                    <div className="hidden sm:flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <kbd className="px-1 py-0.5 bg-slate-700/50 rounded text-[10px]">↑</kbd>
                        <kbd className="px-1 py-0.5 bg-slate-700/50 rounded text-[10px]">↓</kbd>
                        <span>navigate</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="px-1 py-0.5 bg-slate-700/50 rounded text-[10px]">↵</kbd>
                        <span>select</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="px-1 py-0.5 bg-slate-700/50 rounded text-[10px]">esc</kbd>
                        <span>close</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span>Intent Detection</span>
                  </div>
                </div>
              </div>
            </CommandPrimitive>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

IntentField.displayName = 'IntentField';

export default IntentField;
