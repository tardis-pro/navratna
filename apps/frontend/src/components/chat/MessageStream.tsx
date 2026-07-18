// MessageStream — scrollable message list shared by portal and floating chat
// modes: message bubbles, warm-hearth empty state, TypingIndicator, and
// auto-scroll-to-bottom on new messages.
//
// The empty state is the "warm hearth": a calm centered invitation with 2–3
// conversation starters that submit through the same composer path.

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage, ChatMode, TypingState } from './chat.types';

export interface MessageStreamProps {
  messages: ChatMessage[];
  mode: ChatMode;
  /** Element id — floating mode scrolls by id (`messages-<windowId>`). */
  id?: string;
  typing?: TypingState;
  onCancelTyping?: () => void;
  /** Agent name for the empty-state greeting; omit when no agent is selected. */
  agentName?: string;
  /** Conversation starters rendered in the empty state. Click submits. */
  suggestions?: string[];
  onSelectSuggestion?: (text: string) => void;
  /** Open the message in the companion pane. Threaded to MessageBubble. */
  onExpandMessage?: (message: ChatMessage) => void;
  /** ID of the message currently being streamed token-by-token. While set, that
   *  bubble renders the streaming cursor + abort button instead of metadata. */
  streamingMessageId?: string | null;
  /** Abort the active stream for the message identified by `streamingMessageId`. */
  onAbortStream?: () => void;
  className?: string;
}

export const TypingIndicator: React.FC<{
  typing?: TypingState;
  onCancel?: () => void;
}> = ({ typing, onCancel }) => {
  if (!typing || (!typing.isTyping && !typing.loadingText)) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex items-center gap-2 p-3 bg-muted/60 rounded-lg border border-border/40 mb-2"
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 bg-cyan-400 rounded-full"
            animate={{
              y: [0, -8, 0],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground flex-1">
        {typing.loadingText || 'Agent is typing...'}
      </span>
      {typing.progress !== undefined && typing.progress > 0 && (
        <div className="flex-1 bg-muted rounded-full h-1 ml-2">
          <motion.div
            className="bg-cyan-400 h-1 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${typing.progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}
      {onCancel && (
        <button
          onClick={onCancel}
          className="ml-2 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Cancel"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
};

const EmptyState: React.FC<{
  mode: ChatMode;
  agentName?: string;
  suggestions: string[];
  onSelectSuggestion?: (text: string) => void;
}> = ({ mode, agentName, suggestions, onSelectSuggestion }) => {
  const compact = mode === 'floating';
  const greeting = agentName
    ? `Start a conversation with ${agentName}`
    : 'Select an agent to begin chatting';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8' : 'h-full min-h-32'
      )}
    >
      <motion.div
        className={cn(
          'mx-auto rounded-full bg-muted flex items-center justify-center',
          compact ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-4'
        )}
        animate={{
          rotate: [0, 5, -5, 0],
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {compact ? (
          <MessageSquare className="w-6 h-6 text-muted-foreground" />
        ) : (
          <Bot className="w-8 h-8 text-muted-foreground" />
        )}
      </motion.div>

      <p className={cn('text-muted-foreground', compact ? 'text-sm' : 'text-lg')}>{greeting}</p>

      {suggestions.length > 0 && onSelectSuggestion && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-center gap-2',
            compact ? 'mt-4 px-2' : 'mt-5 max-w-md'
          )}
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => onSelectSuggestion(suggestion)}
              className="text-xs px-3 py-1.5 rounded-full border border-border/50 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70 hover:border-border transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export const MessageStream: React.FC<MessageStreamProps> = ({
  messages,
  mode,
  id,
  typing,
  onCancelTyping,
  agentName,
  suggestions = [],
  onSelectSuggestion,
  onExpandMessage,
  streamingMessageId = null,
  onAbortStream,
  className,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const compact = mode === 'floating';

  // Auto-scroll to bottom whenever the message list or typing state changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingMessageId, typing?.isTyping, typing?.progress]);

  return (
    <div
      ref={scrollRef}
      id={id}
      className={cn(
        'flex-1 overflow-y-auto min-h-0',
        compact ? 'p-4 space-y-3' : 'p-6 space-y-4',
        className
      )}
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor:
          'color-mix(in oklch, var(--color-muted-foreground) 30%, transparent) transparent',
      }}
    >
      <AnimatePresence>
        {messages.length === 0 ? (
          <EmptyState
            key="empty"
            mode={mode}
            agentName={agentName}
            suggestions={suggestions}
            onSelectSuggestion={onSelectSuggestion}
          />
        ) : (
          messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              compact={compact}
              animationDelay={index * (compact ? 0.03 : 0.05)}
              onExpand={onExpandMessage}
              isStreaming={streamingMessageId === message.id}
              onAbort={
                streamingMessageId === message.id ? onAbortStream : undefined
              }
            />
          ))
        )}
      </AnimatePresence>

      <TypingIndicator typing={typing} onCancel={onCancelTyping} />
    </div>
  );
};
