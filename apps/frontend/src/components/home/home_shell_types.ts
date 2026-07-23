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
  selectAgent: (agentId: string) => void;
  selectThreadById: (threadId: string) => void;
  openDiscussionComposer: () => void;
}

export interface ThreadDockProps {
  threads: Thread[];
  selectedAgentId: string | null;
  onSelectThread: (thread: Thread, event: MouseEvent<HTMLButtonElement>) => void;
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
