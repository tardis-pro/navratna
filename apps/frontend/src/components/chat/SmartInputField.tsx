import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { createConversationIntelligenceSocket } from './conversation-socket-utils';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AutocompleteSuggestionItems } from '@/components/ui/AutocompleteSuggestionItems';
import { handleSuggestionArrowKeys } from '@/components/ui/suggestion-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAutocompleteState } from '@/hooks/use_autocomplete_state';
import { useDebounce } from '@/hooks/use_debounce';
import { AutocompleteSuggestion, ConversationWebSocketEventType } from '@uaip/types';

interface SmartInputFieldProps {
  agentId: string;
  conversationId?: string;
  onSubmit: (text: string, intent?: unknown) => void;
  placeholder?: string;
  className?: string;
}

export const SmartInputField: React.FC<SmartInputFieldProps> = ({
  agentId,
  conversationId,
  onSubmit,
  placeholder = 'Type a message...',
  className,
}) => {
  const [inputValue, setInputValue] = useState('');
  const {
    suggestions,
    selectedIndex,
    showSuggestions,
    setSelectedIndex,
    setSuggestionResults,
    hideSuggestions,
    clearSuggestions,
  } = useAutocompleteState<AutocompleteSuggestion>();
  const [detectedIntent, setDetectedIntent] = useState<unknown>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const userRecord = user as unknown as Record<string, unknown> | null;
  const authToken =
    userRecord && typeof userRecord.token === 'string'
      ? (userRecord.token as string)
      : '';
  const debouncedValue = useDebounce(inputValue, 300);
  const intentCategory =
    detectedIntent &&
    typeof detectedIntent === 'object' &&
    'category' in detectedIntent &&
    typeof (detectedIntent as { category?: unknown }).category === 'string'
      ? (detectedIntent as { category: string }).category
      : null;

  useEffect(() => {
    if (!authToken) return;

    const newSocket = createConversationIntelligenceSocket(authToken, agentId, conversationId);

    newSocket.on(ConversationWebSocketEventType.AUTOCOMPLETE_RESULTS, (data: { suggestions: AutocompleteSuggestion[] }) => {
      setSuggestionResults(data.suggestions);
    });

    newSocket.on(ConversationWebSocketEventType.INTENT_DETECTED, (data: { intent: unknown }) => {
      setDetectedIntent(data.intent);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [authToken, agentId, conversationId, setSuggestionResults]);

  // Request autocomplete suggestions
  useEffect(() => {
    if (!socket || !debouncedValue || debouncedValue.length < 2) {
      clearSuggestions();
      return;
    }

    socket.emit('autocomplete_query', {
      partial: debouncedValue,
      context: { conversationId },
      limit: 5,
    });
  }, [socket, debouncedValue, conversationId, clearSuggestions]);

  // Request intent detection on input change
  useEffect(() => {
    if (!socket || !debouncedValue || debouncedValue.length < 5) {
      setDetectedIntent(null);
      return;
    }

    socket.emit('request_intent_detection', {
      text: debouncedValue,
      conversationId,
      context: {},
    });
  }, [socket, debouncedValue, conversationId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      return;
    }

    if (handleSuggestionArrowKeys(e, suggestions.length, setSelectedIndex)) return;

    switch (e.key) {
      case 'Tab':
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          selectSuggestion(suggestions[selectedIndex]);
        } else {
          handleSubmit();
        }
        break;

      case 'Escape':
        hideSuggestions();
        break;
    }
  };

  const selectSuggestion = (suggestion: AutocompleteSuggestion) => {
    setInputValue(suggestion.text);
    hideSuggestions();
    inputRef.current?.focus();
  };

  const handleSubmit = () => {
    if (!inputValue.trim()) return;

    onSubmit(inputValue.trim(), detectedIntent);
    setInputValue('');
    setDetectedIntent(null);
    clearSuggestions();
  };

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      suggestionsRef.current &&
      !suggestionsRef.current.contains(e.target as Node) &&
      !inputRef.current?.contains(e.target as Node)
    ) {
      hideSuggestions();
    }
  }, [hideSuggestions]);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleClickOutside]);

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`pr-20 ${className}`}
          autoComplete="off"
        />

        {/* Intent indicator */}
        {intentCategory && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Badge variant="secondary" className="text-xs">
              {intentCategory}
            </Badge>
          </div>
        )}
      </div>

      {/* Autocomplete suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <Card ref={suggestionsRef} className="absolute z-50 w-full mt-1 shadow-lg">
          <CardContent className="p-0">
            <AutocompleteSuggestionItems
              suggestions={suggestions}
              selectedIndex={selectedIndex}
              onSelectSuggestion={selectSuggestion}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};
