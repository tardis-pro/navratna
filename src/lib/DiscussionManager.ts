import { Message, AgentState, Persona } from '../types/agent';
import { DocumentContext } from '../types/document';
import { LLMService } from '../services/llm';
import { generateAgentResponse } from '../services/llm';
import { AgentContextValue } from '../types/agent';

export interface DiscussionContext {
  topic: string;
  initialDocument?: string;
  maxRounds: number;
  currentRound: number;
  isActive: boolean;
  agents: Map<string, AgentState>;
  history: Message[];
}

export type TurnStrategy = 'round-robin' | 'moderated' | 'context-aware';

export interface DiscussionState {
  isRunning: boolean;
  currentSpeakerId: string | null;
  turnQueue: string[];
  messageHistory: Message[];
  currentRound: number;
  lastError: string | null;
}

export interface IDiscussionManager {
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  addAgent: (agent: AgentState) => void;
  removeAgent: (agentId: string) => void;
  updateDocument: (document: DocumentContext | null) => void;
  overrideTurn: (agentId: string) => void;
  detectAgreementDisagreement: () => { agrees: string[], disagrees: string[] };
  createCheckpoint: () => string;
  restoreCheckpoint: (checkpointId: string) => boolean;
  summarizeDiscussion: () => Promise<string>;
  addDocument: (document: DocumentContext) => void;
  removeDocument: (documentId: string) => void;
  getDocuments: () => DocumentContext[];
}

interface TopicCluster {
  id: string;
  topic: string;
  keywords: string[];
  messages: string[]; // Message IDs
  score: number;
}

export class DiscussionManager implements IDiscussionManager {
  private context: DiscussionContext;
  private turnStrategy: TurnStrategy;
  private currentTurn: string | null;
  private moderatorId?: string;
  private state: DiscussionState;
  private document: DocumentContext | null;
  private updateCallback: (state: DiscussionState) => void;
  private responseCallback: (agentId: string, response: string) => void;
  private abortController: AbortController | null = null;
  private checkpoints: Map<string, DiscussionState> = new Map();
  private documents: DocumentContext[] = [];
  private agentContext: AgentContextValue;
  private topicClusters: Map<string, TopicCluster> = new Map();

  constructor(
    agents: Record<string, AgentState>,
    document: DocumentContext | null,
    updateCallback: (state: DiscussionState) => void,
    responseCallback: (agentId: string, response: string) => void,
    agentContext: AgentContextValue
  ) {
    this.context = {
      topic: '',
      maxRounds: 3,
      currentRound: 0,
      isActive: false,
      agents: new Map(),  // We'll use agentContext instead
      history: []
    };
    this.turnStrategy = 'round-robin';
    this.currentTurn = null;
    this.document = document;
    this.updateCallback = updateCallback;
    this.responseCallback = responseCallback;
    this.agentContext = agentContext;
    this.state = {
      isRunning: false,
      currentSpeakerId: null,
      turnQueue: [],
      messageHistory: [],
      currentRound: 0,
      lastError: null,
    };
    
    // Initialize documents array with primary document if available
    if (document) {
      this.documents = [document];
    }
  }

  private get agents(): Record<string, AgentState> {
    return this.agentContext.agents;
  }

  public addAgent(agent: AgentState): void {
    this.agentContext.addAgent(agent);
    if (this.state.isRunning) {
      this.state.turnQueue.push(agent.id);
    }
  }

  public removeAgent(agentId: string): void {
    this.agentContext.removeAgent(agentId);
    this.state.turnQueue = this.state.turnQueue.filter(id => id !== agentId);
    if (this.state.currentSpeakerId === agentId) {
      this.moveToNextTurn();
    }
  }

  public setModerator(agentId: string): void {
    if (!this.context.agents.has(agentId)) {
      throw new Error('Moderator must be a registered agent');
    }
    this.moderatorId = agentId;
  }

  public start(): void {
    console.log('Starting discussion with agents:', Object.keys(this.agentContext.agents));
    console.log('Document state:', this.document);

    if (Object.keys(this.agentContext.agents).length < 2) {
      const error = 'At least two agents are required to start a discussion.';
      console.error(error);
      this.state.lastError = error;
      this.updateCallback(this.state);
      return;
    }

    if (!this.document) {
      const error = 'A document must be loaded to start a discussion.';
      console.error(error);
      this.state.lastError = error;
      this.updateCallback(this.state);
      return;
    }

    // Initialize the discussion
    this.state = {
      isRunning: true,
      currentSpeakerId: null,
      turnQueue: this.initializeTurnQueue(),
      messageHistory: [],
      currentRound: 0,
      lastError: null,
    };
    
    console.log('Discussion initialized with state:', this.state);
    this.updateCallback(this.state);
    
    // Start processing turns
    console.log('Starting turn processing');
    this.processNextTurn().catch(error => {
      console.error('Error processing turn:', error);
      this.state.lastError = error instanceof Error ? error.message : 'Unknown error occurred';
      this.updateCallback(this.state);
    });
  }

  public stop(): void {
    // Cancel any in-progress response generation
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Reset all state
    this.state = {
      ...this.state,
      isRunning: false,
      currentSpeakerId: null,
      turnQueue: [],
      lastError: null
    };
    this.context.isActive = false;
    this.currentTurn = null;

    // Reset agent states
    Object.keys(this.agentContext.agents).forEach(agentId => {
      this.agentContext.updateAgentState(agentId, {
        isThinking: false,
        error: null,
        currentResponse: null
      });
    });

    this.updateCallback(this.state);
  }

  public addMessage(agentId: string, content: string, replyTo?: string): void {
    if (!this.state.isRunning) {
      throw new Error('Discussion is not active');
    }
    if (agentId !== this.state.currentSpeakerId) {
      throw new Error('Not this agent\'s turn to speak');
    }

    const agent = this.agents[agentId];
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Find thread info if replying
    let threadRoot: string | undefined;
    let threadDepth = 0;
    
    if (replyTo) {
      const parentMessage = this.state.messageHistory.find(m => m.id === replyTo);
      if (parentMessage) {
        threadRoot = parentMessage.threadRoot || parentMessage.id;
        threadDepth = (parentMessage.threadDepth || 0) + 1;
      }
    }

    // Extract mentions
    const mentions = Object.values(this.agents)
      .map(a => a.name)
      .filter(name => content.includes(name));

    // Analyze sentiment
    const sentimentKeywords = {
      positive: ['agree', 'good', 'excellent', 'right', 'correct', 'better', 'best', 'improve', 'helpful', 'effective', 'success', 'benefit', 'advantage', 'support', 'clear', 'well'],
      negative: ['disagree', 'bad', 'wrong', 'poor', 'worse', 'worst', 'problem', 'issue', 'difficult', 'fail', 'drawback', 'disadvantage', 'oppose', 'unclear', 'confusing']
    };

    const words = content.toLowerCase().split(/\W+/);
    let sentimentScore = 0;
    const matchedKeywords: string[] = [];

    words.forEach(word => {
      if (sentimentKeywords.positive.includes(word)) {
        sentimentScore += 0.2;
        matchedKeywords.push(word);
      } else if (sentimentKeywords.negative.includes(word)) {
        sentimentScore -= 0.2;
        matchedKeywords.push(word);
      }
    });

    // Normalize score to -1 to 1 range
    sentimentScore = Math.max(-1, Math.min(1, sentimentScore));

    // Analyze logical fallacies
    const fallacyPatterns = {
      'ad_hominem': {
        patterns: ['you are', 'you\'re just', 'clearly you', 'obviously you'],
        confidence: 0.7
      },
      'false_dichotomy': {
        patterns: ['either', 'or else', 'must be either', 'can only be'],
        confidence: 0.6
      },
      'appeal_to_authority': {
        patterns: ['experts say', 'studies show', 'research proves', 'scientists agree'],
        confidence: 0.5
      },
      'hasty_generalization': {
        patterns: ['always', 'never', 'everyone', 'nobody', 'all people'],
        confidence: 0.6
      },
      'slippery_slope': {
        patterns: ['will lead to', 'eventually', 'next thing you know', 'down this path'],
        confidence: 0.5
      }
    };

    const fallacies: Array<{ type: string; confidence: number; snippet: string }> = [];
    const contentLower = content.toLowerCase();
    
    Object.entries(fallacyPatterns).forEach(([fallacyType, { patterns, confidence }]) => {
      patterns.forEach(pattern => {
        if (contentLower.includes(pattern)) {
          // Get surrounding context
          const words = contentLower.split(' ');
          const patternIndex = words.findIndex(w => w.includes(pattern));
          if (patternIndex !== -1) {
            const start = Math.max(0, patternIndex - 3);
            const end = Math.min(words.length, patternIndex + 4);
            const snippet = words.slice(start, end).join(' ');
            fallacies.push({
              type: fallacyType,
              confidence,
              snippet
            });
          }
        }
      });
    });

    // Check for valid argument structure
    const hasValidArgument = content.toLowerCase().includes('because') || 
                           content.toLowerCase().includes('therefore') ||
                           content.toLowerCase().includes('since') ||
                           content.toLowerCase().includes('consequently');

    const message: Message = {
      id: crypto.randomUUID(),
      content,
      sender: agent.name,
      timestamp: new Date(),
      type: 'response',
      replyTo,
      threadRoot,
      threadDepth,
      mentions,
      sentiment: {
        score: sentimentScore,
        keywords: matchedKeywords
      },
      logicalAnalysis: {
        fallacies,
        hasValidArgument
      }
    };

    // Update message history and topic clusters
    this.state.messageHistory.push(message);
    this.updateTopicClusters(message);
    
    // Update agent's conversation history
    if (this.agentContext) {
      this.agentContext.updateAgentState(message.sender, {
        conversationHistory: [...this.state.messageHistory]
      });
    }
    
    // Notify callbacks
    this.updateCallback(this.state);
    this.responseCallback(agentId, content);
    
    // Move to next turn
    this.moveToNextTurn();
  }

  private moveToNextTurn(): void {
    // Add current speaker back to end of queue
    if (this.state.currentSpeakerId) {
      this.state.turnQueue.push(this.state.currentSpeakerId);
    }
    
    // Clear current speaker
    this.state.currentSpeakerId = null;
    this.updateCallback(this.state);

    // Process next turn
    this.processNextTurn();
  }

  private progressDiscussion(): void {
    if (this.turnStrategy === 'moderated' && this.moderatorId) {
      // In moderated mode, always go back to moderator after each message
      this.currentTurn = this.moderatorId;
    } else {
      this.determineNextTurn();
    }
  }

  private determineNextTurn(): void {
    if (!this.context.isActive) return;

    switch (this.turnStrategy) {
      case 'round-robin':
        this.handleRoundRobinTurn();
        break;
      case 'context-aware':
        this.handleContextAwareTurn();
        break;
      case 'moderated':
        this.handleModeratedTurn();
        break;
    }
  }

  private handleRoundRobinTurn(): void {
    const agents = Array.from(this.context.agents.keys())
      .filter(id => id !== this.moderatorId);

    if (!this.currentTurn) {
      // Start with first agent
      this.currentTurn = agents[0];
      return;
    }

    const currentIndex = agents.indexOf(this.currentTurn);
    if (currentIndex === agents.length - 1) {
      // End of round
      this.context.currentRound++;
      if (this.context.currentRound >= this.context.maxRounds) {
        this.stop();
        return;
      }
      this.currentTurn = agents[0];
    } else {
      this.currentTurn = agents[currentIndex + 1];
    }
  }

  private handleContextAwareTurn(): void {
    if (this.state.messageHistory.length === 0) {
      const agents = Object.keys(this.agents);
      this.currentTurn = agents[Math.floor(Math.random() * agents.length)];
      return;
    }

    // Get the last few messages for analysis
    const recentMessages = this.state.messageHistory.slice(-3);
    const lastMessage = recentMessages[recentMessages.length - 1];
    
    // Check for explicit mentions first
    const agents = Object.values(this.agents);
    const mentioned = agents.find(agent => 
      lastMessage.mentions?.includes(agent.name) && agent.id !== lastMessage.sender
    );

    if (mentioned) {
      this.currentTurn = mentioned.id;
      return;
    }

    // Get current topic cluster
    const currentCluster = this.getTopicClusters()[0];
    if (currentCluster) {
      // Find agent most relevant to current topic
      const agentScores = Object.values(this.agents).map(agent => {
        if (agent.id === lastMessage.sender) return { agent, score: -1 }; // Exclude last speaker
        
        let score = 0;
        // Check agent's expertise against topic keywords
        const agentPersona = agent.persona;
        if (agentPersona && typeof agentPersona === 'object' && 'expertise' in agentPersona) {
          const expertise = agentPersona.expertise;
          if (Array.isArray(expertise)) {
            score += currentCluster.keywords.filter(keyword => 
              expertise.some(exp => typeof exp === 'string' && exp.toLowerCase().includes(keyword))
            ).length * 2;
          }
        }
        
        // Check agent's previous contributions to this topic
        const agentMessages = this.getClusterMessages(currentCluster.id)
          .filter(m => m.sender === agent.name);
        score += agentMessages.length;

        // Bonus for valid arguments, penalty for fallacies
        const recentAgentMessage = agentMessages[agentMessages.length - 1];
        if (recentAgentMessage?.logicalAnalysis) {
          if (recentAgentMessage.logicalAnalysis.hasValidArgument) score += 2;
          score -= recentAgentMessage.logicalAnalysis.fallacies.length;
        }

        return { agent, score };
      });

      // Select agent with highest score
      const bestAgent = agentScores.reduce((best, current) => 
        current.score > best.score ? current : best
      );

      if (bestAgent.score > 0) {
        this.currentTurn = bestAgent.agent.id;
        return;
      }
    }

    // If no specific context cues, fall back to round-robin
    this.handleRoundRobinTurn();
  }

  private handleModeratedTurn(): void {
    if (!this.moderatorId) {
      throw new Error('Moderated discussions require a moderator');
    }
    // Always set turn to moderator who will then decide next speaker
    this.currentTurn = this.moderatorId;
  }

  public getCurrentTurn(): string | null {
    return this.currentTurn;
  }

  public getContext(): DiscussionContext {
    return { ...this.context };
  }

  public getHistory(): Message[] {
    return [...this.context.history];
  }

  public setInitialDocument(document: string): void {
    // Create a proper DocumentContext object
    const documentContext: DocumentContext = {
      id: 'initial-document',
      title: 'Discussion Topic',
      content: document,
      type: 'general',
      metadata: {
        createdAt: new Date(),
        lastModified: new Date()
      },
      tags: []
    };

    // Update both the document reference and context
    this.document = documentContext;
    this.context.initialDocument = document;
    
    // Add to documents array
    this.addDocument(documentContext);
  }

  private initializeTurnQueue(): string[] {
    // Get all agent IDs except moderator
    const agentIds = Object.keys(this.agentContext.agents)
      .filter(id => id !== this.moderatorId);
    // Randomize initial order
    return agentIds.sort(() => Math.random() - 0.5);
  }

  private async processNextTurn(): Promise<void> {
    if (!this.state.isRunning) {
      return;
    }

    // If queue is empty, reinitialize it
    if (this.state.turnQueue.length === 0) {
      this.state.turnQueue = this.initializeTurnQueue();
      this.state.currentRound++;
      
      // Check if we've reached max rounds
      if (this.state.currentRound > this.context.maxRounds) {
        this.stop();
        return;
      }
    }

    // Get next speaker from queue
    const nextSpeakerId = this.state.turnQueue.shift();
    if (!nextSpeakerId) {
      // No more speakers in queue, end discussion
      this.stop();
      return;
    }

    // Set current speaker in both state and currentTurn
    this.state.currentSpeakerId = nextSpeakerId;
    this.currentTurn = nextSpeakerId;
    this.updateCallback(this.state);

    // Trigger agent response
    const agent = this.agentContext.agents[nextSpeakerId];
    if (agent) {
      try {
        // Set agent to thinking state
        this.agentContext.updateAgentState(nextSpeakerId, {
          isThinking: true,
          error: null,
          currentResponse: null
        });

        // Generate response
        await this.generateResponse(nextSpeakerId);
      } catch (error) {
        // Handle error
        this.agentContext.updateAgentState(nextSpeakerId, {
          isThinking: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          currentResponse: null
        });
        
        // Move to next turn
        this.moveToNextTurn();
      }
    }
  }

  private async generateResponse(agentId: string): Promise<void> {
    const agent = this.agents[agentId];
    if (!agent) return Promise.resolve();
    
    // Create a new abort controller for this response
    this.abortController = new AbortController();
    
    // Set agent to thinking state
    this.agentContext.updateAgentState(agentId, { 
      isThinking: true, 
      error: null,
      currentResponse: null 
    });
    
    // Generate the "thinking" message
    const thinkingMessage: Message = {
      id: crypto.randomUUID(),
      sender: agent.name,
      content: "Thinking...",
      type: "thought",
      timestamp: new Date(),
    };
    
    // Add thinking message to state
    this.state.messageHistory.push(thinkingMessage);
    this.updateCallback(this.state);

    try {
      // Generate the agent's response based on context
      const documentContent = this.getCombinedDocumentContent();
      
      // Get optimized conversation history
      const conversationHistory = this.getOptimizedHistory(agent);
      
      const response = await generateAgentResponse(
        agent,
        documentContent,
        conversationHistory,
        this.abortController?.signal
      );
      
      // Create response message
      const responseMessage: Message = {
        id: crypto.randomUUID(),
        sender: agent.name,
        content: response,
        type: "response",
        timestamp: new Date(),
      };
      
      // Remove thinking message from state
      this.state.messageHistory = this.state.messageHistory.filter(m => m.id !== thinkingMessage.id);
      
      // Add response message to state
      this.state.messageHistory.push(responseMessage);
      
      // Update agent state with new message and response
      this.agentContext.updateAgentState(agentId, {
        isThinking: false,
        currentResponse: response,
        error: null,
        conversationHistory: [...(this.agents[agentId]?.conversationHistory || []), responseMessage]
      });
      
      this.updateCallback(this.state);
      
      // Notify parent component
      this.responseCallback(agentId, response);
      
      // Move to next turn
      this.moveToNextTurn();
    } catch (error) {
      // Remove thinking message from state
      this.state.messageHistory = this.state.messageHistory.filter(m => m.id !== thinkingMessage.id);
      
      // Update agent state to error
      this.agentContext.updateAgentState(agentId, {
        isThinking: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        currentResponse: null
      });
      
      this.updateCallback(this.state);
      
      throw error;
    }
  }

  /**
   * Gets optimized conversation history for context windows
   * Limits to last 2-3 messages plus original document to reduce token usage
   */
  private getOptimizedHistory(currentAgent: AgentState): Message[] {
    const MAX_RECENT_MESSAGES = 3; // Limit to last 2-3 messages as requested
    
    // Filter out thought messages to keep only actual conversation
    const conversationHistory = this.state.messageHistory.filter(m => m.type !== "thought");
    
    // If we have very few messages, return all of them
    if (conversationHistory.length <= MAX_RECENT_MESSAGES) {
      return conversationHistory;
    }
    
    // Always include the first message (usually contains initial context/document)
    const initialContext = conversationHistory.slice(0, 1);
    
    // Get the last 2-3 messages for immediate context
    const recentMessages = conversationHistory.slice(-MAX_RECENT_MESSAGES);
    
    // Combine initial context with recent messages
    // Remove duplicates in case the conversation is very short
    const optimizedHistory = [...initialContext];
    
    recentMessages.forEach(message => {
      // Only add if not already in initial context
      if (!optimizedHistory.some(existing => existing.id === message.id)) {
        optimizedHistory.push(message);
      }
    });
    
    return optimizedHistory;
  }

  private setError(errorMessage: string): void {
    this.state.lastError = errorMessage;
    this.updateCallback(this.state);
  }

  public pause(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.state.isRunning = false;
    this.updateCallback(this.state);
  }

  public resume(): void {
    if (!this.state.isRunning) {
      this.state.isRunning = true;
      this.updateCallback(this.state);
      this.processNextTurn();
    }
  }

  public reset(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.state = {
      isRunning: false,
      currentSpeakerId: null,
      turnQueue: [],
      messageHistory: [],
      currentRound: 0,
      lastError: null,
    };
    
    this.updateCallback(this.state);
  }

  public updateDocument(document: DocumentContext | null): void {
    this.document = document;
    
    // Update documents array
    if (document) {
      this.addDocument(document);
    }
  }

  public overrideTurn(agentId: string): void {
    if (!this.agents[agentId]) {
      this.setError(`Agent ${agentId} not found.`);
      return;
    }

    // Cancel any in-progress response generation
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Set the current speaker to the specified agent
    this.state.currentSpeakerId = agentId;
    
    // Update turn queue to prioritize this agent
    this.state.turnQueue = this.state.turnQueue.filter(id => id !== agentId);
    this.state.turnQueue.unshift(agentId);
    
    this.updateCallback(this.state);
    
    // Resume if paused
    if (!this.state.isRunning) {
      this.resume();
    } else {
      // Otherwise, process the next turn immediately
      this.processNextTurn();
    }
  }

  /**
   * Analyzes recent messages to detect agreement and disagreement between agents
   * @returns Object containing arrays of agent IDs that agree or disagree
   */
  public detectAgreementDisagreement(): { agrees: string[], disagrees: string[] } {
    const result = {
      agrees: [] as string[],
      disagrees: [] as string[]
    };
    
    // Only analyze if we have enough messages
    if (this.state.messageHistory.length < 3) {
      return result;
    }
    
    // Get the last few messages for analysis
    const recentMessages = this.state.messageHistory
      .filter(m => m.type === 'response')
      .slice(-5);
    
    // Simple keyword-based detection
    const agreementKeywords = [
      'agree', 'concur', 'correct', 'right', 'yes', 'indeed',
      'good point', 'I support', 'makes sense'
    ];
    
    const disagreementKeywords = [
      'disagree', 'incorrect', 'wrong', 'no', 'however', 'but',
      'I don\'t think', 'not necessarily', 'I\'m not sure', 'on the contrary'
    ];
    
    // Check each agent's last message
    Object.values(this.agents).forEach(agent => {
      // Find the agent's most recent message
      const lastMessage = recentMessages.find(m => m.sender === agent.name);
      if (!lastMessage) return;
      
      // Check for agreement
      if (agreementKeywords.some(keyword => 
        lastMessage.content.toLowerCase().includes(keyword)
      )) {
        result.agrees.push(agent.id);
      }
      
      // Check for disagreement
      if (disagreementKeywords.some(keyword => 
        lastMessage.content.toLowerCase().includes(keyword)
      )) {
        result.disagrees.push(agent.id);
      }
    });
    
    return result;
  }

  /**
   * Creates a checkpoint of the current discussion state
   * @returns The ID of the created checkpoint
   */
  public createCheckpoint(): string {
    const checkpointId = `checkpoint-${Date.now()}`;
    
    // Deep clone the current state to preserve it
    const stateClone: DiscussionState = {
      isRunning: this.state.isRunning,
      currentSpeakerId: this.state.currentSpeakerId,
      turnQueue: [...this.state.turnQueue],
      messageHistory: this.state.messageHistory.map(msg => ({...msg})),
      currentRound: this.state.currentRound,
      lastError: this.state.lastError,
    };
    
    this.checkpoints.set(checkpointId, stateClone);
    
    // Keep only the last 5 checkpoints to save memory
    const checkpointKeys = Array.from(this.checkpoints.keys());
    if (checkpointKeys.length > 5) {
      const oldestKey = checkpointKeys[0];
      this.checkpoints.delete(oldestKey);
    }
    
    return checkpointId;
  }
  
  /**
   * Restores the discussion state from a checkpoint
   * @param checkpointId The ID of the checkpoint to restore
   * @returns True if restoration was successful, false otherwise
   */
  public restoreCheckpoint(checkpointId: string): boolean {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      this.setError(`Checkpoint ${checkpointId} not found.`);
      return false;
    }
    
    // Pause any ongoing processes
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    // Restore state from checkpoint
    this.state = {
      isRunning: false, // Always restore in paused state for safety
      currentSpeakerId: checkpoint.currentSpeakerId,
      turnQueue: [...checkpoint.turnQueue],
      messageHistory: checkpoint.messageHistory.map(msg => ({...msg})),
      currentRound: checkpoint.currentRound,
      lastError: null,
    };
    
    this.updateCallback(this.state);
    return true;
  }
  
  /**
   * Generates a summary of the current discussion
   * @returns A promise that resolves to the summary text
   */
  public async summarizeDiscussion(): Promise<string> {
    if (this.state.messageHistory.length === 0) {
      return "No discussion to summarize yet.";
    }
    
    // Use the first available agent to generate the summary
    const summarizingAgent = Object.values(this.agents)[0];
    if (!summarizingAgent) {
      return "No agents available to generate summary.";
    }
    
    // Create a copy of the agent with system prompt for summarization
    const summaryAgent: AgentState = {
      ...summarizingAgent,
      systemPrompt: `You are a helpful assistant that summarizes discussions. 
      Please provide a concise summary of the following discussion, 
      highlighting the key points, agreements, and disagreements.`
    };
    
    // Only include response messages (not thoughts or system)
    const conversationHistory = this.state.messageHistory.filter(
      m => m.type === 'response'
    );
    
    try {
      const documentContent = this.document?.content || "";
      const summary = await generateAgentResponse(
        summaryAgent,
        documentContent,
        conversationHistory,
        null
      );
      
      // Create a system message with the summary
      const summaryMessage: Message = {
        id: crypto.randomUUID(),
        sender: "system",
        content: `## Discussion Summary\n\n${summary}`,
        type: "system",
        timestamp: new Date(),
      };
      
      // Add summary message to both state and all agent histories
      this.state.messageHistory.push(summaryMessage);
      Object.values(this.agents).forEach(agent => {
        agent.conversationHistory.push(summaryMessage);
      });
      
      this.updateCallback(this.state);
      
      return summary;
    } catch (error) {
      this.setError(`Error generating summary: ${error instanceof Error ? error.message : String(error)}`);
      return "Failed to generate summary.";
    }
  }

  /**
   * Adds a document to the discussion
   * @param document The document to add
   */
  public addDocument(document: DocumentContext): void {
    // Check if document already exists
    const existingIndex = this.documents.findIndex(doc => doc.id === document.id);
    if (existingIndex >= 0) {
      // Update existing document
      this.documents[existingIndex] = document;
    } else {
      // Add new document
      this.documents.push(document);
    }
    
    // If no primary document is set, set this as primary
    if (!this.document) {
      this.document = document;
    }
  }
  
  /**
   * Removes a document from the discussion
   * @param documentId The ID of the document to remove
   */
  public removeDocument(documentId: string): void {
    this.documents = this.documents.filter(doc => doc.id !== documentId);
    
    // If we removed the primary document, update it
    if (this.document?.id === documentId) {
      this.document = this.documents.length > 0 ? this.documents[0] : null;
    }
  }
  
  /**
   * Gets all documents in the discussion
   * @returns Array of document contexts
   */
  public getDocuments(): DocumentContext[] {
    return [...this.documents];
  }
  
  /**
   * Combines content from all documents into a single context for the discussion
   * @returns Combined document content
   */
  private getCombinedDocumentContent(): string {
    if (this.documents.length === 0) {
      return "";
    }
    
    if (this.documents.length === 1) {
      return this.documents[0].content || "";
    }
    
    // Combine documents with headers
    return this.documents.map(doc => {
      return `## Document: ${doc.title || 'Untitled'}\n\n${doc.content}\n\n`;
    }).join('---\n\n');
  }

  private updateTopicClusters(message: Message) {
    const content = message.content.toLowerCase();
    const words = content.split(/\W+/).filter(w => w.length > 3);
    
    // Extract potential keywords (nouns, key terms)
    const keywords = words.filter(word => 
      !['this', 'that', 'have', 'been', 'would', 'could', 'should'].includes(word)
    );
    
    // Find matching clusters or create new one
    let bestCluster: TopicCluster | null = null;
    let bestScore = 0;
    
    this.topicClusters.forEach(cluster => {
      const score = keywords.filter(word => 
        cluster.keywords.includes(word)
      ).length;
      
      if (score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    });
    
    if (bestScore >= 2) { // Threshold for topic similarity
      // Add to existing cluster
      bestCluster!.messages.push(message.id);
      bestCluster!.keywords = [...new Set([...bestCluster!.keywords, ...keywords])];
      bestCluster!.score += bestScore;
    } else {
      // Create new topic cluster
      const newCluster: TopicCluster = {
        id: crypto.randomUUID(),
        topic: keywords.slice(0, 3).join(', '), // Simple topic from first few keywords
        keywords,
        messages: [message.id],
        score: 1
      };
      this.topicClusters.set(newCluster.id, newCluster);
    }
  }

  public getTopicClusters(): TopicCluster[] {
    return Array.from(this.topicClusters.values())
      .sort((a, b) => b.score - a.score);
  }

  public getClusterMessages(clusterId: string): Message[] {
    const cluster = this.topicClusters.get(clusterId);
    if (!cluster) return [];
    
    return this.state.messageHistory
      .filter(message => cluster.messages.includes(message.id))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  public getState(): DiscussionState {
    return { ...this.state };
  }
} 