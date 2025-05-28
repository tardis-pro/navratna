import { Persona, PersonaTrait } from './persona';

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

// Conversation context tracking interface
export interface ConversationContext {
  recentTopics: string[];
  speakerHistory: string[];
  keyPoints: Record<string, string[]>;
  conversationMomentum: 'building' | 'exploring' | 'deciding' | 'clarifying';
  lastSpeakerContribution: Record<string, string>;
}

// Contextual trigger interface
export interface ContextualTrigger {
  conversationMoments: string[];
  buildOnPatterns: string[];
  questionPatterns: string[];
  supportPatterns: string[];
}

// Message history interface for conversation context
export interface MessageHistoryItem {
  speaker: string;
  content: string;
  timestamp: Date;
}

// Hybrid suggestion interface
export interface HybridSuggestion {
  parent1: string;
  parent2: string;
  name: string;
  description: string;
}

// Conversation type for contextual responses
export type ConversationType = 'build-on' | 'question' | 'support';

// Persona category type
export type PersonaCategory = 'Development' | 'Policy' | 'Creative' | 'Analysis' | 'Business' | 'Social'; 