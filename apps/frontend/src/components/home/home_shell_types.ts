import type { MouseEvent } from 'react';
import type { Thread } from '@uaip/types';

export interface HomeSuggestion {
  title: string;
  description: string;
  agentId: string;
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
}

export interface ThreadDockProps {
  threads: Thread[];
  selectedAgentId: string | null;
  onNewDiscussion: () => void;
  onSelectThread: (thread: Thread, event: MouseEvent<HTMLButtonElement>) => void;
}
