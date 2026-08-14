import { useCallback, useEffect, useState } from 'react';
import { projectsAPI } from '@/api/projects_api';
import { logger } from '@/utils/browser_logger';
import type { DockProject } from './home_shell_types';

export interface DockProjectsState {
  projects: DockProject[];
  refresh: () => Promise<void>;
}

/**
 * The projects the dock groups threads under.
 *
 * Only id and name are kept: the dock renders a folder row, and holding the full
 * project entity here would make every unrelated project edit re-render the
 * whole thread list.
 *
 * Like useAgentChatThreads, a failure yields an EMPTY list rather than a stale or
 * fabricated one — threads whose project is missing fall back to the loose
 * section, so a failed load degrades to a flat dock instead of hiding
 * conversations.
 */
export function useDockProjects(enabled: boolean): DockProjectsState {
  const [projects, setProjects] = useState<DockProject[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    try {
      const list = await projectsAPI.list();
      setProjects(
        (Array.isArray(list) ? list : [])
          .filter((project) => typeof project?.id === 'string')
          .map((project) => ({
            id: project.id,
            name: project.name?.trim() || 'Untitled project',
          }))
      );
    } catch (error) {
      logger.warn('[HomeShell] projects unavailable', error);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { projects, refresh };
}
