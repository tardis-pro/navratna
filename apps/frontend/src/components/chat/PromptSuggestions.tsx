import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon, SparklesIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PromptSuggestion, ConversationWebSocketEventType } from '@uaip/types';

interface PromptSuggestionsProps {
  agentId: string;
  conversationContext?: {
    currentTopic?: string;
    recentMessages?: Array<{
      content: string;
      role: 'user' | 'assistant';
      timestamp: Date;
    }>;
  };
  onSelectPrompt: (prompt: string) => void;
  className?: string;
}

const CATEGORY_COLORS = {
  question: 'bg-blue-100 text-blue-800',
  command: 'bg-green-100 text-green-800',
  tool_request: 'bg-purple-100 text-purple-800',
  conversation: 'bg-gray-100 text-gray-800',
  clarification: 'bg-yellow-100 text-yellow-800',
};

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
  agentId,
  conversationContext,
  onSelectPrompt,
  className,
}) => {
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const { user } = useAuth();

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user?.token) return;

    const newSocket = io('/conversation-intelligence', {
      auth: { token: user.token },
      query: { agentId },
    });

    newSocket.on('connected', (data) => {
      console.log('Connected to conversation intelligence:', data);
      // Request initial suggestions
      requestSuggestions(newSocket);
    });

    newSocket.on(ConversationWebSocketEventType.SUGGESTIONS_UPDATED, (data) => {
      setSuggestions(data.prompts);
      setLoading(false);
    });

    newSocket.on('error', (error) => {
      console.error('Conversation intelligence error:', error);
      setLoading(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [user?.token, agentId]);

  const requestSuggestions = (socketInstance?: Socket) => {
    const activeSocket = socketInstance || socket;
    if (!activeSocket) return;

    setLoading(true);
    activeSocket.emit('request_prompt_suggestions', {
      conversationContext: conversationContext || {
        recentMessages: [],
        currentTopic: '',
      },
      count: 3,
    });
  };

  const handleRefresh = () => {
    requestSuggestions();
  };

  const handleSelectPrompt = (prompt: string) => {
    onSelectPrompt(prompt);
    // Request new suggestions after selection
    setTimeout(() => requestSuggestions(), 500);
  };

  if (suggestions.length === 0 && !loading) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SparklesIcon className="w-4 h-4" />
          <span>Suggested prompts</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
          className="h-6 px-2"
        >
          <RefreshCwIcon className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="grid gap-2">
        {loading ? (
          <div className="grid gap-2">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-3">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          suggestions.map((suggestion, index) => (
            <Card
              key={index}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleSelectPrompt(suggestion.prompt)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1">{suggestion.prompt}</p>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${CATEGORY_COLORS[suggestion.category] || ''}`}
                  >
                    {suggestion.category}
                  </Badge>
                </div>

                {suggestion.reasoning && (
                  <p className="text-xs text-muted-foreground mt-1">{suggestion.reasoning}</p>
                )}

                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${suggestion.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(suggestion.confidence * 100)}%
                    </span>
                  </div>

                  {suggestion.basedOn && suggestion.basedOn.length > 0 && (
                    <div className="flex gap-1 ml-auto">
                      {suggestion.basedOn.map((source, i) => (
                        <Badge key={i} variant="outline" className="text-xs py-0">
                          {source}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
