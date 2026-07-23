import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { buildDynamicBlocks, createInitialBlocks } from './dynamic_block_registry';
import { useTelescopeSurface } from './TelescopeSurface';
import type { UseTelescopeSurfaceReturn } from './TelescopeSurface';
import { logger } from '@/utils/browser_logger';

const DYNAMIC_REFRESH_MS = 30_000;

interface ExploreSurfaceProviderProps {
  children: ReactNode;
}

interface ExploreSurfaceContextValue {
  surface: UseTelescopeSurfaceReturn;
}

const ExploreSurfaceContext = createContext<ExploreSurfaceContextValue | null>(null);

export function ExploreSurfaceProvider({ children }: ExploreSurfaceProviderProps) {
  const initialBlocks = useMemo(() => createInitialBlocks(), []);
  const surface = useTelescopeSurface(initialBlocks);
  const { mergeBlocks } = surface;

  useEffect(() => {
    let cancelled = false;

    const refresh = async (): Promise<void> => {
      try {
        const dynamicBlocks = await buildDynamicBlocks();
        if (!cancelled) mergeBlocks(dynamicBlocks);
      } catch (error) {
        logger.warn('[ExploreSurface] dynamic refresh failed; keeping warm state', error);
      }
    };

    void refresh();
    const interval = window.setInterval((): void => {
      void refresh();
    }, DYNAMIC_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mergeBlocks]);

  const value = useMemo<ExploreSurfaceContextValue>(() => ({ surface }), [surface]);

  return (
    <ExploreSurfaceContext.Provider value={value}>
      {children}
    </ExploreSurfaceContext.Provider>
  );
}

export function useExploreSurface(): ExploreSurfaceContextValue {
  const context = useContext(ExploreSurfaceContext);
  if (!context) {
    throw new Error('useExploreSurface must be used within ExploreSurfaceProvider');
  }
  return context;
}
