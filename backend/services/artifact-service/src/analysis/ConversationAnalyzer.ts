// Conversation Analysis Service
// Epic 4 Implementation

import { 
  ArtifactConversationContext, 
  ConversationMessage,
  GenerationTrigger,
  ConversationPhaseDetails as ConversationPhase,
  Requirement,
  ConversationSummary,
  Decision,
  ActionItem
} from '@uaip/types';

import { ConversationAnalyzer } from '../interfaces';

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
   * Analyze conversation and return summary
   */
  async analyzeConversation(context: ArtifactConversationContext): Promise<ConversationSummary> {
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

  /**
   * Detect generation triggers in conversation
   */
  async detectGenerationTriggers(context: ArtifactConversationContext): Promise<GenerationTrigger[]> {
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
   * Extract requirements from conversation
   */
  async extractRequirements(context: ArtifactConversationContext): Promise<Requirement[]> {
    const requirements: Requirement[] = [];
    const messages = context.messages;

    for (const message of messages) {
      const messageRequirements = this.extractRequirementsFromMessage(message);
      requirements.push(...messageRequirements);
    }

    return this.deduplicateRequirements(requirements);
  }

  /**
   * Analyze conversation phase
   */
  analyzePhase(context: ArtifactConversationContext): ConversationPhase {
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

  // Private helper methods

  private getRecentMessages(messages: ConversationMessage[], count: number): ConversationMessage[] {
    return messages
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);
  }

  private detectCommandTriggers(messages: ConversationMessage[]): GenerationTrigger[] {
    const triggers: GenerationTrigger[] = [];

    for (const message of messages) {
      const commandMatch = message.content.match(this.commands.generate);
      if (commandMatch) {
        const artifactType = commandMatch[1].toLowerCase();
        triggers.push({
          type: 'command',
          artifactType: this.mapArtifactType(artifactType),
          confidence: 0.95,
          context: `Explicit command detected: ${message.content}`,
          detectedAt: message.timestamp.toISOString()
        });
      }
    }

    return triggers;
  }

  private detectPatternTriggers(messages: ConversationMessage[]): GenerationTrigger[] {
    const triggers: GenerationTrigger[] = [];

    for (const message of messages) {
      // Check code patterns
      if (this.matchesPatterns(message.content, this.patterns.codeRequest)) {
        triggers.push({
          type: 'pattern',
          artifactType: 'code',
          confidence: 0.8,
          context: `Code request pattern detected: ${message.content}`,
          detectedAt: message.timestamp.toISOString()
        });
      }

      // Check test patterns
      if (this.matchesPatterns(message.content, this.patterns.testRequest)) {
        triggers.push({
          type: 'pattern',
          artifactType: 'test',
          confidence: 0.8,
          context: `Test request pattern detected: ${message.content}`,
          detectedAt: message.timestamp.toISOString()
        });
      }

      // Check PRD patterns
      if (this.matchesPatterns(message.content, this.patterns.prdRequest)) {
        triggers.push({
          type: 'pattern',
          artifactType: 'prd',
          confidence: 0.7,
          context: `PRD request pattern detected: ${message.content}`,
          detectedAt: message.timestamp.toISOString()
        });
      }
    }

    return triggers;
  }

  private detectPhaseTriggers(context: ArtifactConversationContext): GenerationTrigger[] {
    const triggers: GenerationTrigger[] = [];
    const phase = this.analyzePhase(context);

    if (phase.current === 'implementation' && phase.confidence > 0.8) {
      triggers.push({
        type: 'phase_change',
        artifactType: 'code',
        confidence: phase.confidence,
        context: `Implementation phase detected with high confidence`,
        detectedAt: new Date().toISOString()
      });
    }

    if (phase.current === 'decision' && phase.confidence > 0.8) {
      triggers.push({
        type: 'phase_change',
        artifactType: 'documentation',
        confidence: phase.confidence,
        context: `Decision phase detected - documentation recommended`,
        detectedAt: new Date().toISOString()
      });
    }

    return triggers;
  }

  private analyzePhaseIndicators(messages: ConversationMessage[]): Record<string, number> {
    const indicators: Record<string, number> = {
      planning: 0,
      discussion: 0,
      decision: 0,
      implementation: 0,
      review: 0
    };

    for (const message of messages) {
      const content = message.content.toLowerCase();

      // Planning indicators
      if (content.includes('plan') || content.includes('strategy') || content.includes('approach')) {
        indicators.planning += 1;
      }

      // Discussion indicators
      if (content.includes('think') || content.includes('consider') || content.includes('what if')) {
        indicators.discussion += 1;
      }

      // Decision indicators
      if (this.matchesPatterns(content, this.patterns.decisionPoint)) {
        indicators.decision += 1;
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
      .reduce((max, [phase, count]) => count > max.count ? { phase, count } : max, 
              { phase: 'discussion', count: 0 });
    
    return maxIndicator.phase;
  }

  private calculatePhaseConfidence(indicators: Record<string, number>, phase: string): number {
    const total = Object.values(indicators).reduce((sum, count) => sum + count, 0);
    if (total === 0) return 0.5;
    
    return Math.min(indicators[phase] / total, 1.0);
  }

  private generatePhaseActions(phase: string, confidence: number): string[] {
    const actions: Record<string, string[]> = {
      planning: ['Define requirements', 'Create project structure', 'Identify dependencies'],
      discussion: ['Continue exploring options', 'Gather more input', 'Clarify requirements'],
      decision: ['Document decisions', 'Create action items', 'Assign responsibilities'],
      implementation: ['Generate code', 'Create tests', 'Set up development environment'],
      review: ['Review code', 'Test functionality', 'Gather feedback']
    };

    return actions[phase] || ['Continue conversation'];
  }

  private extractKeyPoints(messages: ConversationMessage[]): string[] {
    const keyPoints: string[] = [];

    for (const message of messages) {
      if (this.isKeyPoint(message)) {
        keyPoints.push(this.extractKeyPoint(message));
      }
    }

    return keyPoints.slice(0, 10); // Limit to top 10 key points
  }

  private extractDecisions(messages: ConversationMessage[]): Decision[] {
    const decisions: Decision[] = [];

    for (const message of messages) {
      if (this.matchesPatterns(message.content, this.patterns.decisionPoint)) {
        decisions.push({
          id: `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          description: this.extractDecisionText(message.content),
          options: ['option1', 'option2'], // Default options, should be extracted from context
          chosen: this.extractDecisionText(message.content),
          reasoning: this.extractRationale(message.content),
          timestamp: message.timestamp,
          confidence: 0.8
        });
      }
    }

    return decisions;
  }

  private extractActionItems(messages: ConversationMessage[]): ActionItem[] {
    const actionItems: ActionItem[] = [];

    for (const message of messages) {
      if (this.containsActionItem(message)) {
        actionItems.push({
          id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          description: this.extractActionDescription(message.content),
          assignee: this.extractAssignee(message.content),
          priority: this.determinePriority(message.content),
          createdAt: message.timestamp.toISOString()
        });
      }
    }

    return actionItems;
  }

  private getUniqueParticipants(messages: ConversationMessage[]): string[] {
    // Extract participants from message metadata or use role as fallback
    const participants = new Set(messages.map(m => 
      m.metadata?.author || m.metadata?.userId || m.role || 'unknown'
    ));
    return Array.from(participants);
  }

  private extractRequirementsFromMessage(message: ConversationMessage): Requirement[] {
    const requirements: Requirement[] = [];
    const content = message.content;

    const patterns = [
      { regex: /must (have|be|do|support)/gi, type: 'functional' as const, priority: 'must_have' as const },
      { regex: /should (have|be|do|support)/gi, type: 'functional' as const, priority: 'should_have' as const },
      { regex: /could (have|be|do|support)/gi, type: 'functional' as const, priority: 'could_have' as const },
      { regex: /need to (have|be|do|support)/gi, type: 'functional' as const, priority: 'must_have' as const },
      { regex: /required to/gi, type: 'functional' as const, priority: 'must_have' as const },
      { regex: /performance/gi, type: 'non_functional' as const, priority: 'should_have' as const },
      { regex: /security/gi, type: 'non_functional' as const, priority: 'must_have' as const }
    ];

    patterns.forEach(pattern => {
      const matches = content.match(pattern.regex);
      if (matches) {
        requirements.push({
          id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: pattern.type,
          description: this.extractRequirementText(content, pattern.regex),
          priority: pattern.priority,
          source: message.id,
          extractedAt: message.timestamp.toISOString()
        });
      }
    });

    return requirements;
  }

  private matchesPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text));
  }

  private mapArtifactType(type: string): string {
    const mapping: Record<string, string> = {
      'code': 'code',
      'test': 'test',
      'prd': 'prd',
      'doc': 'documentation'
    };
    return mapping[type] || type;
  }

  private isKeyPoint(message: ConversationMessage): boolean {
    const content = message.content.toLowerCase();
    return content.includes('important') || 
           content.includes('key') || 
           content.includes('critical') ||
           content.includes('main') ||
           content.length > 100; // Longer messages likely contain key points
  }

  private extractKeyPoint(message: ConversationMessage): string {
    // Extract first sentence or first 100 characters
    const sentences = message.content.split(/[.!?]+/);
    return sentences[0]?.trim() || message.content.substring(0, 100) + '...';
  }

  private extractDecisionText(content: string): string {
    // Extract the decision from the content
    const sentences = content.split(/[.!?]+/);
    return sentences.find(s => this.patterns.decisionPoint.some(p => p.test(s)))?.trim() || content.substring(0, 100);
  }

  private extractRationale(content: string): string {
    // Look for "because", "since", "due to" patterns
    const rationaleMatch = content.match(/(?:because|since|due to|as)\s+(.+?)(?:[.!?]|$)/i);
    return rationaleMatch ? rationaleMatch[1].trim() : 'No rationale provided';
  }

  private containsActionItem(message: ConversationMessage): boolean {
    const content = message.content.toLowerCase();
    return content.includes('todo') || 
           content.includes('action item') ||
           content.includes('need to') ||
           content.includes('should do') ||
           content.includes('will do');
  }

  private extractActionDescription(content: string): string {
    // Extract action from content
    const actionMatch = content.match(/(?:todo|action item|need to|should do|will do):\s*(.+?)(?:[.!?]|$)/i);
    return actionMatch ? actionMatch[1].trim() : content.substring(0, 100);
  }

  private extractAssignee(content: string): string | undefined {
    // Look for @mentions or "assigned to" patterns
    const assigneeMatch = content.match(/@(\w+)|assigned to (\w+)/i);
    return assigneeMatch ? (assigneeMatch[1] || assigneeMatch[2]) : undefined;
  }

  private determinePriority(content: string): 'low' | 'medium' | 'high' {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('urgent') || lowerContent.includes('critical') || lowerContent.includes('asap')) {
      return 'high';
    }
    if (lowerContent.includes('important') || lowerContent.includes('priority')) {
      return 'medium';
    }
    return 'low';
  }

  private extractRequirementText(content: string, pattern: RegExp): string {
    const match = content.match(pattern);
    if (match) {
      // Extract the sentence containing the requirement
      const sentences = content.split(/[.!?]+/);
      const requirementSentence = sentences.find(s => pattern.test(s));
      return requirementSentence?.trim() || match[0];
    }
    return content.substring(0, 100);
  }

  private deduplicateRequirements(requirements: Requirement[]): Requirement[] {
    const seen = new Set<string>();
    return requirements.filter(req => {
      const key = req.description.toLowerCase().trim();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
} 