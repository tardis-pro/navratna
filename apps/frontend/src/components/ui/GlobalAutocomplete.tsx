import React, { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AutocompleteSuggestionItems } from '@/components/ui/AutocompleteSuggestionItems';
import { SparklesIcon, Loader2Icon, XIcon, MessageSquareIcon, FileTextIcon } from 'lucide-react';
import { BASE_SUGGESTION_ICONS, handleSuggestionArrowKeys } from './suggestion-icons';
import { useAutocompleteState } from '@/hooks/use_autocomplete_state';
import { useConversationIntelligence } from '@/hooks/use_conversation_intelligence';
import { useDebounce } from '@/hooks/use_debounce';
import { AutocompleteSuggestion } from '@uaip/types';
import { logger } from '@/utils/browser_logger';

interface GlobalAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  rows?: number;
  enhancementType?: 'topic' | 'context' | 'general';
  context?: {
    purpose?: string;
    selectedAgents?: string[];
    conversationId?: string;
    discussionType?: string;
  };
  disabled?: boolean;
  onEnhance?: (enhancedText: string) => void;
}

const SUGGESTION_ICONS = {
  ...BASE_SUGGESTION_ICONS,
  ai_generated: <SparklesIcon className="w-4 h-4" />,
  topic: <MessageSquareIcon className="w-4 h-4" />,
  context: <FileTextIcon className="w-4 h-4" />,
};

const ENHANCEMENT_PROMPTS = {
  topic: 'Generate discussion topic suggestions based on purpose and context',
  context: 'Suggest additional context and constraints for the discussion',
  general: 'Provide intelligent suggestions based on input context',
};

export const GlobalAutocomplete = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  GlobalAutocompleteProps
>(
  (
    {
      value,
      onChange,
      placeholder = 'Type to get suggestions...',
      className = '',
      multiline = false,
      rows = 3,
      enhancementType = 'general',
      context = {},
      disabled = false,
      onEnhance,
    },
    ref
  ) => {
    const {
      suggestions,
      selectedIndex,
      showSuggestions,
      setSelectedIndex,
      setSuggestionResults,
      hideSuggestions,
      clearSuggestions,
    } = useAutocompleteState<AutocompleteSuggestion>();
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [enhancedSuggestions, setEnhancedSuggestions] = useState<string[]>([]);
    const [showEnhancementPanel, setShowEnhancementPanel] = useState(false);

    const suggestionsRef = useRef<HTMLDivElement>(null);
    const debouncedValue = useDebounce(value, 300);

    // Use conversation intelligence for autocomplete with user's default LLM provider
    const {
      connected,
      autocompleteSuggestions: _autocompleteSuggestions,
      loading: _loading,
      requestAutocomplete,
      clearAutocomplete: _clearAutocomplete,
    } = useConversationIntelligence({
      agentId: 'global-user-llm',
      conversationId: context.conversationId,
      onAutocompleteResults: (results) => {
        // Check if this is an enhancement response
        if (isEnhancing && results.length > 0) {
          const enhancementTexts = results.map((r) => r.text);
          setEnhancedSuggestions(enhancementTexts);
          setIsEnhancing(false);
        } else {
          setSuggestionResults(results);
        }
      },
    });

    // Debug log
    useEffect(() => {
      if (connected) {
      }
    }, [connected]);

    // Request autocomplete suggestions
    useEffect(() => {
      if (!connected || !debouncedValue || debouncedValue.length < 2) {
        clearSuggestions();
        return;
      }

      requestAutocomplete(debouncedValue, {
        type: enhancementType,
        purpose: context.purpose,
        discussionType: context.discussionType,
        selectedAgents: context.selectedAgents,
        conversationId: context.conversationId,
      });
    }, [connected, debouncedValue, enhancementType, context, requestAutocomplete, clearSuggestions]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!showSuggestions || suggestions.length === 0) {
          return;
        }

        if (handleSuggestionArrowKeys(e, suggestions.length, setSelectedIndex)) return;

        switch (e.key) {
          case 'Tab':
          case 'Enter':
            if (!multiline || e.ctrlKey) {
              e.preventDefault();
              if (selectedIndex >= 0) {
                selectSuggestion(suggestions[selectedIndex]);
              }
            }
            break;

          case 'Escape':
            hideSuggestions();
            setShowEnhancementPanel(false);
            break;
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [showSuggestions, suggestions, selectedIndex, multiline, hideSuggestions]
    );

    const selectSuggestion = useCallback(
      (suggestion: AutocompleteSuggestion) => {
        onChange(suggestion.text);
        hideSuggestions();
      },
      [onChange, hideSuggestions]
    );

    const handleEnhanceRequest = useCallback(async () => {
      if (!connected || isEnhancing) return;

      setIsEnhancing(true);
      setShowEnhancementPanel(true);

      try {
        // Request AI enhancement through WebSocket
        requestAutocomplete(value || '', {
          type: 'ai_enhancement',
          enhancementType,
          currentText: value,
          purpose: context.purpose,
          discussionType: context.discussionType,
          selectedAgents: context.selectedAgents,
          prompt: ENHANCEMENT_PROMPTS[enhancementType],
        });

        // The real response will come through the WebSocket callback
        // and will be handled by the onAutocompleteResults callback
      } catch (error) {
        logger.error('Enhancement request failed:', error);
        setIsEnhancing(false);
      }
    }, [connected, isEnhancing, enhancementType, value, context, requestAutocomplete]);

    const applyEnhancement = useCallback(
      (enhancedText: string) => {
        onChange(enhancedText);
        setShowEnhancementPanel(false);
        setEnhancedSuggestions([]);
        if (onEnhance) {
          onEnhance(enhancedText);
        }
      },
      [onChange, onEnhance]
    );

    const handleClickOutside = useCallback((e: MouseEvent) => {
      if (suggestionsRef.current && e.target instanceof Node && !suggestionsRef.current.contains(e.target)) {
        hideSuggestions();
        setShowEnhancementPanel(false);
      }
    }, [hideSuggestions]);

    useEffect(() => {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [handleClickOutside]);

    const InputComponent = multiline ? Textarea : Input;

    return (
      <div className="relative">
        <div className="relative">
          {/* @ts-expect-error -- ref is HTMLInputElement | HTMLTextAreaElement; InputComponent switches between the two */}
          <InputComponent
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={`pr-20 ${className}`}
            rows={multiline ? rows : undefined}
            disabled={disabled}
            autoComplete="off"
          />

          {/* Magic Enhancement Button */}
          <div
            className={`absolute right-2 flex items-center gap-1 ${multiline ? 'top-2' : 'top-1/2 -translate-y-1/2'}`}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleEnhanceRequest}
              disabled={isEnhancing || disabled || !connected}
              className="h-7 w-7 p-0 hover:bg-blue-500/20 hover:text-blue-400 border border-blue-500/30 bg-blue-500/10 transition-all duration-200 hover:scale-105 disabled:opacity-50"
              title={
                connected
                  ? `✨ AI Enhancement - ${ENHANCEMENT_PROMPTS[enhancementType]}`
                  : 'AI Enhancement (WebSocket not connected)'
              }
            >
              {isEnhancing ? (
                <Loader2Icon className="w-4 h-4 animate-spin text-blue-400" />
              ) : (
                <SparklesIcon className="w-4 h-4 text-blue-400" />
              )}
            </Button>
          </div>
        </div>

        {/* Autocomplete Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <Card
            ref={suggestionsRef}
            className="absolute z-[10000] w-full mt-1 shadow-lg border-slate-600 bg-slate-800/95 backdrop-blur-sm"
          >
            <CardContent className="p-0">
              <AutocompleteSuggestionItems
                suggestions={suggestions}
                selectedIndex={selectedIndex}
                onSelectSuggestion={selectSuggestion}
                variant="inverted"
                icons={SUGGESTION_ICONS}
              />
            </CardContent>
          </Card>
        )}

        {/* AI Enhancement Panel */}
        {showEnhancementPanel && (
          <Card
            ref={suggestionsRef}
            className="absolute z-[10001] w-full mt-1 shadow-lg border-blue-500/30 bg-gradient-to-br from-blue-900/30 to-slate-800/95 backdrop-blur-sm"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-blue-300">AI Enhancement</span>
                  <Badge variant="secondary" className="text-xs">
                    {enhancementType}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEnhancementPanel(false)}
                  className="h-6 w-6 p-0 hover:bg-slate-700/50"
                >
                  <XIcon className="w-3 h-3" />
                </Button>
              </div>

              {isEnhancing ? (
                <div className="flex items-center gap-2 py-4">
                  <Loader2Icon className="w-4 h-4 animate-spin text-blue-400" />
                  <span className="text-sm text-slate-300">Generating enhanced suggestions...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {enhancedSuggestions.map((suggestion, _index) => (
                    <div
                      key={`enhanced-${suggestion.substring(0, 20)}`}
                      className="p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700/70 cursor-pointer border border-slate-600/30 hover:border-blue-500/30 transition-all"
                      onClick={() => applyEnhancement(suggestion)}
                    >
                      <p className="text-sm text-slate-200 leading-relaxed">{suggestion}</p>
                    </div>
                  ))}
                  {enhancedSuggestions.length === 0 && (
                    <p className="text-sm text-slate-400 py-2">
                      No enhancements available. Try typing something first.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3 pt-2 border-t border-slate-700">
                <p className="text-xs text-slate-500">
                  Click the <SparklesIcon className="w-3 h-3 inline mx-1 text-blue-400" /> button
                  for AI enhancement
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
);

GlobalAutocomplete.displayName = 'GlobalAutocomplete';
