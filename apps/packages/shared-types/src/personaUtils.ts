import { Persona, PersonaTrait } from './persona';
import {
  HybridPersona,
  ConversationContext,
  MessageHistoryItem,
  HybridSuggestion,
  ConversationType,
  ContextualTrigger,
  ConversationState,
  ResponseType,
  FillerType,
  ResponseEnhancement,
  ContributionScore,
} from './personaAdvanced';

// Helper function to extract trait strings from PersonaTrait objects or string arrays
function extractTraitStrings(traits: PersonaTrait[] | string[]): string[] {
  if (traits.length === 0) return [];

  // Check if first element is string or object
  if (typeof traits[0] === 'string') {
    return traits as string[];
  } else {
    return (traits as PersonaTrait[]).map((trait) => trait.name || '');
  }
}

// Helper function to convert string traits to PersonaTrait objects
function convertStringTraitsToPersonaTraits(traitStrings: string[]): PersonaTrait[] {
  return traitStrings.map((trait) => ({
    name: trait,
    description: `Hybrid trait: ${trait}`,
    weight: 0.7, // Default weight for hybrid traits
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
  const parent1Traits = extractTraitStrings(parent1.traits || []);
  const parent2Traits = extractTraitStrings(parent2.traits || []);

  // Combine traits (remove duplicates)
  const combinedTraitStrings = Array.from(new Set([...parent1Traits, ...parent2Traits]));
  const combinedTraits = convertStringTraitsToPersonaTraits(combinedTraitStrings);

  // Combine expertise (remove duplicates) - expertise is ExpertiseDomain[] in the new schema
  const combinedExpertise = Array.from(
    new Set([...(parent1.expertise || []), ...(parent2.expertise || [])])
  );

  // Create hybrid description
  const parent1ExpertiseNames = parent1.expertise?.slice(0, 2).map((e) => e.name) || [];
  const parent2ExpertiseNames = parent2.expertise?.slice(0, 2).map((e) => e.name) || [];

  const hybridDescription =
    dominantParent === 'parent1'
      ? `A ${parent1.role} with ${parent2.role} insights. ${parent1.description} Enhanced with ${parent2ExpertiseNames.join(' and ')} expertise.`
      : `A ${parent2.role} with ${parent1.role} insights. ${parent2.description} Enhanced with ${parent1ExpertiseNames.join(' and ')} expertise.`;

  // Create hybrid role
  const hybridRole = `${parent1.role}/${parent2.role} Hybrid`;

  // Create blended system prompt
  const dominantPrompt = dominantParent === 'parent1' ? parent1.systemPrompt : parent2.systemPrompt;

  // Extract key elements from secondary prompt
  const secondaryExpertise =
    dominantParent === 'parent1'
      ? parent2ExpertiseNames.slice(0, 3)
      : parent1ExpertiseNames.slice(0, 3);
  const secondaryRole = dominantParent === 'parent1' ? parent2.role : parent1.role;

  const hybridSystemPrompt =
    dominantPrompt +
    `

HYBRID ENHANCEMENT:
You also have expertise in ${secondaryExpertise.join(', ')} from your ${secondaryRole} background. 
Blend these perspectives naturally when relevant to the discussion.

ADDITIONAL CONVERSATION PATTERNS:
- "Combining my ${parent1.role} and ${parent2.role} experience..."
- "From both a [domain1] and [domain2] perspective..."
- "This bridges what I know about [parent1 expertise] and [parent2 expertise]..."

Leverage your dual expertise naturally, don't force it. /no_think`;

  // Calculate personality blend (simplified)
  const personalityBlend = combinedTraitStrings.reduce(
    (blend, trait) => {
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
    },
    {} as Record<string, number>
  );

  // Blend conversational characteristics
  const dominantPersona = dominantParent === 'parent1' ? parent1 : parent2;
  const secondaryPersona = dominantParent === 'parent1' ? parent2 : parent1;

  // Get dominant expertise safely
  const dominantExpertise =
    dominantPersona.expertise && dominantPersona.expertise.length > 0
      ? dominantPersona.expertise[0].name
      : '';

  return {
    id: hybridId,
    name,
    role: hybridRole,
    description: hybridDescription,
    traits: combinedTraits,
    expertise: combinedExpertise,
    systemPrompt: hybridSystemPrompt,
    background: `Hybrid of ${parent1.role} and ${parent2.role}`,
    parentPersonas: [parent1.id || '', parent2.id || ''],
    hybridTraits: combinedTraitStrings,
    dominantExpertise,
    personalityBlend,
    // Blend conversational characteristics with safe defaults - using conversationalStyle
    conversationalStyle: {
      tone: dominantPersona.conversationalStyle?.tone || 'analytical',
      verbosity: secondaryPersona.conversationalStyle?.verbosity || 'moderate',
      formality: dominantPersona.conversationalStyle?.formality || 'neutral',
      empathy: Math.max(
        dominantPersona.conversationalStyle?.empathy || 0.5,
        secondaryPersona.conversationalStyle?.empathy || 0.5
      ),
      assertiveness:
        ((dominantPersona.conversationalStyle?.assertiveness || 0.5) +
          (secondaryPersona.conversationalStyle?.assertiveness || 0.5)) /
        2,
      creativity: Math.max(
        dominantPersona.conversationalStyle?.creativity || 0.5,
        secondaryPersona.conversationalStyle?.creativity || 0.5
      ),
      analyticalDepth: dominantPersona.conversationalStyle?.analyticalDepth || 0.5,
      questioningStyle: dominantPersona.conversationalStyle?.questioningStyle || 'exploratory',
      responsePattern: dominantPersona.conversationalStyle?.responsePattern || 'structured',
    },
    status: dominantPersona.status,
    visibility: dominantPersona.visibility,
    createdBy: dominantPersona.createdBy,
    organizationId: dominantPersona.organizationId,
    teamId: dominantPersona.teamId,
    version: 1,
    tags: Array.from(new Set([...(dominantPersona.tags || []), ...(secondaryPersona.tags || [])])),
    capabilities: Array.from(
      new Set([...(dominantPersona.capabilities || []), ...(secondaryPersona.capabilities || [])])
    ),
  } as HybridPersona;
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
export function getPersonaById(
  id: string,
  allPersonas: Record<string, Persona[]>
): Persona | undefined {
  for (const category of Object.values(allPersonas)) {
    const persona = category.find((p) => p.id === id);
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

      const p1Expertise = p1.expertise?.slice(0, 2).map((e) => e.name) || [];
      const p2Expertise = p2.expertise?.slice(0, 2).map((e) => e.name) || [];

      const description = `Combines ${p1Expertise.join(' & ')} with ${p2Expertise.join(' & ')}`;
      suggestions.push({
        parent1: p1.id || '',
        parent2: p2.id || '',
        name,
        description,
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
  return triggers.conversationMoments.some((moment) => lowerContent.includes(moment.toLowerCase()));
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
    case 'agree':
      patterns = triggers.agreementPhrases || [];
      break;
    case 'transition':
      patterns = triggers.transitionPhrases || [];
      break;
    case 'reflect':
      patterns = triggers.emotionalReflections || [];
      break;
  }

  if (patterns.length === 0) return '';

  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  return pattern.replace('{speaker}', lastSpeaker).replace('{topic}', lastTopic);
}

// Determine conversation momentum based on recent messages
export function analyzeConversationMomentum(
  recentMessages: string[]
): ConversationContext['conversationMomentum'] {
  if (recentMessages.length === 0) return 'building';

  const lastMessage = recentMessages[recentMessages.length - 1].toLowerCase();

  if (
    lastMessage.includes('?') ||
    lastMessage.includes('clarify') ||
    lastMessage.includes('explain')
  ) {
    return 'clarifying';
  }
  if (
    lastMessage.includes('decide') ||
    lastMessage.includes('choose') ||
    lastMessage.includes('should we')
  ) {
    return 'deciding';
  }
  if (
    lastMessage.includes('what if') ||
    lastMessage.includes('consider') ||
    lastMessage.includes('explore')
  ) {
    return 'exploring';
  }

  return 'building';
}

// Enhanced weighted contribution scoring function
export function calculateContributionScore(
  persona: Persona,
  context: ConversationContext,
  currentTopic: string,
  contextualTriggers: Record<string, ContextualTrigger>,
  conversationState: ConversationState
): ContributionScore {
  const triggers = contextualTriggers[persona.id || ''];

  // Factor 1: Topic match (0-1.0)
  const topicLower = currentTopic.toLowerCase();
  const topicMatch = triggers?.conversationMoments.some((moment) =>
    topicLower.includes(moment.toLowerCase())
  )
    ? 1.0
    : 0.0;

  // Factor 2: Momentum match (0-0.5)
  const momentumMatch =
    context.conversationMomentum === 'clarifying' && persona.id === 'junior-developer' ? 0.5 : 0.2;

  // Factor 3: Chattiness factor (persona's natural tendency to contribute)
  const chattinessFactor = persona.conversationalStyle?.assertiveness || 0.5;

  // Factor 4: Continuity penalty (avoid back-to-back from same persona)
  const lastSpeaker = context.speakerHistory[context.speakerHistory.length - 1];
  const continuityPenalty = lastSpeaker === persona.id ? -0.8 : 0.0;

  // Factor 5: Energy bonus (high energy personas contribute more in dynamic conversations)
  const verbosity = persona.conversationalStyle?.verbosity;
  const energyBonus =
    verbosity === 'verbose' || verbosity === 'detailed'
      ? conversationState.conversationEnergy * 0.2
      : 0.0;

  const totalScore =
    topicMatch + momentumMatch + chattinessFactor + continuityPenalty + energyBonus;

  return {
    personaId: persona.id || '',
    score: totalScore,
    factors: {
      topicMatch,
      momentumMatch,
      chattinessFactor,
      continuityPenalty,
      energyBonus,
    },
  };
}

// Enhanced persona contribution decision with weighted scoring
export function shouldPersonaContribute(
  personaId: string,
  context: ConversationContext,
  currentTopic: string,
  contextualTriggers: Record<string, ContextualTrigger>,
  allPersonas: Record<string, Persona[]>,
  conversationState: ConversationState,
  threshold: number = 1.2
): boolean {
  const persona = getPersonaById(personaId, allPersonas);
  if (!persona) return false;

  const score = calculateContributionScore(
    persona,
    context,
    currentTopic,
    contextualTriggers,
    conversationState
  );
  return score.score > threshold;
}

// Generate tone-appropriate response starters
export function getResponseStarter(
  persona: Persona,
  responseType: ResponseType,
  _context: ConversationContext
): string {
  const tone = persona.conversationalStyle?.tone || 'analytical';
  // const formality = persona.conversationalStyle?.formality || 'neutral';

  const starters: Record<string, Record<ResponseType, string[]>> = {
    casual: {
      primary: ['Yeah, so...', 'Right, I think...', 'OK so...'],
      'follow-up': ['Just to add to that...', 'Oh, and also...', 'Plus...'],
      agreement: ['+1 to that.', 'Exactly!', 'Yeah, totally.'],
      concern: ['Hmm, one thing though...', "Wait, I'm a bit worried about..."],
      transition: ['Switching gears a bit...', 'So, moving on to...'],
      clarification: ['Sorry, could you clarify...', 'Just to make sure I understand...'],
    },
    analytical: {
      primary: [
        'Looking at this from...',
        'I think we need to consider...',
        'The data suggests...',
      ],
      'follow-up': ['To build on that analysis...', 'Additionally...', 'Furthermore...'],
      agreement: ['That analysis is sound.', 'I concur with that assessment.'],
      concern: ['I see a potential issue with...', 'We should be cautious about...'],
      transition: ["Let's examine...", 'Now, considering...'],
      clarification: ['Could you elaborate on...', 'I need clarification on...'],
    },
    friendly: {
      primary: [
        'I understand that...',
        'From a human perspective...',
        'Considering how this affects people...',
      ],
      'follow-up': ['I also want to add...', 'Building on that caring approach...'],
      agreement: ['I really feel that too.', 'That resonates with me.'],
      concern: ["I'm concerned about how this might impact...", 'I worry that...'],
      transition: ["Let's think about how this affects...", 'Shifting to the human side...'],
      clarification: ['Help me understand...', 'Could you share more about...'],
    },
    professional: {
      primary: ['Quick point:', 'Simply put:', 'Bottom line:'],
      'follow-up': ['Also:', 'Plus:', 'And:'],
      agreement: ['Agreed.', 'Correct.', 'Yes.'],
      concern: ['Issue:', 'Problem:', 'Concern:'],
      transition: ['Next:', 'Moving on:', 'Now:'],
      clarification: ['Clarify:', 'Explain:', 'What exactly...'],
    },
    academic: {
      primary: [
        "I'd like to elaborate on this topic because...",
        'Let me walk through my thinking here...',
      ],
      'follow-up': [
        'I want to expand on that excellent point and add some additional considerations...',
      ],
      agreement: ['I wholeheartedly agree with that perspective and would like to emphasize...'],
      concern: ['I have some concerns that I think are worth exploring in detail...'],
      transition: ["I'd like to shift our focus to a related but distinct area..."],
      clarification: ['Could you help me understand the nuances of...'],
    },
    creative: {
      primary: [
        'Well, this is interesting! 😄',
        "OK, so here's my take...",
        'Alright, buckle up...',
      ],
      'follow-up': ["Oh, and here's the fun part...", "Wait, there's more! 😅"],
      agreement: ['Ha! Exactly my thoughts!', 'You read my mind! 🎯'],
      concern: ['Uh oh, I see a potential plot twist...', 'Houston, we might have a problem...'],
      transition: ['Plot twist time!', 'And now for something completely different...'],
      clarification: ['OK, help me out here...', "I'm a bit lost, could you..."],
    },
    formal: {
      primary: [
        'I want to be careful here, but...',
        'Let me think through this...',
        'We should proceed carefully...',
      ],
      'follow-up': [
        'I also want to mention, with some caution...',
        "Additionally, though I'm hesitant to say...",
      ],
      agreement: ['I tentatively agree...', 'That seems reasonable, though...'],
      concern: ["I'm quite concerned about...", 'This raises some red flags...'],
      transition: ["Let's carefully consider...", "I'd like to cautiously explore..."],
      clarification: [
        'Before we proceed, could you clarify...',
        'I want to make sure I understand...',
      ],
    },
  };

  const toneStarters = starters[tone]?.[responseType] || starters['analytical'][responseType];
  return toneStarters[Math.floor(Math.random() * toneStarters.length)];
}

// Generate appropriate fillers based on persona and type
export function getFiller(persona: Persona, fillerType: FillerType): string {
  const tone = persona.conversationalStyle?.tone || 'analytical';

  const fillers: Record<FillerType, Record<string, string[]>> = {
    thinking: {
      casual: ['Let me think...', 'Hmm...', 'So...'],
      analytical: ['Let me analyze this...', 'Processing this...', 'Evaluating...'],
      friendly: ["I'm reflecting on this...", 'Let me consider...'],
      professional: ['...', 'Thinking.', 'Hmm.'],
      academic: ["I'm taking a moment to carefully consider the implications..."],
      creative: ['*thinking face* 🤔', 'Give me a sec... *brain loading*'],
      formal: ['Let me carefully think this through...', 'I need to consider this carefully...'],
    },
    hesitation: {
      casual: ['Well...', 'I mean...', 'Like...'],
      analytical: ['However...', 'That said...', 'On the other hand...'],
      friendly: ['I feel like...', 'It seems to me...'],
      professional: ['But...', 'Though...'],
      academic: ['I find myself somewhat hesitant to say this, but...'],
      creative: ['Uh... well... 😅', '*nervous laugh*'],
      formal: ["I'm hesitant to say this, but...", "I'm not entirely sure, but..."],
    },
    transition: {
      casual: ['Anyway...', 'So...', 'But yeah...'],
      analytical: ['Therefore...', 'Consequently...', 'As a result...'],
      friendly: ['I also feel...', "What's important to me is..."],
      professional: ['Next:', 'Also:'],
      academic: ['Moving forward with this line of thinking...'],
      creative: ['*drum roll*', 'And now...', 'Plot twist!'],
      formal: ['Moving carefully to...', 'Let me cautiously transition to...'],
    },
    agreement: {
      casual: ['Yeah!', 'Totally!', 'For sure!'],
      analytical: ['Precisely.', 'Correct.', "That's accurate."],
      friendly: ['I feel that too.', 'That resonates.'],
      professional: ['Yes.', 'Agreed.'],
      academic: ['I find myself in complete agreement with that sentiment...'],
      creative: ['Boom! 💥', 'Nailed it!', 'Ding ding! 🔔'],
      formal: ['I believe so...', 'That seems right...'],
    },
    casual: {
      casual: ['You know...', 'I guess...', 'Maybe...'],
      analytical: ['In fact...', 'Indeed...', 'Actually...'],
      friendly: ['I sense...', 'It feels like...'],
      professional: ['Well...'],
      academic: ['As I was contemplating this...'],
      creative: ['LOL', '*shrugs*', 'Haha'],
      formal: ['Perhaps...', 'Possibly...'],
    },
  };

  const personaFillers = fillers[fillerType]?.[tone] || fillers[fillerType]['analytical'];
  return personaFillers[Math.floor(Math.random() * personaFillers.length)];
}

// Get memory reference for a persona
export function getMemoryReference(
  persona: Persona,
  context: ConversationContext,
  contextualTriggers: Record<string, ContextualTrigger>
): string {
  const triggers = contextualTriggers[persona.id || ''];
  if (!triggers?.memoryReferences || triggers.memoryReferences.length === 0) return '';

  const references = triggers.memoryReferences;
  const reference = references[Math.floor(Math.random() * references.length)];

  // Try to find a relevant previous topic
  const relevantTopic = context.recentTopics.find((topic) => topic.length > 4) || 'that topic';

  return reference.replace('{topic}', relevantTopic);
}

// Get emotional reflection for empathetic personas
export function getEmotionalReflection(
  persona: Persona,
  currentTopic: string,
  contextualTriggers: Record<string, ContextualTrigger>
): string {
  const empathyLevel = persona.conversationalStyle?.empathy || 0.5;
  if (empathyLevel < 0.6) return ''; // Only high-empathy personas reflect

  const triggers = contextualTriggers[persona.id || ''];
  if (!triggers?.emotionalReflections || triggers.emotionalReflections.length === 0) {
    // Default emotional reflections
    const defaultReflections = [
      `I wonder how this ${currentTopic} would impact users who aren't tech-savvy?`,
      `From a human perspective, we need to consider how ${currentTopic} affects everyone.`,
      `I'm thinking about the broader implications of ${currentTopic} on people's lives.`,
    ];
    return defaultReflections[Math.floor(Math.random() * defaultReflections.length)];
  }

  const reflections = triggers.emotionalReflections;
  const reflection = reflections[Math.floor(Math.random() * reflections.length)];

  return reflection.replace('{topic}', currentTopic);
}

// Enhanced response generator with all improvements
export function generateEnhancedResponse(
  persona: Persona,
  content: string,
  responseEnhancement: ResponseEnhancement,
  context: ConversationContext,
  contextualTriggers: Record<string, ContextualTrigger>
): string {
  const response = content;
  const parts: string[] = [];

  // Add transition/starter if requested
  if (responseEnhancement.useTransition || responseEnhancement.type !== 'primary') {
    const starter = getResponseStarter(persona, responseEnhancement.type, context);
    if (starter) parts.push(starter);
  }

  // Add filler if requested (30% chance to make it natural)
  if (responseEnhancement.useFiller && responseEnhancement.fillerType && Math.random() < 0.3) {
    const filler = getFiller(persona, responseEnhancement.fillerType);
    if (filler) parts.push(filler);
  }

  // Add memory reference if requested
  if (responseEnhancement.referenceMemory && Math.random() < 0.4) {
    const memoryRef = getMemoryReference(persona, context, contextualTriggers);
    if (memoryRef) parts.push(memoryRef);
  }

  // Add main content
  parts.push(response);

  // Add emotional reflection if requested
  if (
    responseEnhancement.addEmotionalReflection &&
    (persona.conversationalStyle?.empathy || 0.5) > 0.6
  ) {
    const currentTopic = context.recentTopics[0] || 'this';
    const reflection = getEmotionalReflection(persona, currentTopic, contextualTriggers);
    if (reflection) parts.push(reflection);
  }

  // Add style-specific modifications
  const questioningStyle = persona.conversationalStyle?.questioningStyle;
  if (questioningStyle === 'exploratory' && !response.includes('?')) {
    const questions = [
      'What do you all think?',
      'Does that make sense?',
      'Am I missing something?',
    ];
    parts.push(questions[Math.floor(Math.random() * questions.length)]);
  }

  return parts.join(' ');
}

// Update conversation state based on new contribution
export function updateConversationState(
  state: ConversationState,
  newSpeaker: string,
  topicChanged: boolean
): ConversationState {
  const updatedRecentContributors = [newSpeaker, ...state.recentContributors.slice(0, 4)];

  return {
    activePersonaId: newSpeaker,
    lastSpeakerContinuityCount:
      state.activePersonaId === newSpeaker ? state.lastSpeakerContinuityCount + 1 : 1,
    recentContributors: updatedRecentContributors,
    conversationEnergy: Math.min(1.0, state.conversationEnergy + 0.1),
    needsClarification: false, // Reset after each contribution
    topicStability: topicChanged ? 'shifting' : 'stable',
  };
}

// Detect topic shift in conversation
export function detectTopicShift(
  previousTopics: string[],
  currentMessage: string,
  threshold: number = 0.3
): boolean {
  if (previousTopics.length === 0) return false;

  const currentWords = currentMessage
    .toLowerCase()
    .split(' ')
    .filter((word) => word.length > 3);
  const previousWords = previousTopics
    .join(' ')
    .toLowerCase()
    .split(' ')
    .filter((word) => word.length > 3);

  const overlap = currentWords.filter((word) => previousWords.includes(word)).length;
  const similarity = overlap / Math.max(currentWords.length, previousWords.length);

  return similarity < threshold;
}

// Generate natural conversation starter for a persona
export function generateConversationStarter(personaId: string, topic: string): string {
  const starters: Record<string, string[]> = {
    'tech-lead': [
      `Looking at this ${topic} discussion, I think we should consider...`,
      `From an architectural perspective on ${topic}...`,
      `I've seen similar ${topic} challenges before...`,
    ],
    'software-engineer': [
      `For the ${topic} implementation, we could...`,
      `I've worked with ${topic} before, and what worked well was...`,
      `From a coding standpoint on ${topic}...`,
    ],
    'qa-engineer': [
      `Thinking about ${topic} from a quality perspective...`,
      `For ${topic}, we'd want to ensure...`,
      `I'm considering the testing implications of ${topic}...`,
    ],
    'junior-developer': [
      `I'm trying to understand how ${topic} works...`,
      `Could someone help me understand ${topic}?`,
      `I have a question about ${topic}...`,
    ],
    'devops-engineer': [
      `From an operations standpoint, ${topic} would require...`,
      `Thinking about ${topic} in production...`,
      `For ${topic} deployment, we'd need to consider...`,
    ],
    'data-scientist': [
      `From a data perspective, ${topic} could be analyzed by...`,
      `The metrics around ${topic} would include...`,
      `I'm thinking about the data implications of ${topic}...`,
    ],
    'policy-analyst': [
      `From a policy standpoint, ${topic} would require...`,
      `The implementation challenges for ${topic} include...`,
      `Looking at ${topic} from a governance perspective...`,
    ],
    economist: [
      `The economic implications of ${topic} would be...`,
      `From a market perspective, ${topic} could affect...`,
      `The cost-benefit analysis of ${topic} suggests...`,
    ],
    'legal-expert': [
      `From a legal perspective, ${topic} would need...`,
      `The regulatory requirements for ${topic} include...`,
      `Looking at ${topic} from a compliance standpoint...`,
    ],
    philosopher: [
      `The ethical implications of ${topic} raise questions about...`,
      `From a philosophical perspective, ${topic} challenges us to consider...`,
      `The fundamental assumptions about ${topic} include...`,
    ],
  };

  const personaStarters = starters[personaId] || [];
  if (personaStarters.length === 0) return '';

  return personaStarters[Math.floor(Math.random() * personaStarters.length)];
}

// Create enhanced conversation context from message history
export function createConversationContext(
  messageHistory: MessageHistoryItem[]
): ConversationContext {
  const recentMessages = messageHistory.slice(-5).map((m) => m.content);
  const speakerHistory = messageHistory.slice(-3).map((m) => m.speaker);

  // Extract topics from recent messages (simplified)
  const recentTopics = recentMessages
    .flatMap((msg) =>
      msg
        .toLowerCase()
        .split(' ')
        .filter((word) => word.length > 4)
    )
    .slice(0, 10);

  // Group key points by speaker
  const keyPoints: Record<string, string[]> = {};
  messageHistory.slice(-10).forEach((msg) => {
    if (!keyPoints[msg.speaker]) keyPoints[msg.speaker] = [];
    // Extract key phrases (simplified)
    const sentences = msg.content.split('.').filter((s) => s.trim().length > 10);
    keyPoints[msg.speaker].push(...sentences.slice(0, 2));
  });

  // Track last contribution per speaker
  const lastSpeakerContribution: Record<string, string> = {};
  messageHistory.slice(-5).forEach((msg) => {
    lastSpeakerContribution[msg.speaker] = msg.content;
  });

  // Calculate continuity count
  let lastSpeakerContinuityCount = 0;
  const lastSpeaker = speakerHistory[speakerHistory.length - 1];
  for (let i = speakerHistory.length - 1; i >= 0 && speakerHistory[i] === lastSpeaker; i--) {
    lastSpeakerContinuityCount++;
  }

  // Detect topic shifts
  const topicShiftDetected =
    messageHistory.length > 1
      ? detectTopicShift(recentTopics.slice(1), messageHistory[messageHistory.length - 1].content)
      : false;

  // Analyze overall tone and emotional context
  const lastMessage = recentMessages[recentMessages.length - 1] || '';
  const overallTone = analyzeOverallTone(recentMessages);
  const emotionalContext = analyzeEmotionalContext(lastMessage);

  return {
    recentTopics,
    speakerHistory,
    keyPoints,
    conversationMomentum: analyzeConversationMomentum(recentMessages),
    lastSpeakerContribution,
    lastSpeakerContinuityCount,
    topicShiftDetected,
    overallTone,
    emotionalContext,
  };
}

// Analyze overall conversation tone
function analyzeOverallTone(
  recentMessages: string[]
): 'formal' | 'casual' | 'heated' | 'collaborative' {
  if (recentMessages.length === 0) return 'casual';

  const allText = recentMessages.join(' ').toLowerCase();

  if (allText.includes('disagree') || allText.includes('wrong') || allText.includes('problem')) {
    return 'heated';
  }
  if (allText.includes('we should') || allText.includes("let's") || allText.includes('together')) {
    return 'collaborative';
  }
  if (
    allText.includes('therefore') ||
    allText.includes('furthermore') ||
    allText.includes('however')
  ) {
    return 'formal';
  }

  return 'casual';
}

// Analyze emotional context
function analyzeEmotionalContext(
  lastMessage: string
): 'neutral' | 'excited' | 'concerned' | 'frustrated' | 'optimistic' {
  const lower = lastMessage.toLowerCase();

  if (lower.includes('!') || lower.includes('exciting') || lower.includes('great')) {
    return 'excited';
  }
  if (lower.includes('worried') || lower.includes('concern') || lower.includes('issue')) {
    return 'concerned';
  }
  if (lower.includes('frustrated') || lower.includes('difficult') || lower.includes('hard')) {
    return 'frustrated';
  }
  if (lower.includes('hope') || lower.includes('positive') || lower.includes('optimistic')) {
    return 'optimistic';
  }

  return 'neutral';
}
