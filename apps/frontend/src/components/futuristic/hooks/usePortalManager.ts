import { useState, useCallback, useEffect } from 'react';

type PortalType = 
  | 'agent-hub' 
  | 'discussion-hub' 
  | 'intelligence-hub' 
  | 'system-hub' 
  | 'chat' 
  | 'knowledge' 
  | 'monitoring-hub' 
  | 'tools' 
  | 'tool-management' 
  | 'provider' 
  | 'marketplace-hub' 
  | 'security-hub'
  | 'dashboard'
  | 'artifacts'
  | 'search'
  | 'tasks'
  | 'create'
  | 'mini-browser';

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

export const usePortalManager = () => {
  const [state, setState] = useState<PortalManagerState>({
    portals: {},
    activePortalId: null,
    nextZIndex: 100
  });

  // Generate unique portal ID
  const generatePortalId = useCallback((type: PortalType) => {
    return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Open a portal
  const openPortal = useCallback((type: PortalType, options?: {
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    bringToFront?: boolean;
  }) => {
    setState(prevState => {
      // Check if portal of this type is already open
      const existingPortal = Object.values(prevState.portals).find(portal => 
        portal.type === type && portal.isOpen
      );

      if (existingPortal) {
        // Bring existing portal to front and activate it
        const updatedPortals = {
          ...prevState.portals,
          [existingPortal.id]: {
            ...existingPortal,
            isMinimized: false,
            zIndex: prevState.nextZIndex,
            lastActive: new Date()
          }
        };

        return {
          ...prevState,
          portals: updatedPortals,
          activePortalId: existingPortal.id,
          nextZIndex: prevState.nextZIndex + 1
        };
      }

      // Create new portal
      const portalId = generatePortalId(type);
      const defaultPosition = {
        x: Math.random() * 300 + 100,
        y: Math.random() * 200 + 100
      };
      const defaultSize = {
        width: 800,
        height: 600
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
        lastActive: new Date()
      };

      return {
        ...prevState,
        portals: {
          ...prevState.portals,
          [portalId]: newPortal
        },
        activePortalId: portalId,
        nextZIndex: prevState.nextZIndex + 1
      };
    });
  }, [generatePortalId]);

  // Close a portal
  const closePortal = useCallback((portalId: string) => {
    setState(prevState => {
      const { [portalId]: removedPortal, ...remainingPortals } = prevState.portals;
      
      // If closing the active portal, find the next most recently active portal
      let newActivePortalId = prevState.activePortalId;
      if (prevState.activePortalId === portalId) {
        const sortedPortals = Object.values(remainingPortals)
          .filter(portal => portal.isOpen && !portal.isMinimized)
          .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
        
        newActivePortalId = sortedPortals.length > 0 ? sortedPortals[0].id : null;
      }

      return {
        ...prevState,
        portals: remainingPortals,
        activePortalId: newActivePortalId
      };
    });
  }, []);

  // Minimize a portal
  const minimizePortal = useCallback((portalId: string) => {
    setState(prevState => {
      const portal = prevState.portals[portalId];
      if (!portal) return prevState;

      const updatedPortals = {
        ...prevState.portals,
        [portalId]: {
          ...portal,
          isMinimized: true,
          isMaximized: false
        }
      };

      // If minimizing the active portal, find the next active one
      let newActivePortalId = prevState.activePortalId;
      if (prevState.activePortalId === portalId) {
        const sortedPortals = Object.values(updatedPortals)
          .filter(p => p.isOpen && !p.isMinimized)
          .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
        
        newActivePortalId = sortedPortals.length > 0 ? sortedPortals[0].id : null;
      }

      return {
        ...prevState,
        portals: updatedPortals,
        activePortalId: newActivePortalId
      };
    });
  }, []);

  // Maximize a portal
  const maximizePortal = useCallback((portalId: string) => {
    setState(prevState => {
      const portal = prevState.portals[portalId];
      if (!portal) return prevState;

      return {
        ...prevState,
        portals: {
          ...prevState.portals,
          [portalId]: {
            ...portal,
            isMaximized: !portal.isMaximized,
            isMinimized: false,
            zIndex: prevState.nextZIndex,
            lastActive: new Date()
          }
        },
        activePortalId: portalId,
        nextZIndex: prevState.nextZIndex + 1
      };
    });
  }, []);

  // Restore a minimized portal
  const restorePortal = useCallback((portalId: string) => {
    setState(prevState => {
      const portal = prevState.portals[portalId];
      if (!portal) return prevState;

      return {
        ...prevState,
        portals: {
          ...prevState.portals,
          [portalId]: {
            ...portal,
            isMinimized: false,
            zIndex: prevState.nextZIndex,
            lastActive: new Date()
          }
        },
        activePortalId: portalId,
        nextZIndex: prevState.nextZIndex + 1
      };
    });
  }, []);

  // Bring portal to front
  const bringToFront = useCallback((portalId: string) => {
    setState(prevState => {
      const portal = prevState.portals[portalId];
      if (!portal) return prevState;

      return {
        ...prevState,
        portals: {
          ...prevState.portals,
          [portalId]: {
            ...portal,
            zIndex: prevState.nextZIndex,
            lastActive: new Date()
          }
        },
        activePortalId: portalId,
        nextZIndex: prevState.nextZIndex + 1
      };
    });
  }, []);

  // Update portal position
  const updatePortalPosition = useCallback((portalId: string, position: { x: number; y: number }) => {
    setState(prevState => {
      const portal = prevState.portals[portalId];
      if (!portal) return prevState;

      return {
        ...prevState,
        portals: {
          ...prevState.portals,
          [portalId]: {
            ...portal,
            position,
            lastActive: new Date()
          }
        }
      };
    });
  }, []);

  // Update portal size
  const updatePortalSize = useCallback((portalId: string, size: { width: number; height: number }) => {
    setState(prevState => {
      const portal = prevState.portals[portalId];
      if (!portal) return prevState;

      return {
        ...prevState,
        portals: {
          ...prevState.portals,
          [portalId]: {
            ...portal,
            size,
            lastActive: new Date()
          }
        }
      };
    });
  }, []);

  // Check if a portal type is open
  const isPortalOpen = useCallback((type: PortalType) => {
    return Object.values(state.portals).some(portal => 
      portal.type === type && portal.isOpen
    );
  }, [state.portals]);

  // Get portal by ID
  const getPortal = useCallback((portalId: string) => {
    return state.portals[portalId] || null;
  }, [state.portals]);

  // Get portals by type
  const getPortalsByType = useCallback((type: PortalType) => {
    return Object.values(state.portals).filter(portal => portal.type === type);
  }, [state.portals]);

  // Get all open portals
  const getOpenPortals = useCallback(() => {
    return Object.values(state.portals).filter(portal => portal.isOpen);
  }, [state.portals]);

  // Get minimized portals
  const getMinimizedPortals = useCallback(() => {
    return Object.values(state.portals).filter(portal => portal.isMinimized);
  }, [state.portals]);

  // Close all portals
  const closeAllPortals = useCallback(() => {
    setState(prevState => ({
      ...prevState,
      portals: {},
      activePortalId: null
    }));
  }, []);

  // Minimize all portals
  const minimizeAllPortals = useCallback(() => {
    setState(prevState => {
      const updatedPortals = Object.fromEntries(
        Object.entries(prevState.portals).map(([id, portal]) => [
          id,
          { ...portal, isMinimized: true, isMaximized: false }
        ])
      );

      return {
        ...prevState,
        portals: updatedPortals,
        activePortalId: null
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
    minimizeAllPortals
  };
};
