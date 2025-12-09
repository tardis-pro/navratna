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

import { Persona } from '../src/types/persona';
import { MessageHistoryItem, ConversationState } from '../src/types/personaAdvanced';
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
  console.log('🚀 Tech Team Discussion Demo');
  console.log('============================');

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
  console.log('\n💬 Conversation Flow:');
  console.log('Topic: Microservices Architecture\n');

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

      console.log(`\n${selectedPersona.name} (${selectedPersona.tone}, ${selectedPersona.style}):`);
      console.log(`"${enhancedResponse}"`);

      // Add to message history
      addMessage(messageHistory, selectedPersona.id, enhancedResponse);
      conversationState = updatedState;

      // Show contribution scoring details
      if (i < 3) {
        // Show details for first few contributions
        console.log(
          `   → Response type: ${contribution.contributionScores.find((s) => s.personaId === selectedPersona.id)?.score.toFixed(2)} contribution score`
        );
        console.log(
          `   → Energy level: ${selectedPersona.energyLevel}, Chattiness: ${selectedPersona.chattiness}`
        );
      }
    } else {
      console.log('\n(No persona wants to contribute right now)');
      break;
    }
  }

  // Analyze the conversation
  console.log('\n📊 Conversation Analysis:');
  console.log('=========================');

  const insights = getConversationInsights(messageHistory, conversationState);
  console.log(`Total messages: ${insights.totalMessages}`);
  console.log(`Unique participants: ${insights.uniqueParticipants}`);
  console.log(`Average message length: ${insights.averageMessageLength.toFixed(1)} characters`);
  console.log(`Conversation energy: ${(insights.conversationEnergy * 100).toFixed(1)}%`);
  console.log(`Emotional tone: ${insights.emotionalTone}`);
  console.log(`Topic stability: ${insights.topicStability}`);

  console.log('\nTop contributors:');
  insights.topContributors.slice(0, 3).forEach((contributor) => {
    console.log(
      `  • ${contributor.speaker}: ${contributor.count} messages (${contributor.percentage.toFixed(1)}%)`
    );
  });

  const flowAnalysis = analyzeConversationFlow(messageHistory, []);
  console.log(`\nFlow quality: ${(flowAnalysis.flowQuality * 100).toFixed(1)}%`);
  console.log(`Speaker diversity: ${(flowAnalysis.diversityScore * 100).toFixed(1)}%`);

  if (flowAnalysis.suggestions.length > 0) {
    console.log('\nSuggestions:');
    flowAnalysis.suggestions.forEach((suggestion) => {
      console.log(`  • ${suggestion}`);
    });
  }
}

// Example: Policy Debate with Different Tones
export function demoPolicyDebate() {
  console.log('\n\n🏛️ Policy Debate Demo');
  console.log('=====================');

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

  console.log('\n💬 Conversation Flow:');
  console.log('Topic: Universal Basic Income Policy\n');

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
      const characteristics = `${selectedPersona.tone} tone, ${selectedPersona.style} style, empathy: ${selectedPersona.empathyLevel}`;
      console.log(`\n${selectedPersona.name} (${characteristics}):`);
      console.log(`"${enhancedResponse}"`);

      addMessage(messageHistory, selectedPersona.id, enhancedResponse);
      conversationState = updatedState;

      // Demonstrate memory and emotional reflection
      if (selectedPersona.empathyLevel > 0.8) {
        console.log(`   → High empathy persona adding emotional context`);
      }
      if (selectedPersona.tone === 'verbose') {
        console.log(`   → Verbose tone providing detailed analysis`);
      }
    }
  }

  // Show conversation insights
  const insights = getConversationInsights(messageHistory, conversationState);
  console.log(`\n📊 Final emotional tone: ${insights.emotionalTone}`);
  console.log(`📊 Conversation energy: ${(insights.conversationEnergy * 100).toFixed(1)}%`);
}

// Example: Mixed Team with Different Energy Levels
export function demoMixedTeamDynamics() {
  console.log('\n\n⚡ Mixed Team Dynamics Demo');
  console.log('============================');

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

  console.log('\n💬 Conversation Flow:');
  console.log('Topic: AI Ethics in Software Development');
  console.log('(Notice how different energy levels and styles create natural rhythm)\n');

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
      const energyIcon =
        selectedPersona.energyLevel === 'dynamic'
          ? '🚀'
          : selectedPersona.energyLevel === 'high'
            ? '⚡'
            : selectedPersona.energyLevel === 'moderate'
              ? '🔋'
              : '🔅';

      console.log(
        `\n${energyIcon} ${selectedPersona.name} (${selectedPersona.energyLevel} energy, ${selectedPersona.chattiness} chattiness):`
      );
      console.log(`"${enhancedResponse}"`);

      // Show contribution factors
      const score = contributionScores.find((s) => s.personaId === selectedPersona.id);
      if (score && i < 4) {
        console.log(
          `   → Factors: topic(${score.factors.topicMatch.toFixed(1)}) + chattiness(${score.factors.chattinessFactor.toFixed(1)}) + energy(${score.factors.energyBonus.toFixed(1)}) - continuity(${Math.abs(score.factors.continuityPenalty).toFixed(1)}) = ${score.score.toFixed(2)}`
        );
      }

      addMessage(messageHistory, selectedPersona.id, enhancedResponse);
      conversationState = updatedState;
    }
  }

  // Analyze the mixed dynamics
  const flowAnalysis = analyzeConversationFlow(messageHistory, []);
  console.log(`\n📊 Mixed team flow quality: ${(flowAnalysis.flowQuality * 100).toFixed(1)}%`);
  console.log(`📊 Speaker diversity: ${(flowAnalysis.diversityScore * 100).toFixed(1)}%`);
}

// Example: Demonstrating All Enhancement Features
export function demoAllFeatures() {
  console.log('\n\n🎯 All Features Demo');
  console.log('====================');

  console.log('\n✅ Features implemented:');
  console.log('1. ✅ Persona tone & style modifiers (concise, verbose, analytical, casual, etc.)');
  console.log('2. ✅ Inertial continuity (follow-up behavior when same persona continues)');
  console.log('3. ✅ Transitions and meta-language for flow (contextual starters)');
  console.log('4. ✅ Simulate overlap/informal timing (fillers and hesitation)');
  console.log('5. ✅ Memory/preference nudges (reference previous topics)');
  console.log('6. ✅ Reactions & agreement nudges (agreement patterns)');
  console.log('7. ✅ Conversation flow tuning with weighted intents (contribution scoring)');
  console.log('8. ✅ Emotional reflection loop (high-empathy personas add emotional context)');

  console.log('\n🔧 Usage example:');
  console.log(`
import { 
  initializeConversationState,
  getNextPersonaContribution 
} from '../src/utils/conversationEnhancer';

// Initialize
let conversationState = initializeConversationState();
const messageHistory = [];

// Get next contribution
const contribution = getNextPersonaContribution(
  availablePersonas,
  messageHistory,
  currentTopic,
  allPersonas,
  conversationState
);

if (contribution) {
  const { selectedPersona, enhancedResponse, updatedState } = contribution;
  console.log(\`\${selectedPersona.name}: \${enhancedResponse}\`);
  conversationState = updatedState;
}
  `);
}

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
  console.log('🎪 Enhanced Conversation System Demo');
  console.log('=====================================');

  demoTechTeamDiscussion();
  demoPolicyDebate();
  demoMixedTeamDynamics();
  demoAllFeatures();

  console.log(
    '\n\n🎉 Demo completed! Your persona system now has natural, human-like conversation flow.'
  );
  console.log('\nKey improvements achieved:');
  console.log('• Natural conversation starters and transitions');
  console.log('• Tone-appropriate responses based on persona characteristics');
  console.log('• Intelligent follow-up behavior and continuity');
  console.log('• Memory references and emotional reflections');
  console.log('• Weighted contribution scoring for diverse participation');
  console.log('• Flow analysis and quality metrics');
}

// Export for use
export default {
  demoTechTeamDiscussion,
  demoPolicyDebate,
  demoMixedTeamDynamics,
  demoAllFeatures,
  runAllDemos,
};
