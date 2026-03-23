import { APIClient } from './client';
import type {
  UserPersonaData,
  OnboardingProgress,
  BehavioralPatterns,
  UserPersonaUpdate,
  UserPersonaResponse,
  PersonaRecommendations,
  PersonaInsights,
} from '@uaip/types';

export type { UserPersonaData, OnboardingProgress, BehavioralPatterns, UserPersonaUpdate, UserPersonaResponse, PersonaRecommendations, PersonaInsights };

class UserPersonaAPI {
  // Get current user's persona data
  async getCurrentPersona(): Promise<UserPersonaResponse> {
    const response = await APIClient.get('/api/v1/users/persona');
    return response.data;
  }

  // Update user persona data
  async updatePersona(updates: UserPersonaUpdate): Promise<UserPersonaResponse> {
    const response = await APIClient.put('/api/v1/users/persona', updates);
    return response.data;
  }

  // Complete onboarding flow
  async completeOnboarding(data: {
    personaData: UserPersonaData;
    onboardingProgress: OnboardingProgress;
  }): Promise<UserPersonaResponse> {
    const response = await APIClient.post('/api/v1/users/persona/complete-onboarding', data);
    return response.data;
  }

  // Update behavioral patterns (called automatically by system)
  async updateBehavioralPatterns(
    patterns: Partial<BehavioralPatterns>
  ): Promise<UserPersonaResponse> {
    const response = await APIClient.put('/api/v1/users/persona/behavioral-patterns', patterns);
    return response.data;
  }

  // Get persona-based recommendations
  async getPersonaRecommendations(): Promise<PersonaRecommendations> {
    const response = await APIClient.get('/api/v1/users/persona/recommendations');
    return response.data;
  }

  // Get persona insights and analytics
  async getPersonaInsights(): Promise<PersonaInsights> {
    const response = await APIClient.get('/api/v1/users/persona/insights');
    return response.data;
  }

  // Check if onboarding is required
  async checkOnboardingStatus(): Promise<{
    isRequired: boolean;
    isCompleted: boolean;
    currentStep?: number;
  }> {
    try {
      const response = await APIClient.get('/api/v1/users/persona/onboarding-status');
      return response.data;
    } catch (error: unknown) {
      // Log the full error for debugging
      console.error('User persona onboarding status check failed:', {
        error,
        status: error?.status,
        statusCode: error?.statusCode,
        message: error?.message,
        response: error?.response,
        config: error?.config,
      });

      // For now, default to requiring onboarding since we can't check status
      return {
        isRequired: true,
        isCompleted: false,
        currentStep: 1,
      };
    }
  }

  // Reset persona data (admin or user choice)
  async resetPersona(): Promise<{ success: boolean }> {
    const response = await APIClient.post('/api/v1/users/persona/reset');
    return response.data;
  }

  // Get persona-compatible agents
  async getCompatibleAgents(): Promise<
    Array<{
      id: string;
      name: string;
      compatibility: number;
      reason: string;
      persona: unknown;
    }>
  > {
    const response = await APIClient.get('/api/v1/users/persona/compatible-agents');
    return response.data;
  }

  // Get persona-optimized workspace layout
  async getOptimizedWorkspace(): Promise<{
    layout: string;
    components: unknown[];
    shortcuts: unknown[];
    notifications: unknown;
  }> {
    const response = await APIClient.get('/api/v1/users/persona/optimized-workspace');
    return response.data;
  }

  // Track user interaction for behavioral learning
  async trackInteraction(interaction: {
    type: 'tool_usage' | 'agent_interaction' | 'workflow_completion' | 'preference_change';
    data: unknown;
    timestamp: Date;
  }): Promise<{ success: boolean }> {
    const response = await APIClient.post('/api/v1/users/persona/track-interaction', interaction);
    return response.data;
  }
}

export const userPersonaAPI = new UserPersonaAPI();
