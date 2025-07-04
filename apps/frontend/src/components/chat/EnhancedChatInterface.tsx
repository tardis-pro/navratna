import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { InfoIcon, BrainIcon } from 'lucide-react';
import { SmartInputField } from './SmartInputField';
import { PromptSuggestions } from './PromptSuggestions';
import { ConversationTopicDisplay } from './ConversationTopicDisplay';
import { useConversationIntelligence } from '@/hooks/useConversationIntelligence';
import { Intent } from '@uaip/types';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  intent?: Intent;
}

interface EnhancedChatInterfaceProps {
  agentId: string;
  conversationId: string;
  onSendMessage: (message: string, intent?: Intent) => void;
  messages: Message[];
  className?: string;
}

export const EnhancedChatInterface: React.FC<EnhancedChatInterfaceProps> = ({
  agentId,
  conversationId,
  onSendMessage,
  messages,
  className
}) => {
  const [showIntentInfo, setShowIntentInfo] = useState(true);
  const [toolPreview, setToolPreview] = useState<any>(null);

  const {
    connected,
    currentIntent,
    currentTopic,
    topicConfidence,
    promptSuggestions,
    generateTopic,
    requestPromptSuggestions,
    loading
  } = useConversationIntelligence({
    agentId,
    conversationId,
    onIntentDetected: (intent, preview) => {
      if (preview) {
        setToolPreview(preview);
      }
    }
  });

  // Generate topic when messages change
  useEffect(() => {
    if (messages.length >= 3) {
      const recentMessages = messages.slice(-10).map(m => ({
        content: m.content,
        role: m.role,
        timestamp: m.timestamp
      }));
      generateTopic(recentMessages, currentTopic || undefined);
    }
  }, [messages, generateTopic, currentTopic]);

  // Request prompt suggestions based on conversation context
  useEffect(() => {
    const recentMessages = messages.slice(-5).map(m => ({
      content: m.content,
      role: m.role,
      timestamp: m.timestamp
    }));

    requestPromptSuggestions({
      currentTopic,
      recentMessages
    });
  }, [messages, currentTopic, requestPromptSuggestions]);

  const handleSendMessage = (text: string, intent?: Intent) => {
    onSendMessage(text, intent || currentIntent || undefined);
    setToolPreview(null);
  };

  const handleSelectPrompt = (prompt: string) => {
    // This will be picked up by the SmartInputField through a ref or state management
    // For now, just send it directly
    handleSendMessage(prompt);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Connection Status */}
      {!connected && (
        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            Connecting to conversation intelligence...
          </AlertDescription>
        </Alert>
      )}

      {/* Topic Display */}
      <Card>
        <CardHeader className="py-3">
          <ConversationTopicDisplay
            conversationId={conversationId}
            agentId={agentId}
            initialTopic={currentTopic || 'New Conversation'}
            editable={true}
          />
        </CardHeader>
      </Card>

      {/* Intent and Tool Preview */}
      {showIntentInfo && (currentIntent || toolPreview) && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm">
              <BrainIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Detected:</span>
              
              {currentIntent && (
                <Badge variant="secondary">
                  {currentIntent.category}: {currentIntent.subType}
                </Badge>
              )}
              
              {toolPreview && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-muted-foreground">Will use:</span>
                  <Badge variant="outline">
                    {toolPreview.name}
                  </Badge>
                  {toolPreview.estimatedDuration && (
                    <span className="text-xs text-muted-foreground">
                      ~{Math.round(toolPreview.estimatedDuration / 1000)}s
                    </span>
                  )}
                </div>
              )}
            </div>
            
            {currentIntent?.reasoning && (
              <p className="text-xs text-muted-foreground mt-1">
                {currentIntent.reasoning}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Messages would be rendered here */}
      <div className="flex-1 overflow-y-auto">
        {/* Message list component */}
      </div>

      {/* Prompt Suggestions */}
      {promptSuggestions.length > 0 && (
        <PromptSuggestions
          agentId={agentId}
          conversationContext={{
            currentTopic,
            recentMessages: messages.slice(-5).map(m => ({
              content: m.content,
              role: m.role,
              timestamp: m.timestamp
            }))
          }}
          onSelectPrompt={handleSelectPrompt}
        />
      )}

      {/* Smart Input Field */}
      <SmartInputField
        agentId={agentId}
        conversationId={conversationId}
        onSubmit={handleSendMessage}
        placeholder="Ask anything..."
        className="text-base"
      />

      {/* Loading States */}
      {(loading.intent || loading.topic || loading.suggestions) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {loading.intent && <span>Analyzing intent...</span>}
          {loading.topic && <span>Generating topic...</span>}
          {loading.suggestions && <span>Finding suggestions...</span>}
        </div>
      )}
    </div>
  );
};