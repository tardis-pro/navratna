import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { WelcomeScreen } from './WelcomeScreen';
import { UserPersonaOnboardingFlow } from './UserPersonaOnboardingFlow';
import { useOnboarding } from '../contexts/OnboardingContext';

/**
 * OnboardingManager - Orchestrates the complete onboarding experience
 * 
 * Flow:
 * 1. Welcome Screen - Introduces the platform and features
 * 2. User Persona Onboarding - Captures user preferences and work style
 * 3. Completion - Sets up user environment and preferences
 */
export const OnboardingManager: React.FC = () => {
  const {
    showOnboarding,
    showWelcome,
    onboardingStep,
    completeWelcome,
    completeOnboarding,
    skipOnboarding
  } = useOnboarding();

  // Don't render anything if onboarding isn't active
  if (!showOnboarding) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      {/* Welcome Screen */}
      {showWelcome && onboardingStep === 'welcome' && (
        <WelcomeScreen
          key="welcome"
          isOpen={true}
          onGetStarted={completeWelcome}
          onSkip={skipOnboarding}
        />
      )}

      {/* User Persona Onboarding */}
      {!showWelcome && onboardingStep === 'persona' && (
        <UserPersonaOnboardingFlow
          key="persona"
          isOpen={true}
          onClose={skipOnboarding}
          onComplete={completeOnboarding}
        />
      )}
    </AnimatePresence>
  );
};