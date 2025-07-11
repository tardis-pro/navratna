import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Image, Globe, MapPin, StickyNote, RefreshCw, Cloud, Play, Pause, 
  SkipForward, SkipBack, Settings, Monitor, Shuffle, Timer, 
  ChevronLeft, ChevronRight, Info
} from 'lucide-react';
import { useWallpaper } from '../hooks/useWallpaper';
import { LocationData } from '../services/LocationService';

interface WallpaperCustomizationPanelProps {
  useMapWallpaper: boolean;
  onMapWallpaperToggle: (enabled: boolean) => void;
  userLocation: LocationData | null;
  onLocationRequest: () => void;
  onCreateNote: () => void;
  onRefreshWeather: () => void;
  onClose: () => void;
}

const DESIGN_TOKENS = {
  colors: {
    primary: 'from-blue-400 to-cyan-400',
    surface: 'bg-slate-900/90',
    surfaceHover: 'hover:bg-slate-700/50',
    border: 'border-slate-700/50',
    text: 'text-white',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-400',
  },
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    lg: 'rounded-2xl',
  },
  padding: {
    sm: 'p-1',
    md: 'p-2',
    lg: 'p-4',
  },
  backdrop: 'backdrop-blur-xl',
  transition: 'transition-all duration-200',
  shadow: 'shadow-xl',
};

const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
}> = ({ children, onClick, variant = 'ghost', size = 'md', className = '', disabled = false }) => {
  const variants = {
    primary: `bg-gradient-to-r ${DESIGN_TOKENS.colors.primary} text-white hover:scale-105`,
    secondary: `${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.text}`,
    ghost: `${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.textSecondary}`,
    danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
  };
  
  const sizes = {
    sm: `${DESIGN_TOKENS.padding.sm} text-xs`,
    md: `${DESIGN_TOKENS.padding.md} text-sm`,
    lg: `${DESIGN_TOKENS.padding.lg} text-base`,
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${variants[variant]} ${sizes[size]} ${DESIGN_TOKENS.radius.md} 
        ${DESIGN_TOKENS.transition} flex items-center gap-2
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
    >
      {children}
    </button>
  );
};

export const WallpaperCustomizationPanel: React.FC<WallpaperCustomizationPanelProps> = ({
  useMapWallpaper,
  onMapWallpaperToggle,
  userLocation,
  onLocationRequest,
  onCreateNote,
  onRefreshWeather,
  onClose
}) => {
  const {
    currentImage,
    currentTheme,
    availableThemes,
    preferences,
    isLoading,
    setTheme,
    setImage,
    nextImage,
    previousImage,
    toggleSlideshow,
    setSlideshowInterval,
    updatePreferences,
    getCurrentImageUrl
  } = useWallpaper();

  const [selectedThemeId, setSelectedThemeId] = useState(currentTheme?.id || 'space');
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [customUrl, setCustomUrl] = useState('');

  const handleThemeChange = (themeId: string) => {
    const theme = availableThemes.find(t => t.id === themeId);
    if (theme) {
      setSelectedThemeId(themeId);
      setTheme(theme);
    }
  };

  const handleCustomUrl = () => {
    if (customUrl.trim()) {
      // Create a custom single-image theme
      const customTheme = {
        id: 'custom',
        name: 'Custom Image',
        description: 'User-provided wallpaper',
        category: 'custom' as const,
        slideshow: false,
        interval: 0,
        images: [{
          id: 'custom-image',
          url: customUrl.trim(),
          title: 'Custom Wallpaper',
          description: 'User-provided image'
        }]
      };
      setTheme(customTheme);
      setCustomUrl('');
    }
  };

  const intervalOptions = [
    { value: 60, label: '1 minute' },
    { value: 300, label: '5 minutes' },
    { value: 600, label: '10 minutes' },
    { value: 1800, label: '30 minutes' },
    { value: 3600, label: '1 hour' }
  ];

  const qualityOptions = [
    { value: 'high', label: 'High Quality' },
    { value: 'medium', label: 'Medium Quality' },
    { value: 'low', label: 'Low Quality' }
  ];

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90] flex items-center justify-center">
        <div className="bg-slate-900/90 backdrop-blur-xl rounded-2xl p-8 text-white">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto"></div>
          <p className="mt-4 text-center">Loading wallpaper themes...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90]" onClick={onClose} />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`
          fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] max-h-[90vh] 
          ${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.backdrop} ${DESIGN_TOKENS.radius.lg} 
          ${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.shadow} z-[100] overflow-hidden
        `}
      >
        <div className={`${DESIGN_TOKENS.padding.lg} ${DESIGN_TOKENS.colors.border} border-b`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-xl font-bold ${DESIGN_TOKENS.colors.text} flex items-center gap-2`}>
              <Monitor className="w-6 h-6 text-blue-400" />
              Desktop Customization
            </h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="max-h-[75vh] overflow-y-auto">
          {/* Current Wallpaper Status */}
          <div className={`${DESIGN_TOKENS.padding.lg} ${DESIGN_TOKENS.colors.border} border-b bg-gradient-to-r from-blue-500/10 to-purple-500/10`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`text-lg font-semibold ${DESIGN_TOKENS.colors.text}`}>
                  {currentTheme?.name || 'Current Theme'}
                </h3>
                <p className={`text-sm ${DESIGN_TOKENS.colors.textMuted}`}>
                  {currentTheme?.description || 'No theme selected'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {currentImage && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowImagePreview(true)}
                  >
                    <Info className="w-4 h-4" />
                    Preview
                  </Button>
                )}
              </div>
            </div>

            {/* Slideshow Controls */}
            {currentTheme?.slideshow && (
              <div className="flex items-center gap-2 mb-4">
                <Button
                  variant={preferences.slideshowEnabled ? "primary" : "secondary"}
                  size="sm"
                  onClick={toggleSlideshow}
                >
                  {preferences.slideshowEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {preferences.slideshowEnabled ? 'Pause' : 'Play'}
                </Button>
                
                <Button variant="secondary" size="sm" onClick={previousImage}>
                  <SkipBack className="w-4 h-4" />
                </Button>
                
                <Button variant="secondary" size="sm" onClick={nextImage}>
                  <SkipForward className="w-4 h-4" />
                </Button>
                
                <div className="flex items-center gap-2 ml-4">
                  <Timer className="w-4 h-4 text-slate-400" />
                  <select
                    value={preferences.intervalSeconds}
                    onChange={(e) => setSlideshowInterval(Number(e.target.value))}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                  >
                    {intervalOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <Button
                  variant={preferences.randomOrder ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => updatePreferences({ randomOrder: !preferences.randomOrder })}
                  title="Random order"
                >
                  <Shuffle className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Current Image Info */}
            {currentImage && (
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${DESIGN_TOKENS.colors.text}`}>
                      {currentImage.title}
                    </p>
                    {currentImage.description && (
                      <p className={`text-sm ${DESIGN_TOKENS.colors.textMuted}`}>
                        {currentImage.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`text-xs ${DESIGN_TOKENS.colors.textMuted}`}>
                      {currentTheme?.images.indexOf(currentImage) + 1} of {currentTheme?.images.length}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Theme Selection */}
          <div className={`${DESIGN_TOKENS.padding.lg} ${DESIGN_TOKENS.colors.border} border-b`}>
            <h3 className={`text-lg font-semibold ${DESIGN_TOKENS.colors.text} mb-4`}>Wallpaper Themes</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              {availableThemes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeChange(theme.id)}
                  className={`
                    relative p-4 rounded-lg border-2 transition-all text-left
                    ${selectedThemeId === theme.id ? 'border-blue-400 bg-blue-400/10' : 'border-slate-600 hover:border-slate-500 bg-slate-800/30'}
                  `}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className={`font-medium ${DESIGN_TOKENS.colors.text}`}>
                      {theme.name}
                    </h4>
                    {theme.slideshow && (
                      <div className="flex items-center gap-1">
                        <Play className="w-3 h-3 text-blue-400" />
                        <span className="text-xs text-blue-400">Slideshow</span>
                      </div>
                    )}
                  </div>
                  <p className={`text-sm ${DESIGN_TOKENS.colors.textMuted} mb-2`}>
                    {theme.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${DESIGN_TOKENS.colors.textMuted} capitalize`}>
                      {theme.category}
                    </span>
                    <span className={`text-xs ${DESIGN_TOKENS.colors.textMuted}`}>
                      {theme.images.length} images
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom URL Input */}
            <div className="border-t border-slate-700/50 pt-4">
              <h4 className={`text-sm font-medium ${DESIGN_TOKENS.colors.text} mb-2`}>Custom Image</h4>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="Enter custom wallpaper URL..."
                  className={`
                    flex-1 px-3 py-2 bg-slate-800 ${DESIGN_TOKENS.colors.border} border 
                    ${DESIGN_TOKENS.radius.md} ${DESIGN_TOKENS.colors.text} text-sm
                    focus:outline-none focus:border-blue-400
                  `}
                />
                <Button
                  variant="primary"
                  onClick={handleCustomUrl}
                  disabled={!customUrl.trim()}
                >
                  <Image className="w-4 h-4" />
                  Apply
                </Button>
              </div>
            </div>
          </div>

          {/* Map Wallpaper Section */}
          <div className={`${DESIGN_TOKENS.padding.lg} ${DESIGN_TOKENS.colors.border} border-b`}>
            <h3 className={`text-lg font-semibold ${DESIGN_TOKENS.colors.text} mb-4 flex items-center gap-2`}>
              <Globe className="w-5 h-5 text-blue-400" />
              Map Wallpaper
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                <div>
                  <p className="text-white font-medium">Enable Map Background</p>
                  <p className="text-slate-400 text-sm">Use an interactive map as your desktop wallpaper</p>
                </div>
                <button
                  onClick={() => onMapWallpaperToggle(!useMapWallpaper)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    useMapWallpaper ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      useMapWallpaper ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {useMapWallpaper && (
                <div className="space-y-3">
                  {userLocation ? (
                    <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-green-400" />
                        <span className="text-green-300 font-medium">Location Active</span>
                      </div>
                      <p className="text-green-400/80 text-sm">
                        {userLocation.city && userLocation.country 
                          ? `${userLocation.city}, ${userLocation.country}`
                          : `Coordinates: ${userLocation.latitude.toFixed(2)}, ${userLocation.longitude.toFixed(2)}`
                        }
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-orange-400" />
                        <span className="text-orange-300 font-medium">Location Required</span>
                      </div>
                      <p className="text-orange-400/80 text-sm mb-3">
                        Allow location access to personalize your map wallpaper
                      </p>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={onLocationRequest}
                        className="w-full"
                      >
                        <MapPin className="w-4 h-4 mr-2" />
                        Enable Location
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Settings */}
          <div className={`${DESIGN_TOKENS.padding.lg} ${DESIGN_TOKENS.colors.border} border-b`}>
            <h3 className={`text-lg font-semibold ${DESIGN_TOKENS.colors.text} mb-4 flex items-center gap-2`}>
              <Settings className="w-5 h-5 text-gray-400" />
              Settings
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Image Quality</p>
                  <p className="text-slate-400 text-sm">Higher quality uses more bandwidth</p>
                </div>
                <select
                  value={preferences.quality}
                  onChange={(e) => updatePreferences({ quality: e.target.value as 'high' | 'medium' | 'low' })}
                  className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white"
                >
                  {qualityOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Widgets Section */}
          <div className={`${DESIGN_TOKENS.padding.lg}`}>
            <h3 className={`text-lg font-semibold ${DESIGN_TOKENS.colors.text} mb-4`}>Desktop Widgets</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={() => { onCreateNote(); onClose(); }}
                className="flex-col h-20"
              >
                <StickyNote className="w-6 h-6 mb-2 text-yellow-400" />
                <span>Add Sticky Note</span>
              </Button>
              
              <Button
                variant="secondary"
                onClick={() => { onRefreshWeather(); }}
                className="flex-col h-20"
                title="Refresh weather data"
              >
                <RefreshCw className="w-6 h-6 mb-2 text-blue-400" />
                <span>Refresh Weather</span>
              </Button>
            </div>

            {userLocation && (
              <div className="mt-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <Cloud className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-300 font-medium text-sm">Weather Active</span>
                </div>
                <p className="text-blue-400/80 text-xs">
                  Weather data for {userLocation.city && userLocation.country 
                    ? `${userLocation.city}, ${userLocation.country}`
                    : 'your location'
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {showImagePreview && currentImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4"
            onClick={() => setShowImagePreview(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="max-w-4xl max-h-[80vh] bg-slate-900 rounded-xl overflow-hidden border border-slate-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">{currentImage.title}</h3>
                  {currentImage.description && (
                    <p className="text-slate-400 text-sm">{currentImage.description}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowImagePreview(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="relative">
                <img
                  src={getCurrentImageUrl(800, 600)}
                  alt={currentImage.title}
                  className="w-full h-auto max-h-[60vh] object-contain"
                />
                <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg p-2">
                  <p className="text-white text-sm">
                    {currentTheme?.images.indexOf(currentImage) + 1} of {currentTheme?.images.length}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};