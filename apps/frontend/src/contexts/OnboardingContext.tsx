import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { userPersonaAPI } from '../api/user_persona_api';
import type { UserPersonaData, OnboardingProgress } from '../api/user_persona_api';
import { logger } from '@/utils/browser_logger';

interface OnboardingState {
  isFirstTime: boolean;
  showOnboarding: boolean;
  showWelcome: boolean;
  onboardingStep: 'welcome' | 'persona' | 'completed';
  isLoading: boolean;
}

interface OnboardingContextType extends OnboardingState {
  startOnboarding: () => void;
  completeWelcome: () => void;
  completeOnboarding: (data: CompleteOnboardingData) => Promise<void>;
  /**
   * Finishes onboarding when the server already recorded it — the imprint
   * interview commits through /api/v1/onboarding/interview/complete, so
   * re-posting the legacy persona payload here would overwrite it.
   */
  markOnboardingSettled: () => void;
  skipOnboarding: () => void;
  restartOnboarding: () => void;
  checkOnboardingStatus: () => Promise<void>;
}

interface CompleteOnboardingData {
  personaData: UserPersonaData;
  onboardingProgress: OnboardingProgress;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

interface OnboardingProviderProps {
  children: React.ReactNode;
}

export const OnboardingProvider: React.FC<OnboardingProviderProps> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  const [state, setState] = useState<OnboardingState>({
    isFirstTime: false,
    showOnboarding: false,
    showWelcome: false,
    onboardingStep: 'completed',
    isLoading: true,
  });

  // The server is authoritative; local storage is only a fallback for when it
  // is unreachable. Local state is per-browser and survives account switches,
  // so trusting it first would let one skip suppress onboarding permanently.
  const detectFirstTimeUser = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const onboardingStatus = await userPersonaAPI.checkOnboardingStatus();
      if (onboardingStatus && !onboardingStatus.isCompleted) {
        return true;
      }

      return false;
    } catch {
      const hasPreferences = localStorage.getItem('user-preferences') !== null;
      const hasDesktopCustomizations = localStorage.getItem('desktop_preferences') !== null;

      return !hasPreferences && !hasDesktopCustomizations;
    }
  }, [user]);

  // Main onboarding status check
  const checkOnboardingStatus = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const isFirstTime = await detectFirstTimeUser();

      if (isFirstTime) {
        // First-time user: show welcome screen first
        setState({
          isFirstTime: true,
          showOnboarding: true,
          showWelcome: true,
          onboardingStep: 'welcome',
          isLoading: false,
        });
      } else {
        // Returning user: no onboarding needed
        setState({
          isFirstTime: false,
          showOnboarding: false,
          showWelcome: false,
          onboardingStep: 'completed',
          isLoading: false,
        });
      }
    } catch (error) {
      logger.error('Failed to check onboarding status:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        // Safe fallback: don't show onboarding if unsure
        showOnboarding: false,
        showWelcome: false,
      }));
    }
  }, [isAuthenticated, user, detectFirstTimeUser]);

  // Check onboarding status when user logs in
  useEffect(() => {
    checkOnboardingStatus();
  }, [checkOnboardingStatus]);

  const startOnboarding = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showOnboarding: true,
      showWelcome: true,
      onboardingStep: 'welcome',
    }));
  }, []);

  const completeWelcome = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showWelcome: false,
      onboardingStep: 'persona',
    }));
  }, []);

  const completeOnboarding = useCallback(async (data: CompleteOnboardingData) => {
    try {
      // Save persona data to backend
      await userPersonaAPI.completeOnboarding(data);

      // Mark as completed in local state
      setState((prev) => ({
        ...prev,
        showOnboarding: false,
        showWelcome: false,
        onboardingStep: 'completed',
        isFirstTime: false,
      }));

      // Set initial user preferences to mark as non-first-time
      if (!localStorage.getItem('user-preferences')) {
        const defaultPreferences = {
          theme: 'light',
          language: 'en',
          notifications: { enabled: true },
          ui: { animations: true },
          desktop: { wallpaper: 'default' },
          onboardingCompleted: true,
          completedAt: new Date().toISOString(),
        };
        localStorage.setItem('user-preferences', JSON.stringify(defaultPreferences));
      }
    } catch (error) {
      logger.error('Failed to complete onboarding:', error);
      throw error;
    }
  }, []);

  const markOnboardingSettled = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showOnboarding: false,
      showWelcome: false,
      onboardingStep: 'completed',
      isFirstTime: false,
    }));
  }, []);

  const skipOnboarding = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showOnboarding: false,
      showWelcome: false,
      onboardingStep: 'completed',
      isFirstTime: false,
    }));

    // Mark as skipped in preferences
    const preferences = JSON.parse(localStorage.getItem('user-preferences') || '{}');
    preferences.onboardingSkipped = true;
    preferences.skippedAt = new Date().toISOString();
    localStorage.setItem('user-preferences', JSON.stringify(preferences));
  }, []);

  const restartOnboarding = useCallback(() => {
    // Clear onboarding-related local storage
    const preferences = JSON.parse(localStorage.getItem('user-preferences') || '{}');
    delete preferences.onboardingCompleted;
    delete preferences.onboardingSkipped;
    localStorage.setItem('user-preferences', JSON.stringify(preferences));

    // Restart the flow
    setState({
      isFirstTime: true,
      showOnboarding: true,
      showWelcome: true,
      onboardingStep: 'welcome',
      isLoading: false,
    });
  }, []);

  const contextValue: OnboardingContextType = useMemo(
    () => ({
      ...state,
      startOnboarding,
      completeWelcome,
      completeOnboarding,
      markOnboardingSettled,
      skipOnboarding,
      restartOnboarding,
      checkOnboardingStatus,
    }),
    [
      state,
      startOnboarding,
      completeWelcome,
      completeOnboarding,
      markOnboardingSettled,
      skipOnboarding,
      restartOnboarding,
      checkOnboardingStatus,
    ]
  );

  return <OnboardingContext.Provider value={contextValue}>{children}</OnboardingContext.Provider>;
};

export const useOnboarding = (): OnboardingContextType => {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};
