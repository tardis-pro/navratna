import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, Navigation, Layers, RotateCcw, ZoomIn, ZoomOut, Eye, EyeOff } from 'lucide-react';

declare global {
  interface Window {
    maplibregl: any;
  }
}

interface MapWallpaperProps {
  userLocation?: { lat: number; lng: number };
  theme?: 'light' | 'dark';
  interactive?: boolean;
  className?: string;
}

interface BasemapOption {
  id: string;
  name: string;
  style: string;
  preview?: string;
}

const BASEMAP_OPTIONS: BasemapOption[] = [
  {
    id: 'dark',
    name: 'Dark',
    style: 'https://tiles.olamaps.io/styles/default-dark-standard/style.json',
  },
  {
    id: 'light',
    name: 'Light',
    style: 'https://tiles.olamaps.io/styles/default-light-standard/style.json',
  },
  {
    id: 'satellite',
    name: 'Satellite',
    style: 'https://tiles.olamaps.io/styles/satellite/style.json',
  },
  {
    id: 'terrain',
    name: 'Terrain',
    style: 'https://tiles.olamaps.io/styles/terrain/style.json',
  },
];

export const MapWallpaper: React.FC<MapWallpaperProps> = React.memo(
  ({ userLocation, theme = 'dark', interactive = false, className = '' }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<any>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [isInteractive, setIsInteractive] = useState(interactive);
    const [showControls, setShowControls] = useState(false);
    const [currentBasemap, setCurrentBasemap] = useState(theme === 'dark' ? 'dark' : 'light');

    // Update basemap when theme changes
    useEffect(() => {
      const themeBasemap = theme === 'dark' ? 'dark' : 'light';
      if (currentBasemap !== themeBasemap) {
        setCurrentBasemap(themeBasemap);
      }
    }, [theme, currentBasemap]);
    const [showBasemapSelector, setShowBasemapSelector] = useState(false);

    const initializeMap = useCallback(() => {
      if (!mapContainer.current || !window.maplibregl || map.current) return;

      const selectedBasemap =
        BASEMAP_OPTIONS.find((b) => b.id === currentBasemap) || BASEMAP_OPTIONS[0];

      // Initialize map
      map.current = new window.maplibregl.Map({
        container: mapContainer.current,
        style: selectedBasemap.style,
        center: [userLocation?.lng || -74.006, userLocation?.lat || 40.7128],
        zoom: userLocation ? 12 : 2,
        pitch: 45,
        bearing: 0,
        interactive: isInteractive,
        attributionControl: false,
      });

      // Add user location marker if provided
      if (userLocation) {
        map.current.on('load', () => {
          // Add pulsing dot for user location
          map.current.addSource('user-location', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [userLocation.lng, userLocation.lat],
              },
            },
          });

          map.current.addLayer({
            id: 'user-location-circle',
            type: 'circle',
            source: 'user-location',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 15, 15],
              'circle-color': '#3B82F6',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FFFFFF',
              'circle-opacity': 0.8,
            },
          });

          // Add pulsing animation
          map.current.addLayer({
            id: 'user-location-pulse',
            type: 'circle',
            source: 'user-location',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 15, 15, 30],
              'circle-color': '#3B82F6',
              'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 15, 0.1],
            },
          });

          setMapLoaded(true);
        });
      } else {
        map.current.on('load', () => {
          setMapLoaded(true);
        });
      }
    }, [userLocation, isInteractive, currentBasemap]);

    // Map control functions
    const toggleInteractive = useCallback(() => {
      setIsInteractive((prev) => !prev);
      if (map.current) {
        map.current.remove();
        map.current = null;
        setTimeout(() => initializeMap(), 100);
      }
    }, [initializeMap]);

    const changeBasemap = useCallback((basemapId: string) => {
      setCurrentBasemap(basemapId);
      if (map.current) {
        const selectedBasemap = BASEMAP_OPTIONS.find((b) => b.id === basemapId);
        if (selectedBasemap) {
          map.current.setStyle(selectedBasemap.style);
        }
      }
      setShowBasemapSelector(false);
    }, []);

    const zoomIn = useCallback(() => {
      if (map.current) {
        map.current.zoomIn();
      }
    }, []);

    const zoomOut = useCallback(() => {
      if (map.current) {
        map.current.zoomOut();
      }
    }, []);

    const resetView = useCallback(() => {
      if (map.current) {
        map.current.flyTo({
          center: [userLocation?.lng || -74.006, userLocation?.lat || 40.7128],
          zoom: userLocation ? 12 : 2,
          pitch: 45,
          bearing: 0,
        });
      }
    }, [userLocation]);

    const resetNorth = useCallback(() => {
      if (map.current) {
        map.current.rotateTo(0);
      }
    }, []);

    useEffect(() => {
      initializeMap();

      return () => {
        if (map.current) {
          map.current.remove();
          map.current = null;
        }
      };
    }, [initializeMap]);

    if (!window.maplibregl) {
      return (
        <div className={`absolute inset-0 bg-slate-900 ${className}`}>
          <div className="flex items-center justify-center h-full text-slate-400">
            Loading map...
          </div>
        </div>
      );
    }

    return (
      <motion.div
        className={`absolute inset-0 group ${className}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: mapLoaded ? 0.3 : 0 }}
        transition={{ duration: 2 }}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => {
          setShowControls(false);
          setShowBasemapSelector(false);
        }}
      >
        <div
          ref={mapContainer}
          className="w-full h-full"
          style={{
            filter: theme === 'dark' ? 'brightness(0.7) contrast(1.2)' : 'none',
          }}
        />

        {/* Overlay gradient for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-900/20 pointer-events-none" />

        {/* Interactive Controls */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-4 left-4 flex flex-col gap-2 pointer-events-auto z-50"
            >
              {/* Interactive Toggle */}
              <motion.button
                onClick={toggleInteractive}
                className={`p-2 rounded-lg backdrop-blur-md border transition-all
                ${
                  isInteractive
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-400'
                    : 'bg-slate-700/50 border-slate-600/30 text-slate-400 hover:text-white'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={isInteractive ? 'Disable interaction' : 'Enable interaction'}
              >
                {isInteractive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </motion.button>

              {/* Basemap Selector */}
              <div className="relative">
                <motion.button
                  onClick={() => setShowBasemapSelector(!showBasemapSelector)}
                  className="p-2 rounded-lg backdrop-blur-md bg-slate-700/50 border border-slate-600/30 
                          text-slate-400 hover:text-white transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="Change basemap"
                >
                  <Layers className="w-4 h-4" />
                </motion.button>

                <AnimatePresence>
                  {showBasemapSelector && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute left-0 top-full mt-2 w-32 backdrop-blur-md bg-slate-800/90 
                              border border-slate-600/30 rounded-lg shadow-xl overflow-hidden"
                    >
                      {BASEMAP_OPTIONS.map((basemap) => (
                        <motion.button
                          key={basemap.id}
                          onClick={() => changeBasemap(basemap.id)}
                          className={`w-full px-3 py-2 text-right text-sm transition-colors
                          ${
                            currentBasemap === basemap.id
                              ? 'bg-cyan-500/20 text-cyan-400'
                              : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                          }`}
                          whileHover={{ backgroundColor: 'rgba(148, 163, 184, 0.1)' }}
                        >
                          {basemap.name}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Zoom Controls - Only show when interactive */}
              {isInteractive && (
                <>
                  <motion.button
                    onClick={zoomIn}
                    className="p-2 rounded-lg backdrop-blur-md bg-slate-700/50 border border-slate-600/30 
                            text-slate-400 hover:text-white transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Zoom in"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </motion.button>

                  <motion.button
                    onClick={zoomOut}
                    className="p-2 rounded-lg backdrop-blur-md bg-slate-700/50 border border-slate-600/30 
                            text-slate-400 hover:text-white transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Zoom out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </motion.button>

                  <motion.button
                    onClick={resetNorth}
                    className="p-2 rounded-lg backdrop-blur-md bg-slate-700/50 border border-slate-600/30 
                            text-slate-400 hover:text-white transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Reset to north"
                  >
                    <Navigation className="w-4 h-4" />
                  </motion.button>

                  <motion.button
                    onClick={resetView}
                    className="p-2 rounded-lg backdrop-blur-md bg-slate-700/50 border border-slate-600/30 
                            text-slate-400 hover:text-white transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Reset view"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </motion.button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Indicator */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute bottom-4 left-20 pointer-events-auto z-50"
            >
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-md 
                          bg-slate-700/50 border border-slate-600/30 text-slate-300"
              >
                <Map className="w-4 h-4" />
                <span className="text-xs">
                  {isInteractive ? 'Interactive' : 'Static'} •{' '}
                  {BASEMAP_OPTIONS.find((b) => b.id === currentBasemap)?.name}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }
);
