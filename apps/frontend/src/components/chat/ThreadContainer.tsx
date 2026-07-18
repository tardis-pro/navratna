// ThreadContainer — owns the chat layout: a CSS grid with a center column
// (message stream + composer pinned to the bottom) and an optional right
// companion slot.
//
//   grid-template-columns: 1fr auto
//
// The companion slot is empty/hidden by default (WS-3 mounts real companion
// panes). When a companion opens, the stream column narrows but the composer
// stays fixed at the bottom of the center column.

import React from 'react';
import { cn } from '@/lib/utils';
import { MessageStream } from './MessageStream';
import type { ChatMessage, ChatMode, TypingState } from './chat.types';

export interface ThreadContainerProps {
  messages: ChatMessage[];
  mode: ChatMode;
  /** Composer rendered at the bottom of the center column — never moves. */
  composer: React.ReactNode;
  /** Element id forwarded to the scroll container (floating scroll-by-id). */
  streamId?: string;
  typing?: TypingState;
  onCancelTyping?: () => void;
  agentName?: string;
  suggestions?: string[];
  onSelectSuggestion?: (text: string) => void;
  /** Open the message in the companion pane. */
  onExpandMessage?: (message: ChatMessage) => void;
  /** ID of the message currently being streamed token-by-token. */
  streamingMessageId?: string | null;
  /** Abort the active stream for the message identified by `streamingMessageId`. */
  onAbortStream?: () => void;
  /** Optional header rendered above the stream inside the center column. */
  header?: React.ReactNode;
  /** Right companion pane content. Rendered only when `companionOpen`. */
  companion?: React.ReactNode;
  companionOpen?: boolean;
  className?: string;
}

export const ThreadContainer: React.FC<ThreadContainerProps> = ({
  messages,
  mode,
  composer,
  streamId,
  typing,
  onCancelTyping,
  agentName,
  suggestions,
  onSelectSuggestion,
  onExpandMessage,
  streamingMessageId = null,
  onAbortStream,
  header,
  companion,
  companionOpen = false,
  className,
}) => {
  return (
    <div
      className={cn('grid h-full min-h-0', className)}
      style={{ gridTemplateColumns: '1fr auto' }}
    >
      {/* Center column — stream scrolls, composer stays fixed at the bottom. */}
      <div className="flex flex-col h-full min-h-0">
        {header}
        <MessageStream
          messages={messages}
          mode={mode}
          id={streamId}
          typing={typing}
          onCancelTyping={onCancelTyping}
          agentName={agentName}
          suggestions={suggestions}
          onSelectSuggestion={onSelectSuggestion}
          onExpandMessage={onExpandMessage}
          streamingMessageId={streamingMessageId}
          onAbortStream={onAbortStream}
        />
        {composer}
      </div>

      {/* Right companion slot — only mounted when companionOpen is true. */}
      {companionOpen && companion ? (
        <div className="h-full min-h-0 border-l border-border/40">{companion}</div>
      ) : null}
    </div>
  );
};
