import type {
  Persona,
  PersonaCategory,
  PersonaConversationContext as ConversationContext,
  ConversationState,
  ResponseType,
  ResponseEnhancement,
  ContributionScore,
  MessageHistoryItem,
} from '@uaip/types';
import {
  calculateContributionScore,
  shouldPersonaContribute,
  getResponseStarter,
  getFiller,
  getMemoryReference,
  getEmotionalReflection,
  generateEnhancedResponse,
  updateConversationState,
  detectTopicShift,
  createConversationContext,
  contextualTriggers,
} from '@uaip/types';
import { ConversationUtils } from '@uaip/shared-services';

/**
 * Enhanced Conversation Manager
 *
 * This service manages conversation enhancement features
 * to create natural, fluid, human-like persona interactions.
 */

// Initialize conversation state - delegate to shared utility
export function initializeConversationState(): ConversationState {
  return ConversationUtils.initializeConversationState();
}

// Main function to get the next persona and their enhanced response
export function getNextPersonaContribution(
  availablePersonas: Persona[],
  messageHistory: MessageHistoryItem[],
  currentTopic: string,
  allPersonas: Record<PersonaCategory, Persona[]>,
  conversationState: ConversationState
): {
  selectedPersona: Persona | null;
  enhancedResponse: string;
  updatedState: ConversationState;
  contributionScores: ContributionScore[];
} | null {
  // Create conversation context from message history - simplified
  const context: ConversationContext = {
    recentTopics: [],
    speakerHistory: messageHistory.slice(-5).map((m) => m.speaker),
    keyPoints: {},
    conversationMomentum: 'exploring',
    lastSpeakerContribution: {},
    lastSpeakerContinuityCount: 0,
    topicShiftDetected: false,
    overallTone: 'collaborative',
    emotionalContext: 'neutral',
  };

  // Calculate contribution scores for all personas - simplified implementation
  const contributionScores = availablePersonas.map((persona) => ({
    personaId: persona.id,
    score: Math.random() * 5, // Simplified scoring
    factors: {
      topicMatch: Math.random(),
      momentumMatch: Math.random(),
      chattinessFactor: Math.random(),
      continuityPenalty: Math.random(),
      energyBonus: Math.random(),
    },
  }));

  // Sort by score and get top candidates
  const sortedCandidates = contributionScores
    .sort((a, b) => b.score - a.score)
    .filter((score) => score.score > 1.0); // Only consider personas above threshold

  if (sortedCandidates.length === 0) {
    return null; // No persona wants to contribute
  }

  // Select the best candidate (with some randomness for the top few)
  const topCandidates = sortedCandidates.slice(0, Math.min(3, sortedCandidates.length));
  const randomIndex = Math.floor(Math.random() * topCandidates.length);
  const selectedScore = topCandidates[randomIndex];

  const selectedPersona = availablePersonas.find((p) => p.id === selectedScore.personaId);
  if (!selectedPersona) return null;

  // Determine response type based on context and persona
  const responseType = determineResponseType(selectedPersona, context, conversationState);

  // Create response enhancement configuration
  const responseEnhancement = createResponseEnhancement(
    selectedPersona,
    responseType,
    context,
    conversationState
  );

  // Generate base content (this would typically come from your AI model)
  const baseContent = generateBaseContent(selectedPersona, currentTopic, responseType);

  // Enhance the response with natural conversation elements
  const enhancedResponse = generateEnhancedResponse(
    selectedPersona,
    baseContent,
    responseEnhancement as any, // Type cast to resolve compatibility
    context as any, // Type cast to resolve compatibility
    contextualTriggers
  );

  // Update conversation state - simplified
  const topicChanged = false; // Simplified topic detection
  const updatedState: ConversationState = {
    ...conversationState,
    activePersonaId: selectedPersona.id,
    lastSpeakerContinuityCount:
      conversationState.activePersonaId === selectedPersona.id
        ? conversationState.lastSpeakerContinuityCount + 1
        : 0,
    recentContributors: [...conversationState.recentContributors.slice(-4), selectedPersona.id],
    conversationEnergy: Math.min(1, conversationState.conversationEnergy + 0.1),
    needsClarification: false,
    topicStability: topicChanged ? 'shifting' : 'stable',
  };

  return {
    selectedPersona,
    enhancedResponse,
    updatedState,
    contributionScores,
  };
}

// Determine what type of response this should be
function determineResponseType(
  persona: Persona,
  context: ConversationContext,
  conversationState: ConversationState
): ResponseType {
  // Follow-up if same persona spoke recently and conversation is building
  if (
    conversationState.activePersonaId === persona.id &&
    conversationState.lastSpeakerContinuityCount < 3 &&
    context.conversationMomentum === 'building'
  ) {
    return 'follow-up';
  }

  // Agreement if conversation tone is collaborative and persona has high empathy
  if (
    context.overallTone === 'collaborative' &&
    persona.conversationalStyle?.empathy &&
    persona.conversationalStyle.empathy > 0.7
  ) {
    return Math.random() < 0.3 ? 'agreement' : 'primary';
  }

  // Concern if persona is formal and conversation momentum is low
  if (
    persona.conversationalStyle?.tone === 'formal' &&
    context.conversationMomentum === 'deciding'
  ) {
    return Math.random() < 0.4 ? 'concern' : 'primary';
  }

  // Transition if topic seems to be shifting
  if (context.topicShiftDetected) {
    return 'transition';
  }

  // Clarification if conversation momentum is clarifying or persona is junior
  if (context.conversationMomentum === 'clarifying' || persona.id === 'junior-developer') {
    return Math.random() < 0.6 ? 'clarification' : 'primary';
  }

  return 'primary';
}

// Create response enhancement configuration
function createResponseEnhancement(
  persona: Persona,
  responseType: ResponseType,
  context: ConversationContext,
  conversationState: ConversationState
): ResponseEnhancement {
  return {
    type: responseType,
    useTransition: responseType === 'transition',
    useFiller: Math.random() < 0.3,
    fillerType: 'casual',
    referenceMemory: Math.random() < 0.2,
    addEmotionalReflection: Math.random() < 0.1,
  };
}

// Determine what type of filler to use
function determineFillerType(
  persona: Persona,
  responseType: ResponseType,
  context: ConversationContext
): 'thinking' | 'hesitation' | 'transition' | 'agreement' | 'casual' {
  if (responseType === 'agreement') return 'agreement';
  if (responseType === 'transition') return 'transition';
  if (persona.conversationalStyle?.tone === 'formal') return 'hesitation';
  if (persona.conversationalStyle?.assertiveness && persona.conversationalStyle.assertiveness < 0.3)
    return 'thinking';

  return 'casual';
}

// Generate base content for the persona (placeholder - would integrate with your AI model)
function generateBaseContent(
  persona: Persona,
  currentTopic: string,
  responseType: ResponseType
): string {
  // This is a simplified example - in practice, this would integrate with your AI model
  const contentTemplates: Record<ResponseType, string[]> = {
    primary: [
      `I think we should focus on the technical aspects of ${currentTopic}.`,
      `From my experience with ${currentTopic}, the key challenge is implementation.`,
      `Looking at ${currentTopic}, we need to consider scalability and maintainability.`,
    ],
    'follow-up': [
      `And another important point about ${currentTopic} is performance optimization.`,
      `Also, we should think about how ${currentTopic} affects our existing architecture.`,
      `Plus, the security implications of ${currentTopic} need careful consideration.`,
    ],
    agreement: [
      `I completely agree with that approach to ${currentTopic}.`,
      `That's exactly the right way to handle ${currentTopic}.`,
      `Yes, that solution for ${currentTopic} addresses all the key concerns.`,
    ],
    concern: [
      `I'm worried about the complexity that ${currentTopic} might introduce.`,
      `One concern I have about ${currentTopic} is the maintenance overhead.`,
      `I think we need to be careful about the risks associated with ${currentTopic}.`,
    ],
    transition: [
      `Let's shift our focus to a different aspect of ${currentTopic}.`,
      `Moving on to another important consideration about ${currentTopic}.`,
      `Now let's examine ${currentTopic} from a different angle.`,
    ],
    clarification: [
      `Can someone help me understand how ${currentTopic} works in practice?`,
      `I'm not entirely clear on the implementation details of ${currentTopic}.`,
      `Could we clarify the requirements for ${currentTopic}?`,
    ],
  };

  const templates = contentTemplates[responseType];
  if (!templates || templates.length === 0) {
    return `Discussing ${currentTopic} from the perspective of ${persona.id}.`;
  }
  return templates[Math.floor(Math.random() * templates.length)];
}

// Analyze conversation flow and suggest improvements - delegate to shared utility
export function analyzeConversationFlow(
  messageHistory: MessageHistoryItem[],
  contributionScores: ContributionScore[]
): {
  flowQuality: number; // 0-1 score
  suggestions: string[];
  diversityScore: number; // 0-1 score for speaker diversity
} {
  const analysis = ConversationUtils.analyzeConversationFlow(messageHistory, contributionScores);

  // Return compatible interface (subset of shared utility response)
  return {
    flowQuality: analysis.flowQuality,
    suggestions: analysis.suggestions,
    diversityScore: analysis.diversityScore,
  };
}

// Get conversation insights and metrics - delegate to shared utility
export function getConversationInsights(
  messageHistory: MessageHistoryItem[],
  conversationState: ConversationState
): {
  totalMessages: number;
  uniqueParticipants: number;
  averageMessageLength: number;
  conversationEnergy: number;
  topContributors: Array<{ speaker: string; count: number; percentage: number }>;
  topicStability: string;
  emotionalTone: string;
} {
  const insights = ConversationUtils.getConversationInsights(messageHistory, conversationState);

  // Return compatible interface (subset of shared utility response)
  return {
    totalMessages: insights.totalMessages,
    uniqueParticipants: insights.uniqueParticipants,
    averageMessageLength: insights.averageMessageLength,
    conversationEnergy: insights.conversationEnergy,
    topContributors: insights.topContributors,
    topicStability: insights.topicStability,
    emotionalTone: insights.emotionalTone,
  };
}
