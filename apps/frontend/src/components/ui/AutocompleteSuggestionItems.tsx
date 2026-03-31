import React from 'react';
import { BASE_SUGGESTION_ICONS } from './suggestion-icons';
import { AutocompleteSuggestion } from '@uaip/types';

type SuggestionStyleVariant = 'default' | 'inverted';

interface AutocompleteSuggestionItemsProps {
  suggestions: AutocompleteSuggestion[];
  selectedIndex: number;
  onSelectSuggestion: (suggestion: AutocompleteSuggestion) => void;
  variant?: SuggestionStyleVariant;
  icons?: Record<string, React.ReactNode>;
}

export const AutocompleteSuggestionItems: React.FC<AutocompleteSuggestionItemsProps> = ({
  suggestions,
  selectedIndex,
  onSelectSuggestion,
  variant = 'default',
  icons,
}) => {
  const suggestionIcons: Record<string, React.ReactNode> = {
    ...BASE_SUGGESTION_ICONS,
    ...icons,
  };

  return (
    <>
      {suggestions.map((suggestion, index) => {
        const baseRowClass = 'flex items-center gap-2 px-3 py-2 cursor-pointer';
        const interactiveClass =
          variant === 'inverted'
            ? index === selectedIndex
              ? 'bg-blue-500/20 text-blue-300'
              : 'hover:bg-slate-700/50 text-slate-300'
            : index === selectedIndex
              ? 'bg-muted'
              : 'hover:bg-muted/50';
        const borderClass =
          index !== suggestions.length - 1
            ? variant === 'inverted'
              ? 'border-b border-slate-700'
              : 'border-b'
            : '';

        return (
          <div
            key={`suggestion-${suggestion.text.substring(0, 20)}-${index}`}
            className={`${baseRowClass} ${interactiveClass} ${borderClass}`}
            onClick={() => onSelectSuggestion(suggestion)}
          >
            <span className={variant === 'inverted' ? 'text-slate-400' : 'text-muted-foreground'}>
              {suggestionIcons[suggestion.type] || suggestionIcons.common}
            </span>
            <span className={variant === 'inverted' ? 'flex-1 text-sm' : 'flex-1'}>
              {suggestion.text}
            </span>
            {suggestion.metadata?.description && (
              <span className={variant === 'inverted' ? 'text-xs text-slate-500' : 'text-xs text-muted-foreground'}>
                {suggestion.metadata.description}
              </span>
            )}
            <span className={variant === 'inverted' ? 'text-xs text-slate-500' : 'text-xs text-muted-foreground'}>
              {Math.round(suggestion.score * 100)}%
            </span>
          </div>
        );
      })}
    </>
  );
};
