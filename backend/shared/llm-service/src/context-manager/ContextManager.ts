import { Message, DocumentContext } from '../interfaces.js';

export interface TokenBudget {
  systemPrompt: number;
  context: number;
  messages: number;
  tools: number;
  response: number;
  total: number;
}

export interface ContextWindow {
  recentMessages: Message[];
  summarizedContext?: string;
  contextDocuments: DocumentContext[];
  estimatedTokens: number;
  windowSize: number;
}

export interface ContextConfig {
  maxTokens: number;
  systemPromptTokens: number;
  toolsTokensPerTool: number;
  responseTokensReserved: number;
  recentMessagesWindow: number;
  summarizationThreshold: number;
  tokensPerMessage: number;
  tokensPerChar: number;
}

export class ContextManager {
  public config: ContextConfig;
  private personaCache: Map<string, string> = new Map();
  private contextSummaryCache: Map<string, string> = new Map();

  constructor(config: Partial<ContextConfig> = {}) {
    this.config = {
      maxTokens: 16000, // Conservative default for most models
      systemPromptTokens: 500,
      toolsTokensPerTool: 100,
      responseTokensReserved: 1000,
      recentMessagesWindow: 20,
      summarizationThreshold: 50,
      tokensPerMessage: 25, // Average tokens per message
      tokensPerChar: 0.25, // Rough estimate for token counting
      ...config
    };
  }

  /**
   * Create a rolling window context that fits within token budget
   */
  public createRollingWindow(
    messages: Message[], 
    systemPromptTokens: number,
    toolsCount: number = 0,
    contextDocuments: DocumentContext[] = []
  ): ContextWindow {
    const budget = this.calculateTokenBudget(systemPromptTokens, toolsCount);
    const availableForMessages = budget.messages;

    // If messages fit within budget, return all
    const totalMessageTokens = this.estimateTokens(messages.map(m => m.content).join(' '));
    if (totalMessageTokens <= availableForMessages) {
      return {
        recentMessages: messages,
        contextDocuments,
        estimatedTokens: totalMessageTokens + systemPromptTokens + (toolsCount * this.config.toolsTokensPerTool),
        windowSize: messages.length
      };
    }

    // Need rolling window with summarization
    return this.createSummarizedWindow(messages, availableForMessages, contextDocuments);
  }

  /**
   * Cache and reuse persona descriptions to avoid repetition
   */
  public cachePersonaPrompt(agentId: string, personaPrompt: string): void {
    this.personaCache.set(agentId, personaPrompt);
  }

  public getCachedPersonaPrompt(agentId: string): string | undefined {
    return this.personaCache.get(agentId);
  }

  /**
   * Remove hard 200-word limits and use dynamic sizing
   */
  public calculateOptimalResponseLimit(availableTokens: number): number {
    // Reserve some buffer, but allow much more flexible response sizes
    const buffer = Math.min(200, availableTokens * 0.1);
    return Math.max(500, availableTokens - buffer); // Minimum 500 tokens for responses
  }

  /**
   * Deduplicate context from multiple sources
   */
  public deduplicateContext(contexts: DocumentContext[]): DocumentContext[] {
    const seen = new Set<string>();
    return contexts.filter(context => {
      const key = `${context.title}-${context.content.substring(0, 100)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Estimate tokens for a given text (public method)
   */
  public estimateTokens(text: string): number {
    return Math.ceil(text.length * this.config.tokensPerChar);
  }

  /**
   * Monitor context health and provide warnings
   */
  public analyzeContextHealth(window: ContextWindow): {
    status: 'healthy' | 'warning' | 'critical';
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    if (window.estimatedTokens > this.config.maxTokens * 0.9) {
      warnings.push('Context approaching token limit');
      recommendations.push('Consider more aggressive summarization');
    }

    if (window.recentMessages.length < 3) {
      warnings.push('Very few recent messages in context');
      recommendations.push('Check if summarization is too aggressive');
    }

    if (window.summarizedContext && window.summarizedContext.length > 2000) {
      warnings.push('Summary context is quite long');
      recommendations.push('Consider hierarchical summarization');
    }

    const status = warnings.length === 0 ? 'healthy' : 
                   warnings.length <= 2 ? 'warning' : 'critical';

    return { status, warnings, recommendations };
  }

  private calculateTokenBudget(systemPromptTokens: number, toolsCount: number): TokenBudget {
    const toolsTokens = toolsCount * this.config.toolsTokensPerTool;
    const reservedTokens = systemPromptTokens + toolsTokens + this.config.responseTokensReserved;
    const availableForMessages = Math.max(0, this.config.maxTokens - reservedTokens);

    return {
      systemPrompt: systemPromptTokens,
      context: 0, // Will be calculated based on documents
      messages: availableForMessages,
      tools: toolsTokens,
      response: this.config.responseTokensReserved,
      total: this.config.maxTokens
    };
  }

  private createSummarizedWindow(
    messages: Message[], 
    availableTokens: number, 
    contextDocuments: DocumentContext[]
  ): ContextWindow {
    // Keep most recent messages that fit in budget
    const recentMessages: Message[] = [];
    let usedTokens = 0;
    
    // Reserve space for summary (roughly 20% of available tokens)
    const summaryReserve = Math.min(500, availableTokens * 0.2);
    const availableForRecent = availableTokens - summaryReserve;

    // Add recent messages from the end (most recent first)
    for (let i = messages.length - 1; i >= 0; i--) {
      const messageTokens = this.estimateTokens(messages[i].content);
      if (usedTokens + messageTokens <= availableForRecent) {
        recentMessages.unshift(messages[i]);
        usedTokens += messageTokens;
      } else {
        break;
      }
    }

    // Create summary of older messages if any exist
    const olderMessages = messages.slice(0, messages.length - recentMessages.length);
    let summarizedContext: string | undefined;
    
    if (olderMessages.length > 0) {
      summarizedContext = this.summarizeMessages(olderMessages);
    }

    return {
      recentMessages,
      summarizedContext,
      contextDocuments: this.deduplicateContext(contextDocuments),
      estimatedTokens: usedTokens + this.estimateTokens(summarizedContext || ''),
      windowSize: recentMessages.length
    };
  }

  private summarizeMessages(messages: Message[]): string {
    // Create a conversation summary that preserves key information
    const participantCounts = new Map<string, number>();
    const keyTopics = new Set<string>();
    
    messages.forEach(msg => {
      participantCounts.set(msg.sender, (participantCounts.get(msg.sender) || 0) + 1);
      
      // Extract potential key topics (simple keyword extraction)
      const words = msg.content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 4 && !this.isCommonWord(word)) {
          keyTopics.add(word);
        }
      });
    });

    const participants = Array.from(participantCounts.keys());
    const topTopics = Array.from(keyTopics).slice(0, 5);
    
    let summary = `[Earlier conversation summary: ${messages.length} messages between ${participants.join(', ')}`;
    
    if (topTopics.length > 0) {
      summary += `. Discussion topics included: ${topTopics.join(', ')}`;
    }
    
    // Add key decisions or actions if we can detect them
    const actionMessages = messages.filter(m => 
      m.content.toLowerCase().includes('decided') ||
      m.content.toLowerCase().includes('agreed') ||
      m.content.toLowerCase().includes('action') ||
      m.content.toLowerCase().includes('will do')
    );
    
    if (actionMessages.length > 0) {
      summary += '. Key decisions/actions were mentioned.';
    }
    
    summary += ']';
    
    return summary;
  }


  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'among', 'this', 'that',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me',
      'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our',
      'their', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'be', 'am', 'is',
      'are', 'was', 'were', 'being', 'been'
    ]);
    return commonWords.has(word);
  }
}

// Singleton instance
let contextManager: ContextManager | null = null;

export function getContextManager(config?: Partial<ContextConfig>): ContextManager {
  if (!contextManager) {
    contextManager = new ContextManager(config);
  }
  return contextManager;
}