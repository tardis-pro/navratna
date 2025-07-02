import { useState, useCallback, useRef } from 'react';

interface DragItem {
  id: string;
  type: string;
  data: any;
}

interface DropZone {
  id: string;
  accepts: string[];
  onDrop: (item: DragItem, position?: { x: number; y: number }) => void;
}

interface DragState {
  isDragging: boolean;
  dragItem: DragItem | null;
  dragOffset: { x: number; y: number };
  dropZones: Record<string, DropZone>;
  hoveredDropZone: string | null;
}

export const useDragAndDrop = () => {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragItem: null,
    dragOffset: { x: 0, y: 0 },
    dropZones: {},
    hoveredDropZone: null
  });

  const dragStartPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Register a drop zone
  const registerDropZone = useCallback((dropZone: DropZone) => {
    setDragState(prev => ({
      ...prev,
      dropZones: {
        ...prev.dropZones,
        [dropZone.id]: dropZone
      }
    }));
  }, []);

  // Unregister a drop zone
  const unregisterDropZone = useCallback((dropZoneId: string) => {
    setDragState(prev => {
      const { [dropZoneId]: removed, ...remainingDropZones } = prev.dropZones;
      return {
        ...prev,
        dropZones: remainingDropZones
      };
    });
  }, []);

  // Start dragging an item
  const startDrag = useCallback((
    item: DragItem, 
    event: React.MouseEvent | React.TouchEvent,
    options?: { 
      dragImage?: HTMLElement;
      offset?: { x: number; y: number };
    }
  ) => {
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    dragStartPosition.current = { x: clientX, y: clientY };

    setDragState(prev => ({
      ...prev,
      isDragging: true,
      dragItem: item,
      dragOffset: options?.offset || { x: 0, y: 0 }
    }));

    // Prevent default drag behavior
    event.preventDefault();
  }, []);

  // Update drag position
  const updateDragPosition = useCallback((
    event: React.MouseEvent | React.TouchEvent
  ) => {
    if (!dragState.isDragging) return;

    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    // Check if we're over a drop zone
    const elementUnderCursor = document.elementFromPoint(clientX, clientY);
    let hoveredDropZone: string | null = null;

    if (elementUnderCursor) {
      // Find the closest drop zone
      let element = elementUnderCursor;
      while (element && element !== document.body) {
        const dropZoneId = element.getAttribute('data-drop-zone-id');
        if (dropZoneId && dragState.dropZones[dropZoneId]) {
          const dropZone = dragState.dropZones[dropZoneId];
          if (dragState.dragItem && dropZone.accepts.includes(dragState.dragItem.type)) {
            hoveredDropZone = dropZoneId;
            break;
          }
        }
        element = element.parentElement;
      }
    }

    setDragState(prev => ({
      ...prev,
      hoveredDropZone
    }));
  }, [dragState.isDragging, dragState.dropZones, dragState.dragItem]);

  // End drag operation
  const endDrag = useCallback((
    event: React.MouseEvent | React.TouchEvent
  ) => {
    if (!dragState.isDragging || !dragState.dragItem) return;

    const clientX = 'touches' in event ? event.changedTouches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.changedTouches[0].clientY : event.clientY;

    // Check if we're dropping on a valid drop zone
    if (dragState.hoveredDropZone) {
      const dropZone = dragState.dropZones[dragState.hoveredDropZone];
      if (dropZone && dropZone.accepts.includes(dragState.dragItem.type)) {
        dropZone.onDrop(dragState.dragItem, { x: clientX, y: clientY });
      }
    }

    setDragState(prev => ({
      ...prev,
      isDragging: false,
      dragItem: null,
      dragOffset: { x: 0, y: 0 },
      hoveredDropZone: null
    }));
  }, [dragState.isDragging, dragState.dragItem, dragState.hoveredDropZone, dragState.dropZones]);

  // Cancel drag operation
  const cancelDrag = useCallback(() => {
    setDragState(prev => ({
      ...prev,
      isDragging: false,
      dragItem: null,
      dragOffset: { x: 0, y: 0 },
      hoveredDropZone: null
    }));
  }, []);

  // Get drag handlers for a draggable element
  const getDragHandlers = useCallback((
    item: DragItem,
    options?: { 
      dragImage?: HTMLElement;
      offset?: { x: number; y: number };
    }
  ) => ({
    onMouseDown: (event: React.MouseEvent) => {
      startDrag(item, event, options);
    },
    onTouchStart: (event: React.TouchEvent) => {
      startDrag(item, event, options);
    }
  }), [startDrag]);

  // Get drop zone handlers
  const getDropZoneHandlers = useCallback((dropZone: DropZone) => ({
    'data-drop-zone-id': dropZone.id,
    onMouseEnter: () => {
      if (dragState.isDragging && dragState.dragItem && 
          dropZone.accepts.includes(dragState.dragItem.type)) {
        setDragState(prev => ({
          ...prev,
          hoveredDropZone: dropZone.id
        }));
      }
    },
    onMouseLeave: () => {
      setDragState(prev => ({
        ...prev,
        hoveredDropZone: prev.hoveredDropZone === dropZone.id ? null : prev.hoveredDropZone
      }));
    }
  }), [dragState.isDragging, dragState.dragItem]);

  // Global mouse/touch handlers (should be attached to document or window)
  const getGlobalHandlers = useCallback(() => ({
    onMouseMove: updateDragPosition,
    onMouseUp: endDrag,
    onTouchMove: updateDragPosition,
    onTouchEnd: endDrag,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragState.isDragging) {
        cancelDrag();
      }
    }
  }), [updateDragPosition, endDrag, cancelDrag, dragState.isDragging]);

  // Check if an item can be dropped in a zone
  const canDrop = useCallback((
    item: DragItem,
    dropZoneId: string
  ): boolean => {
    const dropZone = dragState.dropZones[dropZoneId];
    return dropZone ? dropZone.accepts.includes(item.type) : false;
  }, [dragState.dropZones]);

  // Get visual feedback for drag state
  const getDragFeedback = useCallback(() => {
    if (!dragState.isDragging || !dragState.dragItem) {
      return null;
    }

    return {
      item: dragState.dragItem,
      isValidDrop: dragState.hoveredDropZone !== null,
      hoveredDropZone: dragState.hoveredDropZone
    };
  }, [dragState.isDragging, dragState.dragItem, dragState.hoveredDropZone]);

  return {
    // State
    isDragging: dragState.isDragging,
    dragItem: dragState.dragItem,
    hoveredDropZone: dragState.hoveredDropZone,

    // Drop zone management
    registerDropZone,
    unregisterDropZone,

    // Drag operations
    startDrag,
    endDrag,
    cancelDrag,

    // Handlers
    getDragHandlers,
    getDropZoneHandlers,
    getGlobalHandlers,

    // Utilities
    canDrop,
    getDragFeedback
  };
};

// Hook for managing icon positions with drag and drop
export const useIconDragDrop = (
  initialPositions: Record<string, { x: number; y: number }> = {},
  onPositionChange?: (iconId: string, position: { x: number; y: number }) => void
) => {
  const [iconPositions, setIconPositions] = useState(initialPositions);
  const dragAndDrop = useDragAndDrop();

  // Update icon position
  const updateIconPosition = useCallback((
    iconId: string,
    position: { x: number; y: number }
  ) => {
    setIconPositions(prev => ({
      ...prev,
      [iconId]: position
    }));
    onPositionChange?.(iconId, position);
  }, [onPositionChange]);

  // Get position for an icon
  const getIconPosition = useCallback((iconId: string) => {
    return iconPositions[iconId] || { x: 0, y: 0 };
  }, [iconPositions]);

  // Create drag handlers for an icon
  const getIconDragHandlers = useCallback((iconId: string, iconData: any) => {
    return dragAndDrop.getDragHandlers({
      id: iconId,
      type: 'desktop-icon',
      data: iconData
    });
  }, [dragAndDrop]);

  // Create drop zone for the desktop grid
  const createDesktopDropZone = useCallback((
    gridElement: HTMLElement,
    gridConfig: { columns: number; iconSize: number; gap: number }
  ) => {
    const dropZone = {
      id: 'desktop-grid',
      accepts: ['desktop-icon'],
      onDrop: (item: DragItem, position?: { x: number; y: number }) => {
        if (position && gridElement) {
          const rect = gridElement.getBoundingClientRect();
          const relativeX = position.x - rect.left;
          const relativeY = position.y - rect.top;

          // Calculate grid position
          const cellWidth = (rect.width / gridConfig.columns);
          const cellHeight = gridConfig.iconSize + gridConfig.gap;

          const gridX = Math.floor(relativeX / cellWidth);
          const gridY = Math.floor(relativeY / cellHeight);

          // Convert back to pixel position
          const pixelX = gridX * cellWidth;
          const pixelY = gridY * cellHeight;

          updateIconPosition(item.id, { x: pixelX, y: pixelY });
        }
      }
    };

    dragAndDrop.registerDropZone(dropZone);
    return dropZone;
  }, [dragAndDrop, updateIconPosition]);

  return {
    ...dragAndDrop,
    iconPositions,
    updateIconPosition,
    getIconPosition,
    getIconDragHandlers,
    createDesktopDropZone
  };
};
