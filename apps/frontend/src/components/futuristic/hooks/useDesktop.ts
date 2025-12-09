import { useState, useEffect, useCallback } from 'react';

interface RecentItem {
  id: string;
  title: string;
  type: string;
  timestamp: Date;
  icon: React.ComponentType<any>;
  description?: string;
  isPinned?: boolean;
  isFavorite?: boolean;
  accessCount?: number;
  lastAccessed?: Date;
  category?: 'portal' | 'action' | 'file' | 'search';
  metadata?: {
    portalId?: string;
    actionType?: string;
    fileSize?: number;
    searchQuery?: string;
    duration?: number;
  };
}

interface ActivityEvent {
  id: string;
  type:
    | 'portal_open'
    | 'portal_close'
    | 'action_execute'
    | 'search'
    | 'file_access'
    | 'user_interaction';
  itemId: string;
  timestamp: Date;
  duration?: number;
  metadata?: Record<string, any>;
}

interface IconPosition {
  id: string;
  x: number;
  y: number;
  gridPosition?: {
    row: number;
    col: number;
  };
}

interface DesktopPreferences {
  theme: 'light' | 'dark' | 'auto';
  iconSize: 'small' | 'medium' | 'large';
  showLabels: boolean;
  showDescriptions: boolean;
  autoHideRecentPanel: boolean;
  maxRecentItems: number;
  enableAnimations: boolean;
  gridSpacing: 'compact' | 'normal' | 'spacious';
}

interface DesktopState {
  iconPositions: Record<string, IconPosition>;
  recentItems: RecentItem[];
  preferences: DesktopPreferences;
  activityEvents: ActivityEvent[];
}

const DEFAULT_PREFERENCES: DesktopPreferences = {
  theme: 'dark',
  iconSize: 'medium',
  showLabels: true,
  showDescriptions: true,
  autoHideRecentPanel: false,
  maxRecentItems: 20,
  enableAnimations: true,
  gridSpacing: 'normal',
};

const STORAGE_KEYS = {
  ICON_POSITIONS: 'desktop_icon_positions',
  RECENT_ITEMS: 'desktop_recent_items',
  PREFERENCES: 'desktop_preferences',
  ACTIVITY_EVENTS: 'desktop_activity_events',
};

export const useDesktop = () => {
  const [iconPositions, setIconPositions] = useState<Record<string, IconPosition>>({});
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [preferences, setPreferences] = useState<DesktopPreferences>(DEFAULT_PREFERENCES);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);

  // Load data from localStorage on mount
  useEffect(() => {
    try {
      // Load icon positions
      const savedPositions = localStorage.getItem(STORAGE_KEYS.ICON_POSITIONS);
      if (savedPositions) {
        setIconPositions(JSON.parse(savedPositions));
      }

      // Load recent items
      const savedRecentItems = localStorage.getItem(STORAGE_KEYS.RECENT_ITEMS);
      if (savedRecentItems) {
        const items = JSON.parse(savedRecentItems);
        // Convert timestamp strings back to Date objects
        const itemsWithDates = items.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }));
        setRecentItems(itemsWithDates);
      }

      // Load preferences
      const savedPreferences = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      if (savedPreferences) {
        setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(savedPreferences) });
      }

      // Load activity events
      const savedActivityEvents = localStorage.getItem(STORAGE_KEYS.ACTIVITY_EVENTS);
      if (savedActivityEvents) {
        const events = JSON.parse(savedActivityEvents);
        // Convert timestamp strings back to Date objects
        const eventsWithDates = events.map((event: any) => ({
          ...event,
          timestamp: new Date(event.timestamp),
        }));
        setActivityEvents(eventsWithDates);
      }
    } catch (error) {
      console.error('Error loading desktop data from localStorage:', error);
    }
  }, []);

  // Save icon positions to localStorage
  const saveIconPositions = useCallback((positions: Record<string, IconPosition>) => {
    try {
      localStorage.setItem(STORAGE_KEYS.ICON_POSITIONS, JSON.stringify(positions));
    } catch (error) {
      console.error('Error saving icon positions:', error);
    }
  }, []);

  // Save recent items to localStorage
  const saveRecentItems = useCallback((items: RecentItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.RECENT_ITEMS, JSON.stringify(items));
    } catch (error) {
      console.error('Error saving recent items:', error);
    }
  }, []);

  // Save preferences to localStorage
  const savePreferences = useCallback((prefs: DesktopPreferences) => {
    try {
      localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(prefs));
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  }, []);

  // Save activity events to localStorage
  const saveActivityEvents = useCallback((events: ActivityEvent[]) => {
    try {
      // Keep only the last 1000 events to prevent storage bloat
      const limitedEvents = events.slice(-1000);
      localStorage.setItem(STORAGE_KEYS.ACTIVITY_EVENTS, JSON.stringify(limitedEvents));
    } catch (error) {
      console.error('Error saving activity events:', error);
    }
  }, []);

  // Update icon position
  const updateIconPosition = useCallback(
    (iconId: string, position: Omit<IconPosition, 'id'>) => {
      const newPositions = {
        ...iconPositions,
        [iconId]: { id: iconId, ...position },
      };
      setIconPositions(newPositions);
      saveIconPositions(newPositions);
    },
    [iconPositions, saveIconPositions]
  );

  // Add activity event
  const addActivityEvent = useCallback(
    (event: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
      const newEvent: ActivityEvent = {
        ...event,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
      };

      setActivityEvents((prevEvents) => {
        const newEvents = [newEvent, ...prevEvents];
        // Keep only the last 500 events
        const limitedEvents = newEvents.slice(0, 500);
        saveActivityEvents(limitedEvents);
        return limitedEvents;
      });
    },
    [saveActivityEvents]
  );

  // Add recent item with activity tracking
  const addRecentItem = useCallback(
    (item: Omit<RecentItem, 'timestamp' | 'accessCount' | 'lastAccessed'>) => {
      const now = new Date();

      setRecentItems((prevItems) => {
        // Find existing item
        const existingItemIndex = prevItems.findIndex(
          (existingItem) => existingItem.id === item.id
        );

        let newItems: RecentItem[];

        if (existingItemIndex >= 0) {
          // Update existing item
          const existingItem = prevItems[existingItemIndex];
          const updatedItem: RecentItem = {
            ...existingItem,
            ...item,
            timestamp: now,
            lastAccessed: now,
            accessCount: (existingItem.accessCount || 0) + 1,
          };

          // Move to front
          newItems = [
            updatedItem,
            ...prevItems.slice(0, existingItemIndex),
            ...prevItems.slice(existingItemIndex + 1),
          ];
        } else {
          // Add new item
          const newItem: RecentItem = {
            ...item,
            timestamp: now,
            lastAccessed: now,
            accessCount: 1,
          };
          newItems = [newItem, ...prevItems];
        }

        // Limit to maxRecentItems
        const limitedItems = newItems.slice(0, preferences.maxRecentItems);

        saveRecentItems(limitedItems);
        return limitedItems;
      });

      // Add activity event
      addActivityEvent({
        type: 'user_interaction',
        itemId: item.id,
        metadata: {
          itemType: item.type,
          category: item.category || 'portal',
        },
      });
    },
    [preferences.maxRecentItems, saveRecentItems, addActivityEvent]
  );

  // Remove recent item
  const removeRecentItem = useCallback(
    (itemId: string) => {
      setRecentItems((prevItems) => {
        const newItems = prevItems.filter((item) => item.id !== itemId);
        saveRecentItems(newItems);
        return newItems;
      });
    },
    [saveRecentItems]
  );

  // Toggle item favorite status
  const toggleItemFavorite = useCallback(
    (itemId: string) => {
      setRecentItems((prevItems) => {
        const newItems = prevItems.map((item) =>
          item.id === itemId ? { ...item, isFavorite: !item.isFavorite } : item
        );
        saveRecentItems(newItems);
        return newItems;
      });
    },
    [saveRecentItems]
  );

  // Toggle item pinned status
  const toggleItemPinned = useCallback(
    (itemId: string) => {
      setRecentItems((prevItems) => {
        const newItems = prevItems.map((item) =>
          item.id === itemId ? { ...item, isPinned: !item.isPinned } : item
        );
        saveRecentItems(newItems);
        return newItems;
      });
    },
    [saveRecentItems]
  );

  // Clear recent items
  const clearRecentItems = useCallback(() => {
    setRecentItems([]);
    localStorage.removeItem(STORAGE_KEYS.RECENT_ITEMS);
  }, []);

  // Update preferences
  const updatePreferences = useCallback(
    (newPreferences: Partial<DesktopPreferences>) => {
      const updatedPreferences = { ...preferences, ...newPreferences };
      setPreferences(updatedPreferences);
      savePreferences(updatedPreferences);
    },
    [preferences, savePreferences]
  );

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setIconPositions({});
    setRecentItems([]);
    setPreferences(DEFAULT_PREFERENCES);

    localStorage.removeItem(STORAGE_KEYS.ICON_POSITIONS);
    localStorage.removeItem(STORAGE_KEYS.RECENT_ITEMS);
    localStorage.removeItem(STORAGE_KEYS.PREFERENCES);
  }, []);

  // Get recent items by type
  const getRecentItemsByType = useCallback(
    (type: string) => {
      return recentItems.filter((item) => item.type === type);
    },
    [recentItems]
  );

  // Get favorite items
  const getFavoriteItems = useCallback(() => {
    return recentItems.filter((item) => item.isFavorite);
  }, [recentItems]);

  // Get pinned items
  const getPinnedItems = useCallback(() => {
    return recentItems.filter((item) => item.isPinned);
  }, [recentItems]);

  // Search recent items
  const searchRecentItems = useCallback(
    (query: string) => {
      const lowercaseQuery = query.toLowerCase();
      return recentItems.filter(
        (item) =>
          item.title.toLowerCase().includes(lowercaseQuery) ||
          item.type.toLowerCase().includes(lowercaseQuery) ||
          (item.description && item.description.toLowerCase().includes(lowercaseQuery))
      );
    },
    [recentItems]
  );

  // Get activity statistics
  const getActivityStats = useCallback(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const todayEvents = activityEvents.filter((event) => event.timestamp >= today);
    const weekEvents = activityEvents.filter((event) => event.timestamp >= thisWeek);
    const monthEvents = activityEvents.filter((event) => event.timestamp >= thisMonth);

    const mostUsedItems = recentItems
      .filter((item) => item.accessCount && item.accessCount > 1)
      .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0))
      .slice(0, 5);

    return {
      totalEvents: activityEvents.length,
      todayEvents: todayEvents.length,
      weekEvents: weekEvents.length,
      monthEvents: monthEvents.length,
      mostUsedItems,
      averageSessionTime:
        activityEvents
          .filter((event) => event.duration)
          .reduce((sum, event) => sum + (event.duration || 0), 0) /
          activityEvents.filter((event) => event.duration).length || 0,
    };
  }, [activityEvents, recentItems]);

  // Get trending items (items with increasing usage)
  const getTrendingItems = useCallback(() => {
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previousWeek = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const recentEvents = activityEvents.filter((event) => event.timestamp >= lastWeek);
    const previousEvents = activityEvents.filter(
      (event) => event.timestamp >= previousWeek && event.timestamp < lastWeek
    );

    const recentCounts = recentEvents.reduce(
      (acc, event) => {
        acc[event.itemId] = (acc[event.itemId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const previousCounts = previousEvents.reduce(
      (acc, event) => {
        acc[event.itemId] = (acc[event.itemId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return Object.keys(recentCounts)
      .map((itemId) => {
        const recentCount = recentCounts[itemId] || 0;
        const previousCount = previousCounts[itemId] || 0;
        const growth =
          previousCount > 0 ? (recentCount - previousCount) / previousCount : recentCount;
        const item = recentItems.find((item) => item.id === itemId);

        return {
          itemId,
          item,
          recentCount,
          previousCount,
          growth,
        };
      })
      .filter((trend) => trend.growth > 0 && trend.item)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 5);
  }, [activityEvents, recentItems]);

  return {
    // State
    iconPositions,
    recentItems,
    preferences,
    activityEvents,

    // Icon position management
    updateIconPosition,

    // Recent items management
    addRecentItem,
    removeRecentItem,
    toggleItemFavorite,
    toggleItemPinned,
    clearRecentItems,
    getRecentItemsByType,
    getFavoriteItems,
    getPinnedItems,
    searchRecentItems,

    // Activity tracking
    addActivityEvent,
    getActivityStats,
    getTrendingItems,

    // Preferences management
    updatePreferences,

    // Utility
    resetToDefaults,
  };
};
