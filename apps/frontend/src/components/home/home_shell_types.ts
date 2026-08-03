import type { MouseEvent } from 'react';
import type { Thread } from '@uaip/types';

export interface WhisperSuggestion {
  id: string;
  title: string;
  description: string;
}

export interface AnimatingThreadRect {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
}

export interface HomeShellContextValue {
  selectedAgentId: string | null;
  /** Which of the agent's threads is open. Undefined means the default thread. */
  selectedThreadKey: string | undefined;
  selectAgent: (agentId: string) => void;
  selectThreadById: (threadId: string) => void;
  openDiscussionComposer: () => void;
  /** Opens a fresh thread with the same agent, leaving the current one intact. */
  startNewThread: (agentId: string) => void;
  onThreadActivity: () => void;
}

export interface ThreadDockProps {
  threads: Thread[];
  selectedAgentId: string | null;
  selectedThreadKey?: string;
  onSelectThread: (thread: Thread, event: MouseEvent<HTMLButtonElement>) => void;
  onRenameThread?: (conversationId: string, title: string) => void;
  onArchiveThread?: (conversationId: string) => void;
  onClose?: () => void;
  className?: string;
}

export interface ShellHeaderProps {
  onOpenThreads: () => void;
  onNewDiscussion: () => void;
  onToggleWhisper: () => void;
  whisperOpen: boolean;
}

export interface WhisperRailProps {
  suggestions: WhisperSuggestion[];
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (suggestion: WhisperSuggestion) => void;
  contextLabel: string;
  className?: string;
}
