import { APIClient } from './index';

export interface UserPersonaData {
  workStyle: 'collaborative' | 'independent' | 'hybrid';
  communicationPreference: 'brief' | 'detailed' | 'visual';
  domainExpertise: string[];
  toolPreferences: string[];
  workflowStyle: 'structured' | 'flexible' | 'experimental';
  problemSolvingApproach: 'analytical' | 'creative' | 'pragmatic';
  decisionMaking: 'quick' | 'deliberate' | 'consensus';
  learningStyle: 'hands-on' | 'theoretical' | 'collaborative';
  timeManagement: 'deadline-driven' | 'flexible' | 'time-blocked';
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
}

export interface OnboardingProgress {
  isCompleted: boolean;
  currentStep: number;
  completedSteps: string[];
  startedAt?: Date;
  completedAt?: Date;
  responses: Record<string, any>;
}

export interface BehavioralPatterns {
  sessionDuration: number;
  activeHours: string[];
  frequentlyUsedTools: string[];
  preferredAgents: string[];
  workflowPatterns: string[];
  interactionStyle: 'direct' | 'exploratory' | 'methodical';
  feedbackPreference: 'immediate' | 'summary' | 'detailed';
}

export interface UserPersonaUpdate {
  personaData?: Partial<UserPersonaData>;
  onboardingProgress?: Partial<OnboardingProgress>;
  behavioralPatterns?: Partial<BehavioralPatterns>;
}

export interface UserPersonaResponse {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  userPersona?: UserPersonaData;
  onboardingProgress?: OnboardingProgress;
  behavioralPatterns?: BehavioralPatterns;
  updatedAt: string;
}

export interface PersonaRecommendations {
  recommendedTools: Array<{
    id: string;
    name: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  recommendedAgents: Array<{
    id: string;
    name: string;
    reason: string;
    compatibility: number;
  }>;
  workflowSuggestions: Array<{
    id: string;
    title: string;
    description: string;
    steps: string[];
  }>;
  uiCustomizations: {
    layout: string;
    density: 'compact' | 'comfortable' | 'spacious';
    theme: 'default' | 'focus' | 'creative';
    notifications: 'minimal' | 'standard' | 'detailed';
  };
}

export interface PersonaInsights {
  completionRate: number;
  strongestTraits: string[];
  growthAreas: string[];
  personalityType: string;
  workStyleMatch: number;
  recommendations: PersonaRecommendations;
}

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
  async updateBehavioralPatterns(patterns: Partial<BehavioralPatterns>): Promise<UserPersonaResponse> {
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
    const response = await APIClient.get('/api/v1/users/persona/onboarding-status');
    return response.data;
  }

  // Reset persona data (admin or user choice)
  async resetPersona(): Promise<{ success: boolean }> {
    const response = await APIClient.post('/api/v1/users/persona/reset');
    return response.data;
  }

  // Get persona-compatible agents
  async getCompatibleAgents(): Promise<Array<{
    id: string;
    name: string;
    compatibility: number;
    reason: string;
    persona: any;
  }>> {
    const response = await APIClient.get('/api/v1/users/persona/compatible-agents');
    return response.data;
  }

  // Get persona-optimized workspace layout
  async getOptimizedWorkspace(): Promise<{
    layout: string;
    components: any[];
    shortcuts: any[];
    notifications: any;
  }> {
    const response = await APIClient.get('/api/v1/users/persona/optimized-workspace');
    return response.data;
  }

  // Track user interaction for behavioral learning
  async trackInteraction(interaction: {
    type: 'tool_usage' | 'agent_interaction' | 'workflow_completion' | 'preference_change';
    data: any;
    timestamp: Date;
  }): Promise<{ success: boolean }> {
    const response = await APIClient.post('/api/v1/users/persona/track-interaction', interaction);
    return response.data;
  }
}

export const userPersonaAPI = new UserPersonaAPI();