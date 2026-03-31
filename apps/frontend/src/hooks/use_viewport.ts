export interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export function getDefaultViewport(): ViewportSize {
  if (typeof window === 'undefined') {
    return { width: 1024, height: 768, isMobile: false, isTablet: false, isDesktop: true };
  }
  const w = window.innerWidth;
  return {
    width: w,
    height: window.innerHeight,
    isMobile: w < 768,
    isTablet: w >= 768 && w < 1024,
    isDesktop: w >= 1024,
  };
}

export function useViewport(viewport?: ViewportSize): ViewportSize {
  return viewport ?? getDefaultViewport();
}
