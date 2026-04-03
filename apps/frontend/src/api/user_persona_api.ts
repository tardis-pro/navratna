import { gatewayClient, edenWithCSRFRetry } from './eden';
import type {
  UserPersonaData,
  OnboardingProgress,
  BehavioralPatterns,
  UserPersonaUpdate,
  UserPersonaResponse,
  PersonaRecommendations,
  PersonaInsights,
} from '@uaip/contracts/api';

export type {
  UserPersonaData,
  OnboardingProgress,
  BehavioralPatterns,
  UserPersonaUpdate,
  UserPersonaResponse,
  PersonaRecommendations,
  PersonaInsights,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const persona = gatewayClient.api.v1.users.persona;

export const userPersonaAPI = {
  async getCurrentPersona(): Promise<UserPersonaResponse> {
    return edenWithCSRFRetry(() => persona.get());
  },

  async updatePersona(updates: UserPersonaUpdate): Promise<UserPersonaResponse> {
    return edenWithCSRFRetry(() => persona.put(updates));
  },

  async completeOnboarding(data: {
    personaData: UserPersonaData;
    onboardingProgress: OnboardingProgress;
  }): Promise<UserPersonaResponse> {
    return edenWithCSRFRetry(() => persona['complete-onboarding'].post(data));
  },

  async updateBehavioralPatterns(
    patterns: Partial<BehavioralPatterns>
  ): Promise<UserPersonaResponse> {
    return edenWithCSRFRetry(() => persona['behavioral-patterns'].put(patterns));
  },

  async getPersonaRecommendations(): Promise<PersonaRecommendations> {
    return edenWithCSRFRetry(() => persona.recommendations.get());
  },

  async getPersonaInsights(): Promise<PersonaInsights> {
    return edenWithCSRFRetry(() => persona.insights.get());
  },

  async checkOnboardingStatus(): Promise<{
    isRequired: boolean;
    isCompleted: boolean;
    currentStep?: number;
  }> {
    try {
      return edenWithCSRFRetry(() => persona['onboarding-status'].get());
    } catch (error: unknown) {
      const errRecord = isRecord(error) ? error : {};
      console.error('User persona onboarding status check failed:', {
        error,
        status: errRecord['status'],
        statusCode: errRecord['statusCode'],
        message: errRecord['message'],
        response: errRecord['response'],
        config: errRecord['config'],
      });
      return {
        isRequired: true,
        isCompleted: false,
        currentStep: 1,
      };
    }
  },

  async resetPersona(): Promise<{ success: boolean }> {
    return edenWithCSRFRetry(() => persona.reset.post());
  },

  async getCompatibleAgents(): Promise<
    Array<{
      id: string;
      name: string;
      compatibility: number;
      reason: string;
      persona: unknown;
    }>
  > {
    return edenWithCSRFRetry(() => persona['compatible-agents'].get());
  },

  async getOptimizedWorkspace(): Promise<{
    layout: string;
    components: unknown[];
    shortcuts: unknown[];
    notifications: unknown;
  }> {
    return edenWithCSRFRetry(() => persona['optimized-workspace'].get());
  },

  async trackInteraction(interaction: {
    type: 'tool_usage' | 'agent_interaction' | 'workflow_completion' | 'preference_change';
    data: unknown;
    timestamp: Date;
  }): Promise<{ success: boolean }> {
    return edenWithCSRFRetry(() => persona['track-interaction'].post(interaction));
  },
};
