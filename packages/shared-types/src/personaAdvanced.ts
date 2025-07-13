import { Persona } from './persona.js';

// Extended persona interface for hybrid personas
export interface HybridPersona extends Persona {
  parentPersonas: string[];
  hybridTraits: string[];
  dominantExpertise: string;
  personalityBlend: Record<string, number>;
}

// Core personality traits available for cross-breeding
export interface PersonalityTrait {
  weight: number;
  description: string;
}

// Expertise domains available for cross-breeding
export interface ExpertiseDomain {
  category: string;
  description: string;
}

// Enhanced conversation context tracking interface
export interface ConversationContext {
  recentTopics: string[];
  speakerHistory: string[];
  keyPoints: Record<string, string[]>;
  conversationMomentum: 'building' | 'exploring' | 'deciding' | 'clarifying';
  lastSpeakerContribution: Record<string, string>;
  // New enhanced state tracking
  lastSpeakerContinuityCount: number;
  topicShiftDetected: boolean;
  overallTone: 'formal' | 'casual' | 'heated' | 'collaborative';
  emotionalContext: 'neutral' | 'excited' | 'concerned' | 'frustrated' | 'optimistic';
}

// Conversation state for persona contribution decisions
export interface ConversationState {
  activePersonaId: string | null;
  lastSpeakerContinuityCount: number;
  recentContributors: string[];
  conversationEnergy: number; // 0.1-1.0
  needsClarification: boolean;
  topicStability: 'stable' | 'shifting' | 'new';
}

// Response enhancement types
export type ResponseType = 'primary' | 'follow-up' | 'agreement' | 'concern' | 'transition' | 'clarification';
export type FillerType = 'thinking' | 'hesitation' | 'transition' | 'agreement' | 'casual';

export interface ResponseEnhancement {
  type: ResponseType;
  useTransition: boolean;
  useFiller: boolean;
  fillerType?: FillerType;
  referenceMemory: boolean;
  addEmotionalReflection: boolean;
}

// Contextual trigger interface
export interface ContextualTrigger {
  conversationMoments: string[];
  buildOnPatterns: string[];
  questionPatterns: string[];
  supportPatterns: string[];
  // New enhancement patterns
  transitionPhrases: string[];
  agreementPhrases: string[];
  memoryReferences: string[];
  emotionalReflections: string[];
}

// Message history interface for conversation context
export interface MessageHistoryItem {
  speaker: string;
  content: string;
  timestamp: Date;
  responseType?: ResponseType;
  topic?: string;
}

// Hybrid suggestion interface
export interface HybridSuggestion {
  parent1: string;
  parent2: string;
  name: string;
  description: string;
}

// Enhanced conversation type for contextual responses
export type ConversationType = 'build-on' | 'question' | 'support' | 'agree' | 'concern' | 'transition' | 'reflect';

// Persona category type
export type PersonaCategory = 'Development' | 'Policy' | 'Creative' | 'Analysis' | 'Business' | 'Social';

// Weighted contribution scoring interface
export interface ContributionScore {
  personaId: string;
  score: number;
  factors: {
    topicMatch: number;
    momentumMatch: number;
    chattinessFactor: number;
    continuityPenalty: number;
    energyBonus: number;
  };
} 