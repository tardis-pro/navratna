/**
 * Enhanced Conversation Demo
 *
 * This file demonstrates how to use the new conversation enhancement features
 * to create natural, fluid, human-like persona interactions.
 *
 * Features demonstrated:
 * 1. Persona tone & style modifiers
 * 2. Inertial continuity (follow-up behavior)
 * 3. Transitions and meta-language for flow
 * 4. Simulate overlap/informal timing
 * 5. Memory/preference nudges
 * 6. Reactions & agreement nudges
 * 7. Conversation flow tuning with weighted intents
 * 8. Emotional reflection loop
 */

import { MessageHistoryItem } from '../src/types/personaAdvanced';
import {
  initializeConversationState,
  getNextPersonaContribution,
  analyzeConversationFlow,
  getConversationInsights,
} from '../src/utils/conversationEnhancer';
import {
  softwareDevPersonas,
  policyDebatePersonas,
  analyticalPersonas,
} from '../src/data/personas';

// Example: Tech Team Discussion
export function demoTechTeamDiscussion() {
  // Setup
  const allPersonas = {
    development: softwareDevPersonas,
    policy: policyDebatePersonas,
    analytical: analyticalPersonas,
  };

  const availablePersonas = softwareDevPersonas.filter((p) =>
    ['tech-lead', 'software-engineer', 'qa-engineer', 'junior-developer'].includes(p.id)
  );

  let conversationState = initializeConversationState();
  const messageHistory: MessageHistoryItem[] = [];
  const currentTopic = 'microservices architecture';

  // Simulate a natural conversation

  // Start conversation
  addMessage(
    messageHistory,
    'user',
    "We're considering breaking our monolith into microservices. What do you all think?"
  );

  // Let personas contribute naturally
  for (let i = 0; i < 8; i++) {
    const contribution = getNextPersonaContribution(
      availablePersonas,
      messageHistory,
      currentTopic,
      allPersonas,
      conversationState
    );

    if (contribution) {
      const { selectedPersona, enhancedResponse, updatedState } = contribution;

      // Add to message history
      addMessage(messageHistory, selectedPersona.id, enhancedResponse);
      conversationState = updatedState;

      // Show contribution scoring details
      if (i < 3) {
        // Show details for first few contributions
      }
    } else {
      break;
    }
  }

  // Analyze the conversation

  const insights = getConversationInsights(messageHistory, conversationState);

  insights.topContributors.slice(0, 3).forEach((_contributor) => {});

  const flowAnalysis = analyzeConversationFlow(messageHistory, []);

  if (flowAnalysis.suggestions.length > 0) {
    flowAnalysis.suggestions.forEach((_suggestion) => {});
  }
}

// Example: Policy Debate with Different Tones
export function demoPolicyDebate() {
  const allPersonas = {
    development: softwareDevPersonas,
    policy: policyDebatePersonas,
    analytical: analyticalPersonas,
  };

  const availablePersonas = [
    ...policyDebatePersonas.filter((p) =>
      ['policy-analyst', 'economist', 'legal-expert'].includes(p.id)
    ),
    ...analyticalPersonas.filter((p) => p.id === 'philosopher'),
  ];

  let conversationState = initializeConversationState();
  const messageHistory: MessageHistoryItem[] = [];
  const currentTopic = 'universal basic income';

  // Start with a complex policy question
  addMessage(
    messageHistory,
    'user',
    'Should we implement a universal basic income? What are the key considerations?'
  );

  // Show how different tones and styles create natural flow
  for (let i = 0; i < 6; i++) {
    const contribution = getNextPersonaContribution(
      availablePersonas,
      messageHistory,
      currentTopic,
      allPersonas,
      conversationState
    );

    if (contribution) {
      const { selectedPersona, enhancedResponse, updatedState } = contribution;

      // Show persona characteristics
      const _characteristics = `${selectedPersona.tone} tone, ${selectedPersona.style} style, empathy: ${selectedPersona.empathyLevel}`;

      addMessage(messageHistory, selectedPersona.id, enhancedResponse);
      conversationState = updatedState;

      // Demonstrate memory and emotional reflection
      if (selectedPersona.empathyLevel > 0.8) {
      }
      if (selectedPersona.tone === 'verbose') {
      }
    }
  }

  // Show conversation insights
  const _insights = getConversationInsights(messageHistory, conversationState);
}

// Example: Mixed Team with Different Energy Levels
export function demoMixedTeamDynamics() {
  const allPersonas = {
    development: softwareDevPersonas,
    policy: policyDebatePersonas,
    analytical: analyticalPersonas,
  };

  // Mix personas with different energy levels and styles
  const availablePersonas = [
    softwareDevPersonas.find((p) => p.id === 'junior-developer')!, // Dynamic energy, optimistic
    softwareDevPersonas.find((p) => p.id === 'tech-lead')!, // High energy, analytical
    policyDebatePersonas.find((p) => p.id === 'legal-expert')!, // Low energy, cautious
    analyticalPersonas.find((p) => p.id === 'philosopher')!, // Low energy, verbose
  ];

  let conversationState = initializeConversationState();
  const messageHistory: MessageHistoryItem[] = [];
  const currentTopic = 'AI ethics in software development';

  addMessage(messageHistory, 'user', 'How should we handle AI ethics in our software products?');

  // Demonstrate energy and style interactions
  for (let i = 0; i < 8; i++) {
    const contribution = getNextPersonaContribution(
      availablePersonas,
      messageHistory,
      currentTopic,
      allPersonas,
      conversationState
    );

    if (contribution) {
      const { selectedPersona, enhancedResponse, updatedState, contributionScores } = contribution;

      // Show energy dynamics
      const _energyIcon =
        selectedPersona.energyLevel === 'dynamic'
          ? '🚀'
          : selectedPersona.energyLevel === 'high'
            ? '⚡'
            : selectedPersona.energyLevel === 'moderate'
              ? '🔋'
              : '🔅';

      // Show contribution factors
      const score = contributionScores.find((s) => s.personaId === selectedPersona.id);
      if (score && i < 4) {
      }

      addMessage(messageHistory, selectedPersona.id, enhancedResponse);
      conversationState = updatedState;
    }
  }

  // Analyze the mixed dynamics
  const _flowAnalysis = analyzeConversationFlow(messageHistory, []);
}

// Example: Demonstrating All Enhancement Features
export function demoAllFeatures() {}

// Helper function to add messages to history
function addMessage(history: MessageHistoryItem[], speaker: string, content: string) {
  history.push({
    speaker,
    content,
    timestamp: new Date(),
    topic: extractTopic(content),
  });
}

// Simple topic extraction
function extractTopic(content: string): string {
  const words = content.toLowerCase().split(' ');
  const significantWords = words.filter((word) => word.length > 4);
  return significantWords.slice(0, 3).join(' ');
}

// Run all demos
export function runAllDemos() {
  demoTechTeamDiscussion();
  demoPolicyDebate();
  demoMixedTeamDynamics();
  demoAllFeatures();
}

// Export for use
export default {
  demoTechTeamDiscussion,
  demoPolicyDebate,
  demoMixedTeamDynamics,
  demoAllFeatures,
  runAllDemos,
};
