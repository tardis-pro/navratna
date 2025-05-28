import { Persona, PersonaTrait } from '../types/persona';
import { 
  HybridPersona, 
  ConversationContext, 
  MessageHistoryItem, 
  HybridSuggestion,
  ConversationType,
  ContextualTrigger,
  PersonaCategory
} from '../types/personaAdvanced';

// Helper function to extract trait strings from PersonaTrait objects or string arrays
function extractTraitStrings(traits: PersonaTrait[] | string[]): string[] {
  if (traits.length === 0) return [];
  
  // Check if first element is string or object
  if (typeof traits[0] === 'string') {
    return traits as string[];
  } else {
    return (traits as PersonaTrait[]).map(trait => trait.name);
  }
}

// Helper function to convert string traits to PersonaTrait objects
function convertStringTraitsToPersonaTraits(traitStrings: string[]): PersonaTrait[] {
  return traitStrings.map(trait => ({
    name: trait,
    description: `Hybrid trait: ${trait}`,
    strength: 7 // Default strength for hybrid traits
  }));
}

// Cross-breeding function to create hybrid personas
export function crossBreedPersonas(
  parent1: Persona, 
  parent2: Persona, 
  name: string,
  dominantParent: 'parent1' | 'parent2' = 'parent1'
): HybridPersona {
  const hybridId = `hybrid-${parent1.id}-${parent2.id}-${Date.now()}`;
  
  // Extract trait strings for combining
  const parent1Traits = extractTraitStrings(parent1.traits);
  const parent2Traits = extractTraitStrings(parent2.traits);
  
  // Combine traits (remove duplicates)
  const combinedTraitStrings = Array.from(new Set([...parent1Traits, ...parent2Traits]));
  const combinedTraits = convertStringTraitsToPersonaTraits(combinedTraitStrings);
  
  // Combine expertise (remove duplicates)
  const combinedExpertise = Array.from(new Set([...parent1.expertise, ...parent2.expertise]));
  
  // Create hybrid description
  const hybridDescription = dominantParent === 'parent1' 
    ? `A ${parent1.role} with ${parent2.role} insights. ${parent1.description} Enhanced with ${parent2.expertise.slice(0, 2).join(' and ')} expertise.`
    : `A ${parent2.role} with ${parent1.role} insights. ${parent2.description} Enhanced with ${parent1.expertise.slice(0, 2).join(' and ')} expertise.`;
  
  // Create hybrid role
  const hybridRole = `${parent1.role}/${parent2.role} Hybrid`;
  
  // Create blended system prompt
  const dominantPrompt = dominantParent === 'parent1' ? parent1.systemPrompt : parent2.systemPrompt;
  
  // Extract key elements from secondary prompt
  const secondaryExpertise = dominantParent === 'parent1' ? parent2.expertise.slice(0, 3) : parent1.expertise.slice(0, 3);
  const secondaryRole = dominantParent === 'parent1' ? parent2.role : parent1.role;
  
  const hybridSystemPrompt = dominantPrompt + `

HYBRID ENHANCEMENT:
You also have expertise in ${secondaryExpertise.join(', ')} from your ${secondaryRole} background. 
Blend these perspectives naturally when relevant to the discussion.

ADDITIONAL CONVERSATION PATTERNS:
- "Combining my ${parent1.role} and ${parent2.role} experience..."
- "From both a [domain1] and [domain2] perspective..."
- "This bridges what I know about [parent1 expertise] and [parent2 expertise]..."

Leverage your dual expertise naturally, don't force it. /no_think`;

  // Calculate personality blend (simplified)
  const personalityBlend = combinedTraitStrings.reduce((blend, trait) => {
    const isFromParent1 = parent1Traits.includes(trait);
    const isFromParent2 = parent2Traits.includes(trait);
    
    if (isFromParent1 && isFromParent2) {
      blend[trait] = 1.0; // Strong trait from both parents
    } else if (dominantParent === 'parent1' && isFromParent1) {
      blend[trait] = 0.8; // Strong from dominant parent
    } else if (dominantParent === 'parent2' && isFromParent2) {
      blend[trait] = 0.8; // Strong from dominant parent
    } else {
      blend[trait] = 0.4; // Weaker trait from non-dominant parent
    }
    
    return blend;
  }, {} as Record<string, number>);

  return {
    id: hybridId,
    name,
    role: hybridRole,
    description: hybridDescription,
    traits: combinedTraits,
    expertise: combinedExpertise,
    systemPrompt: hybridSystemPrompt,
    background: `Hybrid of ${parent1.role} and ${parent2.role}`,
    parentPersonas: [parent1.id, parent2.id],
    hybridTraits: combinedTraitStrings,
    dominantExpertise: dominantParent === 'parent1' ? parent1.expertise[0] : parent2.expertise[0],
    personalityBlend
  };
}

// Function to generate random hybrid combinations
export function generateRandomHybrid(allPersonasFlat: Persona[], name: string): HybridPersona {
  const shuffled = [...allPersonasFlat].sort(() => 0.5 - Math.random());
  const parent1 = shuffled[0];
  const parent2 = shuffled[1];
  const dominantParent = Math.random() > 0.5 ? 'parent1' : 'parent2';
  
  return crossBreedPersonas(parent1, parent2, name, dominantParent);
}

// Helper function to get all personas as a flat array for cross-breeding
export function getAllPersonasFlat(allPersonas: Record<string, Persona[]>): Persona[] {
  return Object.values(allPersonas).flat();
}

// Helper function to get a persona by ID
export function getPersonaById(id: string, allPersonas: Record<string, Persona[]>): Persona | undefined {
  for (const category of Object.values(allPersonas)) {
    const persona = category.find(p => p.id === id);
    if (persona) return persona;
  }
  return undefined;
}

// Function to get hybrid suggestions based on current personas
export function getHybridSuggestions(currentPersonas: Persona[]): HybridSuggestion[] {
  if (currentPersonas.length < 2) return [];
  
  const suggestions = [];
  for (let i = 0; i < currentPersonas.length; i++) {
    for (let j = i + 1; j < currentPersonas.length; j++) {
      const p1 = currentPersonas[i];
      const p2 = currentPersonas[j];
      const name = `${p1.role}/${p2.role} Hybrid`;
      const description = `Combines ${p1.expertise.slice(0,2).join(' & ')} with ${p2.expertise.slice(0,2).join(' & ')}`;
      suggestions.push({
        parent1: p1.id,
        parent2: p2.id,
        name,
        description
      });
    }
  }
  
  return suggestions.slice(0, 4); // Return top 4 suggestions
}

// Helper function to check if a persona should be triggered by content
export function shouldPersonaActivate(
  personaId: string, 
  content: string,
  contextualTriggers: Record<string, ContextualTrigger>
): boolean {
  const triggers = contextualTriggers[personaId];
  if (!triggers) return false;
  
  const lowerContent = content.toLowerCase();
  return triggers.conversationMoments.some(moment => lowerContent.includes(moment.toLowerCase()));
}

// Helper function to get activation phrase for a persona
export function getActivationPhrase(
  personaId: string,
  contextualTriggers: Record<string, ContextualTrigger>
): string {
  const triggers = contextualTriggers[personaId];
  if (!triggers || triggers.buildOnPatterns.length === 0) return '';
  
  return triggers.buildOnPatterns[Math.floor(Math.random() * triggers.buildOnPatterns.length)];
}

// Helper function to get concern flag for a persona
export function getConcernFlag(
  personaId: string,
  contextualTriggers: Record<string, ContextualTrigger>
): string {
  const triggers = contextualTriggers[personaId];
  if (!triggers || triggers.questionPatterns.length === 0) return '';
  
  return triggers.questionPatterns[Math.floor(Math.random() * triggers.questionPatterns.length)];
}

// Helper function to get build-on pattern for a persona
export function getBuildOnPattern(
  personaId: string,
  contextualTriggers: Record<string, ContextualTrigger>
): string {
  const triggers = contextualTriggers[personaId];
  if (!triggers || triggers.supportPatterns.length === 0) return '';
  
  return triggers.supportPatterns[Math.floor(Math.random() * triggers.supportPatterns.length)];
}

// Generate contextual response based on conversation history
export function generateContextualResponse(
  personaId: string, 
  lastSpeaker: string, 
  lastTopic: string, 
  conversationType: ConversationType = 'build-on',
  contextualTriggers: Record<string, ContextualTrigger>
): string {
  const triggers = contextualTriggers[personaId];
  if (!triggers) return '';

  let patterns: string[] = [];
  switch (conversationType) {
    case 'build-on':
      patterns = triggers.buildOnPatterns;
      break;
    case 'question':
      patterns = triggers.questionPatterns;
      break;
    case 'support':
      patterns = triggers.supportPatterns;
      break;
  }

  if (patterns.length === 0) return '';

  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  return pattern
    .replace('{speaker}', lastSpeaker)
    .replace('{topic}', lastTopic);
}

// Determine conversation momentum based on recent messages
export function analyzeConversationMomentum(recentMessages: string[]): ConversationContext['conversationMomentum'] {
  if (recentMessages.length === 0) return 'building';
  
  const lastMessage = recentMessages[recentMessages.length - 1].toLowerCase();
  
  if (lastMessage.includes('?') || lastMessage.includes('clarify') || lastMessage.includes('explain')) {
    return 'clarifying';
  }
  if (lastMessage.includes('decide') || lastMessage.includes('choose') || lastMessage.includes('should we')) {
    return 'deciding';
  }
  if (lastMessage.includes('what if') || lastMessage.includes('consider') || lastMessage.includes('explore')) {
    return 'exploring';
  }
  
  return 'building';
}

// Check if persona should contribute based on conversation context
export function shouldPersonaContribute(
  personaId: string, 
  context: ConversationContext,
  currentTopic: string,
  contextualTriggers: Record<string, ContextualTrigger>
): boolean {
  const triggers = contextualTriggers[personaId];
  if (!triggers) return false;

  // Check if any conversation moments match
  const topicLower = currentTopic.toLowerCase();
  const momentMatch = triggers.conversationMoments.some(moment => 
    topicLower.includes(moment.toLowerCase())
  );

  // Check conversation momentum
  const momentumMatch = context.conversationMomentum === 'clarifying' && personaId === 'junior-developer';
  
  // Avoid back-to-back contributions from same persona
  const lastSpeaker = context.speakerHistory[context.speakerHistory.length - 1];
  const recentSpeaker = lastSpeaker === personaId;

  return (momentMatch || momentumMatch) && !recentSpeaker;
}

// Generate natural conversation starter for a persona
export function generateConversationStarter(personaId: string, topic: string): string {
  const starters: Record<string, string[]> = {
    'tech-lead': [
      `Looking at this ${topic} discussion, I think we should consider...`,
      `From an architectural perspective on ${topic}...`,
      `I've seen similar ${topic} challenges before...`
    ],
    'software-engineer': [
      `For the ${topic} implementation, we could...`,
      `I've worked with ${topic} before, and what worked well was...`,
      `From a coding standpoint on ${topic}...`
    ],
    'qa-engineer': [
      `Thinking about ${topic} from a quality perspective...`,
      `For ${topic}, we'd want to ensure...`,
      `I'm considering the testing implications of ${topic}...`
    ],
    'junior-developer': [
      `I'm trying to understand how ${topic} works...`,
      `Could someone help me understand ${topic}?`,
      `I have a question about ${topic}...`
    ],
    'devops-engineer': [
      `From an operations standpoint, ${topic} would require...`,
      `Thinking about ${topic} in production...`,
      `For ${topic} deployment, we'd need to consider...`
    ],
    'data-scientist': [
      `From a data perspective, ${topic} could be analyzed by...`,
      `The metrics around ${topic} would include...`,
      `I'm thinking about the data implications of ${topic}...`
    ],
    'policy-analyst': [
      `From a policy standpoint, ${topic} would require...`,
      `The implementation challenges for ${topic} include...`,
      `Looking at ${topic} from a governance perspective...`
    ],
    'economist': [
      `The economic implications of ${topic} would be...`,
      `From a market perspective, ${topic} could affect...`,
      `The cost-benefit analysis of ${topic} suggests...`
    ],
    'legal-expert': [
      `From a legal perspective, ${topic} would need...`,
      `The regulatory requirements for ${topic} include...`,
      `Looking at ${topic} from a compliance standpoint...`
    ],
    'philosopher': [
      `The ethical implications of ${topic} raise questions about...`,
      `From a philosophical perspective, ${topic} challenges us to consider...`,
      `The fundamental assumptions about ${topic} include...`
    ]
  };

  const personaStarters = starters[personaId] || [];
  if (personaStarters.length === 0) return '';

  return personaStarters[Math.floor(Math.random() * personaStarters.length)];
}

// Create conversation context from message history
export function createConversationContext(
  messageHistory: MessageHistoryItem[]
): ConversationContext {
  const recentMessages = messageHistory.slice(-5).map(m => m.content);
  const speakerHistory = messageHistory.slice(-3).map(m => m.speaker);
  
  // Extract topics from recent messages (simplified)
  const recentTopics = recentMessages.flatMap(msg => 
    msg.toLowerCase().split(' ').filter(word => word.length > 4)
  ).slice(0, 10);

  // Group key points by speaker
  const keyPoints: Record<string, string[]> = {};
  messageHistory.slice(-10).forEach(msg => {
    if (!keyPoints[msg.speaker]) keyPoints[msg.speaker] = [];
    // Extract key phrases (simplified)
    const sentences = msg.content.split('.').filter(s => s.trim().length > 10);
    keyPoints[msg.speaker].push(...sentences.slice(0, 2));
  });

  // Track last contribution per speaker
  const lastSpeakerContribution: Record<string, string> = {};
  messageHistory.slice(-5).forEach(msg => {
    lastSpeakerContribution[msg.speaker] = msg.content;
  });

  return {
    recentTopics,
    speakerHistory,
    keyPoints,
    conversationMomentum: analyzeConversationMomentum(recentMessages),
    lastSpeakerContribution
  };
} 