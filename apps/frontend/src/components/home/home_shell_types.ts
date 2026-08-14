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
  /**
   * The project the open thread belongs to, or undefined for a loose one. Drives
   * which project a turn is sent under — including the FIRST turn of a new
   * thread, which is what files it under the project at all.
   */
  activeProjectId: string | undefined;
  selectAgent: (agentId: string) => void;
  selectThreadById: (threadId: string) => void;
  openDiscussionComposer: () => void;
  /** Opens a fresh thread with the same agent, leaving the current one intact. */
  startNewThread: (agentId: string, projectId?: string) => void;
  onThreadActivity: () => void;
}

/** The minimum a project needs to appear as a group in the dock. */
export interface DockProject {
  id: string;
  name: string;
}

export interface ThreadDockProps {
  threads: Thread[];
  /**
   * Projects the user can see. A project with no threads still renders — an
   * empty project the user just created must be visible to start a thread in.
   */
  projects?: DockProject[];
  selectedAgentId: string | null;
  selectedThreadKey?: string;
  onSelectThread: (thread: Thread, event: MouseEvent<HTMLButtonElement>) => void;
  onRenameThread?: (conversationId: string, title: string) => void;
  onArchiveThread?: (conversationId: string) => void;
  /** Opens the project's settings (instructions, pinned agent). */
  onOpenProject?: (projectId: string) => void;
  /** Starts a thread inside the project, with the agent the project pins. */
  onNewThreadInProject?: (projectId: string) => void;
  onClose?: () => void;
  className?: string;
}

export interface ShellHeaderProps {
  onOpenThreads: () => void;
  onNewDiscussion: () => void;
  onToggleWhisper: () => void;
  whisperOpen: boolean;
  onOpenSearch?: () => void;
}

export interface WhisperRailProps {
  suggestions: WhisperSuggestion[];
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (suggestion: WhisperSuggestion) => void;
  contextLabel: string;
  className?: string;
}
