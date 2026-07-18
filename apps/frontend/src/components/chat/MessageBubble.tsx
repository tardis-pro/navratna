// MessageBubble — pure presentational chat bubble shared by portal and
// floating modes. Extracted from UnifiedChatSystem (the two inline render
// blocks it replaces were pixel-different variants of the same bubble).
//
// Visual contract (do not change — zero-regression refactor):
//   user  → right-aligned, cyan→blue gradient bubble, emerald user avatar.
//   agent/system → left-aligned, muted surface bubble, purple→indigo bot avatar.
//   compact (floating) → 24px avatars, 75% max width, no timestamp, inline badges.
//   portal  → 40px avatars, 80% max width, timestamp under bubble, badge row
//             + tool execution detail list.
//
// Colors use design-system tokens (foreground/muted-foreground/border); the
// gradient accents are the pre-existing brand treatment.

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  User,
  CheckCircle2,
  Brain,
  Sparkles,
  Zap,
  AlertCircle,
  Maximize2,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from './chat.types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { detectCompanionKinds } from './CompanionPane';

export interface MessageBubbleProps {
  message: ChatMessage;
  /** Render the compact (floating window) variant. Default: portal variant. */
  compact?: boolean;
  /** Stagger delay (seconds) applied to the entrance animation. */
  animationDelay?: number;
  /** Open the message in the companion pane. Only fires when `canExpand(message)` is true. */
  onExpand?: (message: ChatMessage) => void;
  /** True while this message is being streamed token-by-token. Disables metadata,
   *  forces all code blocks to render as plain <pre> via MarkdownRenderer, and
   *  renders a pulsing cursor + abort button. */
  isStreaming?: boolean;
  /** Abort the active stream for this message. Required when isStreaming=true. */
  onAbort?: () => void;
}

/** True when `detectCompanionKinds` finds at least one artifact kind. */
export function canExpandMessage(message: ChatMessage): boolean {
  if (message.sender === 'user') return false;
  return detectCompanionKinds(message).length > 0;
}

const USER_GRADIENT = 'bg-gradient-to-br from-cyan-500 to-blue-600';
const AGENT_AVATAR_GRADIENT = 'bg-gradient-to-br from-purple-500 to-indigo-500';
const USER_AVATAR_GRADIENT = 'bg-gradient-to-br from-emerald-500 to-teal-500';

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  compact = false,
  animationDelay = 0,
  onExpand,
  isStreaming = false,
  onAbort,
}) => {
  const isUser = message.sender === 'user';
  const hasMetadata = Boolean(
    message.confidence ||
      message.memoryEnhanced ||
      message.knowledgeUsed ||
      message.toolsExecuted?.length
  );
  const hasToolResults = Boolean(message.toolsExecuted && message.toolsExecuted.length > 0);
  const canExpand = useMemo(() => canExpandMessage(message), [message]);

  const expandButton = onExpand && canExpand ? (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onExpand(message);
      }}
      aria-label="Open message in companion pane"
      title="Open in companion pane (⌘+\\)"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur transition-all',
        'opacity-0 group-hover/bubble:opacity-100 focus-visible:opacity-100',
        '[@media(hover:none)]:opacity-100',
        'hover:bg-muted hover:text-foreground'
      )}
    >
      <Maximize2 className="h-3 w-3" />
      <span>Expand</span>
    </button>
  ) : null;

  const avatar = (
    <motion.div
      className={cn(
        AGENT_AVATAR_GRADIENT,
        'flex items-center justify-center flex-shrink-0',
        compact ? 'w-6 h-6 rounded-full mt-1' : 'w-10 h-10 rounded-xl'
      )}
      whileHover={{ scale: 1.1, rotate: 5 }}
    >
      <Bot className={cn('text-white', compact ? 'w-3 h-3' : 'w-5 h-5')} />
    </motion.div>
  );

  const userAvatar = (
    <motion.div
      className={cn(
        USER_AVATAR_GRADIENT,
        'flex items-center justify-center flex-shrink-0',
        compact ? 'w-6 h-6 rounded-full mt-1' : 'w-10 h-10 rounded-xl'
      )}
      whileHover={{ scale: 1.1, rotate: -5 }}
    >
      <User className={cn('text-white', compact ? 'w-3 h-3' : 'w-5 h-5')} />
    </motion.div>
  );

  const metadataRow = (
    <div
      className={cn(
        'flex items-center text-xs border-t border-border/40',
        compact ? 'gap-3 mt-2 pt-2' : 'gap-4 mt-3 pt-3 text-muted-foreground'
      )}
    >
      {message.confidence ? (
        <div className="flex items-center gap-1 text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          <span>{Math.round(message.confidence * 100)}%</span>
        </div>
      ) : null}
      {message.memoryEnhanced ? (
        <div className="flex items-center gap-1 text-purple-400">
          <Brain className="w-3 h-3" />
          <span>Memory</span>
        </div>
      ) : null}
      {message.knowledgeUsed && message.knowledgeUsed > 0 ? (
        <div className="flex items-center gap-1 text-yellow-400">
          <Sparkles className="w-3 h-3" />
          <span>{message.knowledgeUsed} KB</span>
        </div>
      ) : null}
      {hasToolResults ? (
        <div className="flex items-center gap-1 text-cyan-400">
          <Zap className="w-3 h-3" />
          <span>{message.toolsExecuted!.length} tools</span>
        </div>
      ) : null}
    </div>
  );

  const toolResults = hasToolResults ? (
    <div className="mt-3 pt-3 border-t border-border/40">
      <div className="text-xs text-muted-foreground mb-2">Tools Executed:</div>
      <div className="space-y-2">
        {message.toolsExecuted!.map((tool) => (
          <motion.div
            key={`${tool.toolId}-${tool.timestamp}`}
            className={cn(
              'flex items-center gap-2 text-xs px-3 py-2 rounded-lg border',
              tool.success
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            )}
            whileHover={{ scale: 1.02 }}
          >
            <Zap className="w-3 h-3" />
            <span className="font-medium">{tool.toolName}</span>
            {tool.success ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <AlertCircle className="w-3 h-3" />
            )}
          </motion.div>
        ))}
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          delay: animationDelay,
          type: 'spring',
          stiffness: 400,
          damping: 25,
        }}
        className={cn('group/bubble flex items-start gap-2', isUser ? 'justify-end' : 'justify-start')}
      >
        {!isUser && avatar}
        <motion.div
          className={cn(
            'max-w-[75%] p-3 rounded-xl text-sm leading-relaxed',
            isUser ? `${USER_GRADIENT} text-white` : 'bg-muted/80 text-foreground border border-border/50'
          )}
          whileHover={{
            scale: 1.02,
            boxShadow: isUser
              ? '0 8px 25px rgba(6, 182, 212, 0.3)'
              : '0 8px 25px rgba(0, 0, 0, 0.3)',
          }}
        >
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <>
              <MarkdownRenderer content={message.content} isStreaming={isStreaming} />
              {isStreaming && <StreamingCursor />}
            </>
          )}
          {!isUser && hasMetadata && metadataRow}
        </motion.div>
        {isUser && userAvatar}
        {!isUser && (expandButton || (isStreaming && onAbort)) && (
          <div className="flex items-end gap-1 self-end pb-0.5">
            {expandButton}
            {isStreaming && onAbort && <AbortButton onAbort={onAbort} />}
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: animationDelay,
        type: 'spring',
        stiffness: 200,
      }}
      className={cn('group/bubble relative flex gap-4', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && avatar}
      <div className={cn('max-w-[80%]', isUser && 'order-1')}>
        <motion.div
          className={cn(
            'relative overflow-hidden rounded-2xl',
            isUser
              ? `${USER_GRADIENT} text-white ml-auto`
              : 'bg-muted/50 text-foreground border border-border/40'
          )}
          whileHover={{ scale: 1.01, y: -1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <div className="p-4">
            {isUser ? (
              <p className="text-sm leading-relaxed">{message.content}</p>
            ) : (
              <>
                <MarkdownRenderer content={message.content} isStreaming={isStreaming} />
                {isStreaming && <StreamingCursor />}
              </>
            )}
            {!isUser && !isStreaming && hasMetadata && metadataRow}
            {!isUser && !isStreaming && toolResults}
          </div>
        </motion.div>
        <div className="mt-2 flex items-center justify-between px-4">
          <span className="text-xs text-muted-foreground/80">
            {isStreaming ? 'Streaming…' : new Date(message.timestamp).toLocaleTimeString()}
          </span>
          <div className="flex items-center gap-2">
            {expandButton}
            {isStreaming && onAbort && <AbortButton onAbort={onAbort} />}
          </div>
        </div>
      </div>
      {isUser && userAvatar}
    </motion.div>
  );
};

// Inline keyframes for the streaming caret + abort button glow.
// Local to this file so we don't pollute globals.css with single-use animations.
const STREAMING_ANIMATIONS = `
@keyframes uaip-stream-caret {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.uaip-stream-caret {
  display: inline-block;
  margin-left: 0.15rem;
  color: hsl(var(--primary));
  font-weight: 600;
  animation: uaip-stream-caret 1s steps(1) infinite;
  vertical-align: baseline;
}
@keyframes uaip-stream-abort-pulse {
  0%, 100% { box-shadow: 0 0 0 0 hsl(var(--destructive) / 0.35); }
  50% { box-shadow: 0 0 0 6px hsl(var(--destructive) / 0); }
}
.uaip-stream-abort-pulse {
  animation: uaip-stream-abort-pulse 1.6s ease-out infinite;
}
`;

interface StreamingCursorProps {
  className?: string;
}

const StreamingCursor: React.FC<StreamingCursorProps> = ({ className }) => (
  <>
    <style dangerouslySetInnerHTML={{ __html: STREAMING_ANIMATIONS }} />
    <span
      className={cn('uaip-stream-caret select-none', className)}
      aria-hidden="true"
      data-testid="streaming-cursor"
    >
      ▋
    </span>
  </>
);

interface AbortButtonProps {
  onAbort: () => void;
  compact?: boolean;
}

const AbortButton: React.FC<AbortButtonProps> = ({ onAbort, compact = false }) => (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      onAbort();
    }}
    aria-label="Stop generating response"
    title="Stop generating"
    data-testid="abort-stream-button"
    className={cn(
      'inline-flex items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 text-destructive',
      'hover:bg-destructive/20 hover:text-destructive transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50',
      'uaip-stream-abort-pulse',
      compact ? 'h-6 w-6' : 'h-7 w-7'
    )}
  >
    <Square className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} fill="currentColor" />
  </button>
);
