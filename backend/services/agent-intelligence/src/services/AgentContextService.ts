import { logger } from '@uaip/utils';
import { EventBusService } from '@uaip/shared-services';

export interface ConversationContext {
  id: string;
  agentId: string;
  userId: string;
  messages: Array<{
    id: string;
    timestamp: Date;
    role: 'user' | 'agent' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  startedAt: Date;
  lastActivityAt: Date;
  metadata?: Record<string, unknown>;
}

export interface AnalysisResult {
  analysis: {
    userIntent: string;
    contextSummary: string;
    relevantKnowledge: string[];
    suggestedActions: string[];
    complexity: 'low' | 'medium' | 'high';
    sentiment: 'positive' | 'neutral' | 'negative';
  };
  recommendedActions: string[];
  confidence: number;
  explanation: string;
  availableCapabilities: string[];
  securityAssessment: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    permissions: string[];
    restrictions?: string[];
  };
}

export class AgentContextService {
  private eventBusService: EventBusService;

  constructor() {
    this.eventBusService = EventBusService.getInstance();
  }

  async analyzeContext(
    agentId: string,
    userRequest: string,
    conversationContext: ConversationContext,
    constraints?: Record<string, unknown>
  ): Promise<AnalysisResult> {
    try {
      logger.info('Analyzing context for agent', { agentId, userRequest });

      // Analyze user intent using simple heuristics for now
      const userIntent = this.extractUserIntent(userRequest);
      
      // Analyze conversation history
      const contextSummary = this.summarizeContext(conversationContext);
      
      // Determine complexity
      const complexity = this.assessComplexity(userRequest, conversationContext);
      
      // Analyze sentiment
      const sentiment = this.analyzeSentiment(userRequest);

      // Get relevant knowledge (placeholder - would use knowledge graph)
      const relevantKnowledge = await this.getRelevantKnowledge(userRequest, agentId);

      // Suggest actions based on intent
      const suggestedActions = this.suggestActions(userIntent, complexity);

      // Determine available capabilities
      const availableCapabilities = await this.getAvailableCapabilities(agentId);

      // Assess security
      const securityAssessment = this.assessSecurity(userRequest, constraints);

      const result: AnalysisResult = {
        analysis: {
          userIntent,
          contextSummary,
          relevantKnowledge,
          suggestedActions,
          complexity,
          sentiment
        },
        recommendedActions: this.getRecommendedActions(userIntent, complexity, availableCapabilities),
        confidence: this.calculateConfidence(userRequest, conversationContext),
        explanation: this.generateExplanation(userIntent, complexity, sentiment),
        availableCapabilities,
        securityAssessment
      };

      // Emit analysis event
      await this.eventBusService.publish('agent.analysis.completed', {
        agentId,
        userRequest,
        result,
        timestamp: new Date()
      });

      logger.info('Context analysis completed', { agentId, confidence: result.confidence });
      return result;
    } catch (error) {
      logger.error('Failed to analyze context', { error, agentId, userRequest });
      throw error;
    }
  }

  private extractUserIntent(userRequest: string): string {
    const request = userRequest.toLowerCase();
    
    if (request.includes('create') || request.includes('make') || request.includes('build')) {
      return 'creation';
    } else if (request.includes('analyze') || request.includes('explain') || request.includes('understand')) {
      return 'analysis';
    } else if (request.includes('plan') || request.includes('strategy') || request.includes('organize')) {
      return 'planning';
    } else if (request.includes('execute') || request.includes('run') || request.includes('perform')) {
      return 'execution';
    } else if (request.includes('help') || request.includes('support') || request.includes('assist')) {
      return 'assistance';
    } else if (request.includes('search') || request.includes('find') || request.includes('lookup')) {
      return 'information_retrieval';
    } else {
      return 'general_inquiry';
    }
  }

  private summarizeContext(context: ConversationContext): string {
    const messageCount = context.messages.length;
    const duration = Date.now() - context.startedAt.getTime();
    const durationMinutes = Math.floor(duration / (1000 * 60));

    return `Conversation with ${messageCount} messages over ${durationMinutes} minutes. Last activity: ${context.lastActivityAt.toISOString()}`;
  }

  private assessComplexity(userRequest: string, context: ConversationContext): 'low' | 'medium' | 'high' {
    let complexityScore = 0;

    // Length-based complexity
    if (userRequest.length > 200) complexityScore += 2;
    else if (userRequest.length > 100) complexityScore += 1;

    // Multiple questions or requirements
    const questionMarks = (userRequest.match(/\?/g) || []).length;
    const andOr = (userRequest.match(/\band\b|\bor\b/gi) || []).length;
    complexityScore += questionMarks + andOr;

    // Technical terms
    const technicalTerms = /\b(algorithm|database|API|integration|architecture|implementation|optimization)\b/gi;
    if (technicalTerms.test(userRequest)) complexityScore += 2;

    // Context history
    if (context.messages.length > 10) complexityScore += 1;

    if (complexityScore >= 5) return 'high';
    if (complexityScore >= 2) return 'medium';
    return 'low';
  }

  private analyzeSentiment(userRequest: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = /\b(great|good|excellent|perfect|amazing|love|like|helpful|thank)\b/gi;
    const negativeWords = /\b(bad|terrible|hate|problem|issue|error|wrong|difficult|hard)\b/gi;

    const positiveMatches = (userRequest.match(positiveWords) || []).length;
    const negativeMatches = (userRequest.match(negativeWords) || []).length;

    if (positiveMatches > negativeMatches) return 'positive';
    if (negativeMatches > positiveMatches) return 'negative';
    return 'neutral';
  }

  private async getRelevantKnowledge(userRequest: string, agentId: string): Promise<string[]> {
    // Placeholder - would query knowledge graph
    const keywords = userRequest.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    return keywords.slice(0, 5).map(keyword => `Knowledge about: ${keyword}`);
  }

  private suggestActions(intent: string, complexity: 'low' | 'medium' | 'high'): string[] {
    const actions: string[] = [];

    switch (intent) {
      case 'creation':
        actions.push('gather_requirements', 'design_solution', 'implement');
        break;
      case 'analysis':
        actions.push('collect_data', 'analyze_patterns', 'generate_insights');
        break;
      case 'planning':
        actions.push('define_objectives', 'create_timeline', 'allocate_resources');
        break;
      case 'execution':
        actions.push('validate_parameters', 'execute_task', 'monitor_progress');
        break;
      case 'assistance':
        actions.push('clarify_needs', 'provide_guidance', 'offer_alternatives');
        break;
      case 'information_retrieval':
        actions.push('search_knowledge', 'filter_results', 'present_findings');
        break;
      default:
        actions.push('understand_request', 'gather_context', 'provide_response');
    }

    if (complexity === 'high') {
      actions.unshift('break_down_problem');
    }

    return actions;
  }

  private async getAvailableCapabilities(agentId: string): Promise<string[]> {
    // Default capabilities - would be fetched from agent configuration
    return ['analysis', 'planning', 'tool-execution', 'communication', 'learning'];
  }

  private assessSecurity(userRequest: string, constraints?: Record<string, unknown>): {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    permissions: string[];
    restrictions?: string[];
  } {
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const restrictions: string[] = [];

    // Check for potentially risky operations
    if (/\b(delete|remove|destroy|execute|run|system|admin)\b/gi.test(userRequest)) {
      riskLevel = 'medium';
      restrictions.push('Requires elevated permissions for destructive operations');
    }

    if (/\b(database|server|network|file|directory)\b/gi.test(userRequest)) {
      riskLevel = 'medium';
      restrictions.push('System access requires additional validation');
    }

    return {
      riskLevel,
      permissions: ['read', 'analyze', 'communicate'],
      restrictions: restrictions.length > 0 ? restrictions : undefined
    };
  }

  private getRecommendedActions(intent: string, complexity: 'low' | 'medium' | 'high', capabilities: string[]): string[] {
    const baseActions = ['analyze_request'];

    if (capabilities.includes('planning') && (complexity === 'medium' || complexity === 'high')) {
      baseActions.push('create_plan');
    }

    if (capabilities.includes('tool-execution')) {
      baseActions.push('execute_tools');
    }

    baseActions.push('provide_response');

    if (capabilities.includes('learning')) {
      baseActions.push('learn_from_interaction');
    }

    return baseActions;
  }

  private calculateConfidence(userRequest: string, context: ConversationContext): number {
    let confidence = 0.7; // Base confidence

    // Clear, specific requests increase confidence
    if (userRequest.length > 20 && userRequest.length < 200) {
      confidence += 0.1;
    }

    // Context history helps confidence
    if (context.messages.length > 2) {
      confidence += 0.1;
    }

    // Question marks indicate clear intent
    if (userRequest.includes('?')) {
      confidence += 0.05;
    }

    return Math.min(confidence, 0.95);
  }

  private generateExplanation(intent: string, complexity: 'low' | 'medium' | 'high', sentiment: string): string {
    return `Detected ${intent} intent with ${complexity} complexity. User sentiment appears ${sentiment}. Analysis based on linguistic patterns and conversation context.`;
  }
}