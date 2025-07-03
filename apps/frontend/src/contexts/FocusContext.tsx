import React, { createContext, useContext } from 'react';
import { useFocusManager } from '../hooks/useFocusManager';
import { FocusPreview } from '../components/FocusPreview';

interface FocusContextType {
  focusedElement: any;
  hoverState: any;
  registerElement: (element: any) => () => void;
  unregisterElement: (elementId: string) => void;
  focusElement: (elementId: string) => void;
  closePreview: () => void;
  getPreviewData: () => any;
  isFocused: (elementId: string) => boolean;
  isHovered: (elementId: string) => boolean;
  isPreviewVisible: boolean;
  previewPosition: { x: number; y: number } | null;
}

const FocusContext = createContext<FocusContextType | null>(null);

export const useFocus = () => {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocus must be used within a FocusProvider');
  }
  return context;
};

interface FocusProviderProps {
  children: React.ReactNode;
}

export const FocusProvider: React.FC<FocusProviderProps> = ({ children }) => {
  const focusManager = useFocusManager();
  const previewData = focusManager.getPreviewData();

  return (
    <FocusContext.Provider value={focusManager}>
      {children}
      
      {/* Global preview overlay */}
      <FocusPreview
        isVisible={focusManager.isPreviewVisible}
        position={focusManager.previewPosition}
        data={previewData}
        onClose={focusManager.closePreview}
      />
    </FocusContext.Provider>
  );
};