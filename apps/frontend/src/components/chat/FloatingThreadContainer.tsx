// FloatingThreadContainer — wraps ThreadContainer with the floating-window
// chrome: entrance/hover motion, positioning, focus ring, drag handle header,
// and the corner resize handle. All drag/resize math stays in the parent
// (UnifiedChatSystem) and arrives as callbacks + position/size props.

import React from 'react';
import { motion } from 'framer-motion';
import { Bot, Minimize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThreadContainer } from './ThreadContainer';
import type { ChatMessage, TypingState } from './chat.types';

export interface FloatingWindowChrome {
  agentName: string;
  isLoading: boolean;
  isMinimized: boolean;
  isFocused: boolean;
  isDragging: boolean;
  isResizing: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface FloatingThreadContainerProps {
  chrome: FloatingWindowChrome;
  messages: ChatMessage[];
  composer: React.ReactNode;
  streamId?: string;
  typing?: TypingState;
  onCancelTyping?: () => void;
  agentName?: string;
  suggestions?: string[];
  onSelectSuggestion?: (text: string) => void;
  /** ID of the message currently being streamed token-by-token. */
  streamingMessageId?: string | null;
  /** Abort the active stream for the message identified by `streamingMessageId`. */
  onAbortStream?: () => void;
  /** Ref callback — parent keeps window elements for drag hit-testing. */
  containerRef?: (el: HTMLDivElement | null) => void;
  onFocus?: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
  onDragHandleMouseDown?: (e: React.MouseEvent) => void;
  onResizeHandleMouseDown?: (e: React.MouseEvent) => void;
}

export const FloatingThreadContainer: React.FC<FloatingThreadContainerProps> = ({
  chrome,
  messages,
  composer,
  streamId,
  typing,
  onCancelTyping,
  agentName,
  suggestions,
  onSelectSuggestion,
  streamingMessageId = null,
  onAbortStream,
  containerRef,
  onFocus,
  onMinimize,
  onClose,
  onDragHandleMouseDown,
  onResizeHandleMouseDown,
}) => {
  const {
    agentName: title,
    isLoading,
    isMinimized,
    isFocused,
    isDragging,
    isResizing,
    position,
    size,
  } = chrome;

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        'fixed bg-gradient-to-br from-muted/95 via-background/95 to-muted/95',
        'backdrop-blur-xl rounded-xl border border-border/40 text-foreground pointer-events-auto',
        'flex flex-col shadow-2xl shadow-black/50 overflow-hidden',
        isFocused ? 'ring-2 ring-cyan-500/50 z-10' : 'z-0',
        isDragging ? 'cursor-grabbing scale-105' : 'cursor-default',
        isResizing && 'select-none'
      )}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: isMinimized ? 'auto' : size.height,
        zIndex: isFocused ? 60 : 50,
      }}
      initial={{
        opacity: 0,
        scale: 0.8,
        y: 100,
        rotateX: -15,
      }}
      animate={{
        opacity: 1,
        scale: isDragging ? 1.05 : isResizing ? 1.02 : 1,
        y: 0,
        rotateX: 0,
      }}
      exit={{
        opacity: 0,
        scale: 0.8,
        y: 100,
        rotateX: 15,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
      whileHover={{
        scale: isDragging || isResizing ? undefined : 1.01,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}
      onClick={onFocus}
    >
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 opacity-50" />

      {/* Chat Header — drag handle */}
      <div
        className="relative flex items-center justify-between p-4 bg-gradient-to-r from-muted/50 to-muted/70 border-b border-border/40 cursor-grab active:cursor-grabbing"
        onMouseDown={onDragHandleMouseDown}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center"
            animate={{
              boxShadow: isLoading
                ? [
                    '0 0 10px rgba(6, 182, 212, 0.5)',
                    '0 0 20px rgba(6, 182, 212, 0.8)',
                    '0 0 10px rgba(6, 182, 212, 0.5)',
                  ]
                : '0 0 10px rgba(6, 182, 212, 0.3)',
            }}
            transition={{
              duration: 2,
              repeat: isLoading ? Infinity : 0,
            }}
          >
            <Bot className="w-4 h-4 text-white" />
          </motion.div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">{title}</h3>
            <div className="flex items-center gap-2 text-xs">
              <div
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  isLoading ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'
                )}
              />
              <span className="text-muted-foreground">{isLoading ? 'Processing...' : 'Online'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMinimize?.();
            }}
            className="p-1.5 hover:bg-muted/60 rounded-md transition-colors group"
            title="Minimize"
          >
            <Minimize2 className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            className="p-1.5 hover:bg-red-500/20 rounded-md transition-colors group"
            title="Close"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground group-hover:text-red-400" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <ThreadContainer
            messages={messages}
            mode="floating"
            composer={composer}
            streamId={streamId}
            typing={typing}
            onCancelTyping={onCancelTyping}
            agentName={agentName}
            suggestions={suggestions}
            onSelectSuggestion={onSelectSuggestion}
            streamingMessageId={streamingMessageId}
            onAbortStream={onAbortStream}
            className="flex-1"
          />

          {/* Resize Handle */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-50 hover:opacity-100 transition-opacity"
            onMouseDown={onResizeHandleMouseDown}
          >
            <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-muted-foreground" />
          </div>
        </>
      )}
    </motion.div>
  );
};
