import { useMemo } from 'react';
import { Bot, Check, ChevronDown, ChevronsUpDown, CircleAlert, Plus, RefreshCw } from 'lucide-react';

import type { FrontendAgentState } from '@uaip/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface AgentSwitcherProps {
  agents: Record<string, FrontendAgentState>;
  value: string;
  onChange: (agentId: string) => void;
  onCreateAgent?: () => void;
  onRetry?: () => void;
  isLoading?: boolean;
  error?: string | null;
  disabled?: boolean;
  className?: string;
  align?: 'start' | 'center' | 'end';
}

const ROLE_BADGE_GRADIENT: Record<string, string> = {
  assistant: 'from-blue-500/20 to-cyan-500/20 text-blue-700 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/60',
  orchestrator: 'from-purple-500/20 to-pink-500/20 text-purple-700 dark:text-purple-300 border-purple-200/60 dark:border-purple-800/60',
  analyzer: 'from-emerald-500/20 to-teal-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60',
  specialist: 'from-amber-500/20 to-orange-500/20 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60',
  strategist: 'from-indigo-500/20 to-violet-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/60',
  architect: 'from-slate-500/20 to-zinc-500/20 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-slate-800/60',
};

const DEFAULT_ROLE_GRADIENT =
  'from-blue-500/20 to-purple-500/20 text-foreground border-border';

function getRoleGradient(role: string): string {
  return ROLE_BADGE_GRADIENT[role] ?? DEFAULT_ROLE_GRADIENT;
}

export function AgentSwitcher({
  agents,
  value,
  onChange,
  onCreateAgent,
  onRetry,
  isLoading = false,
  error = null,
  disabled = false,
  className,
  align = 'start',
}: AgentSwitcherProps): React.ReactElement {
  const agentList = useMemo(() => Object.values(agents), [agents]);
  const selected = useMemo(
    () => agentList.find((agent) => agent.id === value) ?? null,
    [agentList, value]
  );

  if (error && agentList.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm',
          className
        )}
        role="alert"
      >
        <div className="flex min-w-0 items-center gap-2">
          <CircleAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <span className="truncate text-destructive">
            Couldn&apos;t load agents: {error}
          </span>
        </div>
        {onRetry && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={isLoading}
            className="shrink-0 gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} aria-hidden />
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (agentList.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm',
          className
        )}
      >
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <Bot className="h-4 w-4 shrink-0" aria-hidden />
          <span>No agents available — create one to start chatting.</span>
        </div>
        {onCreateAgent && (
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={onCreateAgent}
            className="shrink-0 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Create agent
          </Button>
        )}
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Select agent"
          disabled={disabled}
          className={cn(
            'h-auto w-full justify-between gap-3 rounded-xl border-border/60 bg-card/40 px-4 py-3 text-sm font-normal text-foreground shadow-none transition-all hover:bg-card/60',
            'focus-visible:ring-2 focus-visible:ring-ring/50',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          {selected ? (
            <AgentSummary agent={selected} />
          ) : (
            <span className="flex items-center gap-2">
              <ChevronsUpDown className="h-4 w-4 opacity-60" aria-hidden />
              Select an agent…
            </span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align={align}
        sideOffset={6}
      >
        <Command loop shouldFilter>
          <CommandInput placeholder="Search agents by name, role, or model…" autoFocus />
          <CommandList>
            <CommandEmpty>No agents match your search.</CommandEmpty>
            <CommandGroup heading={`Agents (${agentList.length})`}>
              {agentList.map((agent) => {
                const isActive = agent.id === value;
                return (
                  <CommandItem
                    key={agent.id}
                    value={`${agent.name} ${agent.role} ${agent.modelId ?? ''}`}
                    onSelect={() => onChange(agent.id)}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <AgentAvatar agent={agent} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">{agent.name}</span>
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center rounded-full border bg-gradient-to-r px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                            getRoleGradient(agent.role)
                          )}
                        >
                          {agent.role}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
                        <span
                          className={cn(
                            'inline-flex h-1.5 w-1.5 shrink-0 rounded-full',
                            isAgentOnline(agent) ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                          )}
                          aria-hidden
                        />
                        <span className="truncate">
                          {agent.modelId ? `Model: ${agent.modelId}` : 'No model assigned'}
                        </span>
                      </div>
                    </div>
                    {isActive && (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {onCreateAgent && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="__create_agent__"
                    onSelect={() => onCreateAgent()}
                    className="gap-2 text-muted-foreground"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Create a new agent
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AgentSummary({ agent }: { agent: FrontendAgentState }): React.ReactElement {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <AgentAvatar agent={agent} />
      <span className="flex min-w-0 flex-col text-left">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">{agent.name}</span>
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full border bg-gradient-to-r px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              getRoleGradient(agent.role)
            )}
          >
            {agent.role}
          </span>
        </span>
        <span className="mt-0.5 truncate text-xs text-muted-foreground">
          {agent.modelId ? agent.modelId : 'No model assigned'}
        </span>
      </span>
    </span>
  );
}

function AgentAvatar({ agent }: { agent: FrontendAgentState }): React.ReactElement {
  const initial = agent.name.trim().charAt(0).toUpperCase() || 'A';
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 text-sm font-semibold text-white shadow-sm ring-1 ring-blue-500/20"
      aria-hidden
    >
      {initial}
    </span>
  );
}

function isAgentOnline(agent: FrontendAgentState): boolean {
  if (agent.error) return false;
  if (typeof agent.status === 'string') {
    return (
      agent.status === 'idle' ||
      agent.status === 'thinking' ||
      agent.status === 'executing' ||
      agent.status === 'waiting'
    );
  }
  return true;
}