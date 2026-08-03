import { useCallback, useEffect, useState } from 'react';
import type { AgentChatThreadSummary } from '@uaip/types';
import { uaipAPI } from '@/utils/uaip_api';
import { logger } from '@/utils/browser_logger';

export interface AgentChatThreadsState {
  threads: AgentChatThreadSummary[];
  refresh: () => Promise<void>;
  rename: (conversationId: string, title: string) => Promise<void>;
  archive: (conversationId: string) => Promise<void>;
}

/**
 * Threads are the user's own, so this must never fall back to a shared or
 * fabricated list: an error yields an empty dock rather than someone else's
 * conversations.
 */
export function useAgentChatThreads(enabled: boolean): AgentChatThreadsState {
  const [threads, setThreads] = useState<AgentChatThreadSummary[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await uaipAPI.agents.listChatThreads();
      setThreads(Array.isArray(response?.threads) ? response.threads : []);
    } catch (error) {
      logger.warn('[HomeShell] agent chat threads unavailable', error);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rename = useCallback(
    async (conversationId: string, title: string) => {
      const trimmed = title.trim();
      if (trimmed === '') return;

      // Optimistic: the dock is the only place a title is visible, so waiting for
      // the round trip would make a rename feel like it did nothing.
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === conversationId ? { ...thread, title: trimmed } : thread
        )
      );

      try {
        await uaipAPI.agents.updateChatThread(conversationId, { title: trimmed });
      } catch (error) {
        logger.error('[HomeShell] failed to rename the thread', error);
        await refresh();
      }
    },
    [refresh]
  );

  const archive = useCallback(
    async (conversationId: string) => {
      const previous = threads;
      setThreads((prev) => prev.filter((thread) => thread.id !== conversationId));

      try {
        await uaipAPI.agents.updateChatThread(conversationId, { archived: true });
      } catch (error) {
        logger.error('[HomeShell] failed to archive the thread', error);
        setThreads(previous);
      }
    },
    [threads]
  );

  return { threads, refresh, rename, archive };
}
