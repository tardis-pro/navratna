import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface DesktopPreferences {
  wallpaper: string;
  showShortcuts: boolean;
  taskbarPosition: 'bottom' | 'top';
  iconSize: 'small' | 'medium' | 'large';
  enableAnimations: boolean;
  compactMode: boolean;
}

export interface UIPreferences {
  showDescriptions: boolean;
  compactMode: boolean;
  animations: boolean;
  gridView: boolean;
  autoSave: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  agentUpdates: boolean;
  systemAlerts: boolean;
  securityWarnings: boolean;
  sound: boolean;
}

export interface UserPreferences {
  theme: ThemeMode;
  language: string;
  notifications: NotificationSettings;
  ui: UIPreferences;
  desktop: DesktopPreferences;
}

interface UserPreferencesContextType {
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  updateUIPreferences: (updates: Partial<UIPreferences>) => void;
  updateDesktopPreferences: (updates: Partial<DesktopPreferences>) => void;
  updateNotificationSettings: (updates: Partial<NotificationSettings>) => void;
  resetToDefaults: () => void;
  // Theme-specific helpers
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  effectiveTheme: 'light' | 'dark';
  isLoading: boolean;
}

const defaultPreferences: UserPreferences = {
  theme: 'dark',
  language: 'en',
  notifications: {
    enabled: true,
    agentUpdates: true,
    systemAlerts: true,
    securityWarnings: true,
    sound: false
  },
  ui: {
    showDescriptions: true,
    compactMode: false,
    animations: true,
    gridView: true,
    autoSave: true
  },
  desktop: {
    wallpaper: 'gradient',
    showShortcuts: true,
    taskbarPosition: 'bottom',
    iconSize: 'medium',
    enableAnimations: true,
    compactMode: false
  }
};

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
  }
  return context;
};

interface UserPreferencesProviderProps {
  children: ReactNode;
}

export const UserPreferencesProvider: React.FC<UserPreferencesProviderProps> = ({ children }) => {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('dark');

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user-preferences');
      if (stored) {
        const parsed = JSON.parse(stored);
        setPreferences({ ...defaultPreferences, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load user preferences:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Detect system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Save preferences to localStorage when they change
  useEffect(() => {
    if (!isLoading) {
      try {
        localStorage.setItem('user-preferences', JSON.stringify(preferences));
      } catch (error) {
        console.error('Failed to save user preferences:', error);
      }
    }
  }, [preferences, isLoading]);

  // Calculate effective theme
  const effectiveTheme = preferences.theme === 'auto' ? systemTheme : preferences.theme;

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark');
  }, [effectiveTheme]);

  const updatePreferences = (updates: Partial<UserPreferences>) => {
    setPreferences(prev => ({ ...prev, ...updates }));
  };

  const updateUIPreferences = (updates: Partial<UIPreferences>) => {
    setPreferences(prev => ({
      ...prev,
      ui: { ...prev.ui, ...updates }
    }));
  };

  const updateDesktopPreferences = (updates: Partial<DesktopPreferences>) => {
    setPreferences(prev => ({
      ...prev,
      desktop: { ...prev.desktop, ...updates }
    }));
  };

  const updateNotificationSettings = (updates: Partial<NotificationSettings>) => {
    setPreferences(prev => ({
      ...prev,
      notifications: { ...prev.notifications, ...updates }
    }));
  };

  const setTheme = (theme: ThemeMode) => {
    updatePreferences({ theme });
  };

  const toggleTheme = () => {
    const currentTheme = effectiveTheme;
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  const resetToDefaults = () => {
    setPreferences(defaultPreferences);
  };

  const value: UserPreferencesContextType = {
    preferences,
    updatePreferences,
    updateUIPreferences,
    updateDesktopPreferences,
    updateNotificationSettings,
    resetToDefaults,
    setTheme,
    toggleTheme,
    effectiveTheme,
    isLoading
  };

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
};