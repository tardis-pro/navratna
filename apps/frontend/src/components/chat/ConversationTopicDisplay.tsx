import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EditIcon, CheckIcon, XIcon, HashIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ConversationWebSocketEventType } from '@uaip/types';

interface ConversationTopicDisplayProps {
  conversationId: string;
  agentId: string;
  initialTopic?: string;
  onTopicChange?: (newTopic: string) => void;
  editable?: boolean;
  className?: string;
}

export const ConversationTopicDisplay: React.FC<ConversationTopicDisplayProps> = ({
  conversationId,
  agentId,
  initialTopic = 'New Conversation',
  onTopicChange,
  editable = true,
  className
}) => {
  const [topic, setTopic] = useState(initialTopic);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(topic);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<number>(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const { user } = useAuth();

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user?.token) return;

    const newSocket = io('/conversation-intelligence', {
      auth: { token: user.token },
      query: { agentId, conversationId }
    });

    newSocket.on('connected', (data) => {
      console.log('Connected to conversation intelligence:', data);
    });

    newSocket.on(ConversationWebSocketEventType.TOPIC_GENERATED, (data) => {
      setTopic(data.topicName);
      setConfidence(data.confidence);
      if (onTopicChange) {
        onTopicChange(data.topicName);
      }
    });

    newSocket.on('error', (error) => {
      console.error('Conversation intelligence error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [user?.token, agentId, conversationId, onTopicChange]);

  const handleEdit = () => {
    setEditValue(topic);
    setIsEditing(true);
  };

  const handleSave = () => {
    const newTopic = editValue.trim() || 'New Conversation';
    setTopic(newTopic);
    setIsEditing(false);
    if (onTopicChange) {
      onTopicChange(newTopic);
    }
  };

  const handleCancel = () => {
    setEditValue(topic);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {isEditing ? (
        <>
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-lg font-semibold"
            autoFocus
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            className="h-8 w-8 p-0"
          >
            <CheckIcon className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-8 w-8 p-0"
          >
            <XIcon className="w-4 h-4" />
          </Button>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold flex-1">{topic}</h2>
          
          {confidence > 0 && (
            <Badge variant="secondary" className="text-xs">
              {Math.round(confidence * 100)}% confident
            </Badge>
          )}
          
          {keywords.length > 0 && (
            <div className="flex items-center gap-1">
              <HashIcon className="w-3 h-3 text-muted-foreground" />
              {keywords.slice(0, 3).map((keyword, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          )}
          
          {editable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEdit}
              className="h-8 w-8 p-0"
            >
              <EditIcon className="w-4 h-4" />
            </Button>
          )}
        </>
      )}
    </div>
  );
};