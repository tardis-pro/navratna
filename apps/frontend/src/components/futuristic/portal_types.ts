import React from 'react';

export interface PortalConfig extends Omit<PortalProps, 'children'> {
  component: React.ComponentType<unknown>;
  props?: unknown;
}

export interface PortalProps {
  id: string;
  type: string;
  title: string;
  children?: React.ReactNode;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  zIndex?: number;
  onClose?: () => void;
  onMaximize?: () => void;
  onMinimize?: () => void;
  onFocus?: () => void;
  className?: string;
}
