import React, { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CommandIcon, 
  FileTextIcon, 
  SearchIcon, 
  MessageSquareIcon, 
  HelpCircleIcon,
  SparklesIcon,
  Loader2Icon,
  XIcon
} from 'lucide-react';
import { useConversationIntelligence } from '@/hooks/useConversationIntelligence';
import { useDebounce } from '@/hooks/useDebounce';
import { AutocompleteSuggestion } from '@uaip/types';

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
  command: <CommandIcon className="w-4 h-4" />,
  tool: <FileTextIcon className="w-4 h-4" />,
  previous: <SearchIcon className="w-4 h-4" />,
  common: <MessageSquareIcon className="w-4 h-4" />,
  question: <HelpCircleIcon className="w-4 h-4" />,
  ai_generated: <SparklesIcon className="w-4 h-4" />,
  topic: <MessageSquareIcon className="w-4 h-4" />,
  context: <FileTextIcon className="w-4 h-4" />
};

const ENHANCEMENT_PROMPTS = {
  topic: 'Generate discussion topic suggestions based on purpose and context',
  context: 'Suggest additional context and constraints for the discussion',
  general: 'Provide intelligent suggestions based on input context'
};

export const GlobalAutocomplete = forwardRef<HTMLInputElement | HTMLTextAreaElement, GlobalAutocompleteProps>(({
  value,
  onChange,
  placeholder = 'Type to get suggestions...',
  className = '',
  multiline = false,
  rows = 3,
  enhancementType = 'general',
  context = {},
  disabled = false,
  onEnhance
}, ref) => {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedSuggestions, setEnhancedSuggestions] = useState<string[]>([]);
  const [showEnhancementPanel, setShowEnhancementPanel] = useState(false);

  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debouncedValue = useDebounce(value, 300);

  // Use conversation intelligence for autocomplete
  const {
    connected,
    autocompleteSuggestions,
    loading,
    requestAutocomplete,
    clearAutocomplete
  } = useConversationIntelligence({
    agentId: context.selectedAgents?.[0] || 'global',
    conversationId: context.conversationId,
    onAutocompleteResults: (results) => {
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    }
  });

  // Debug log
  useEffect(() => {
    console.log('GlobalAutocomplete - WebSocket connected:', connected);
  }, [connected]);

  // Request autocomplete suggestions
  useEffect(() => {
    if (!connected || !debouncedValue || debouncedValue.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    requestAutocomplete(debouncedValue, {
      type: enhancementType,
      purpose: context.purpose,
      discussionType: context.discussionType,
      selectedAgents: context.selectedAgents,
      conversationId: context.conversationId
    });
  }, [connected, debouncedValue, enhancementType, context, requestAutocomplete]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      
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
        setShowSuggestions(false);
        setSelectedIndex(-1);
        setShowEnhancementPanel(false);
        break;
    }
  }, [showSuggestions, suggestions, selectedIndex, multiline]);

  const selectSuggestion = useCallback((suggestion: AutocompleteSuggestion) => {
    onChange(suggestion.text);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  }, [onChange]);

  const handleEnhanceRequest = useCallback(async () => {
    if (!connected || isEnhancing) return;

    setIsEnhancing(true);
    setShowEnhancementPanel(true);

    try {
      // Request AI enhancement through WebSocket
      requestAutocomplete('', {
        type: 'ai_enhancement',
        enhancementType,
        currentText: value,
        purpose: context.purpose,
        discussionType: context.discussionType,
        selectedAgents: context.selectedAgents,
        prompt: ENHANCEMENT_PROMPTS[enhancementType]
      });

      // Simulate AI enhancement results (in real implementation, this would come from WebSocket)
      setTimeout(() => {
        const mockEnhancements = generateMockEnhancements(enhancementType, context, value);
        setEnhancedSuggestions(mockEnhancements);
        setIsEnhancing(false);
      }, 1500);
    } catch (error) {
      console.error('Enhancement request failed:', error);
      setIsEnhancing(false);
    }
  }, [connected, isEnhancing, enhancementType, value, context, requestAutocomplete]);

  const generateMockEnhancements = (type: string, ctx: any, currentText: string) => {
    const base = currentText || '';
    
    switch (type) {
      case 'topic':
        return [
          base || `${ctx.purpose || 'Collaborative'} Discussion: AI-Powered Analysis`,
          base || `${ctx.purpose || 'Strategic'} Planning Session with Multi-Agent Intelligence`,
          base || `${ctx.purpose || 'Deep-Dive'} Exploration: ${ctx.discussionType || 'Expert'} Perspectives`
        ];
      
      case 'context':
        return [
          base + (base ? '\n\n' : '') + 'Focus on actionable insights and practical implementation strategies.',
          base + (base ? '\n\n' : '') + 'Consider edge cases, scalability, and long-term maintainability.',
          base + (base ? '\n\n' : '') + 'Prioritize user experience and business value in recommendations.'
        ];
      
      default:
        return [
          base + (base ? ' ' : '') + 'with comprehensive analysis',
          base + (base ? ' ' : '') + 'leveraging AI capabilities',
          base + (base ? ' ' : '') + 'for optimal outcomes'
        ];
    }
  };

  const applyEnhancement = useCallback((enhancedText: string) => {
    onChange(enhancedText);
    setShowEnhancementPanel(false);
    setEnhancedSuggestions([]);
    if (onEnhance) {
      onEnhance(enhancedText);
    }
  }, [onChange, onEnhance]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      suggestionsRef.current &&
      !suggestionsRef.current.contains(e.target as Node)
    ) {
      setShowSuggestions(false);
      setShowEnhancementPanel(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  const InputComponent = multiline ? Textarea : Input;

  return (
    <div className="relative">
      <div className="relative">
        <InputComponent
          ref={ref as any}
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
        <div className={`absolute right-2 flex items-center gap-1 ${multiline ? 'top-2' : 'top-1/2 -translate-y-1/2'}`}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleEnhanceRequest}
            disabled={isEnhancing || disabled || !connected}
            className="h-7 w-7 p-0 hover:bg-blue-500/20 hover:text-blue-400 border border-blue-500/30 bg-blue-500/10 transition-all duration-200 hover:scale-105 disabled:opacity-50"
            title={connected ? `✨ AI Enhancement - ${ENHANCEMENT_PROMPTS[enhancementType]}` : 'AI Enhancement (WebSocket not connected)'}
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
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                className={`
                  flex items-center gap-2 px-3 py-2 cursor-pointer
                  ${index === selectedIndex ? 'bg-blue-500/20 text-blue-300' : 'hover:bg-slate-700/50 text-slate-300'}
                  ${index !== suggestions.length - 1 ? 'border-b border-slate-700' : ''}
                `}
                onClick={() => selectSuggestion(suggestion)}
              >
                <span className="text-slate-400">
                  {SUGGESTION_ICONS[suggestion.type] || SUGGESTION_ICONS.common}
                </span>
                <span className="flex-1 text-sm">{suggestion.text}</span>
                {suggestion.metadata?.description && (
                  <span className="text-xs text-slate-500">
                    {suggestion.metadata.description}
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {Math.round(suggestion.score * 100)}%
                </span>
              </div>
            ))}
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
                {enhancedSuggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700/70 cursor-pointer border border-slate-600/30 hover:border-blue-500/30 transition-all"
                    onClick={() => applyEnhancement(suggestion)}
                  >
                    <p className="text-sm text-slate-200 leading-relaxed">
                      {suggestion}
                    </p>
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
                Click the <SparklesIcon className="w-3 h-3 inline mx-1 text-blue-400" /> button for AI enhancement
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

GlobalAutocomplete.displayName = 'GlobalAutocomplete';