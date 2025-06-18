import { Persona } from '../types/persona';
import { 
  ConversationContext,
  ConversationState,
  ResponseType,
  ResponseEnhancement,
  ContributionScore,
  MessageHistoryItem
} from '../types/personaAdvanced';
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
  createConversationContext
} from './personaUtils';
import { contextualTriggers } from '../data/contextualTriggers';

/**
 * Enhanced Conversation Manager
 * 
 * This utility demonstrates how to use all the new conversation enhancement features
 * to create natural, fluid, human-like persona interactions.
 */

// Initialize conversation state
export function initializeConversationState(): ConversationState {
  return {
    activePersonaId: null,
    lastSpeakerContinuityCount: 0,
    recentContributors: [],
    conversationEnergy: 0.5,
    needsClarification: false,
    topicStability: 'stable'
  };
}

// Main function to get the next persona and their enhanced response
export function getNextPersonaContribution(
  availablePersonas: Persona[],
  messageHistory: MessageHistoryItem[],
  currentTopic: string,
  allPersonas: Record<string, Persona[]>,
  conversationState: ConversationState
): {
  selectedPersona: Persona | null;
  enhancedResponse: string;
  updatedState: ConversationState;
  contributionScores: ContributionScore[];
} | null {
  
  // Create conversation context from message history
  const context = createConversationContext(messageHistory);
  
  // Calculate contribution scores for all personas
  const contributionScores = availablePersonas.map(persona => 
    calculateContributionScore(persona, context, currentTopic, contextualTriggers, conversationState)
  );
  
  // Sort by score and get top candidates
  const sortedCandidates = contributionScores
    .sort((a, b) => b.score - a.score)
    .filter(score => score.score > 1.0); // Only consider personas above threshold
  
  if (sortedCandidates.length === 0) {
    return null; // No persona wants to contribute
  }
  
  // Select the best candidate (with some randomness for the top few)
  const topCandidates = sortedCandidates.slice(0, Math.min(3, sortedCandidates.length));
  const randomIndex = Math.floor(Math.random() * topCandidates.length);
  const selectedScore = topCandidates[randomIndex];
  
  const selectedPersona = availablePersonas.find(p => p.id === selectedScore.personaId);
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
    responseEnhancement,
    context,
    contextualTriggers
  );
  
  // Update conversation state
  const topicChanged = detectTopicShift(context.recentTopics, baseContent);
  const updatedState = updateConversationState(conversationState, selectedPersona.id, topicChanged);
  
  return {
    selectedPersona,
    enhancedResponse,
    updatedState,
    contributionScores
  };
}

// Determine what type of response this should be
function determineResponseType(
  persona: Persona,
  context: ConversationContext,
  conversationState: ConversationState
): ResponseType {
  
  // Follow-up if same persona spoke recently and conversation is building
  if (conversationState.activePersonaId === persona.id && 
      conversationState.lastSpeakerContinuityCount < 3 &&
      context.conversationMomentum === 'building') {
    return 'follow-up';
  }
  
  // Agreement if conversation tone is collaborative and persona has high empathy
  if (context.overallTone === 'collaborative' && persona.empathyLevel > 0.7) {
    return Math.random() < 0.3 ? 'agreement' : 'primary';
  }
  
  // Concern if persona is cautious and conversation momentum is deciding
  if (persona.tone === 'cautious' && context.conversationMomentum === 'deciding') {
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
    useTransition: responseType !== 'primary' || context.topicShiftDetected,
    useFiller: persona.tone === 'casual' || persona.energyLevel === 'low',
    fillerType: determineFillerType(persona, responseType, context),
    referenceMemory: context.recentTopics.length > 2 && Math.random() < 0.4,
    addEmotionalReflection: persona.empathyLevel > 0.7 && Math.random() < 0.5
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
  if (persona.tone === 'cautious') return 'hesitation';
  if (persona.energyLevel === 'low') return 'thinking';
  
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
      `Looking at ${currentTopic}, we need to consider scalability and maintainability.`
    ],
    'follow-up': [
      `And another important point about ${currentTopic} is performance optimization.`,
      `Also, we should think about how ${currentTopic} affects our existing architecture.`,
      `Plus, the security implications of ${currentTopic} need careful consideration.`
    ],
    agreement: [
      `I completely agree with that approach to ${currentTopic}.`,
      `That's exactly the right way to handle ${currentTopic}.`,
      `Yes, that solution for ${currentTopic} addresses all the key concerns.`
    ],
    concern: [
      `I'm worried about the complexity that ${currentTopic} might introduce.`,
      `One concern I have about ${currentTopic} is the maintenance overhead.`,
      `I think we need to be careful about the risks associated with ${currentTopic}.`
    ],
    transition: [
      `Let's shift our focus to a different aspect of ${currentTopic}.`,
      `Moving on to another important consideration about ${currentTopic}.`,
      `Now let's examine ${currentTopic} from a different angle.`
    ],
    clarification: [
      `Can someone help me understand how ${currentTopic} works in practice?`,
      `I'm not entirely clear on the implementation details of ${currentTopic}.`,
      `Could we clarify the requirements for ${currentTopic}?`
    ]
  };
  
  const templates = contentTemplates[responseType];
  return templates[Math.floor(Math.random() * templates.length)];
}

// Analyze conversation flow and suggest improvements
export function analyzeConversationFlow(
  messageHistory: MessageHistoryItem[],
  contributionScores: ContributionScore[]
): {
  flowQuality: number; // 0-1 score
  suggestions: string[];
  diversityScore: number; // 0-1 score for speaker diversity
} {
  
  if (messageHistory.length < 3) {
    return {
      flowQuality: 1.0,
      suggestions: [],
      diversityScore: 1.0
    };
  }
  
  const recentSpeakers = messageHistory.slice(-5).map(m => m.speaker);
  const uniqueSpeakers = new Set(recentSpeakers);
  const diversityScore = uniqueSpeakers.size / Math.min(5, recentSpeakers.length);
  
  // Check for back-to-back speakers
  let backToBackCount = 0;
  for (let i = 1; i < recentSpeakers.length; i++) {
    if (recentSpeakers[i] === recentSpeakers[i-1]) {
      backToBackCount++;
    }
  }
  
  // Check for dominating speakers
  const speakerCounts = recentSpeakers.reduce((acc, speaker) => {
    acc[speaker] = (acc[speaker] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const maxContributions = Math.max(...Object.values(speakerCounts));
  const dominationScore = maxContributions / recentSpeakers.length;
  
  // Calculate overall flow quality
  const flowQuality = Math.max(0, 1 - (backToBackCount * 0.2) - (dominationScore > 0.6 ? 0.3 : 0));
  
  // Generate suggestions
  const suggestions: string[] = [];
  
  if (diversityScore < 0.4) {
    suggestions.push("Consider encouraging more personas to participate for better diversity.");
  }
  
  if (backToBackCount > 2) {
    suggestions.push("Too many back-to-back contributions. Encourage speaker transitions.");
  }
  
  if (dominationScore > 0.6) {
    suggestions.push("One persona is dominating. Balance participation across personas.");
  }
  
  if (contributionScores.every(score => score.score < 1.5)) {
    suggestions.push("Low engagement scores. Consider introducing new topics or perspectives.");
  }
  
  return {
    flowQuality,
    suggestions,
    diversityScore
  };
}

// Get conversation insights and metrics
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
  
  const totalMessages = messageHistory.length;
  const uniqueParticipants = new Set(messageHistory.map(m => m.speaker)).size;
  const averageMessageLength = messageHistory.reduce((sum, m) => sum + m.content.length, 0) / totalMessages;
  
  // Calculate speaker contributions
  const speakerCounts = messageHistory.reduce((acc, msg) => {
    acc[msg.speaker] = (acc[msg.speaker] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topContributors = Object.entries(speakerCounts)
    .map(([speaker, count]) => ({
      speaker,
      count,
      percentage: (count / totalMessages) * 100
    }))
    .sort((a, b) => b.count - a.count);
  
  // Analyze emotional tone from recent messages
  const recentMessages = messageHistory.slice(-5);
  const emotionalWords = {
    positive: ['excited', 'great', 'love', 'excellent', 'amazing', 'fantastic'],
    negative: ['concerned', 'worried', 'problem', 'issue', 'difficult', 'frustrated'],
    neutral: ['think', 'consider', 'analyze', 'suggest', 'propose']
  };
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  recentMessages.forEach(msg => {
    const content = msg.content.toLowerCase();
    emotionalWords.positive.forEach(word => {
      if (content.includes(word)) positiveCount++;
    });
    emotionalWords.negative.forEach(word => {
      if (content.includes(word)) negativeCount++;
    });
  });
  
  let emotionalTone = 'neutral';
  if (positiveCount > negativeCount) emotionalTone = 'positive';
  else if (negativeCount > positiveCount) emotionalTone = 'negative';
  
  return {
    totalMessages,
    uniqueParticipants,
    averageMessageLength,
    conversationEnergy: conversationState.conversationEnergy,
    topContributors,
    topicStability: conversationState.topicStability,
    emotionalTone
  };
}

// Export ready-to-use conversation enhancement functions
export {
  calculateContributionScore,
  shouldPersonaContribute,
  getResponseStarter,
  getFiller,
  getMemoryReference,
  getEmotionalReflection,
  generateEnhancedResponse,
  updateConversationState,
  detectTopicShift,
  createConversationContext
}; 