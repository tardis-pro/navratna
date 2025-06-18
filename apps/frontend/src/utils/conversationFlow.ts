import { ConversationPattern } from '../types/agent';
import { shouldPersonaActivate, getActivationPhrase, getConcernFlag, getBuildOnPattern, contextualTriggers } from '../data/personas';

export interface ConversationState {
  activePersonas: Set<string>;
  lastSpeaker: string | null;
  conversationPhase: 'discussion' | 'planning' | 'decision' | 'review';
  recentTopics: string[];
}

export class ConversationFlowManager {
  private state: ConversationState;

  constructor() {
    this.state = {
      activePersonas: new Set(),
      lastSpeaker: null,
      conversationPhase: 'discussion',
      recentTopics: []
    };
  }

  // Detect conversation patterns in content
  detectPattern(content: string): ConversationPattern | null {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('wait,') || lowerContent.includes('hold on')) return 'interruption';
    if (lowerContent.includes('building on') || lowerContent.includes('adding to')) return 'build-on';
    if (lowerContent.includes('can someone explain') || lowerContent.includes('i\'m not sure')) return 'clarification';
    if (lowerContent.includes('what about') || lowerContent.includes('how do we')) return 'concern';
    if (lowerContent.includes('from a') && lowerContent.includes('perspective')) return 'expertise';
    
    return null;
  }

  // Get personas that should be triggered by content
  getTriggeredPersonas(content: string): string[] {
    const triggered: string[] = [];
    
    // Check all available personas for triggers
    const personaIds = [
      'tech-lead', 'software-engineer', 'qa-engineer', 'junior-dev', 'devops-engineer',
      'policy-analyst', 'economist', 'legal-expert', 'social-scientist', 'environmental-expert'
    ];
    
    personaIds.forEach(personaId => {
      if (shouldPersonaActivate(personaId, content, contextualTriggers)) {
        triggered.push(personaId);
      }
    });
    
    return triggered;
  }

  // Get appropriate response starter for a persona based on context
  getResponseStarter(personaId: string, pattern: ConversationPattern | null): string {
    if (pattern === 'build-on') {
      return getBuildOnPattern(personaId) || getActivationPhrase(personaId);
    }
    
    if (pattern === 'concern') {
      return getConcernFlag(personaId) || getActivationPhrase(personaId);
    }
    
    return getActivationPhrase(personaId);
  }

  // Update conversation state
  updateState(speaker: string, content: string, triggeredPersonas: string[]) {
    this.state.lastSpeaker = speaker;
    
    // Add triggered personas to active set
    triggeredPersonas.forEach(persona => {
      this.state.activePersonas.add(persona);
    });
    
    // Extract topics (simple keyword extraction)
    const topics = this.extractTopics(content);
    this.state.recentTopics = [...new Set([...topics, ...this.state.recentTopics])].slice(0, 10);
    
    // Detect conversation phase
    this.updateConversationPhase(content);
  }

  // Simple topic extraction
  private extractTopics(content: string): string[] {
    const topicKeywords = [
      'architecture', 'testing', 'deployment', 'security', 'performance',
      'policy', 'cost', 'legal', 'environment', 'social', 'implementation',
      'design', 'quality', 'infrastructure', 'compliance', 'budget'
    ];
    
    const lowerContent = content.toLowerCase();
    return topicKeywords.filter(keyword => lowerContent.includes(keyword));
  }

  // Update conversation phase based on content
  private updateConversationPhase(content: string) {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('sprint') || lowerContent.includes('planning')) {
      this.state.conversationPhase = 'planning';
    } else if (lowerContent.includes('decision') || lowerContent.includes('decide')) {
      this.state.conversationPhase = 'decision';
    } else if (lowerContent.includes('review') || lowerContent.includes('summary')) {
      this.state.conversationPhase = 'review';
    } else {
      this.state.conversationPhase = 'discussion';
    }
  }

  // Get current state
  getState(): ConversationState {
    return { ...this.state };
  }

  // Reset state
  reset() {
    this.state = {
      activePersonas: new Set(),
      lastSpeaker: null,
      conversationPhase: 'discussion',
      recentTopics: []
    };
  }
}

// Export singleton instance
export const conversationFlow = new ConversationFlowManager(); 