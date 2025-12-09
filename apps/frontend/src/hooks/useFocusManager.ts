import { useState, useEffect, useRef, useCallback } from 'react';

interface FocusableElement {
  id: string;
  type: 'chat-window' | 'portal' | 'button' | 'input' | 'dropdown';
  element: HTMLElement;
  data?: any;
  preview?: {
    title: string;
    content: string;
    metadata?: Record<string, any>;
  };
}

interface HoverState {
  elementId: string | null;
  startTime: number | null;
  isPreviewVisible: boolean;
  previewPosition: { x: number; y: number } | null;
}

export const useFocusManager = () => {
  const [focusedElement, setFocusedElement] = useState<FocusableElement | null>(null);
  const [hoverState, setHoverState] = useState<HoverState>({
    elementId: null,
    startTime: null,
    isPreviewVisible: false,
    previewPosition: null,
  });

  const focusableElements = useRef<Map<string, FocusableElement>>(new Map());
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Register a focusable element
  const registerElement = useCallback((element: FocusableElement) => {
    focusableElements.current.set(element.id, element);

    // Add click listener for focus
    const handleClick = (e: Event) => {
      e.stopPropagation();
      setFocusedElement(element);
    };

    // Add hover listeners for preview
    const handleMouseEnter = (e: MouseEvent) => {
      const rect = element.element.getBoundingClientRect();
      setHoverState({
        elementId: element.id,
        startTime: Date.now(),
        isPreviewVisible: false,
        previewPosition: {
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        },
      });

      // Clear any existing timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }

      // Set timeout for preview (10 seconds)
      hoverTimeoutRef.current = setTimeout(() => {
        setHoverState((prev) => ({
          ...prev,
          isPreviewVisible: true,
        }));
      }, 10000);
    };

    const handleMouseLeave = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }

      setHoverState({
        elementId: null,
        startTime: null,
        isPreviewVisible: false,
        previewPosition: null,
      });
    };

    element.element.addEventListener('click', handleClick);
    element.element.addEventListener('mouseenter', handleMouseEnter);
    element.element.addEventListener('mouseleave', handleMouseLeave);

    // Return cleanup function
    return () => {
      element.element.removeEventListener('click', handleClick);
      element.element.removeEventListener('mouseenter', handleMouseEnter);
      element.element.removeEventListener('mouseleave', handleMouseLeave);
      focusableElements.current.delete(element.id);
    };
  }, []);

  // Unregister element
  const unregisterElement = useCallback(
    (elementId: string) => {
      focusableElements.current.delete(elementId);
      if (focusedElement?.id === elementId) {
        setFocusedElement(null);
      }
      if (hoverState.elementId === elementId) {
        setHoverState({
          elementId: null,
          startTime: null,
          isPreviewVisible: false,
          previewPosition: null,
        });
      }
    },
    [focusedElement?.id, hoverState.elementId]
  );

  // Focus specific element programmatically
  const focusElement = useCallback((elementId: string) => {
    const element = focusableElements.current.get(elementId);
    if (element) {
      setFocusedElement(element);
      // Scroll into view if needed
      element.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  // Close preview
  const closePreview = useCallback(() => {
    setHoverState((prev) => ({
      ...prev,
      isPreviewVisible: false,
    }));

    // Auto-close preview after 5 seconds
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }
    previewTimeoutRef.current = setTimeout(() => {
      setHoverState({
        elementId: null,
        startTime: null,
        isPreviewVisible: false,
        previewPosition: null,
      });
    }, 5000);
  }, []);

  // Get preview data for current hovered element
  const getPreviewData = useCallback(() => {
    if (!hoverState.elementId || !hoverState.isPreviewVisible) return null;

    const element = focusableElements.current.get(hoverState.elementId);
    return element?.preview || null;
  }, [hoverState.elementId, hoverState.isPreviewVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, []);

  return {
    focusedElement,
    hoverState,
    registerElement,
    unregisterElement,
    focusElement,
    closePreview,
    getPreviewData,
    isFocused: (elementId: string) => focusedElement?.id === elementId,
    isHovered: (elementId: string) => hoverState.elementId === elementId,
    isPreviewVisible: hoverState.isPreviewVisible,
    previewPosition: hoverState.previewPosition,
  };
};
