import { useMemo } from 'react';
import { Check, ChevronDown, Cpu } from 'lucide-react';

import type { LLMModel } from '@uaip/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ModelSwitcherProps {
  models: LLMModel[];
  /** Provider-native model name currently in effect, e.g. "dirt-cheap". */
  value?: string;
  /** What the agent would use when no override is chosen. */
  agentDefaultModel?: string;
  onChange: (model: string | undefined) => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * A model is identified by its provider-native NAME, not a uuid: the user-facing
 * catalogue is fetched live from each provider rather than from `llm_models`.
 */
function modelKey(model: LLMModel): string {
  return model.name || model.id;
}

export function ModelSwitcher({
  models,
  value,
  agentDefaultModel,
  onChange,
  isLoading = false,
  disabled = false,
  className,
}: ModelSwitcherProps): React.ReactElement {
  const available = useMemo(
    () => models.filter((model) => model.isAvailable !== false),
    [models]
  );

  const effective = value ?? agentDefaultModel;
  const label = isLoading ? 'Loading models…' : effective || 'Default model';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          aria-label="Select model"
          disabled={disabled || (available.length === 0 && !isLoading)}
          className={cn(
            'h-6 gap-1 px-1.5 text-[10px] font-normal text-muted-foreground hover:text-foreground',
            className
          )}
        >
          <Cpu className="h-3 w-3 shrink-0" aria-hidden />
          <span className="max-w-[10rem] truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end" sideOffset={6}>
        <Command loop shouldFilter>
          <CommandInput placeholder="Search models…" autoFocus />
          <CommandList>
            <CommandEmpty>No models available from your providers.</CommandEmpty>
            <CommandGroup heading="Models">
              {agentDefaultModel && (
                <CommandItem
                  value={`__default__ ${agentDefaultModel}`}
                  onSelect={() => onChange(undefined)}
                  className="flex items-center gap-2 py-2"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">Agent default</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {agentDefaultModel}
                    </span>
                  </div>
                  {value === undefined && (
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  )}
                </CommandItem>
              )}
              {available.map((model) => {
                const key = modelKey(model);
                return (
                  <CommandItem
                    key={model.id}
                    value={`${model.name} ${model.provider ?? ''}`}
                    onSelect={() => onChange(key)}
                    className="flex items-center gap-2 py-2"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{model.name}</span>
                      {model.provider && (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {model.provider}
                        </span>
                      )}
                    </div>
                    {value === key && (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
