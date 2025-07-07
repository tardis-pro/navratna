import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

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

export const MapWallpaper: React.FC<MapWallpaperProps> = React.memo(({
  userLocation,
  theme = 'dark',
  interactive = false,
  className = ''
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const initializeMap = useCallback(() => {
    if (!mapContainer.current || !window.maplibregl || map.current) return;

    // Initialize map
    map.current = new window.maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.olamaps.io/styles/default-dark-standard/style.json",
      center: [userLocation?.lng || -74.006, userLocation?.lat || 40.7128],
      zoom: userLocation ? 12 : 2,
      pitch: 45,
      bearing: 0,
      interactive: interactive,
      attributionControl: false
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
              coordinates: [userLocation.lng, userLocation.lat]
            }
          }
        });

        map.current.addLayer({
          id: 'user-location-circle',
          type: 'circle',
          source: 'user-location',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 8,
              15, 15
            ],
            'circle-color': '#3B82F6',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
            'circle-opacity': 0.8
          }
        });

        // Add pulsing animation
        map.current.addLayer({
          id: 'user-location-pulse',
          type: 'circle',
          source: 'user-location',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 15,
              15, 30
            ],
            'circle-color': '#3B82F6',
            'circle-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 0.3,
              15, 0.1
            ]
          }
        });

        setMapLoaded(true);
      });
    } else {
      map.current.on('load', () => {
        setMapLoaded(true);
      });
    }
  }, [userLocation, interactive]);

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
      className={`absolute inset-0 ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: mapLoaded ? 0.3 : 0 }}
      transition={{ duration: 2 }}
    >
      <div 
        ref={mapContainer} 
        className="w-full h-full"
        style={{
          filter: theme === 'dark' ? 'brightness(0.7) contrast(1.2)' : 'none'
        }}
      />
      
      {/* Overlay gradient for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-900/20 pointer-events-none" />
    </motion.div>
  );
});