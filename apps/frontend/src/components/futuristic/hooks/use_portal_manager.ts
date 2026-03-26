import { useState, useCallback } from 'react';

type PortalType =
  | 'agent-hub'
  | 'discussion-hub'
  | 'intelligence-hub'
  | 'system-hub'
  | 'chat'
  | 'user-chat'
  | 'knowledge'
  | 'monitoring-hub'
  | 'tools'
  | 'tool-management'
  | 'provider'
  | 'marketplace-hub'
  | 'security-hub'
  | 'system-admin'
  | 'dashboard'
  | 'artifacts'
  | 'search'
  | 'tasks'
  | 'create'
  | 'create-anything'
  | 'mini-browser'
  | 'documents'
  | 'database-admin'
  | 'system-console'
  | 'system-monitoring'
  | 'user-management'
  | 'api-management';

interface PortalState {
  id: string;
  type: PortalType;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  lastActive: Date;
}

interface PortalManagerState {
  portals: Record<string, PortalState>;
  activePortalId: string | null;
  nextZIndex: number;
}

function findNextActivePortal(
  portals: Record<string, PortalState>,
  excludeId: string
): string | null {
  const sorted = Object.values(portals)
    .filter((p) => p.isOpen && !p.isMinimized && p.id !== excludeId)
    .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
  return sorted.length > 0 ? sorted[0].id : null;
}

function updatePortalState(
  prevState: PortalManagerState,
  portalId: string,
  updates: Partial<PortalState>,
  activate = false
): PortalManagerState {
  const portal = prevState.portals[portalId];
  if (!portal) return prevState;
  return {
    ...prevState,
    portals: {
      ...prevState.portals,
      [portalId]: {
        ...portal,
        lastActive: new Date(),
        ...updates,
        ...(activate ? { zIndex: prevState.nextZIndex } : {}),
      },
    },
    ...(activate ? { activePortalId: portalId, nextZIndex: prevState.nextZIndex + 1 } : {}),
  };
}

export const usePortalManager = () => {
  const [state, setState] = useState<PortalManagerState>({
    portals: {},
    activePortalId: null,
    nextZIndex: 100,
  });

  // Generate unique portal ID
  const generatePortalId = useCallback((type: PortalType) => {
    return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Open a portal
  const openPortal = useCallback(
    (
      type: PortalType,
      options?: {
        position?: { x: number; y: number };
        size?: { width: number; height: number };
        bringToFront?: boolean;
      }
    ) => {
      setState((prevState) => {
        // Check if portal of this type is already open
        const existingPortal = Object.values(prevState.portals).find(
          (portal) => portal.type === type && portal.isOpen
        );

        if (existingPortal) {
          return updatePortalState(prevState, existingPortal.id, { isMinimized: false }, true);
        }

        // Create new portal
        const portalId = generatePortalId(type);
        const defaultPosition = {
          x: Math.random() * 300 + 100,
          y: Math.random() * 200 + 100,
        };
        const defaultSize = {
          width: 800,
          height: 600,
        };

        const newPortal: PortalState = {
          id: portalId,
          type,
          isOpen: true,
          isMinimized: false,
          isMaximized: false,
          position: options?.position || defaultPosition,
          size: options?.size || defaultSize,
          zIndex: prevState.nextZIndex,
          lastActive: new Date(),
        };

        return {
          ...prevState,
          portals: {
            ...prevState.portals,
            [portalId]: newPortal,
          },
          activePortalId: portalId,
          nextZIndex: prevState.nextZIndex + 1,
        };
      });
    },
    [generatePortalId]
  );

  const closePortal = useCallback((portalId: string) => {
    setState((prevState) => {
      const { [portalId]: _removedPortal, ...remainingPortals } = prevState.portals;
      const newActivePortalId =
        prevState.activePortalId === portalId
          ? findNextActivePortal(remainingPortals, portalId)
          : prevState.activePortalId;
      return { ...prevState, portals: remainingPortals, activePortalId: newActivePortalId };
    });
  }, []);

  const minimizePortal = useCallback((portalId: string) => {
    setState((prevState) => {
      const patched = updatePortalState(prevState, portalId, { isMinimized: true, isMaximized: false });
      const newActivePortalId =
        prevState.activePortalId === portalId
          ? findNextActivePortal(patched.portals, portalId)
          : prevState.activePortalId;
      return { ...patched, activePortalId: newActivePortalId };
    });
  }, []);

  const maximizePortal = useCallback((portalId: string) => {
    setState((prevState) => {
      const portal = prevState.portals[portalId];
      return updatePortalState(prevState, portalId, {
        isMaximized: !portal?.isMaximized,
        isMinimized: false,
      }, true);
    });
  }, []);

  const restorePortal = useCallback((portalId: string) => {
    setState((prevState) => updatePortalState(prevState, portalId, { isMinimized: false }, true));
  }, []);

  const bringToFront = useCallback((portalId: string) => {
    setState((prevState) => updatePortalState(prevState, portalId, {}, true));
  }, []);

  const updatePortalPosition = useCallback(
    (portalId: string, position: { x: number; y: number }) => {
      setState((prevState) => updatePortalState(prevState, portalId, { position }));
    },
    []
  );

  const updatePortalSize = useCallback(
    (portalId: string, size: { width: number; height: number }) => {
      setState((prevState) => updatePortalState(prevState, portalId, { size }));
    },
    []
  );

  // Check if a portal type is open
  const isPortalOpen = useCallback(
    (type: PortalType) => {
      return Object.values(state.portals).some((portal) => portal.type === type && portal.isOpen);
    },
    [state.portals]
  );

  // Get portal by ID
  const getPortal = useCallback(
    (portalId: string) => {
      return state.portals[portalId] || null;
    },
    [state.portals]
  );

  // Get portals by type
  const getPortalsByType = useCallback(
    (type: PortalType) => {
      return Object.values(state.portals).filter((portal) => portal.type === type);
    },
    [state.portals]
  );

  // Get all open portals
  const getOpenPortals = useCallback(() => {
    return Object.values(state.portals).filter((portal) => portal.isOpen);
  }, [state.portals]);

  // Get minimized portals
  const getMinimizedPortals = useCallback(() => {
    return Object.values(state.portals).filter((portal) => portal.isMinimized);
  }, [state.portals]);

  // Close all portals
  const closeAllPortals = useCallback(() => {
    setState((prevState) => ({
      ...prevState,
      portals: {},
      activePortalId: null,
    }));
  }, []);

  // Minimize all portals
  const minimizeAllPortals = useCallback(() => {
    setState((prevState) => {
      const updatedPortals = Object.fromEntries(
        Object.entries(prevState.portals).map(([id, portal]) => [
          id,
          { ...portal, isMinimized: true, isMaximized: false },
        ])
      );

      return {
        ...prevState,
        portals: updatedPortals,
        activePortalId: null,
      };
    });
  }, []);

  return {
    // State
    portals: state.portals,
    activePortalId: state.activePortalId,

    // Portal management
    openPortal,
    closePortal,
    minimizePortal,
    maximizePortal,
    restorePortal,
    bringToFront,

    // Portal updates
    updatePortalPosition,
    updatePortalSize,

    // Queries
    isPortalOpen,
    getPortal,
    getPortalsByType,
    getOpenPortals,
    getMinimizedPortals,

    // Bulk operations
    closeAllPortals,
    minimizeAllPortals,
  };
};
