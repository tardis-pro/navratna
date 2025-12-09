import React, { useState, useEffect } from 'react';
import { DesktopWorkspace } from './DesktopWorkspace';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export const SimpleWorkspace: React.FC = () => {
  const [viewport, setViewport] = useState<ViewportSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: false,
    isTablet: false,
    isDesktop: true,
  });

  // Update viewport on resize
  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewport({
        width,
        height,
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
      });
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Simple portal handler - just logs for now
  const handleOpenPortal = (type: string) => {
    console.log(`Opening ${type} - Portal system removed for simplicity`);
    // TODO: Implement simple modal or navigation instead of complex portals
  };

  const isPortalOpen = (type: string) => false; // No portals = none are open

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <DesktopWorkspace
        onOpenPortal={handleOpenPortal}
        isPortalOpen={isPortalOpen}
        portals={[]}
        viewport={viewport}
      />
    </div>
  );
};
