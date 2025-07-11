import { useState, useEffect, useCallback } from 'react';
import WallpaperService, { WallpaperImage, WallpaperTheme, WallpaperPreferences } from '../services/WallpaperService';

export interface UseWallpaperReturn {
  currentImage: WallpaperImage | null;
  currentTheme: WallpaperTheme | null;
  availableThemes: WallpaperTheme[];
  preferences: WallpaperPreferences;
  isLoading: boolean;
  
  // Actions
  setTheme: (theme: WallpaperTheme) => void;
  setImage: (imageId: string) => void;
  nextImage: () => void;
  previousImage: () => void;
  toggleSlideshow: () => void;
  setSlideshowInterval: (seconds: number) => void;
  updatePreferences: (updates: Partial<WallpaperPreferences>) => void;
  
  // Utilities
  getOptimizedImageUrl: (image: WallpaperImage, width?: number, height?: number) => string;
  getCurrentImageUrl: (width?: number, height?: number) => string;
}

export const useWallpaper = (): UseWallpaperReturn => {
  const [wallpaperService] = useState(() => WallpaperService.getInstance());
  const [currentImage, setCurrentImage] = useState<WallpaperImage | null>(null);
  const [currentTheme, setCurrentTheme] = useState<WallpaperTheme | null>(null);
  const [availableThemes, setAvailableThemes] = useState<WallpaperTheme[]>([]);
  const [preferences, setPreferences] = useState<WallpaperPreferences>({
    currentTheme: 'space',
    slideshowEnabled: true,
    intervalSeconds: 300,
    randomOrder: false,
    locationBased: false,
    quality: 'high'
  });
  const [isLoading, setIsLoading] = useState(true);

  // Initialize wallpaper service and state
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        
        // Get available themes
        const themes = wallpaperService.getAvailableThemes();
        setAvailableThemes(themes);
        
        // Get current theme and image
        const theme = wallpaperService.getCurrentTheme();
        const image = wallpaperService.getCurrentImage();
        const prefs = wallpaperService.getPreferences();
        
        setCurrentTheme(theme);
        setCurrentImage(image);
        setPreferences(prefs);
        
        // Set up change listener
        const handleImageChange = (newImage: WallpaperImage) => {
          setCurrentImage(newImage);
          setCurrentTheme(wallpaperService.getCurrentTheme());
        };
        
        wallpaperService.addChangeListener(handleImageChange);
        
        // Cleanup function
        return () => {
          wallpaperService.removeChangeListener(handleImageChange);
        };
      } catch (error) {
        console.error('Failed to initialize wallpaper service:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const cleanup = initialize();
    return () => {
      cleanup?.then(cleanupFn => cleanupFn?.());
    };
  }, [wallpaperService]);

  // Actions
  const setTheme = useCallback((theme: WallpaperTheme) => {
    wallpaperService.setTheme(theme);
    setCurrentTheme(theme);
    setCurrentImage(wallpaperService.getCurrentImage());
    setPreferences(wallpaperService.getPreferences());
  }, [wallpaperService]);

  const setImage = useCallback((imageId: string) => {
    wallpaperService.setImage(imageId);
    setCurrentImage(wallpaperService.getCurrentImage());
  }, [wallpaperService]);

  const nextImage = useCallback(() => {
    wallpaperService.nextImage();
    setCurrentImage(wallpaperService.getCurrentImage());
  }, [wallpaperService]);

  const previousImage = useCallback(() => {
    wallpaperService.previousImage();
    setCurrentImage(wallpaperService.getCurrentImage());
  }, [wallpaperService]);

  const toggleSlideshow = useCallback(() => {
    wallpaperService.toggleSlideshow();
    setPreferences(wallpaperService.getPreferences());
  }, [wallpaperService]);

  const setSlideshowInterval = useCallback((seconds: number) => {
    wallpaperService.setSlideshowInterval(seconds);
    setPreferences(wallpaperService.getPreferences());
  }, [wallpaperService]);

  const updatePreferences = useCallback((updates: Partial<WallpaperPreferences>) => {
    wallpaperService.updatePreferences(updates);
    setPreferences(wallpaperService.getPreferences());
  }, [wallpaperService]);

  // Utilities
  const getOptimizedImageUrl = useCallback((image: WallpaperImage, width?: number, height?: number) => {
    return wallpaperService.getOptimizedImageUrl(image, width, height);
  }, [wallpaperService]);

  const getCurrentImageUrl = useCallback((width?: number, height?: number) => {
    const image = wallpaperService.getCurrentImage();
    return image ? wallpaperService.getOptimizedImageUrl(image, width, height) : '';
  }, [wallpaperService]);

  return {
    currentImage,
    currentTheme,
    availableThemes,
    preferences,
    isLoading,
    
    // Actions
    setTheme,
    setImage,
    nextImage,
    previousImage,
    toggleSlideshow,
    setSlideshowInterval,
    updatePreferences,
    
    // Utilities
    getOptimizedImageUrl,
    getCurrentImageUrl
  };
};