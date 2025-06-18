// Conversation Analysis Service
// Epic 4 Implementation

import { 
  ConversationContext, 
  Message 
} from '@/types/artifact';

import { 
  ConversationAnalyzer,
  GenerationTrigger,
  ConversationPhase,
  Requirement,
  ConversationSummary,
  Decision,
  ActionItem
} from '../interfaces';

export class ConversationAnalyzerImpl implements ConversationAnalyzer {
  private readonly patterns = {
    codeRequest: [
      /can you (generate|create|draft|write|refactor|fix)/i,
      /let's (implement|code|build|create)/i,
      /need to (implement|code|build|write)/i,
      /how about we (implement|code|create)/i
    ],
    testRequest: [
      /need (tests|testing|test coverage)/i,
      /write (tests|unit tests|integration tests)/i,
      /test (this|the code|coverage)/i,
      /add test/i
    ],
    prdRequest: [
      /let's document/i,
      /create (prd|requirements|specification)/i,
      /need (requirements|specs|documentation)/i,
      /document (this|the requirements)/i
    ],
    decisionPoint: [
      /we should/i,
      /let's go with/i,
      /agreed on/i,
      /decided to/i,
      /the decision is/i,
      /we'll use/i
    ],
    implementation: [
      /implement/i,
      /build/i,
      /develop/i,
      /create/i,
      /code/i
    ],
    review: [
      /review/i,
      /check/i,
      /look at/i,
      /feedback/i,
      /approve/i
    ]
  };

  private readonly commands = {
    generate: /\/gen\s+(code|test|prd|doc)\b/i,
    help: /\/help\s*$/i,
    status: /\/status\s*$/i
  };

  /**
   * Detect generation triggers in conversation
   */
  detectTriggers(context: ConversationContext): GenerationTrigger[] {
    const triggers: GenerationTrigger[] = [];
    const recentMessages = this.getRecentMessages(context.messages, 10);

    // Check for explicit commands first
    triggers.push(...this.detectCommandTriggers(recentMessages));

    // Check for pattern-based triggers
    triggers.push(...this.detectPatternTriggers(recentMessages));

    // Check for phase-based triggers
    triggers.push(...this.detectPhaseTriggers(context));

    return triggers.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyze conversation phase
   */
  analyzePhase(context: ConversationContext): ConversationPhase {
    const messages = context.messages;
    const recentMessages = this.getRecentMessages(messages, 5);

    // Analyze recent message content
    const phaseIndicators = this.analyzePhaseIndicators(recentMessages);
    
    // Determine current phase
    const phase = this.determinePhase(phaseIndicators);
    
    // Calculate confidence
    const confidence = this.calculatePhaseConfidence(phaseIndicators, phase);

    // Generate suggested actions
    const suggestedActions = this.generatePhaseActions(phase, confidence);

    return {
      current: phase,
      confidence,
      suggestedActions
    };
  }

  /**
   * Extract requirements from conversation
   */
  extractRequirements(context: ConversationContext): Requirement[] {
    const requirements: Requirement[] = [];
    const messages = context.messages;

    for (const message of messages) {
      const messageRequirements = this.extractRequirementsFromMessage(message);
      requirements.push(...messageRequirements);
    }

    return this.deduplicateRequirements(requirements);
  }

  /**
   * Get conversation summary
   */
  summarize(context: ConversationContext): ConversationSummary {
    const messages = context.messages;
    
    const keyPoints = this.extractKeyPoints(messages);
    const decisions = this.extractDecisions(messages);
    const actionItems = this.extractActionItems(messages);
    const participants = this.getUniqueParticipants(messages);
    const phase = this.analyzePhase(context);

    return {
      keyPoints,
      decisions,
      actionItems,
      participants,
      phase: phase.current,
      confidence: phase.confidence
    };
  }

  // Private helper methods

  private getRecentMessages(messages: Message[], count: number): Message[] {
    return messages
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);
  }

  private detectCommandTriggers(messages: Message[]): GenerationTrigger[] {
    const triggers: GenerationTrigger[] = [];

    for (const message of messages) {
      const commandMatch = message.content.match(this.commands.generate);
      if (commandMatch) {
        const artifactType = commandMatch[1].toLowerCase();
        triggers.push({
          type: 'command',
          confidence: 0.95,
          artifactType: this.mapArtifactType(artifactType),
          context: message.content,
          detectedAt: message.timestamp
        });
      }
    }

    return triggers;
  }

  private detectPatternTriggers(messages: Message[]): GenerationTrigger[] {
    const triggers: GenerationTrigger[] = [];

    for (const message of messages) {
      // Check code patterns
      if (this.matchesPatterns(message.content, this.patterns.codeRequest)) {
        triggers.push({
          type: 'pattern',
          confidence: 0.8,
          artifactType: 'code-diff',
          context: message.content,
          detectedAt: message.timestamp
        });
      }

      // Check test patterns
      if (this.matchesPatterns(message.content, this.patterns.testRequest)) {
        triggers.push({
          type: 'pattern',
          confidence: 0.8,
          artifactType: 'test',
          context: message.content,
          detectedAt: message.timestamp
        });
      }

      // Check PRD patterns
      if (this.matchesPatterns(message.content, this.patterns.prdRequest)) {
        triggers.push({
          type: 'pattern',
          confidence: 0.7,
          artifactType: 'prd',
          context: message.content,
          detectedAt: message.timestamp
        });
      }
    }

    return triggers;
  }

  private detectPhaseTriggers(context: ConversationContext): GenerationTrigger[] {
    const triggers: GenerationTrigger[] = [];
    const phase = this.analyzePhase(context);

    if (phase.current === 'decision' && phase.confidence > 0.8) {
      triggers.push({
        type: 'phase_change',
        confidence: phase.confidence,
        artifactType: 'documentation',
        context: 'Decision phase detected',
        detectedAt: new Date().toISOString()
      });
    }

    if (phase.current === 'implementation' && phase.confidence > 0.8) {
      triggers.push({
        type: 'phase_change',
        confidence: phase.confidence,
        artifactType: 'code-diff',
        context: 'Implementation phase detected',
        detectedAt: new Date().toISOString()
      });
    }

    return triggers;
  }

  private analyzePhaseIndicators(messages: Message[]): Record<string, number> {
    const indicators: Record<string, number> = {
      discussion: 0,
      clarification: 0,
      decision: 0,
      implementation: 0,
      review: 0
    };

    for (const message of messages) {
      const content = message.content.toLowerCase();

      // Discussion indicators
      if (content.includes('what if') || content.includes('maybe') || content.includes('consider')) {
        indicators.discussion += 1;
      }

      // Clarification indicators
      if (content.includes('?') || content.includes('clarify') || content.includes('explain')) {
        indicators.clarification += 1;
      }

      // Decision indicators
      if (this.matchesPatterns(content, this.patterns.decisionPoint)) {
        indicators.decision += 2;
      }

      // Implementation indicators
      if (this.matchesPatterns(content, this.patterns.implementation)) {
        indicators.implementation += 1;
      }

      // Review indicators
      if (this.matchesPatterns(content, this.patterns.review)) {
        indicators.review += 1;
      }
    }

    return indicators;
  }

  private determinePhase(indicators: Record<string, number>): string {
    const maxIndicator = Object.entries(indicators)
      .reduce((max, [phase, score]) => score > max.score ? { phase, score } : max, 
              { phase: 'discussion', score: 0 });

    return maxIndicator.phase;
  }

  private calculatePhaseConfidence(indicators: Record<string, number>, phase: string): number {
    const phaseScore = indicators[phase] || 0;
    const totalScore = Object.values(indicators).reduce((sum, score) => sum + score, 0);

    if (totalScore === 0) return 0;
    
    return Math.min(phaseScore / totalScore, 1);
  }

  private generatePhaseActions(phase: string, confidence: number): string[] {
    const actions: string[] = [];

    switch (phase) {
      case 'discussion':
        actions.push('Continue exploring ideas and options');
        if (confidence > 0.7) {
          actions.push('Consider moving toward a decision');
        }
        break;
      
      case 'decision':
        actions.push('Document decisions made');
        actions.push('Consider creating requirements or specifications');
        break;
      
      case 'implementation':
        actions.push('Generate code or implementation artifacts');
        actions.push('Create test cases');
        break;
      
      case 'review':
        actions.push('Review generated artifacts');
        actions.push('Provide feedback and suggestions');
        break;
      
      default:
        actions.push('Continue the conversation');
    }

    return actions;
  }

  private extractKeyPoints(messages: Message[]): string[] {
    const keyPoints: string[] = [];
    
    // Look for messages that contain key decisions or important information
    for (const message of messages) {
      if (this.isKeyPoint(message)) {
        keyPoints.push(this.extractKeyPoint(message));
      }
    }

    return keyPoints.slice(0, 10); // Limit to top 10 key points
  }

  private extractDecisions(messages: Message[]): Decision[] {
    const decisions: Decision[] = [];

    for (const message of messages) {
      if (this.matchesPatterns(message.content, this.patterns.decisionPoint)) {
        decisions.push({
          description: this.extractDecisionText(message.content),
          rationale: this.extractRationale(message.content),
          participants: [message.sender],
          timestamp: message.timestamp,
          confidence: 0.8
        });
      }
    }

    return decisions;
  }

  private extractActionItems(messages: Message[]): ActionItem[] {
    const actionItems: ActionItem[] = [];

    for (const message of messages) {
      if (this.containsActionItem(message)) {
        actionItems.push({
          description: this.extractActionDescription(message.content),
          assignee: this.extractAssignee(message.content),
          priority: this.determinePriority(message.content),
          status: 'pending'
        });
      }
    }

    return actionItems;
  }

  private getUniqueParticipants(messages: Message[]): string[] {
    const participants = new Set(messages.map(m => m.sender));
    return Array.from(participants);
  }

  private extractRequirementsFromMessage(message: Message): Requirement[] {
    const requirements: Requirement[] = [];
    
    // Simple pattern matching for requirements
    const requirementPatterns = [
      /must (have|be|do|support)/i,
      /should (have|be|do|support)/i,
      /need to|needs to/i,
      /required to/i
    ];

    for (const pattern of requirementPatterns) {
      if (pattern.test(message.content)) {
        requirements.push({
          type: 'functional',
          description: this.extractRequirementText(message.content, pattern),
          priority: this.determinePriorityFromPattern(pattern),
          source: message.id,
          confidence: 0.7
        });
      }
    }

    return requirements;
  }

  // Utility methods

  private matchesPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text));
  }

  private mapArtifactType(type: string): string {
    const mapping: Record<string, string> = {
      'code': 'code-diff',
      'test': 'test',
      'prd': 'prd',
      'doc': 'documentation'
    };
    return mapping[type] || type;
  }

  private isKeyPoint(message: Message): boolean {
    const keyPointIndicators = [
      /important/i,
      /key/i,
      /critical/i,
      /main/i,
      /decision/i,
      /conclusion/i
    ];
    return this.matchesPatterns(message.content, keyPointIndicators);
  }

  private extractKeyPoint(message: Message): string {
    // Simple extraction - in a real implementation, this would be more sophisticated
    return message.content.slice(0, 100) + (message.content.length > 100 ? '...' : '');
  }

  private extractDecisionText(content: string): string {
    // Extract the main decision from the message
    const sentences = content.split(/[.!?]/);
    return sentences.find(s => this.matchesPatterns(s, this.patterns.decisionPoint))?.trim() || content.slice(0, 100);
  }

  private extractRationale(content: string): string {
    // Extract reasoning or justification
    const reasoningKeywords = ['because', 'since', 'due to', 'reason'];
    for (const keyword of reasoningKeywords) {
      const index = content.toLowerCase().indexOf(keyword);
      if (index !== -1) {
        return content.slice(index, index + 100);
      }
    }
    return 'No explicit rationale provided';
  }

  private containsActionItem(message: Message): boolean {
    const actionPatterns = [
      /need to (do|implement|create|build)/i,
      /action item/i,
      /todo/i,
      /task/i
    ];
    return this.matchesPatterns(message.content, actionPatterns);
  }

  private extractActionDescription(content: string): string {
    return content.slice(0, 100);
  }

  private extractAssignee(content: string): string | undefined {
    const assigneePattern = /@(\w+)/;
    const match = content.match(assigneePattern);
    return match ? match[1] : undefined;
  }

  private determinePriority(content: string): 'low' | 'medium' | 'high' {
    if (/urgent|critical|asap/i.test(content)) return 'high';
    if (/important|soon/i.test(content)) return 'medium';
    return 'low';
  }

  private extractRequirementText(content: string, pattern: RegExp): string {
    const match = content.match(pattern);
    if (match) {
      const startIndex = match.index! + match[0].length;
      return content.slice(startIndex, startIndex + 100).trim();
    }
    return content.slice(0, 100);
  }

  private determinePriorityFromPattern(pattern: RegExp): 'must_have' | 'should_have' | 'could_have' | 'wont_have' {
    const patternStr = pattern.toString();
    if (patternStr.includes('must')) return 'must_have';
    if (patternStr.includes('should')) return 'should_have';
    return 'could_have';
  }

  private deduplicateRequirements(requirements: Requirement[]): Requirement[] {
    const seen = new Set();
    return requirements.filter(req => {
      const key = req.description.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
} 