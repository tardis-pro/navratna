import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CommandIcon,
  FileTextIcon,
  SearchIcon,
  MessageSquareIcon,
  HelpCircleIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDebounce } from '@/hooks/useDebounce';
import { AutocompleteSuggestion, ConversationWebSocketEventType } from '@uaip/types';

interface SmartInputFieldProps {
  agentId: string;
  conversationId?: string;
  onSubmit: (text: string, intent?: any) => void;
  placeholder?: string;
  className?: string;
}

const SUGGESTION_ICONS = {
  command: <CommandIcon className="w-4 h-4" />,
  tool: <FileTextIcon className="w-4 h-4" />,
  previous: <SearchIcon className="w-4 h-4" />,
  common: <MessageSquareIcon className="w-4 h-4" />,
  question: <HelpCircleIcon className="w-4 h-4" />,
};

export const SmartInputField: React.FC<SmartInputFieldProps> = ({
  agentId,
  conversationId,
  onSubmit,
  placeholder = 'Type a message...',
  className,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [detectedIntent, setDetectedIntent] = useState<any>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const debouncedValue = useDebounce(inputValue, 300);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user?.token) return;

    const newSocket = io('/conversation-intelligence', {
      auth: { token: user.token },
      query: { agentId, conversationId },
    });

    newSocket.on('connected', (data) => {
      console.log('Connected to conversation intelligence:', data);
    });

    newSocket.on(ConversationWebSocketEventType.AUTOCOMPLETE_RESULTS, (data) => {
      setSuggestions(data.suggestions);
      setShowSuggestions(data.suggestions.length > 0);
    });

    newSocket.on(ConversationWebSocketEventType.INTENT_DETECTED, (data) => {
      setDetectedIntent(data.intent);
    });

    newSocket.on('error', (error) => {
      console.error('Conversation intelligence error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [user?.token, agentId, conversationId]);

  // Request autocomplete suggestions
  useEffect(() => {
    if (!socket || !debouncedValue || debouncedValue.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    socket.emit('autocomplete_query', {
      partial: debouncedValue,
      context: { conversationId },
      limit: 5,
    });
  }, [socket, debouncedValue, conversationId]);

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

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;

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
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const selectSuggestion = (suggestion: AutocompleteSuggestion) => {
    setInputValue(suggestion.text);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const handleSubmit = () => {
    if (!inputValue.trim()) return;

    onSubmit(inputValue.trim(), detectedIntent);
    setInputValue('');
    setDetectedIntent(null);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      suggestionsRef.current &&
      !suggestionsRef.current.contains(e.target as Node) &&
      !inputRef.current?.contains(e.target as Node)
    ) {
      setShowSuggestions(false);
    }
  }, []);

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
        {detectedIntent && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Badge variant="secondary" className="text-xs">
              {detectedIntent.category}
            </Badge>
          </div>
        )}
      </div>

      {/* Autocomplete suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <Card ref={suggestionsRef} className="absolute z-50 w-full mt-1 shadow-lg">
          <CardContent className="p-0">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                className={`
                  flex items-center gap-2 px-3 py-2 cursor-pointer
                  ${index === selectedIndex ? 'bg-muted' : 'hover:bg-muted/50'}
                  ${index !== suggestions.length - 1 ? 'border-b' : ''}
                `}
                onClick={() => selectSuggestion(suggestion)}
              >
                <span className="text-muted-foreground">
                  {SUGGESTION_ICONS[suggestion.type] || SUGGESTION_ICONS.common}
                </span>
                <span className="flex-1">{suggestion.text}</span>
                {suggestion.metadata?.description && (
                  <span className="text-xs text-muted-foreground">
                    {suggestion.metadata.description}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {Math.round(suggestion.score * 100)}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
